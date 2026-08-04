import { parentPort, workerData } from 'worker_threads';

// ── excelParseWorker — runs the Excel→JSON parsing in an isolated worker thread ────
// Why this exists: parsing a large/complex spreadsheet with the `xlsx` library is
// synchronous and can use a lot of memory. When this ran directly inside the main
// server process, a single oversized upload could blow past the container's memory
// limit and crash the ENTIRE backend (every logged-in user, not just the uploader) —
// Railway would then restart the whole service, which is exactly the "random failed to
// fetch" behavior this was causing. Running the parse in a worker thread with an
// explicit memory ceiling (see resourceLimits where this worker is spawned, in
// routes/inward.ts) means a too-large file fails ONLY this one upload — the worker is
// torn down and the main server keeps serving everyone else without interruption.
// This file is a byte-for-byte move of the parsing logic that used to live directly in
// the /parse-excel route handler — the output shape and behavior are unchanged.

let XLSX: any = null;
try { XLSX = require('xlsx'); } catch { /* xlsx not installed yet */ }
let fflate: any = null;
try { fflate = require('fflate'); } catch { /* fflate not installed yet — fast path below just won't run */ }

const DATE_TAB = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;
function tabDateValue(name: string): number | null {
  const m = DATE_TAB.exec(name.trim());
  if (!m) return null;
  const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d.getTime();
}
// Same rule the slow path below uses to pick a sheet out of a list of names — pulled out so
// both paths share identical selection behavior instead of two copies that could drift apart.
function chooseSheetName(sheetNames: string[], fileName: string | undefined): string {
  let chosen = sheetNames[0];
  const dateTabs = sheetNames.filter((n) => tabDateValue(n) !== null);
  if (dateTabs.length) {
    const filenameDateStr = fileName ? String(fileName).match(/\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/)?.[0] : undefined;
    const filenameDateValue = filenameDateStr ? tabDateValue(filenameDateStr) : null;
    const matchedFromFilename = filenameDateValue !== null
      ? dateTabs.find((n) => tabDateValue(n) === filenameDateValue)
      : undefined;
    chosen = matchedFromFilename || dateTabs.reduce((latest, n) =>
      (tabDateValue(n) as number) > (tabDateValue(latest) as number) ? n : latest, dateTabs[0]);
  }
  return chosen;
}

// ── Fast path: extract ONLY the one sheet we need straight from the zip ───────────────────
// `XLSX.read()` — even with `bookSheets: true` or a `sheets: [...]` filter — turns out to
// still inflate every internal XML part of the archive up front (confirmed against a real
// 47MB / 76-tab "one sheet per date" godown-sheet export: `bookSheets: true` alone already
// balloons to ~930MB RSS before a single cell is parsed). On a 512MB-RAM host (Render's
// free/starter web service plans) that's an out-of-memory kill mid-request — the browser
// just sees "Failed to fetch" with no real error surfaced anywhere.
// This reads the zip's central directory (near-free) and selectively inflates only:
//   1. xl/workbook.xml + xl/_rels/workbook.xml.rels + [Content_Types].xml — a few KB, to get
//      the sheet name -> internal file (e.g. "worksheets/sheet51.xml") mapping.
//   2. The ONE chosen sheet's XML, plus xl/sharedStrings.xml / xl/styles.xml if present.
// Then it repackages just those parts into a tiny synthetic .xlsx (one sheet only) and hands
// THAT to XLSX.read() — so XLSX's own inflate cost is now proportional to one sheet, not 76.
// Falls back to the slow path (below) on any failure — this must never be the reason a normal
// file fails to import.
function tryFastExtractSheet(buf: Buffer, fileName: string | undefined): { chosenSheetName: string; ws: any } | null {
  if (!fflate) return null;
  try {
    const zipBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const metaWanted = new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml']);
    const meta = fflate.unzipSync(zipBytes, { filter: (f: any) => metaWanted.has(f.name) });
    if (!meta['xl/workbook.xml'] || !meta['xl/_rels/workbook.xml.rels']) return null;

    const workbookXml = Buffer.from(meta['xl/workbook.xml']).toString('utf8');
    const relsXml = Buffer.from(meta['xl/_rels/workbook.xml.rels']).toString('utf8');
    // Sheet tags can list name/r:id attributes in either order — match generically then pull
    // each attribute out separately rather than assuming a fixed order.
    const sheetTags = [...workbookXml.matchAll(/<sheet\b[^>]*\/>/g)].map(m => m[0]);
    const sheetEntries = sheetTags.map(tag => {
      const name = tag.match(/name="([^"]*)"/)?.[1];
      const rid = tag.match(/r:id="([^"]*)"/)?.[1];
      return name && rid ? { name, rid } : null;
    }).filter((x): x is { name: string; rid: string } => !!x);
    if (!sheetEntries.length) return null;

    const relMatches = [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)].map(m => m[0]);
    const ridToTarget: Record<string, string> = {};
    relMatches.forEach(tag => {
      const id = tag.match(/Id="([^"]*)"/)?.[1];
      const target = tag.match(/Target="([^"]*)"/)?.[1];
      if (id && target) ridToTarget[id] = target;
    });

    const sheetNames = sheetEntries.map(s => s.name);
    const chosenSheetName = chooseSheetName(sheetNames, fileName);
    const chosenEntry = sheetEntries.find(s => s.name === chosenSheetName);
    const rawTarget = chosenEntry && ridToTarget[chosenEntry.rid];
    if (!rawTarget) return null;
    // Target is relative to xl/ (e.g. "worksheets/sheet51.xml"); normalize a couple of the
    // other forms real exporters occasionally use (leading "/xl/..." or "xl/...").
    const sheetPath = rawTarget.startsWith('/xl/') ? rawTarget.slice(1)
      : rawTarget.startsWith('xl/') ? rawTarget
      : `xl/${rawTarget}`;

    const partsWanted = new Set([sheetPath, 'xl/sharedStrings.xml', 'xl/styles.xml']);
    const parts = fflate.unzipSync(zipBytes, { filter: (f: any) => partsWanted.has(f.name) });
    if (!parts[sheetPath]) return null;

    const sheetFileName = sheetPath.split('/').pop();
    const hasStrings = !!parts['xl/sharedStrings.xml'];
    const hasStyles = !!parts['xl/styles.xml'];

    const miniWorkbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${chosenSheetName.replace(/"/g, '&quot;')}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const miniRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${sheetFileName}"/>` +
      (hasStrings ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` : '') +
      (hasStyles ? `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` : '') +
      `</Relationships>`;
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/${sheetFileName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      (hasStrings ? `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` : '') +
      (hasStyles ? `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` : '') +
      `</Types>`;
    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`;

    const zipInput: Record<string, Uint8Array> = {
      '[Content_Types].xml': new TextEncoder().encode(contentTypesXml),
      '_rels/.rels': new TextEncoder().encode(rootRelsXml),
      'xl/workbook.xml': new TextEncoder().encode(miniWorkbookXml),
      'xl/_rels/workbook.xml.rels': new TextEncoder().encode(miniRelsXml),
      [`xl/worksheets/${sheetFileName}`]: parts[sheetPath],
    };
    if (hasStrings) zipInput['xl/sharedStrings.xml'] = parts['xl/sharedStrings.xml'];
    if (hasStyles) zipInput['xl/styles.xml'] = parts['xl/styles.xml'];

    const miniZip = fflate.zipSync(zipInput, { level: 0 });
    const wb = XLSX.read(Buffer.from(miniZip), { type: 'buffer', raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return null;
    return { chosenSheetName, ws };
  } catch {
    return null; // any surprise in a real-world file's XML -> just fall back to the slow path
  }
}

function excelSerialToDate(serial: number): string {
  const intSerial = Math.floor(serial);
  const epoch = new Date(1899, 11, 30, 0, 0, 0, 0);
  epoch.setDate(epoch.getDate() + intSerial);
  const d = String(epoch.getDate()).padStart(2, '0');
  const m = String(epoch.getMonth() + 1).padStart(2, '0');
  const y = epoch.getFullYear();
  return `${d}-${m}-${y}`;
}

function excelSerialToTime(serial: number): string {
  const frac = serial - Math.floor(serial);
  const totalMins = Math.round(frac * 24 * 60);
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function convertCell(val: any, headerName: string): any {
  if (val === '' || val === null || val === undefined) return '';
  // "Rec Date" (used by some real warehouse stock-take sheets in place of a plain "Date"
  // column) also holds native Excel date serials and needs the same numeric-to-date
  // conversion — without this, a numeric serial in that column would pass through as a
  // raw number (e.g. 45601) instead of a real date string, corrupting every such row's date.
  const isDateCol = /^(date|rec date)$/i.test(headerName.trim());
  const isTimeCol = /time|tat/i.test(headerName.trim());
  if (typeof val === 'number') {
    if (isDateCol && val > 1000) return excelSerialToDate(val);
    if (isTimeCol && val >= 0 && val < 1) return excelSerialToTime(val);
    if (isTimeCol && val > 1) return excelSerialToTime(val);
    if (isDateCol) return excelSerialToDate(val);
    return val;
  }
  if (typeof val === 'string') {
    if (val.startsWith('=')) return val;
    return val.trim();
  }
  return String(val).trim();
}

function run() {
  if (!XLSX) {
    parentPort!.postMessage({ success: false, error: 'xlsx package not installed on backend. Run: npm install xlsx in the backend folder.' });
    return;
  }
  try {
    // Accepts either the raw file buffer (current — comes straight from a multipart upload,
    // no encoding step involved) or a base64 string (legacy fallback, kept in case anything
    // else still calls this worker the old way).
    const data = workerData as { fileBuffer?: Buffer; fileBase64?: string; fileName: string };
    const { fileName } = data;
    const buf: Buffer | null = data.fileBuffer
      ? Buffer.from(data.fileBuffer)
      : data.fileBase64
      ? Buffer.from(data.fileBase64, 'base64')
      : null;
    if (!buf) {
      parentPort!.postMessage({ success: false, error: 'fileBuffer or fileBase64 is required' });
      return;
    }

    // ── Sheet selection + extraction ───────────────────────────────────────────────────
    // Some real warehouse workbooks (e.g. daily "godown sheet" exports) keep one sheet PER
    // DATE, tab-named like "28-07-2026", instead of one sheet total — a single such workbook
    // can hold 70+ dated snapshots. Always taking SheetNames[0] happened to work before only
    // because whoever last edited the file left the newest date's tab first — that's a
    // side effect of Excel tab order, not a reliable rule, and it silently produces the wrong
    // day's data the moment tabs get reordered or a specific archived file
    // (e.g. "Warehouse Stock 01-06-2026.xlsx") is expected to load ITS OWN 01-06-2026 tab
    // rather than whatever tab happens to be first. See chooseSheetName() above for the rule.
    //
    // Try the fast, low-memory path first (see tryFastExtractSheet above) — it selectively
    // inflates only the one sheet we need straight from the zip. Only fall back to the slow
    // path (full XLSX.read of the whole workbook) if that didn't work for any reason, so
    // normal files are never put at risk by this optimization.
    const fast = tryFastExtractSheet(buf, fileName);
    let chosenSheetName: string;
    let ws: any;
    if (fast) {
      ({ chosenSheetName, ws } = fast);
    } else {
      // ── Slow path: read sheet NAMES only first (cheap for most files — skips cell data) ──
      const wbNamesOnly = XLSX.read(buf, { type: 'buffer', bookSheets: true });
      chosenSheetName = chooseSheetName(wbNamesOnly.SheetNames, fileName);
      // ── Parse ONLY the chosen sheet's cell data ─────────────────────────────────────
      const wb = XLSX.read(buf, { type: 'buffer', raw: true, sheets: [chosenSheetName] });
      ws = wb.Sheets[chosenSheetName];
    }
    const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!rawData.length) {
      parentPort!.postMessage({ success: true, headers: [], rows: [] });
      return;
    }

    // Real warehouse sheets often start with a merged title/summary row (sheet name, "as on"
    // date, a handful of running totals) BEFORE the real header row. That summary row can
    // easily have 3+ non-empty cells itself, so "first row with >=3 filled cells" picks the
    // wrong row and every column ends up misnamed. A genuine header row lists every column,
    // so it reliably has the MOST filled cells of any row near the top — pick that one instead.
    let headerRowIdx = 0;
    let maxFilled = -1;
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      const filled = rawData[i].filter((c: any) => String(c).trim()).length;
      if (filled > maxFilled) { maxFilled = filled; headerRowIdx = i; }
    }
    const rawHeaders: string[] = rawData[headerRowIdx].map((h: any) => String(h).trim());
    // ── De-duplicate header names ────────────────────────────────────────────────────
    // Real sheets sometimes reuse the same column title twice for genuinely different
    // columns (e.g. one real file has both a "Qty " after "No of Pallet"/"Box" AND a
    // separate "Qty" after "Despath" a few columns later — two different figures that both
    // trim down to the identical key "Qty"). Building the row object as `obj[h] = value`
    // for each header in order means the SECOND column with that name silently overwrites
    // the first one's value for every row — the first "Qty" column's data was being thrown
    // away entirely, with no error or warning. Keep the first occurrence's name exactly as
    // before (so every existing exact-name/alias lookup elsewhere is unaffected), and only
    // rename the 2nd, 3rd, etc. occurrence (e.g. "Qty" -> "Qty (2)") so both columns' data
    // survives into the parsed row.
    const headerNameCounts = new Map<string, number>();
    const headers: string[] = rawHeaders.map((h) => {
      const n = (headerNameCounts.get(h) || 0) + 1;
      headerNameCounts.set(h, n);
      return n === 1 ? h : `${h} (${n})`;
    });
    const rowsAfterHeader = rawData.slice(headerRowIdx + 1);
    const dataRows = rowsAfterHeader.filter((r: any[]) => r.filter((c: any) => String(c).trim()).length >= 2);
    const blankRowsSkipped = rowsAfterHeader.length - dataRows.length;

    const parsedRows = dataRows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => { obj[h] = convertCell(row[i], h); });
      return obj;
    });

    parentPort!.postMessage({
      success: true,
      headers,
      rows: parsedRows,
      blankRowsSkipped,
      totalRowsInSheet: rowsAfterHeader.length,
      // Which tab was actually parsed — harmless additive field for a multi-sheet workbook;
      // existing callers that only destructure {rows, blankRowsSkipped, totalRowsInSheet}
      // are unaffected.
      sheetName: chosenSheetName,
    });
  } catch (err: any) {
    parentPort!.postMessage({ success: false, error: err.message });
  }
}

run();
