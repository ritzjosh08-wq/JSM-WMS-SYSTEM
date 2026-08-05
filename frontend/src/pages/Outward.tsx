"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Truck, Plus, Search, CheckCircle2, AlertTriangle,
  RefreshCw, Package, XCircle, FileSpreadsheet
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuthStore } from "../store/authStore";

const API = import.meta.env.VITE_API_BASE || "http://localhost:5001/api";

// ─── Types ───────────────────────────────────────────────────────────────────
interface FifoRec {
  batchId: string;
  batchNumber: string;
  warehouse: string;
  warehouseId: string;
  stockLocation: string;
  location: string;
  binLocation: string;
  available: number;
  recommendedPick: number;
  receiptDate: string;
  materialType: string;
  invoiceNo: string;
}

interface OutwardLine {
  id: string;
  materialCode: string;
  materialType: string;
  description: string;
  category: string;
  huUnit: string;
  requiredQty: number;
  // After FIFO check
  matchStatus: "PENDING" | "LOADING" | "FOUND" | "SHORT" | "NOT_FOUND";
  availableQty: number;
  recommendations: FifoRec[];
  expanded: boolean;
}

interface DispatchHeader {
  date: string;
  outboundInvoiceNo: string;
  truckNumber: string;
  transporter: string;
  source: string;
  destination: string;
  sapDocumentNo: string;
  lrNumber: string;
  createdBy: string;
}

interface RawBatch {
  id: string;
  batchNumber: string;
  quantity: number;
  warehouseId: string;
  stockStatus?: string;
  customFields: string | null;
  material: { code: string; description: string; materialType?: string; category?: string; huUnit?: string } | null;
}

// ─── Picklist Excel Export ────────────────────────────────────────────────────
function exportPicklistXLSX(
  header: DispatchHeader,
  lines: OutwardLine[],
  outwardNumber: string,
  skipConfirm = false
) {
  const confirmed = lines.filter(l => l.matchStatus === "FOUND" || l.matchStatus === "SHORT");
  if (!confirmed.length) return;

  if (!skipConfirm) {
    const totalQty = confirmed.reduce((s, l) => s + l.recommendations.reduce((s2, r) => s2 + r.recommendedPick, 0), 0);
    const ok = window.confirm(
      `Ready to export Picklist — ${outwardNumber}\n\n` +
      `• ${confirmed.length} material line(s)\n` +
      `• ${totalQty} total units\n` +
      `• Truck: ${header.truckNumber || '—'}\n` +
      `• Destination: ${header.destination || '—'}\n\n` +
      `Click OK to download the Excel picklist.`
    );
    if (!ok) return;
  }

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Picklist ──────────────────────────────────────────────────────
  const dateStr = new Date(header.date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Info rows at top
  const infoRows = [
    ["JSM Logistics — Outward Picklist"],
    [`Work Order: ${outwardNumber}`],
    [""],
    ["Date", dateStr, "Truck No.", header.truckNumber || "—", "Transporter", header.transporter || "—"],
    ["Source", header.source || "—", "Destination", header.destination || "—", "SAP Doc No", header.sapDocumentNo || "—"],
    ["LR Number", header.lrNumber || "—"],
    [""],
    // Table header
    ["Material Code", "Type of Material", "Description", "Category", "HU Unit", "Pick Qty", "Batch / Invoice", "BIN Location", "Stock Location", "Receipt Date"],
  ];

  // Data rows
  const dataRows = confirmed.flatMap(line =>
    line.recommendations.filter(r => r.recommendedPick > 0).map(rec => [
      line.materialCode,
      line.materialType || "—",
      line.description || "—",
      line.category || "—",
      line.huUnit || "Nos",
      rec.recommendedPick,
      rec.invoiceNo || rec.batchNumber,
      rec.binLocation || rec.location || "—",
      rec.stockLocation || rec.warehouse || "—",
      rec.receiptDate ? new Date(rec.receiptDate).toLocaleDateString("en-IN") : "—",
    ])
  );

  const totalQty = dataRows.reduce((s, r) => s + (Number(r[5]) || 0), 0);
  const totalRow = ["TOTAL", "", "", "", "", totalQty, `${confirmed.length} line(s)`, "", "", ""];

  const allRows = [...infoRows, ...dataRows, [""], totalRow, [""], ["Prepared by", "", "Checked by", "", "Gate Officer", "", "Authorized by"]];

  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Column widths
  ws["!cols"] = [
    { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Picklist");

  // Download
  XLSX.writeFile(wb, `Picklist_${outwardNumber}_${dateStr.replace(/\//g, "-")}.xlsx`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
const DRAFT_KEY = "jsm_outward_draft";

function loadDraft(): { header: DispatchHeader } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveDraft(header: DispatchHeader) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ header })); } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function parseCF(s: string | null | undefined): any {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

// Every distinct physical HU tag recorded against a batch. Older records (committed before
// the multi-tag fix) only ever stored a single `huUnit` string — fall back to that so old
// data still matches. New records carry the full `huUnits` array (see backend commit route).
function batchHUTags(cf: any): string[] {
  if (Array.isArray(cf.huUnits) && cf.huUnits.length) return cf.huUnits.map((h: any) => String(h || "").trim()).filter(Boolean);
  return cf.huUnit ? [String(cf.huUnit).trim()] : [];
}

// Generic units-of-measure ("Kg", "Nos", "Pallet"...) are not unique physical tags — many
// unrelated batches can legitimately share the same one. Treating them as a searchable HU
// code causes false collisions (scanning "kg" could match several different materials).
const GENERIC_HU_VALUES = new Set(["nos", "pallet", "pallets", "box", "boxes", "kg", "kgs"]);
function isSpecificHUValue(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s !== "" && !GENERIC_HU_VALUES.has(s);
}

export default function OutwardClient() {
  const user = useAuthStore(s => s.user);
  const selectedWorker = useAuthStore(s => s.selectedWorker);
  const isViewer = user?.role === 'CUSTOMER';
  const draft = loadDraft();
  const [header, setHeader] = useState<DispatchHeader>(draft?.header ?? {
    date: new Date().toISOString().split("T")[0],
    outboundInvoiceNo: "",
    truckNumber: "",
    transporter: "",
    source: "",
    destination: "",
    sapDocumentNo: "",
    lrNumber: "",
    createdBy: "",
  });
  const [allBatches, setAllBatches] = useState<RawBatch[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ outwardNumber: string } | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  // Snapshot of what was ACTUALLY dispatched (HU-unit flow), used to build the picklist
  // export — populated with the real picked batches right before the dispatch call.
  const [dispatchedLines, setDispatchedLines] = useState<OutwardLine[]>([]);

  // HU unit entry workflow
  const [huBulkText, setHuBulkText] = useState<string>("");
  const [huEntries, setHuEntries] = useState<string[]>([""]);
  const [matchedBatches, setMatchedBatches] = useState<RawBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [huSearched, setHuSearched] = useState(false);
  const [huGenericWarning, setHuGenericWarning] = useState<string | null>(null);
  // Per-batch dispatch qty (partial dispatch — defaults to full batch quantity)
  const [huBatchQtys, setHuBatchQtys] = useState<Map<string, number>>(new Map());

  // ── Persist draft to localStorage whenever header changes
  useEffect(() => { saveDraft(header); }, [header]);

  // ── Fetch live inventory materials + raw batches
  useEffect(() => {
    setLoadingMaterials(true);
    fetch(`${API}/inventory`)
      .then(r => r.json())
      .then(data => {
        const inv: any[] = Array.isArray(data.inventory) ? data.inventory : [];
        // Store raw batches (for HU unit lookup — include discrepancy items too)
        setAllBatches(inv.filter(i => i.quantity > 0 && i.material?.code).map(i => ({ ...i, stockStatus: i.stockStatus })));
      })
      .catch(() => {})
      .finally(() => setLoadingMaterials(false));
  }, []);

  // ── HU unit search
  const findHUMaterials = () => {
    // Parse bulk textarea: split by newlines, commas, or semicolons
    const fromBulk = huBulkText.split(/[\n,;]+/).map(h => h.trim()).filter(Boolean);
    const fromIndividual = huEntries.map(h => h.trim()).filter(Boolean);
    const combined = fromBulk.length ? fromBulk : fromIndividual;
    if (!combined.length) return;
    // Sync back to huEntries so they're visible
    if (fromBulk.length) setHuEntries(fromBulk);
    const entered = combined;
    if (!entered.length) return;
    const lower = new Set(entered.map(h => h.toLowerCase()).filter(isSpecificHUValue));
    const genericSearched = entered.filter(h => !isSpecificHUValue(h));
    const matched = allBatches.filter(b => {
      const cf = parseCF(b.customFields);
      // Check EVERY HU tag ever recorded on this batch, not just the most recent one —
      // otherwise scanning an earlier pallet's tag (still legitimately in stock) finds nothing.
      return batchHUTags(cf).some(tag => lower.has(tag.toLowerCase()));
    });
    setHuGenericWarning(
      genericSearched.length
        ? `Ignored "${genericSearched.join('", "')}" — that's a generic unit of measure, not a specific pallet tag, so it can't be used to look up a single item.`
        : null
    );
    setMatchedBatches(matched);
    setSelectedBatchIds(new Set(matched.map(b => b.id)));
    // Initialise dispatch qty = full quantity for each batch (user can reduce)
    const initQtys = new Map<string, number>();
    matched.forEach(b => initQtys.set(b.id, b.quantity));
    setHuBatchQtys(initQtys);
    setHuSearched(true);
  };

  // ── Build both the FIFO-dispatch payload (grouped by material) and the picklist-export
  // snapshot from whatever's currently selected in the HU table. Shared by the pre-dispatch
  // "Export Picklist" preview button and the real handleHUDispatch commit below, so the
  // picklist a worker prints to go pick pallets is byte-for-byte the same data that's about
  // to be dispatched — no separate code path to drift out of sync.
  const buildHULines = useCallback(() => {
    const selected = matchedBatches.filter(b => selectedBatchIds.has(b.id));
    if (!selected.length) return null;

    const lineMap = new Map<string, { materialCode: string; description: string; materialType: string; category: string; huUnit: string; requiredQty: number; picks: any[] }>();
    selected.forEach(b => {
      const cf = parseCF(b.customFields);
      const code = b.material?.code || "UNKNOWN";
      if (!lineMap.has(code)) {
        lineMap.set(code, {
          materialCode: code,
          description: b.material?.description || "",
          materialType: cf.materialType || b.material?.materialType || "",
          category: (cf.category || b.material?.category || "RM").toUpperCase(),
          huUnit: cf.huUnit || b.material?.huUnit || "Nos",
          requiredQty: 0,
          picks: [],
        });
      }
      const ln = lineMap.get(code)!;
      // Use user-specified partial dispatch qty, clamped to available stock
      const dispQty = Math.min(Math.max(0, huBatchQtys.get(b.id) ?? b.quantity), b.quantity);
      ln.requiredQty += dispQty;
      ln.picks.push({
        batchId: b.id, batchNumber: b.batchNumber, pickQty: dispQty,
        stockLocation: cf.stockLocation || "", warehouseId: b.warehouseId,
        // Carried through so the exported picklist (below) can show BIN/invoice/receipt
        // date per pick — the export used to read these off a completely different,
        // never-populated `lines` state, so they never showed up either.
        binLocation: cf.binLocation || "",
        invoiceNo: cf.invoiceNo || "",
        receiptDate: cf.inwardDate || "",
      });
    });
    const dispatchLines = Array.from(lineMap.values());

    const exportLines: OutwardLine[] = dispatchLines.map(l => ({
      id: makeLineId(),
      materialCode: l.materialCode,
      materialType: l.materialType,
      description: l.description,
      category: l.category,
      huUnit: l.huUnit,
      requiredQty: l.requiredQty,
      matchStatus: "FOUND",
      availableQty: l.requiredQty,
      expanded: true,
      recommendations: l.picks.map((p: any) => ({
        batchId: p.batchId,
        batchNumber: p.batchNumber,
        warehouse: "",
        warehouseId: p.warehouseId,
        stockLocation: p.stockLocation || "",
        location: p.binLocation || "",
        binLocation: p.binLocation || "",
        available: p.pickQty,
        recommendedPick: p.pickQty,
        receiptDate: p.receiptDate || "",
        materialType: l.materialType || "",
        invoiceNo: p.invoiceNo || "",
      })),
    }));

    return { dispatchLines, exportLines };
  }, [matchedBatches, selectedBatchIds, huBatchQtys]);

  // ── Export a picklist for the current selection WITHOUT dispatching — lets a worker
  // pick the indent's pallets against a printed/exported sheet first, then come back and
  // hit Confirm Dispatch once picking is actually done. Nothing is deducted from inventory
  // here; it's purely a read-only export of what's currently selected.
  const handleExportPicklistPreview = () => {
    const built = buildHULines();
    if (!built) { alert("⚠ Select at least one batch to export a picklist for."); return; }
    const label = header.outboundInvoiceNo?.trim() || "DRAFT";
    exportPicklistXLSX(header, built.exportLines, label, false);
  };

  // ── HU-based dispatch
  const handleHUDispatch = async () => {
    if (!header.truckNumber.trim()) {
      alert("⚠ Truck Number is required before dispatching."); return;
    }
    const built = buildHULines();
    if (!built) {
      alert("⚠ Select at least one batch to dispatch."); return;
    }
    const { dispatchLines, exportLines } = built;

    const summary = dispatchLines.map(l => `• ${l.materialCode} — ${l.requiredQty.toFixed(0)} units`).join("\n");
    if (!window.confirm(`Confirm Dispatch to ${header.destination || "destination"}?\n\nTruck: ${header.truckNumber}\nOutbound Invoice: ${header.outboundInvoiceNo || "—"}\n\nMaterials:\n${summary}\n\nThis will deduct from inventory immediately.`)) return;

    setDispatching(true); setDispatchError(null);
    try {
      const res = await fetch(`${API}/outward/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...header, lines: dispatchLines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dispatch failed");
      clearDraft();
      setDispatchedLines(exportLines);
      setDispatchResult({ outwardNumber: data.outwardNumber });
      // Auto-export picklist — this used to be a no-op because it read from the stale
      // `lines` state; now it uses the real dispatch snapshot built above.
      setTimeout(() => exportPicklistXLSX(header, exportLines, data.outwardNumber, true), 300);
    } catch (e: any) {
      const msg = e.message || "Unknown error";
      setDispatchError(msg);
      alert(`❌ Dispatch failed: ${msg}`);
    } finally {
      setDispatching(false);
    }
  };

  const resetForm = () => {
    clearDraft();
    setDispatchResult(null);
    setDispatchError(null);
    setDispatchedLines([]);
    setHuBulkText("");
    setHuBatchQtys(new Map());
    setHuEntries([""]);
    setMatchedBatches([]);
    setSelectedBatchIds(new Set());
    setHuSearched(false);
    setHeader({ date: new Date().toISOString().split("T")[0], outboundInvoiceNo: "", truckNumber: "", transporter: "", source: "", destination: "", sapDocumentNo: "", lrNumber: "", createdBy: "" });
  };

  // ── Render

  // Success screen
  if (dispatchResult) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", padding: "60px 20px", textAlign: "center" }}>
        <div style={{ background: "#ecfdf5", border: "2px solid #a7f3d0", borderRadius: "50%", width: "72px", height: "72px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={36} style={{ color: "#059669" }} />
        </div>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", margin: "0 0 6px" }}>Dispatch Successful!</h2>
          <div style={{ fontSize: "14px", color: "#64748b" }}>Work Order: <strong style={{ fontFamily: "monospace", color: "#2563eb" }}>{dispatchResult.outwardNumber}</strong></div>
          <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "4px" }}>Inventory updated. Excel picklist downloading automatically…</div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => exportPicklistXLSX(header, dispatchedLines, dispatchResult.outwardNumber)}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", background: "#1e40af", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >
            <FileSpreadsheet size={16} /> Export Picklist
          </button>
          <button
            onClick={resetForm}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", background: "#f8fafc", color: "#374151", border: "1.5px solid #e2e8f0", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >
            <Plus size={16} /> New Dispatch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* ── Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 900, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <Truck size={22} style={{ color: "#059669" }} />
            {selectedWorker ? `Outbound — ${selectedWorker.name}` : 'Outbound Dispatch'}
          </h1>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
            {selectedWorker
              ? `Dispatching from ${selectedWorker.name}'s warehouse (${selectedWorker.warehouseCode || selectedWorker.warehouseCodes?.join(', ') || '—'})`
              : isViewer ? "View dispatch records and inventory movements" : "Enter HU unit codes → Find matching inventory → Select & Confirm Dispatch"}
          </p>
        </div>
        {isViewer && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '6px', padding: '4px 10px' }}>
            👁 View Only
          </span>
        )}
      </div>

      {/* ── Error */}
      {dispatchError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "12px 16px", color: "#dc2626", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertTriangle size={15} /> {dispatchError}
          <button onClick={() => setDispatchError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}><XCircle size={14} /></button>
        </div>
      )}

      {/* ── Truck / Dispatch Details */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Truck size={12} /> Dispatch Details
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {[
            { label: "Date *",              field: "date" as const,              type: "date" },
            { label: "Outbound Invoice No", field: "outboundInvoiceNo" as const, placeholder: "OUT-INV-XXXX" },
            { label: "Truck Number *",      field: "truckNumber" as const,       placeholder: "TN 00 AB 0000" },
            { label: "Transporter",         field: "transporter" as const,       placeholder: "Transporter name" },
            { label: "Source",              field: "source" as const,            placeholder: "Origin / source plant" },
            { label: "Destination",         field: "destination" as const,       placeholder: "Delivery location" },
            { label: "SAP Document No",     field: "sapDocumentNo" as const,     placeholder: "490XXXXX" },
            { label: "LR Number",           field: "lrNumber" as const,          placeholder: "LR No." },
            { label: "Created By",          field: "createdBy" as const,         placeholder: "Your name" },
          ].map(({ label, field, type, placeholder }: any) => (
            <div key={field}>
              <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>{label}</label>
              <input
                type={type || "text"}
                value={(header as any)[field]}
                onChange={e => !isViewer && setHeader(h => ({ ...h, [field]: e.target.value }))}
                placeholder={placeholder}
                readOnly={isViewer}
                style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", color: "#0f172a", outline: "none", boxSizing: "border-box", background: isViewer ? "#f8fafc" : "#fff" }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── HU Unit Entry */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Package size={12} /> HU Unit Entry — Materials to Dispatch
        </div>
        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "14px" }}>
          Enter the HU unit codes for each pallet/unit to dispatch. The system will find the matching inventory batches.
        </div>

        {/* HU unit bulk input */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", fontWeight: 600 }}>
            Paste or type HU units below — one per line, or separated by commas/semicolons
          </div>
          <textarea
            value={huBulkText}
            onChange={e => setHuBulkText(e.target.value)}
            placeholder={"HU123456\nHU789012\nHU345678\n..."}
            rows={5}
            style={{ width: "100%", border: "1.5px solid #bfdbfe", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", fontWeight: 700, color: "#1e40af", outline: "none", background: "#eff6ff", resize: "vertical", boxSizing: "border-box", fontFamily: "monospace", lineHeight: 1.6 }}
          />
          {huBulkText.trim() && (
            <div style={{ fontSize: "11px", color: "#2563eb", marginTop: "4px" }}>
              {huBulkText.split(/[\n,;]+/).map(h => h.trim()).filter(Boolean).length} HU unit(s) ready to search
            </div>
          )}
        </div>

        {/* Individual HU rows (shown after search so users can see what was parsed) */}
        {huSearched && huEntries.filter(Boolean).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
            {huEntries.filter(Boolean).map((hu, idx) => (
              <span key={idx} style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: "20px", padding: "3px 12px", fontSize: "12px", fontWeight: 700, color: "#1e40af" }}>
                {hu}
              </span>
            ))}
          </div>
        )}

        {!isViewer && (
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={findHUMaterials} disabled={loadingMaterials}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 18px", background: "#2563eb", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
              <Search size={12} /> Find Materials
            </button>
            {huSearched && (
              <button
                onClick={() => { setHuSearched(false); setMatchedBatches([]); setSelectedBatchIds(new Set()); setHuEntries([""]); setHuBulkText(""); setHuGenericWarning(null); }}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "8px", color: "#64748b", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                <XCircle size={12} /> Clear
              </button>
            )}
          </div>
        )}

        {/* Search results */}
        {huSearched && (
          <div style={{ marginTop: "16px" }}>
            {huGenericWarning && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", marginBottom: "10px" }}>
                <AlertTriangle size={14} style={{ color: "#b45309", flexShrink: 0 }} />
                <span style={{ fontSize: "11px", color: "#92400e", fontWeight: 600 }}>{huGenericWarning}</span>
              </div>
            )}
            {matchedBatches.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px", background: "#fef2f2", borderRadius: "10px", border: "1px solid #fca5a5" }}>
                <AlertTriangle size={24} style={{ color: "#dc2626", margin: "0 auto 8px" }} />
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#dc2626" }}>No matching HU units found in inventory</div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>Check the HU codes and try again</div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#059669" }}>
                    {matchedBatches.length} batch{matchedBatches.length !== 1 ? "es" : ""} found —
                    <span style={{ color: "#2563eb" }}> {selectedBatchIds.size} selected</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => setSelectedBatchIds(new Set(matchedBatches.map(b => b.id)))}
                      style={{ padding: "4px 12px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "6px", color: "#059669", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                      Select All
                    </button>
                    <button onClick={() => setSelectedBatchIds(new Set())}
                      style={{ padding: "4px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", color: "#64748b", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                      Deselect All
                    </button>
                  </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr>
                      {["✓", "HU Unit", "Material Code", "Description", "Type", "Category", "Batch No", "Invoice No", "BIN", "Stock Location", "In Stock", "Dispatch Qty", "Remaining"].map(h => (
                        <th key={h} style={{ padding: "7px 10px", textAlign: h === "In Stock" || h === "Dispatch Qty" || h === "Remaining" ? "right" : "left", fontSize: "10px", fontWeight: 700, color: h === "Dispatch Qty" ? "#2563eb" : "#64748b", borderBottom: "1.5px solid #e2e8f0", background: h === "Dispatch Qty" ? "#eff6ff" : "#f8fafc", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matchedBatches.map((batch, ri) => {
                      const cf = parseCF(batch.customFields);
                      const sel = selectedBatchIds.has(batch.id);
                      const isDisc = batch.stockStatus === "DISCREPANCY" ||
                        Number(cf.shortInPallet || 0) !== 0 ||
                        Number(cf.shortExcessInKg || 0) !== 0 ||
                        Number(cf.shortExcessInQty || 0) !== 0 ||
                        !!cf.discrepancyRemarks || !!cf.discrepancy;
                      const dispQty = huBatchQtys.get(batch.id) ?? batch.quantity;
                      const remaining = batch.quantity - dispQty;
                      return (
                        <tr key={batch.id} onClick={() => {
                          setSelectedBatchIds(prev => {
                            const next = new Set(prev);
                            if (next.has(batch.id)) next.delete(batch.id); else next.add(batch.id);
                            return next;
                          });
                        }} style={{ background: isDisc && sel ? "#fff7ed" : sel ? "#ecfdf5" : ri % 2 === 0 ? "#fff" : "#f8fafc", cursor: "pointer", borderLeft: sel ? (isDisc ? "3px solid #f97316" : "3px solid #059669") : "3px solid transparent" }}>
                          <td style={{ padding: "7px 10px" }}>
                            <input type="checkbox" checked={sel} onChange={() => {}} style={{ cursor: "pointer" }} />
                          </td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontWeight: 800, color: "#1e40af" }}>{cf.huUnit || "—"}</td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontWeight: 700, color: "#0f172a" }}>
                            {batch.material?.code || "—"}
                            {isDisc && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "9px", fontWeight: 800, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fca5a5", padding: "1px 5px", borderRadius: "4px", marginLeft: "4px" }}>
                                ⚠ DISC
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "7px 10px", color: "#374151", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{batch.material?.description || "—"}</td>
                          <td style={{ padding: "7px 10px", color: "#0891b2", fontWeight: 600 }}>{cf.materialType || "—"}</td>
                          <td style={{ padding: "7px 10px" }}>
                            <span style={{ background: (cf.category || "RM").toUpperCase().includes("FG") ? "#f5f3ff" : "#ecfdf5", color: (cf.category || "RM").toUpperCase().includes("FG") ? "#7c3aed" : "#059669", border: `1px solid ${(cf.category || "RM").toUpperCase().includes("FG") ? "#ddd6fe" : "#a7f3d0"}`, padding: "1px 7px", borderRadius: "12px", fontSize: "10px", fontWeight: 700 }}>
                              {(cf.category || "RM").toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: "11px", color: cf.batchNo ? "#374151" : "#94a3b8" }}>{cf.batchNo || "—"}</td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: "11px", color: "#2563eb", fontWeight: 700 }}>{cf.invoiceNo || "—"}</td>
                          <td style={{ padding: "7px 10px", fontWeight: 700, color: "#7c3aed" }}>{cf.binLocation || "—"}</td>
                          <td style={{ padding: "7px 10px", color: "#374151" }}>{cf.stockLocation || "—"}</td>
                          <td style={{ padding: "7px 10px", fontWeight: 700, color: "#475569", textAlign: "right" }}>{batch.quantity.toFixed(0)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", background: sel ? "#eff6ff" : "transparent" }} onClick={e => e.stopPropagation()}>
                            <input
                              type="number"
                              min={0}
                              max={batch.quantity}
                              value={sel ? dispQty : batch.quantity}
                              disabled={!sel}
                              onChange={e => {
                                const v = Math.min(Math.max(0, Number(e.target.value)), batch.quantity);
                                setHuBatchQtys(prev => { const m = new Map(prev); m.set(batch.id, v); return m; });
                              }}
                              style={{ width: "72px", border: sel ? "1.5px solid #93c5fd" : "1.5px solid #e2e8f0", borderRadius: "6px", padding: "4px 6px", fontSize: "12px", fontWeight: 800, color: sel ? "#1e40af" : "#94a3b8", textAlign: "right", background: sel ? "#fff" : "#f8fafc", outline: "none" }}
                            />
                          </td>
                          <td style={{ padding: "7px 10px", fontWeight: 700, textAlign: "right", color: remaining === 0 ? "#64748b" : remaining > 0 ? "#059669" : "#dc2626" }}>
                            {sel ? remaining.toFixed(0) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Dispatch bar */}
                {!isViewer && selectedBatchIds.size > 0 && (() => {
                  const selBatches = matchedBatches.filter(b => selectedBatchIds.has(b.id));
                  const totalDispatch = selBatches.reduce((s, b) => s + Math.min(huBatchQtys.get(b.id) ?? b.quantity, b.quantity), 0);
                  const totalRemaining = selBatches.reduce((s, b) => s + (b.quantity - Math.min(huBatchQtys.get(b.id) ?? b.quantity, b.quantity)), 0);
                  return (
                  <div style={{ marginTop: "14px", background: "#ecfdf5", border: "1.5px solid #a7f3d0", borderRadius: "10px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "16px" }}>
                    <CheckCircle2 size={18} style={{ color: "#059669", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#065f46" }}>
                        {selectedBatchIds.size} batch{selectedBatchIds.size !== 1 ? "es" : ""} selected for dispatch
                      </div>
                      <div style={{ fontSize: "11px", color: "#059669", marginTop: "2px" }}>
                        Dispatch: <strong>{totalDispatch.toFixed(0)}</strong> units
                        {totalRemaining > 0 && <> · Remaining in inventory: <strong>{totalRemaining.toFixed(0)}</strong></>}
                      </div>
                    </div>
                    <button onClick={handleExportPicklistPreview} disabled={dispatching}
                      title="Download the picklist for what's selected — nothing is dispatched or deducted yet. Pick the pallets against this sheet, then come back and Confirm Dispatch."
                      style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", background: "#fff", border: "1.5px solid #1e40af", borderRadius: "9px", color: "#1e40af", fontSize: "13px", fontWeight: 800, cursor: dispatching ? "not-allowed" : "pointer" }}>
                      <FileSpreadsheet size={14} /> Export Picklist
                    </button>
                    <button onClick={handleHUDispatch} disabled={dispatching}
                      style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 24px", background: "#059669", border: "none", borderRadius: "9px", color: "#fff", fontSize: "13px", fontWeight: 800, cursor: dispatching ? "not-allowed" : "pointer", boxShadow: "0 2px 8px rgba(5,150,105,0.3)" }}>
                      {dispatching
                        ? <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Dispatching…</>
                        : <><Truck size={14} /> Confirm Dispatch</>}
                    </button>
                  </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
