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
    const { fileBase64, fileName } = workerData as { fileBase64: string; fileName: string };
    if (!fileBase64) {
      parentPort!.postMessage({ success: false, error: 'fileBase64 is required' });
      return;
    }

    const buf = Buffer.from(fileBase64, 'base64');

    // ── Read sheet NAMES only first (cheap — skips parsing any cell data) ─────────────
    // A plain `XLSX.read(buf)` parses every sheet's full cell data up front, even though we
    // only ever need ONE sheet below. That's harmless for a normal single-sheet file, but a
    // real 40-50MB multi-tab "one sheet per date" workbook (76 tabs x up to ~6,800 rows each)
    // blew straight through this worker's 512MB heap ceiling parsing all 76 tabs just to read
    // the one the code actually wanted — failing the whole upload with a generic "too large"
    // error even though the ONE sheet we need is a perfectly normal size. `bookSheets: true`
    // reads only the workbook's sheet list (a few KB of metadata), not any cell data, so this
    // first pass costs a couple of seconds and ~15MB regardless of file size.
    const wbNamesOnly = XLSX.read(buf, { type: 'buffer', bookSheets: true });

    // ── Sheet selection ──────────────────────────────────────────────────────────────
    // Some real warehouse workbooks (e.g. daily "godown sheet" exports) keep one sheet PER
    // DATE, tab-named like "28-07-2026", instead of one sheet total — a single such workbook
    // can hold 70+ dated snapshots. Always taking SheetNames[0] happened to work before only
    // because whoever last edited the file left the newest date's tab first — that's a
    // side effect of Excel tab order, not a reliable rule, and it silently produces the wrong
    // day's data the moment tabs get reordered or a specific archived file
    // (e.g. "Warehouse Stock 01-06-2026.xlsx") is expected to load ITS OWN 01-06-2026 tab
    // rather than whatever tab happens to be first.
    //   1. If the uploaded filename contains a DD-MM-YYYY (or D-M-YYYY) date that exactly
    //      matches one of the sheet tab names, use that sheet — the file is presumably named
    //      for the snapshot it's meant to represent.
    //   2. Else, if two or more tabs are themselves named as dates, use the most recent one
    //      (the natural "current stock" reading of a dated-tabs workbook).
    //   3. Else (the common case — a normal single/few-sheet template), fall back to the
    //      original behavior: the first sheet. No change for any file that isn't structured
    //      like this.
    const DATE_TAB = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;
    const tabDateValue = (name: string): number | null => {
      const m = DATE_TAB.exec(name.trim());
      if (!m) return null;
      const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
      return isNaN(d.getTime()) ? null : d.getTime();
    };
    let chosenSheetName = wbNamesOnly.SheetNames[0];
    const dateTabs = wbNamesOnly.SheetNames.filter((n: string) => tabDateValue(n) !== null);
    if (dateTabs.length) {
      // Pull a bare DD-MM-YYYY (or D/M/YYYY, D.M.YYYY) substring out of the filename, if any
      // — e.g. "Warehouse Stock 01-06-2026.xlsx" -> "01-06-2026".
      const filenameDateStr = fileName ? String(fileName).match(/\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/)?.[0] : undefined;
      const filenameDateValue = filenameDateStr ? tabDateValue(filenameDateStr) : null;
      const matchedFromFilename = filenameDateValue !== null
        ? dateTabs.find((n: string) => tabDateValue(n) === filenameDateValue)
        : undefined;
      chosenSheetName = matchedFromFilename || dateTabs.reduce((latest: string, n: string) =>
        (tabDateValue(n) as number) > (tabDateValue(latest) as number) ? n : latest, dateTabs[0]);
    }

    // ── Second pass: parse ONLY the chosen sheet's cell data ──────────────────────────
    // `sheets: [name]` tells the parser to skip every other tab entirely — for the 76-tab
    // file above, this is the difference between loading ~450,000 rows across every date and
    // loading just the ~5,700 rows in the one sheet actually being imported.
    const wb = XLSX.read(buf, { type: 'buffer', raw: true, sheets: [chosenSheetName] });
    const ws = wb.Sheets[chosenSheetName];
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
