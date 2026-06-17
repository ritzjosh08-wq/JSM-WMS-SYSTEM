"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Truck, Plus, Trash2, Search, CheckCircle2, AlertTriangle,
  Printer, Database, RefreshCw, Package, ChevronDown, ChevronUp,
  ArrowUpFromLine, XCircle, Check, FileSpreadsheet
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuthStore } from "../store/authStore";

const API = "http://localhost:5001/api";

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
  customFields: string | null;
  material: { code: string; description: string; materialType?: string; category?: string; huUnit?: string } | null;
}

interface InventoryMaterial {
  code: string;
  description: string;
  materialType: string;
  category: string;
  huUnit: string;
  totalQty: number;
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

// ─── Material Autocomplete ────────────────────────────────────────────────────
function MaterialAutocomplete({
  value, materials, loading, onSelect
}: {
  value: string;
  materials: InventoryMaterial[];
  loading: boolean;
  onSelect: (code: string) => void;
}) {
  const [inputVal, setInputVal] = useState(value);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  // Keep input in sync when parent changes value (e.g. reset)
  React.useEffect(() => { setInputVal(value); }, [value]);

  const filtered = inputVal.trim() === ""
    ? materials.slice(0, 12)
    : materials.filter(m =>
        m.code.toLowerCase().includes(inputVal.toLowerCase()) ||
        m.description.toLowerCase().includes(inputVal.toLowerCase()) ||
        m.materialType.toLowerCase().includes(inputVal.toLowerCase())
      ).slice(0, 10);

  const handleSelect = (code: string) => {
    setInputVal(code);
    setOpen(false);
    onSelect(code);
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setOpen(true); }}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 150); }}
          placeholder={loading ? "Loading inventory…" : "Type material code or name…"}
          style={{
            width: "100%", border: `1.5px solid ${focused ? "#2563eb" : "#e2e8f0"}`,
            borderRadius: "7px", padding: "6px 24px 6px 8px",
            fontSize: "11px", fontWeight: 700, color: "#0f172a",
            background: "#fff", outline: "none", boxSizing: "border-box",
            transition: "border-color 0.1s",
          }}
        />
        <Search size={11} style={{ position: "absolute", right: "7px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 1000,
          background: "#fff", border: "1.5px solid #bfdbfe", borderRadius: "9px",
          boxShadow: "0 8px 24px rgba(37,99,235,0.12)", overflow: "hidden",
        }}>
          <div style={{ padding: "5px 10px", fontSize: "9px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            {inputVal ? `${filtered.length} match${filtered.length !== 1 ? "es" : ""}` : "Available in inventory"}
          </div>
          {filtered.map(m => (
            <div
              key={m.code}
              onMouseDown={() => handleSelect(m.code)}
              style={{
                padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9",
                display: "flex", flexDirection: "column", gap: "2px",
                transition: "background 0.08s",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#eff6ff"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#fff"}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 800, color: "#1e40af" }}>{m.code}</span>
                {m.materialType && <span style={{ background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: "4px", padding: "1px 5px", fontSize: "9px", fontWeight: 700 }}>{m.materialType}</span>}
                <span style={{ marginLeft: "auto", background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", borderRadius: "4px", padding: "1px 6px", fontSize: "9px", fontWeight: 700 }}>
                  {m.totalQty.toFixed(0)} avail
                </span>
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.description}</div>
            </div>
          ))}
          {inputVal && filtered.length === 0 && (
            <div style={{ padding: "12px", fontSize: "11px", color: "#94a3b8", textAlign: "center" }}>No matching materials in inventory</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyLine(): OutwardLine {
  return {
    id: makeLineId(),
    materialCode: "",
    materialType: "",
    description: "",
    category: "RM",
    huUnit: "Nos",
    requiredQty: 0,
    matchStatus: "PENDING",
    availableQty: 0,
    recommendations: [],
    expanded: false,
  };
}

const MATCH_CONFIG = {
  PENDING:   { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b", label: "Not Checked" },
  LOADING:   { bg: "#eff6ff", border: "#bfdbfe", text: "#2563eb", label: "Checking…" },
  FOUND:     { bg: "#ecfdf5", border: "#a7f3d0", text: "#059669", label: "✓ Available" },
  SHORT:     { bg: "#fef2f2", border: "#fca5a5", text: "#dc2626", label: "✗ Insufficient" },
  NOT_FOUND: { bg: "#fef2f2", border: "#fecaca", text: "#dc2626", label: "✗ Not Found" },
};

// ─── Main Component ───────────────────────────────────────────────────────────
const DRAFT_KEY = "jsm_outward_draft";

function loadDraft(): { header: DispatchHeader; lines: OutwardLine[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveDraft(header: DispatchHeader, lines: OutwardLine[]) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ header, lines })); } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function parseCF(s: string | null | undefined): any {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

export default function OutwardClient() {
  const user = useAuthStore(s => s.user);
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
  const [lines, setLines] = useState<OutwardLine[]>(draft?.lines ?? [emptyLine()]);
  const [inventoryMaterials, setInventoryMaterials] = useState<InventoryMaterial[]>([]);
  const [allBatches, setAllBatches] = useState<RawBatch[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ outwardNumber: string } | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // HU unit entry workflow
  const [huBulkText, setHuBulkText] = useState<string>("");
  const [huEntries, setHuEntries] = useState<string[]>([""]);
  const [matchedBatches, setMatchedBatches] = useState<RawBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [huSearched, setHuSearched] = useState(false);

  // ── Persist draft to localStorage whenever header/lines change
  useEffect(() => { saveDraft(header, lines); }, [header, lines]);

  // ── Fetch live inventory materials + raw batches
  useEffect(() => {
    setLoadingMaterials(true);
    fetch(`${API}/inventory`)
      .then(r => r.json())
      .then(data => {
        const inv: any[] = Array.isArray(data.inventory) ? data.inventory : [];
        // Store raw batches (for HU unit lookup)
        setAllBatches(inv.filter(i => i.quantity > 0 && i.material?.code));
        // Aggregate by material code for the autocomplete
        const map = new Map<string, InventoryMaterial>();
        inv.forEach(item => {
          if (item.quantity <= 0 || !item.material?.code) return;
          let cf: any = {};
          try { cf = JSON.parse(item.customFields || "{}"); } catch {}
          const code = item.material.code;
          const cat = (item.material.category || cf.category || item.material.materialType || "").toUpperCase();
          if (!map.has(code)) {
            map.set(code, {
              code,
              description: item.material.description || "",
              materialType: cf.materialType || "",
              category: cat,
              huUnit: cf.huUnit || item.material.huUnit || "Nos",
              totalQty: 0,
            });
          }
          map.get(code)!.totalQty += item.quantity;
        });
        setInventoryMaterials(Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code)));
      })
      .catch(() => {})
      .finally(() => setLoadingMaterials(false));
  }, []);

  // ── Line management
  const updateLine = useCallback((id: string, patch: Partial<OutwardLine>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }, []);

  const selectMaterial = useCallback((lineId: string, code: string) => {
    const mat = inventoryMaterials.find(m => m.code === code);
    if (mat) {
      updateLine(lineId, {
        materialCode: mat.code,
        description: mat.description,
        materialType: mat.materialType,
        category: mat.category,
        huUnit: mat.huUnit || "Nos",
        availableQty: mat.totalQty,
        matchStatus: "PENDING",
        recommendations: [],
      });
    } else {
      updateLine(lineId, { materialCode: code, matchStatus: "PENDING", recommendations: [] });
    }
  }, [inventoryMaterials, updateLine]);

  // ── FIFO check for a single line
  const checkLine = useCallback(async (line: OutwardLine) => {
    if (!line.materialCode || line.requiredQty <= 0) {
      updateLine(line.id, { matchStatus: "NOT_FOUND" });
      return;
    }
    updateLine(line.id, { matchStatus: "LOADING" });
    try {
      const res = await fetch(`${API}/outward/fifo?materialCode=${encodeURIComponent(line.materialCode)}&requiredQty=${line.requiredQty}`);
      const data = await res.json();
      const recs: FifoRec[] = data.recommendations || [];
      const pickedTotal = recs.reduce((s, r) => s + r.recommendedPick, 0);
      const status = recs.length === 0 ? "NOT_FOUND" : pickedTotal >= line.requiredQty ? "FOUND" : "SHORT";
      updateLine(line.id, { recommendations: recs, matchStatus: status, availableQty: data.totalAvailable || pickedTotal, expanded: true });
    } catch {
      updateLine(line.id, { matchStatus: "NOT_FOUND", recommendations: [] });
    }
  }, [updateLine]);

  const checkAll = async () => {
    for (const line of lines) {
      await checkLine(line);
    }
  };

  // ── Dispatch
  const handleDispatch = async () => {
    // Validate — use alert so it's impossible to miss
    if (!header.truckNumber.trim()) {
      alert("⚠ Truck Number is required before dispatching.");
      return;
    }
    const readyLines = lines.filter(l => l.matchStatus === "FOUND" || l.matchStatus === "SHORT");
    if (!readyLines.length) {
      alert("⚠ Click 'Check All Inventory' first to confirm stock availability.");
      return;
    }
    const totalPicks = readyLines.reduce((s, l) => s + l.recommendations.filter(r => r.recommendedPick > 0).length, 0);
    if (totalPicks === 0) {
      alert("⚠ No stock was allocated. Please check inventory and try again.");
      return;
    }

    // Confirmation summary dialog
    const summary = readyLines.map(l =>
      `• ${l.materialCode} — ${l.recommendations.reduce((s, r) => s + r.recommendedPick, 0).toFixed(0)} ${l.huUnit} picked`
    ).join("\n");
    const confirmed = window.confirm(
      `Confirm Dispatch to ${header.destination || "destination"}?\n\nTruck: ${header.truckNumber}\nDate: ${header.date}\n\nMaterials:\n${summary}\n\nThis will deduct from inventory immediately.`
    );
    if (!confirmed) return;

    setDispatching(true); setDispatchError(null);
    try {
      const res = await fetch(`${API}/outward/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...header,
          lines: readyLines.map(l => ({
            materialCode: l.materialCode,
            materialType: l.materialType,
            description: l.description,
            category: l.category,
            huUnit: l.huUnit,
            requiredQty: l.requiredQty,
            picks: l.recommendations.filter(r => r.recommendedPick > 0).map(r => ({
              batchId: r.batchId,
              batchNumber: r.batchNumber,
              pickQty: r.recommendedPick,
              stockLocation: r.stockLocation,
              warehouseId: r.warehouseId,
            })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dispatch failed");
      clearDraft();
      setDispatchResult({ outwardNumber: data.outwardNumber });
      // Auto-export picklist
      setTimeout(() => exportPicklistXLSX(header, lines, data.outwardNumber, true), 300);
    } catch (e: any) {
      const msg = e.message || "Unknown error";
      setDispatchError(msg);
      alert(`❌ Dispatch failed: ${msg}\n\nPlease check that the backend server is running and try again.`);
    } finally {
      setDispatching(false);
    }
  };

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
    const lower = new Set(entered.map(h => h.toLowerCase()));
    const matched = allBatches.filter(b => {
      const cf = parseCF(b.customFields);
      const hu = (cf.huUnit || "").trim().toLowerCase();
      return hu && lower.has(hu);
    });
    setMatchedBatches(matched);
    setSelectedBatchIds(new Set(matched.map(b => b.id)));
    setHuSearched(true);
  };

  // ── HU-based dispatch
  const handleHUDispatch = async () => {
    if (!header.truckNumber.trim()) {
      alert("⚠ Truck Number is required before dispatching."); return;
    }
    const selected = matchedBatches.filter(b => selectedBatchIds.has(b.id));
    if (!selected.length) {
      alert("⚠ Select at least one batch to dispatch."); return;
    }

    // Group by material code → build lines structure
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
      ln.requiredQty += b.quantity;
      ln.picks.push({ batchId: b.id, batchNumber: b.batchNumber, pickQty: b.quantity, stockLocation: cf.stockLocation || "", warehouseId: b.warehouseId });
    });
    const dispatchLines = Array.from(lineMap.values());

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
      setDispatchResult({ outwardNumber: data.outwardNumber });
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
    setLines([emptyLine()]);
    setDispatchResult(null);
    setDispatchError(null);
    setHuBulkText("");
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
            onClick={() => exportPicklistXLSX(header, lines, dispatchResult.outwardNumber)}
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
            <Truck size={22} style={{ color: "#059669" }} /> Outbound Dispatch
          </h1>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
            {isViewer ? "View dispatch records and inventory movements" : "Enter HU unit codes → Find matching inventory → Select & Confirm Dispatch"}
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
                onClick={() => { setHuSearched(false); setMatchedBatches([]); setSelectedBatchIds(new Set()); setHuEntries([""]); setHuBulkText(""); }}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "8px", color: "#64748b", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                <XCircle size={12} /> Clear
              </button>
            )}
          </div>
        )}

        {/* Search results */}
        {huSearched && (
          <div style={{ marginTop: "16px" }}>
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
                      {["✓", "HU Unit", "Material Code", "Description", "Type", "Category", "Batch No", "Invoice No", "BIN", "Stock Location", "Qty"].map(h => (
                        <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#64748b", borderBottom: "1.5px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matchedBatches.map((batch, ri) => {
                      const cf = parseCF(batch.customFields);
                      const sel = selectedBatchIds.has(batch.id);
                      return (
                        <tr key={batch.id} onClick={() => {
                          setSelectedBatchIds(prev => {
                            const next = new Set(prev);
                            if (next.has(batch.id)) next.delete(batch.id); else next.add(batch.id);
                            return next;
                          });
                        }} style={{ background: sel ? "#ecfdf5" : ri % 2 === 0 ? "#fff" : "#f8fafc", cursor: "pointer", borderLeft: sel ? "3px solid #059669" : "3px solid transparent" }}>
                          <td style={{ padding: "7px 10px" }}>
                            <input type="checkbox" checked={sel} onChange={() => {}} style={{ cursor: "pointer" }} />
                          </td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontWeight: 800, color: "#1e40af" }}>{cf.huUnit || "—"}</td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontWeight: 700, color: "#0f172a" }}>{batch.material?.code || "—"}</td>
                          <td style={{ padding: "7px 10px", color: "#374151", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{batch.material?.description || "—"}</td>
                          <td style={{ padding: "7px 10px", color: "#0891b2", fontWeight: 600 }}>{cf.materialType || "—"}</td>
                          <td style={{ padding: "7px 10px" }}>
                            <span style={{ background: (cf.category || "RM").toUpperCase().includes("FG") ? "#f5f3ff" : "#ecfdf5", color: (cf.category || "RM").toUpperCase().includes("FG") ? "#7c3aed" : "#059669", border: `1px solid ${(cf.category || "RM").toUpperCase().includes("FG") ? "#ddd6fe" : "#a7f3d0"}`, padding: "1px 7px", borderRadius: "12px", fontSize: "10px", fontWeight: 700 }}>
                              {(cf.category || "RM").toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>{batch.batchNumber || "—"}</td>
                          <td style={{ padding: "7px 10px", fontFamily: "monospace", fontSize: "11px", color: "#2563eb", fontWeight: 700 }}>{cf.invoiceNo || "—"}</td>
                          <td style={{ padding: "7px 10px", fontWeight: 700, color: "#7c3aed" }}>{cf.binLocation || "—"}</td>
                          <td style={{ padding: "7px 10px", color: "#374151" }}>{cf.stockLocation || "—"}</td>
                          <td style={{ padding: "7px 10px", fontWeight: 800, color: "#0f172a", textAlign: "right" }}>{batch.quantity.toFixed(0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Dispatch bar */}
                {!isViewer && selectedBatchIds.size > 0 && (
                  <div style={{ marginTop: "14px", background: "#ecfdf5", border: "1.5px solid #a7f3d0", borderRadius: "10px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "16px" }}>
                    <CheckCircle2 size={18} style={{ color: "#059669", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#065f46" }}>
                        {selectedBatchIds.size} batch{selectedBatchIds.size !== 1 ? "es" : ""} selected for dispatch
                      </div>
                      <div style={{ fontSize: "11px", color: "#059669", marginTop: "2px" }}>
                        Total qty: {matchedBatches.filter(b => selectedBatchIds.has(b.id)).reduce((s, b) => s + b.quantity, 0).toFixed(0)} units
                      </div>
                    </div>
                    <button onClick={handleHUDispatch} disabled={dispatching}
                      style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", padding: "10px 24px", background: "#059669", border: "none", borderRadius: "9px", color: "#fff", fontSize: "13px", fontWeight: 800, cursor: dispatching ? "not-allowed" : "pointer", boxShadow: "0 2px 8px rgba(5,150,105,0.3)" }}>
                      {dispatching
                        ? <><RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} /> Dispatching…</>
                        : <><Truck size={14} /> Confirm Dispatch</>}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
