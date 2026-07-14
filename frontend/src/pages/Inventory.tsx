import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Package, Weight, Layers, Search, RefreshCw, ArrowDownToLine,
  ArrowUpFromLine, MapPin, Edit3, Check, X, ChevronUp, ChevronDown, Trash2,
  Grid3X3, History, ArrowRight, AlertTriangle, CheckCircle2, ClipboardCheck
} from "lucide-react";
import { useAuthStore, whQuery } from "../store/authStore";

const API = "http://localhost:5001/api";

interface InventoryItem {
  id: string;
  materialId: string;
  batchNumber: string;
  quantity: number;
  warehouseId: string;
  receiptDate: string;
  stockStatus: string;
  lastMovementDate: string;
  customFields: string | null;
  material: {
    id: string;
    code: string;
    description: string;
    materialType: string;
    huUnit: string;
    category: string | null;
  } | null;
  warehouse: { id: string; name: string } | null;
  rack: { id: string; code: string } | null;
  bin: {
    id: string;
    code: string;
    level: { id: string; code: string; row: { id: string; code: string } | null } | null;
  } | null;
  floorLocation: { id: string; zone: string; code: string } | null;
}

interface EnrichedItem extends InventoryItem {
  cf: Record<string, any>;
  category: string;
  displayQtyNos: number;
  displayQtyKg: number;
  displayQtyPallet: number;
  binLocation: string;
  // True Rack/Row/Level/Bin hierarchy when this batch is stored in a real provisioned rack
  // bin (from item.rack/item.bin, not just the free-text binLocation string). Blank when the
  // batch is stored in a plain FloorLocation instead.
  storageKind: "RACK" | "FLOOR" | "UNASSIGNED";
  rackCode: string;
  rackRowCode: string;
  rackLevelCode: string;
  rackBinCode: string;
  floorZone: string;
  floorCode: string;
  stockLocation: string;
  source: string;
  invoiceNo: string;
  materialType: string;
  materialTypeList: string[];
  inwardDate: string;
  huUnit: string;
  tatRemarks: string;
  createdBy: string;
  sapDocNo: string;
  gateSerialNo: string;
  truckNumber: string;
  lrNumber: string;
  transporter: string;
  sealNumber: string;
  // Discrepancy fields
  isDiscrepancy: boolean;
  discrepancyRemarks: string;
  shortInPallet: number;
  shortExcessInKg: number;
  shortExcessInQty: number;
  invoiceQtyInNos: number;
  receivedQtyInNos: number;
  invoiceNetWeight: number;
  receivedNetWeight: number;
  invoiceQtyInPallet: number;
  receivedQtyInPallets: number;
}

type SortField = "materialCode" | "description" | "quantity" | "receiptDate" | "category";
type SortDir = "asc" | "desc";
type ViewMode = "ALL" | "RM" | "FG";

async function patchInventoryQty(id: string, quantity: number) {
  const res = await fetch(`${API}/inventory/${id}/adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity }),
  });
  if (!res.ok) throw new Error("Failed to adjust");
  return res.json();
}

// ── Inline qty editor cell ─────────────────────────────────────────────────
function QtyEditCell({
  item, onSaved
}: { item: EnrichedItem; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.quantity));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const q = parseFloat(val);
    if (isNaN(q) || q < 0) return;
    setSaving(true);
    try {
      await patchInventoryQty(item.id, q);
      onSaved();
      setEditing(false);
    } catch {
      alert("Could not save adjustment — check backend is running.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ fontWeight: 700, fontSize: "13px", color: item.quantity <= 0 ? "#dc2626" : "#0f172a" }}>
          {item.quantity.toFixed(2)}
        </span>
        <button
          onClick={() => { setVal(String(item.quantity)); setEditing(true); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#94a3b8", padding: "2px",
          }}
          title="Edit quantity"
        >
          <Edit3 size={12} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <input
        autoFocus
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        style={{
          width: "70px", border: "2px solid #2563eb", borderRadius: "6px",
          padding: "2px 6px", fontSize: "12px", fontWeight: 700,
        }}
      />
      <button
        onClick={save} disabled={saving}
        style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: "5px", padding: "2px 5px", cursor: "pointer" }}
        title="Save"
      ><Check size={11} style={{ color: "#16a34a" }} /></button>
      <button
        onClick={() => setEditing(false)}
        style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "5px", padding: "2px 5px", cursor: "pointer" }}
        title="Cancel"
      ><X size={11} style={{ color: "#dc2626" }} /></button>
    </div>
  );
}

// ── Stable helper components (defined OUTSIDE modal to avoid remount on every keystroke) ──
function ModalInput({
  label, value, onChange, type = "text",
}: { label: string; value: any; onChange: (v: any) => void; type?: string }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={e => onChange(type === "number" ? (e.target.value === "" ? "" : parseFloat(e.target.value) || 0) : e.target.value)}
        style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", color: "#0f172a", background: "#fff", outline: "none", boxSizing: "border-box" }}
      />
    </div>
  );
}

function SectionTitle({ label, color }: { label: string; color: string }) {
  return <div style={{ fontSize: "10px", fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>{label}</div>;
}

// ── Edit Detail Modal ──────────────────────────────────────────────────────
function EditDetailModal({
  item, warehouses, onSaved, onClose, isViewer
}: {
  item: EnrichedItem;
  warehouses: any[];
  onSaved: () => void;
  onClose: () => void;
  isViewer?: boolean;
}) {
  const isFG = (item.category || "").toUpperCase().includes("FG");

  const [form, setForm] = useState({
    // Material identity (now editable)
    materialCode:        item.material?.code || "",
    materialDescription: item.material?.description || "",
    invoiceNo:           item.cf.invoiceNo || item.batchNumber || "",
    // Classification
    materialType: item.materialType,
    category:     item.category || (isFG ? "FG" : "RM"),
    huUnit:       item.cf.huUnit || item.material?.huUnit || "",
    // Quantities
    quantity:     item.quantity,
    netWeight:    item.displayQtyKg,
    pallets:      item.displayQtyPallet,
    numberOfBoxes: parseFloat(item.cf.numberOfBoxes) || 0,
    // Location
    binLocation:   item.binLocation  === "—" ? "" : item.binLocation,
    stockLocation: item.stockLocation === "—" ? "" : item.stockLocation,
    // Status
    stockStatus: item.stockStatus,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: any) => setForm(f => ({ ...f, [k]: v }));
  const isNowFG = form.category.toUpperCase().includes("FG");

  const save = async () => {
    setSaving(true); setError(null);
    try {
      // Pass all other custom fields BUT let binLocation/stockLocation go as
      // top-level body fields so the backend can warehouse-scope the lookup
      // and append location history automatically.
      const newCf = {
        ...item.cf,
        materialType:  form.materialType,
        huUnit:        form.huUnit,
        category:      form.category,
        invoiceNo:     form.invoiceNo,
        netWeight:     form.netWeight,
        pallets:       form.pallets,
        numberOfBoxes: form.numberOfBoxes,
        // Remove binLocation/stockLocation from cf here — backend will set them
        // after resolving the warehouse-scoped floor location.
      };
      delete newCf.binLocation;
      delete newCf.stockLocation;

      const res = await fetch(`${API}/inventory/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity:            form.quantity,
          stockStatus:         form.stockStatus,
          customFields:        newCf,
          materialCode:        form.materialCode,
          materialDescription: form.materialDescription,
          // These trigger warehouse-scoped resolution + history tracking in the backend
          binLocation:         form.binLocation,
          stockLocation:       form.stockLocation,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Save failed"); }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const F = (k: keyof typeof form) => ({ value: form[k], onChange: set(k) });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "700px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.18)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px 14px", borderBottom: "1px solid #f1f5f9", background: "#eff6ff", borderRadius: "16px 16px 0 0", position: "sticky", top: 0, zIndex: 1 }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 900, color: "#1e40af", display: "flex", alignItems: "center", gap: "8px" }}>
              <Package size={16} /> Edit Inventory Record
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
              Batch: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{item.batchNumber}</span>
              {" · "}<span style={{ color: isNowFG ? "#7c3aed" : "#059669", fontWeight: 700 }}>{form.category || "—"}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "6px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ── Material Identity ── */}
          <div>
            <SectionTitle label="Material Identity" color="#1e40af" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: "12px" }}>
              <ModalInput label="Material Code" {...F("materialCode")} />
              <ModalInput label="Description" {...F("materialDescription")} />
              <ModalInput label="Batch / Invoice No" {...F("invoiceNo")} />
            </div>
          </div>

          {/* ── Type & Classification ── */}
          <div>
            <SectionTitle label="Type & Classification" color="#2563eb" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <ModalInput label="Type of Material" {...F("materialType")} />
              <div>
                <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Category</label>
                <select value={form.category} onChange={e => set("category")(e.target.value)}
                  style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", background: "#fff", outline: "none" }}>
                  <option value="RM">RM – Raw Material</option>
                  <option value="FG">FG – Finished Goods</option>
                </select>
              </div>
              <ModalInput label="HU Unit" {...F("huUnit")} />
            </div>
          </div>

          {/* ── Quantities ── */}
          <div>
            <SectionTitle label="Quantities" color="#059669" />
            <div style={{ display: "grid", gridTemplateColumns: isNowFG ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: "12px" }}>
              <ModalInput label="Qty (Nos) — stock" {...F("quantity")} type="number" />
              <ModalInput label="Net Weight (Kg)" {...F("netWeight")} type="number" />
              <ModalInput label="Pallets" {...F("pallets")} type="number" />
              {isNowFG && <ModalInput label="No. of Boxes" {...F("numberOfBoxes")} type="number" />}
            </div>
          </div>

          {/* ── Location ── */}
          <div>
            <SectionTitle label="Location" color="#7c3aed" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <ModalInput label="BIN Location" {...F("binLocation")} />
              <ModalInput label="Stock Location" {...F("stockLocation")} />
            </div>
            {/* Location movement history */}
            {Array.isArray(item.cf.locationHistory) && item.cf.locationHistory.length > 0 && (
              <div style={{ marginTop: "12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <History size={12} style={{ color: "#7c3aed" }} />
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.08em" }}>Movement History</span>
                </div>
                {[...item.cf.locationHistory].reverse().map((h: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0", borderBottom: i < item.cf.locationHistory.length - 1 ? "1px solid #f1f5f9" : "none", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "5px", padding: "2px 7px" }}>{h.fromWh || "—"} / {h.from || "—"}</span>
                    <ArrowRight size={11} style={{ color: "#94a3b8", flexShrink: 0 }} />
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "5px", padding: "2px 7px" }}>{h.toWh || "—"} / {h.to || "—"}</span>
                    <span style={{ fontSize: "9px", color: "#94a3b8", marginLeft: "auto" }}>{new Date(h.movedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Status ── */}
          <div>
            <SectionTitle label="Status" color="#d97706" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Stock Status</label>
                <select value={form.stockStatus} onChange={e => set("stockStatus")(e.target.value)}
                  style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", background: "#fff", outline: "none" }}>
                  <option value="GOOD">GOOD</option>
                  <option value="DISCREPANCY">DISCREPANCY</option>
                  <option value="DAMAGED">DAMAGED</option>
                  <option value="QUARANTINE">QUARANTINE</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <div style={{ fontSize: "11px", color: "#94a3b8", lineHeight: "1.6" }}>
                  Receipt date: <strong>{new Date(item.receiptDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</strong>
                  <br />Last movement: <strong>{item.lastMovementDate ? new Date(item.lastMovementDate).toLocaleDateString("en-IN") : "—"}</strong>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", color: "#dc2626", fontSize: "12px", fontWeight: 600 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 24px 18px", borderTop: "1px solid #f1f5f9", position: "sticky", bottom: 0, background: "#fff", borderRadius: "0 0 16px 16px" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "9px", fontSize: "12px", fontWeight: 700, color: "#64748b", cursor: "pointer" }}>
            {isViewer ? "Close" : "Cancel"}
          </button>
          {!isViewer && (
            <button onClick={save} disabled={saving}
              style={{ padding: "9px 24px", background: saving ? "#93c5fd" : "#2563eb", border: "none", borderRadius: "9px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              {saving ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Saving…</> : <><Check size={12} /> Save Changes</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Rectify Discrepancy Modal ─────────────────────────────────────────────
function RectifyDiscrepancyModal({
  item, onSaved, onClose, onEditFull,
}: {
  item: EnrichedItem;
  onSaved: () => void;
  onClose: () => void;
  onEditFull: () => void;
}) {
  // Pre-fill with invoice quantities — rectification means aligning received to invoice
  const [form, setForm] = useState({
    correctedQty:         item.invoiceQtyInNos    || item.quantity,
    correctedPallets:     item.invoiceQtyInPallet  || item.displayQtyPallet,
    correctedKg:          item.invoiceNetWeight    || item.displayQtyKg,
    rectificationRemarks: "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: any) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.rectificationRemarks.trim()) {
      setError("Rectification remarks are required."); return;
    }
    setSaving(true); setError(null);
    try {
      const history: any[] = Array.isArray(item.cf.rectificationHistory)
        ? item.cf.rectificationHistory : [];
      const newCf = {
        ...item.cf,
        // Clear all discrepancy flags
        shortInPallet:    0,
        shortExcessInKg:  0,
        shortExcessInQty: 0,
        discrepancyRemarks: "",
        discrepancy: false,
        // Align received quantities to match invoice quantities (reconciliation)
        receivedQtyInNos:    form.correctedQty,
        receivedQtyInPallets: form.correctedPallets,
        receivedNetWeight:   form.correctedKg,
        // Also update the working quantities used for stock display
        pallets:   form.correctedPallets,
        netWeight: form.correctedKg,
        nos:       form.correctedQty,
        // Append rectification record
        rectificationHistory: [
          ...history,
          {
            rectifiedAt:        new Date().toISOString(),
            remarks:            form.rectificationRemarks,
            prevShortPallet:    item.shortInPallet,
            prevShortKg:        item.shortExcessInKg,
            prevShortQty:       item.shortExcessInQty,
            prevRemarks:        item.discrepancyRemarks,
            prevReceivedQty:    item.receivedQtyInNos,
            prevReceivedPallet: item.receivedQtyInPallets,
            prevReceivedKg:     item.receivedNetWeight,
            invoiceQty:         item.invoiceQtyInNos,
            invoicePallet:      item.invoiceQtyInPallet,
            invoiceKg:          item.invoiceNetWeight,
            correctedQty:       form.correctedQty,
            correctedPallets:   form.correctedPallets,
            correctedKg:        form.correctedKg,
          },
        ],
      };
      const res = await fetch(`${API}/inventory/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity:     form.correctedQty,
          stockStatus:  "GOOD",
          customFields: newCf,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to rectify"); }
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const shortPallet = item.shortInPallet;
  const shortKg     = item.shortExcessInKg;
  const shortQty    = item.shortExcessInQty;
  const rectHistory: any[] = Array.isArray(item.cf.rectificationHistory)
    ? item.cf.rectificationHistory : [];

  const diffLabel = (v: number, unit: string) => {
    if (v === 0) return null;
    const sign = v > 0 ? "+" : "";
    const color = v < 0 ? "#b91c1c" : "#b45309";
    return <span style={{ fontWeight: 700, color }}>{sign}{v} {unit}</span>;
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.52)",
               display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "700px",
                    maxHeight: "92vh", overflowY: "auto",
                    boxShadow: "0 24px 60px rgba(185,28,28,0.18)" }}>

        {/* ── Header ── */}
        <div style={{ background: "linear-gradient(135deg,#fef2f2 0%,#fff5f5 100%)",
                      borderBottom: "1.5px solid #fecaca", padding: "18px 24px 14px",
                      borderRadius: "16px 16px 0 0", position: "sticky", top: 0, zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px",
                            fontWeight: 900, fontSize: "14px", color: "#b91c1c" }}>
                <AlertTriangle size={16} /> Rectify Discrepancy
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1e40af" }}>
                  {item.material?.code || "—"}
                </span>
                {" · "}{item.material?.description || "—"}
                {item.invoiceNo !== "—" && <>{" · "}Invoice: <strong>{item.invoiceNo}</strong></>}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={onEditFull}
                style={{ padding: "6px 12px", background: "#fff", border: "1.5px solid #e2e8f0",
                         borderRadius: "8px", fontSize: "11px", fontWeight: 700,
                         color: "#64748b", cursor: "pointer" }}>
                Edit Full Details
              </button>
              <button onClick={onClose}
                style={{ background: "#fff", border: "1.5px solid #fca5a5", borderRadius: "8px",
                         padding: "6px", cursor: "pointer", color: "#b91c1c",
                         display: "flex", alignItems: "center" }}>
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* ── Discrepancy Summary ── */}
          <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5",
                        borderRadius: "12px", padding: "16px 18px" }}>
            <div style={{ fontSize: "10px", fontWeight: 800, color: "#dc2626",
                          textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px",
                          display: "flex", alignItems: "center", gap: "6px" }}>
              <AlertTriangle size={11} /> Recorded Discrepancy
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              {/* Pallets */}
              <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#94a3b8",
                              textTransform: "uppercase", marginBottom: "6px" }}>Pallets</div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "3px" }}>
                  Invoice: <strong>{item.invoiceQtyInPallet || "—"}</strong>
                  {" | "}Received: <strong>{item.receivedQtyInPallets || "—"}</strong>
                </div>
                <div>{diffLabel(shortPallet, "pallet(s)") ?? <span style={{ fontSize: "11px", color: "#94a3b8" }}>No difference</span>}</div>
              </div>
              {/* Net Weight */}
              <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#94a3b8",
                              textTransform: "uppercase", marginBottom: "6px" }}>Net Weight</div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "3px" }}>
                  Invoice: <strong>{item.invoiceNetWeight ? `${item.invoiceNetWeight} kg` : "—"}</strong>
                  {" | "}Received: <strong>{item.receivedNetWeight ? `${item.receivedNetWeight} kg` : "—"}</strong>
                </div>
                <div>{diffLabel(shortKg, "kg") ?? <span style={{ fontSize: "11px", color: "#94a3b8" }}>No difference</span>}</div>
              </div>
              {/* Qty Nos */}
              <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#94a3b8",
                              textTransform: "uppercase", marginBottom: "6px" }}>Qty (Nos)</div>
                <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "3px" }}>
                  Invoice: <strong>{item.invoiceQtyInNos || "—"}</strong>
                  {" | "}Received: <strong>{item.receivedQtyInNos || "—"}</strong>
                </div>
                <div>{diffLabel(shortQty, "nos") ?? <span style={{ fontSize: "11px", color: "#94a3b8" }}>No difference</span>}</div>
              </div>
            </div>
            {item.discrepancyRemarks && (
              <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: "8px",
                            padding: "8px 12px", fontSize: "12px", color: "#7f1d1d" }}>
                <strong>Discrepancy Note: </strong>{item.discrepancyRemarks}
              </div>
            )}
          </div>

          {/* ── Corrected Quantities ── */}
          <div>
            <div style={{ fontSize: "10px", fontWeight: 800, color: "#059669",
                          textTransform: "uppercase", letterSpacing: "0.1em",
                          marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={12} /> Reconcile Received → Invoice
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "12px", lineHeight: "1.6" }}>
              A discrepancy is resolved when <strong>received quantities match invoice quantities</strong>.
              The fields below are pre-filled with invoice values — adjust only if the verified figure differs.
            </div>
            {/* Invoice reference row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
              {[
                { label: "Invoice Qty (Nos)",    value: item.invoiceQtyInNos    || "—" },
                { label: "Invoice Pallets",       value: item.invoiceQtyInPallet  || "—" },
                { label: "Invoice Net Wt (kg)",  value: item.invoiceNetWeight    || "—" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "#f0fdf4", border: "1.5px solid #86efac",
                                          borderRadius: "8px", padding: "8px 12px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#16a34a",
                                textTransform: "uppercase", marginBottom: "3px" }}>{label}</div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#15803d" }}>{value}</div>
                </div>
              ))}
            </div>
            {/* Editable received-after-rectification row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <ModalInput label="Set Received Qty (Nos)" value={form.correctedQty} type="number"
                onChange={set("correctedQty")} />
              <ModalInput label="Set Received Pallets" value={form.correctedPallets} type="number"
                onChange={set("correctedPallets")} />
              <ModalInput label="Set Received Net Wt (kg)" value={form.correctedKg} type="number"
                onChange={set("correctedKg")} />
            </div>
            {/* Live diff indicator */}
            {(() => {
              const qDiff = form.correctedQty    - (item.invoiceQtyInNos    || 0);
              const pDiff = form.correctedPallets - (item.invoiceQtyInPallet  || 0);
              const kDiff = form.correctedKg     - (item.invoiceNetWeight    || 0);
              const allMatch = qDiff === 0 && pDiff === 0 && kDiff === 0;
              return (
                <div style={{ marginTop: "8px", padding: "8px 12px", borderRadius: "8px",
                              background: allMatch ? "#f0fdf4" : "#fffbeb",
                              border: `1px solid ${allMatch ? "#86efac" : "#fcd34d"}`,
                              fontSize: "11px", fontWeight: 600,
                              color: allMatch ? "#15803d" : "#b45309",
                              display: "flex", alignItems: "center", gap: "6px" }}>
                  {allMatch
                    ? <><CheckCircle2 size={12} /> Received quantities will match invoice — discrepancy cleared.</>
                    : <><AlertTriangle size={12} /> Remaining difference: {qDiff !== 0 && `${qDiff > 0 ? "+" : ""}${qDiff} nos `}{pDiff !== 0 && `${pDiff > 0 ? "+" : ""}${pDiff} pallet(s) `}{kDiff !== 0 && `${kDiff > 0 ? "+" : ""}${kDiff} kg`}. Discrepancy will be cleared regardless.</>}
                </div>
              );
            })()}
          </div>

          {/* ── Rectification Remarks ── */}
          <div>
            <div style={{ fontSize: "10px", fontWeight: 800, color: "#7c3aed",
                          textTransform: "uppercase", letterSpacing: "0.1em",
                          marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
              <ClipboardCheck size={12} /> Rectification Remarks <span style={{ color: "#dc2626" }}>*</span>
            </div>
            <textarea
              value={form.rectificationRemarks}
              onChange={e => set("rectificationRemarks")(e.target.value)}
              placeholder="Describe how the discrepancy was resolved — e.g. physical recount confirmed 480 Nos; 1 pallet missing due to transit damage, adjusted accordingly."
              rows={3}
              style={{ width: "100%", border: `1.5px solid ${form.rectificationRemarks.trim() ? "#ddd6fe" : "#e2e8f0"}`,
                       borderRadius: "8px", padding: "9px 12px", fontSize: "12px", color: "#0f172a",
                       background: "#faf5ff", outline: "none", boxSizing: "border-box",
                       resize: "vertical", fontFamily: "inherit", lineHeight: "1.6" }}
            />
          </div>

          {/* ── Previous Rectification History ── */}
          {rectHistory.length > 0 && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0",
                          borderRadius: "10px", padding: "12px 16px" }}>
              <div style={{ fontSize: "10px", fontWeight: 800, color: "#7c3aed",
                            textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px",
                            display: "flex", alignItems: "center", gap: "6px" }}>
                <History size={11} /> Previous Rectifications
              </div>
              {[...rectHistory].reverse().map((h: any, i: number) => (
                <div key={i} style={{ padding: "8px 0",
                                      borderBottom: i < rectHistory.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#059669",
                                   display: "flex", alignItems: "center", gap: "4px" }}>
                      <CheckCircle2 size={11} /> Rectified
                    </span>
                    <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                      {new Date(h.rectifiedAt).toLocaleString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#374151", marginBottom: "4px" }}>
                    {h.remarks}
                  </div>
                  <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                    Was: {h.prevShortPallet !== 0 && `${h.prevShortPallet > 0 ? "+" : ""}${h.prevShortPallet} pallet · `}
                         {h.prevShortKg    !== 0 && `${h.prevShortKg > 0 ? "+" : ""}${h.prevShortKg} kg · `}
                         {h.prevShortQty   !== 0 && `${h.prevShortQty > 0 ? "+" : ""}${h.prevShortQty} nos`}
                    {" → "} Corrected to {h.correctedQty} nos / {h.correctedPallets} pallets / {h.correctedKg} kg
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px",
                          padding: "10px 14px", color: "#dc2626", fontSize: "12px", fontWeight: 600 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: "10px", padding: "14px 24px 18px", borderTop: "1px solid #f1f5f9",
                      position: "sticky", bottom: 0, background: "#fff",
                      borderRadius: "0 0 16px 16px" }}>
          <div style={{ fontSize: "11px", color: "#64748b" }}>
            Submitting sets status to <strong style={{ color: "#059669" }}>GOOD</strong> and
            clears all discrepancy flags.
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={onClose}
              style={{ padding: "9px 20px", background: "#f8fafc", border: "1.5px solid #e2e8f0",
                       borderRadius: "9px", fontSize: "12px", fontWeight: 700,
                       color: "#64748b", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={submit} disabled={saving}
              style={{ padding: "9px 24px", background: saving ? "#86efac" : "#16a34a",
                       border: "none", borderRadius: "9px", fontSize: "12px", fontWeight: 800,
                       color: "#fff", cursor: saving ? "not-allowed" : "pointer",
                       display: "flex", alignItems: "center", gap: "6px" }}>
              {saving
                ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Rectifying…</>
                : <><CheckCircle2 size={13} /> Submit Rectification</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function InventoryClient() {
  const user = useAuthStore(s => s.user);
  const selectedWorker = useAuthStore(s => s.selectedWorker);
  const isViewer = user?.role === 'CUSTOMER';
  const [raw, setRaw]           = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  // warehouseCode → Set of valid bin codes (rack bins + floor locations)
  const [validBinsMap, setValidBinsMap] = useState<Record<string, Set<string>>>({});

  const [view, setView]             = useState<ViewMode>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterWh, setFilterWh]         = useState("");
  const [filterType, setFilterType]     = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "GOOD" | "DISCREPANCY">("");
  const [sortField, setSortField]   = useState<SortField>("receiptDate");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  const [selectedItem, setSelectedItem] = useState<EnrichedItem | null>(null);
  const [rectifyItem,  setRectifyItem]  = useState<EnrichedItem | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [expandedLocs, setExpandedLocs] = useState<Set<string>>(new Set());
  const toggleLoc = (loc: string) => setExpandedLocs(prev => {
    const next = new Set(prev);
    next.has(loc) ? next.delete(loc) : next.add(loc);
    return next;
  });
  const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());
  const toggleRack = (rack: string) => setExpandedRacks(prev => {
    const next = new Set(prev);
    next.has(rack) ? next.delete(rack) : next.add(rack);
    return next;
  });
  const [expandedFloorZones, setExpandedFloorZones] = useState<Set<string>>(new Set());
  const toggleFloorZone = (zone: string) => setExpandedFloorZones(prev => {
    const next = new Set(prev);
    next.has(zone) ? next.delete(zone) : next.add(zone);
    return next;
  });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = `${API}/inventory${whQuery(selectedWorker)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const invItems: any[] = Array.isArray(data.inventory) ? data.inventory : [];
      setRaw(invItems);
      const filteredWarehouses = Array.isArray(data.warehouses)
        ? data.warehouses.filter((w: any) =>
            !/jsm/i.test(w.name || '') &&
            !/jsm/i.test(w.code || '') &&
            !/default/i.test(w.name || '') &&
            !/^WH-?DEFAULT$/i.test(w.code || '')
          )
        : [];
      setWarehouses(filteredWarehouses);

      // Fetch valid bins for each unique warehouse and build a lookup map
      const whCodes = [...new Set(invItems.map((i: any) => i.warehouse?.code).filter(Boolean))] as string[];
      const entries = await Promise.all(
        whCodes.map(async (code: string) => {
          try {
            const r = await fetch(`${API}/warehouse/valid-bins?code=${encodeURIComponent(code)}`);
            const d = await r.json();
            return [code, new Set<string>((d.bins || []).map((b: string) => b.toLowerCase()))] as [string, Set<string>];
          } catch { return [code, new Set<string>()] as [string, Set<string>]; }
        })
      );
      setValidBinsMap(Object.fromEntries(entries));
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [selectedWorker]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this stock record? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await fetch(`${API}/inventory/${id}`, { method: "DELETE" });
      load();
    } catch {
      alert("Failed to delete. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }, [load]);

  // Enrich items with parsed customFields
  const enriched: EnrichedItem[] = useMemo(() =>
    raw.map(item => {
      let cf: Record<string, any> = {};
      try { cf = JSON.parse(item.customFields || "{}"); } catch {}
      // cf.category takes priority — it is the per-batch value from the actual inward entry.
      // item.material.category is a global material-level field that may be wrong if the
      // material was previously created under a different category.
      const cat = (cf.category || item.material?.category || item.material?.materialType || "").toUpperCase();
      const isDiscrepancy = !!(cf.discrepancy || item.stockStatus === "DISCREPANCY" ||
        Number(cf.shortInPallet || 0) !== 0 || Number(cf.shortExcessInKg || 0) !== 0 ||
        Number(cf.shortExcessInQty || 0) !== 0 || cf.discrepancyRemarks);
      return {
        ...item,
        cf,
        category: cat,
        displayQtyNos:    parseFloat(cf.nos)       || item.quantity,
        displayQtyKg:     parseFloat(cf.netWeight)  || 0,
        displayQtyPallet: parseFloat(cf.pallets)    || 0,
        binLocation:  cf.binLocation  || "—",
        // Real Rack/Row/Level/Bin hierarchy — only present when Inward commit matched the
        // Excel/manual BIN code against an already-provisioned rack Bin (see inward.ts commit
        // route). Falls back to FloorLocation, or "UNASSIGNED" if neither is set on the batch.
        storageKind: item.bin ? "RACK" : item.floorLocation ? "FLOOR" : "UNASSIGNED",
        rackCode:      item.rack?.code || "",
        rackRowCode:   item.bin?.level?.row?.code || "",
        rackLevelCode: item.bin?.level?.code || "",
        rackBinCode:   item.bin?.code || "",
        floorZone:     item.floorLocation?.zone || "",
        floorCode:     item.floorLocation?.code || "",
        stockLocation: cf.stockLocation || "—",
        source:    cf.source    || "—",
        invoiceNo: cf.invoiceNo || item.batchNumber || "—",
        // A single aggregated batch can legitimately span more than one "Type of Material"
        // value (e.g. several pallets of the same material code came in tagged "Board",
        // "CFC", and "Reel" on the same invoice) — cf.materialType may now be a comma-joined
        // list rather than a single value. materialTypeList exposes the individual values for
        // filtering; materialType keeps the raw (possibly joined) string for display.
        materialType: cf.materialType || item.material?.materialType || "",
        materialTypeList: (Array.isArray(cf.materialTypes) && cf.materialTypes.length
          ? cf.materialTypes
          : (cf.materialType || item.material?.materialType || "").split(',').map((s: string) => s.trim()).filter(Boolean)
        ),
        inwardDate: cf.inwardDate || "",
        huUnit:      cf.huUnit || item.material?.huUnit || "",
        tatRemarks:  cf.tatRemarks || "",
        createdBy:   cf.createdBy || "",
        sapDocNo:    cf.sapDocNo || "",
        gateSerialNo: cf.gateSerialNo || "",
        truckNumber:  cf.truckNumber  || "",
        lrNumber:     cf.lrNumber     || "",
        transporter:  cf.transporter  || "",
        sealNumber:   cf.sealNumber   || "",
        isDiscrepancy,
        discrepancyRemarks: cf.discrepancyRemarks || "",
        shortInPallet:      Number(cf.shortInPallet    || 0),
        shortExcessInKg:    Number(cf.shortExcessInKg  || 0),
        shortExcessInQty:   Number(cf.shortExcessInQty || 0),
        invoiceQtyInNos:    Number(cf.invoiceQtyInNos || 0),
        receivedQtyInNos:   Number(cf.receivedQtyInNos || 0),
        invoiceNetWeight:   Number(cf.invoiceNetWeight || 0),
        receivedNetWeight:  Number(cf.receivedNetWeight || 0),
        invoiceQtyInPallet: Number(cf.invoiceQtyInPallet || 0),
        receivedQtyInPallets: Number(cf.receivedQtyInPallets || 0),
      };
    }),
  [raw]);

  // Summary stats
  const activeItems    = enriched.filter(i => i.quantity > 0);
  const rmItems        = activeItems.filter(i => i.category.includes("RM"));
  const fgItems        = activeItems.filter(i => i.category.includes("FG"));
  const totalRmKg      = rmItems.reduce((s, i) => s + i.displayQtyKg, 0);
  const totalRmPallets = rmItems.reduce((s, i) => s + i.displayQtyPallet, 0);
  const totalFgPallets = fgItems.reduce((s, i) => s + i.displayQtyPallet, 0);
  const totalFgKg      = fgItems.reduce((s, i) => s + i.displayQtyKg, 0);
  const totalFgNos     = fgItems.reduce((s, i) => s + i.displayQtyNos, 0);

  // All material types for filter dropdown — built from the flattened per-item list
  // (materialTypeList), NOT the raw materialType string. A batch that spans multiple
  // "Type of material" values (e.g. Board / CFC / Reel all on one invoice) stores
  // materialType as a joined string like "Board, CFC, Reel" — using that raw string here
  // would either produce one weird combined dropdown option or hide "CFC" entirely
  // whenever it wasn't the sole value for a whole batch.
  const allMaterialTypes = useMemo(() => {
    const types = new Set<string>();
    enriched.forEach(i => i.materialTypeList.forEach((t: string) => { if (t) types.add(t); }));
    return Array.from(types).sort();
  }, [enriched]);

  // RM grouped by material type — pallets + kg
  const rmByType = useMemo(() => {
    const map = new Map<string, { kg: number; pallets: number }>();
    rmItems.forEach(i => {
      const type = i.materialType || "Unclassified";
      const cur = map.get(type) || { kg: 0, pallets: 0 };
      map.set(type, { kg: cur.kg + i.displayQtyKg, pallets: cur.pallets + i.displayQtyPallet });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].pallets - a[1].pallets);
  }, [rmItems]);

  // Bin-wise material allocation — grouped: stock location → bin → items
  const stockBinAllocation = useMemo(() => {
    const locMap = new Map<string, Map<string, { pallets: number; kg: number; items: EnrichedItem[] }>>();
    activeItems.forEach(i => {
      const loc = i.stockLocation !== "—" && i.stockLocation ? i.stockLocation : "Unassigned";
      const bin = i.binLocation   !== "—" && i.binLocation   ? i.binLocation   : "No Bin";
      if (!locMap.has(loc)) locMap.set(loc, new Map());
      const binMap = locMap.get(loc)!;
      if (!binMap.has(bin)) binMap.set(bin, { pallets: 0, kg: 0, items: [] });
      const cur = binMap.get(bin)!;
      cur.pallets += i.displayQtyPallet;
      cur.kg      += i.displayQtyKg;
      cur.items.push(i);
    });
    return Array.from(locMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([loc, binMap]) => {
        const bins = Array.from(binMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([bin, data]) => ({ bin, ...data }));
        return {
          loc,
          bins,
          totalPallets: bins.reduce((s, b) => s + b.pallets, 0),
          totalKg:      bins.reduce((s, b) => s + b.kg, 0),
          totalItems:   bins.reduce((s, b) => s + b.items.length, 0),
        };
      });
  }, [activeItems]);

  // Rack-wise allocation — only items actually stored in a real provisioned Rack Bin
  // (storageKind === "RACK"), grouped Rack → Row → Bin. This is separate from the
  // Bin-wise view above, which only ever showed the free-text BIN string and never
  // distinguished true rack placement from a plain floor location.
  const rackAllocation = useMemo(() => {
    const rackMap = new Map<string, Map<string, { pallets: number; kg: number; items: EnrichedItem[] }>>();
    activeItems.filter(i => i.storageKind === "RACK").forEach(i => {
      const rack = i.rackCode || "Unknown Rack";
      const row = i.rackRowCode || i.rackBinCode || "Unknown Row";
      if (!rackMap.has(rack)) rackMap.set(rack, new Map());
      const rowMap = rackMap.get(rack)!;
      if (!rowMap.has(row)) rowMap.set(row, { pallets: 0, kg: 0, items: [] });
      const cur = rowMap.get(row)!;
      cur.pallets += i.displayQtyPallet;
      cur.kg      += i.displayQtyKg;
      cur.items.push(i);
    });
    return Array.from(rackMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([rack, rowMap]) => {
        const rows = Array.from(rowMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([row, data]) => ({ row, ...data }));
        return {
          rack,
          rows,
          totalPallets: rows.reduce((s, r) => s + r.pallets, 0),
          totalKg:      rows.reduce((s, r) => s + r.kg, 0),
          totalItems:   rows.reduce((s, r) => s + r.items.length, 0),
        };
      });
  }, [activeItems]);

  // Floor-wise allocation — items stored in a FloorLocation (storageKind === "FLOOR"),
  // grouped by zone → floor code.
  const floorAllocation = useMemo(() => {
    const zoneMap = new Map<string, Map<string, { pallets: number; kg: number; items: EnrichedItem[] }>>();
    activeItems.filter(i => i.storageKind === "FLOOR").forEach(i => {
      const zone = i.floorZone || "Unassigned";
      const code = i.floorCode || "Unknown";
      if (!zoneMap.has(zone)) zoneMap.set(zone, new Map());
      const codeMap = zoneMap.get(zone)!;
      if (!codeMap.has(code)) codeMap.set(code, { pallets: 0, kg: 0, items: [] });
      const cur = codeMap.get(code)!;
      cur.pallets += i.displayQtyPallet;
      cur.kg      += i.displayQtyKg;
      cur.items.push(i);
    });
    return Array.from(zoneMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([zone, codeMap]) => {
        const codes = Array.from(codeMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([code, data]) => ({ code, ...data }));
        return {
          zone,
          codes,
          totalPallets: codes.reduce((s, c) => s + c.pallets, 0),
          totalKg:      codes.reduce((s, c) => s + c.kg, 0),
          totalItems:   codes.reduce((s, c) => s + c.items.length, 0),
        };
      });
  }, [activeItems]);

  // Filter + sort
  const filtered = useMemo(() => {
    // Show all items with quantity > 0 PLUS any discrepancy items (even if received qty is 0)
    let list = enriched.filter(i => i.quantity > 0 || i.isDiscrepancy);

    if (view === "RM") list = list.filter(i => i.category.includes("RM"));
    if (view === "FG") list = list.filter(i => i.category.includes("FG"));
    if (filterWh)      list = list.filter(i => i.warehouseId === filterWh);
    // Match against the flattened list, not the raw (possibly comma-joined) materialType
    // string — otherwise selecting "CFC" would never match a batch stored as "Board, CFC, Reel".
    if (filterType)    list = list.filter(i => i.materialTypeList.includes(filterType));
    if (filterStatus === "DISCREPANCY") list = list.filter(i => i.isDiscrepancy);
    if (filterStatus === "GOOD")        list = list.filter(i => !i.isDiscrepancy);

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i =>
        (i.material?.code         || "").toLowerCase().includes(q) ||
        (i.material?.description  || "").toLowerCase().includes(q) ||
        (i.batchNumber            || "").toLowerCase().includes(q) ||
        (i.invoiceNo              || "").toLowerCase().includes(q) ||
        (i.binLocation            || "").toLowerCase().includes(q)
      );
    }

    // Sort
    list = [...list].sort((a, b) => {
      let av: any, bv: any;
      if (sortField === "materialCode")   { av = a.material?.code || ""; bv = b.material?.code || ""; }
      else if (sortField === "description") { av = a.material?.description || ""; bv = b.material?.description || ""; }
      else if (sortField === "quantity")  { av = a.quantity; bv = b.quantity; }
      else if (sortField === "receiptDate") { av = a.receiptDate; bv = b.receiptDate; }
      else { av = a.category; bv = b.category; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [enriched, view, filterWh, filterType, filterStatus, searchTerm, sortField, sortDir]);

  const handleDeleteAll = useCallback(async () => {
    if (filtered.length === 0) return;
    if (!window.confirm(`Remove ALL ${filtered.length} inventory record(s) currently shown? This cannot be undone.`)) return;
    try {
      await Promise.all(filtered.map(item => fetch(`${API}/inventory/${item.id}`, { method: "DELETE" })));
      load();
    } catch {
      alert("Some records could not be deleted. Please refresh and try again.");
    }
  }, [filtered, load]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp size={10} style={{ opacity: 0.3 }} />;
    return sortDir === "asc"
      ? <ChevronUp size={10} style={{ color: "#2563eb" }} />
      : <ChevronDown size={10} style={{ color: "#2563eb" }} />;
  };

  // Status badge colours
  const statusStyle = (s: string) => {
    if (s === "GOOD")         return { bg: "#dcfce7", color: "#15803d", border: "#86efac" };
    if (s === "DAMAGED")      return { bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" };
    if (s === "DISCREPANCY")  return { bg: "#fef2f2", color: "#b91c1c", border: "#f87171" };
    if (s === "QUARANTINE")   return { bg: "#fffbeb", color: "#d97706", border: "#fde68a" };
    return { bg: "#fffbeb", color: "#d97706", border: "#fde68a" };
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: "10px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
    background: "#f8fafc",
    borderBottom: "1.5px solid #e2e8f0",
    whiteSpace: "nowrap",
    cursor: "pointer",
    userSelect: "none",
  };
  const tdStyle: React.CSSProperties = {
    padding: "9px 12px",
    fontSize: "12px",
    color: "#374151",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Rectify Discrepancy modal */}
      {rectifyItem && (
        <RectifyDiscrepancyModal
          item={rectifyItem}
          onClose={() => setRectifyItem(null)}
          onSaved={() => { setRectifyItem(null); load(); }}
          onEditFull={() => { setSelectedItem(rectifyItem); setRectifyItem(null); }}
        />
      )}

      {/* Edit modal */}
      {selectedItem && (
        <EditDetailModal
          item={selectedItem}
          warehouses={warehouses}
          onClose={() => setSelectedItem(null)}
          onSaved={() => { setSelectedItem(null); load(); }}
          isViewer={isViewer}
        />
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <Package size={22} style={{ color: "#2563eb" }} />
            {selectedWorker ? `${selectedWorker.name}'s Inventory` : 'Inventory'}
          </h1>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
            {selectedWorker ? `Warehouse: ${selectedWorker.warehouseCode || selectedWorker.warehouseCodes?.join(', ') || '—'} · ` : ''}
            Live stock · Updated {lastRefresh.toLocaleTimeString("en-IN")}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {!isViewer && (
            <button
              onClick={handleDeleteAll}
              disabled={loading || filtered.length === 0}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "8px 16px", background: "#fef2f2",
                border: "1.5px solid #fca5a5", borderRadius: "9px",
                fontSize: "12px", fontWeight: 700, color: "#dc2626",
                cursor: (loading || filtered.length === 0) ? "not-allowed" : "pointer",
                opacity: filtered.length === 0 ? 0.5 : 1,
              }}
            >
              <Trash2 size={13} /> Remove All
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", background: "#eff6ff",
              border: "1.5px solid #bfdbfe", borderRadius: "9px",
              fontSize: "12px", fontWeight: 700, color: "#2563eb",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "12px 16px", color: "#dc2626", fontSize: "13px", fontWeight: 600 }}>
          ⚠ {error} — make sure the backend is running on port 5001.
        </div>
      )}

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        {/* Active SKUs */}
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", color: "#2563eb" }}>
            <Package size={16} />
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Active SKUs</span>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 900, color: "#2563eb" }}>{activeItems.length}</div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{enriched.length - activeItems.length} depleted</div>
        </div>
        {/* RM Stock — both pallets and kg */}
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "12px", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", color: "#059669" }}>
            <Layers size={16} />
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>RM Stock</span>
          </div>
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: "26px", fontWeight: 900, color: "#059669", lineHeight: 1 }}>{totalRmPallets.toFixed(0)}</div>
              <div style={{ fontSize: "10px", color: "#6ee7b7", fontWeight: 700, marginTop: "2px" }}>Pallets</div>
            </div>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#0369a1", lineHeight: 1 }}>{totalRmKg.toFixed(0)}</div>
              <div style={{ fontSize: "10px", color: "#7dd3fc", fontWeight: 700, marginTop: "2px" }}>KG</div>
            </div>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>{rmItems.length} RM batches</div>
        </div>
        {/* FG – Pallets */}
        <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "12px", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", color: "#7c3aed" }}>
            <ArrowDownToLine size={16} />
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>FG – Pallets</span>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 900, color: "#7c3aed" }}>{totalFgPallets.toFixed(0)}</div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{fgItems.length} FG batches</div>
        </div>
        {/* FG – Net Wt */}
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", color: "#d97706" }}>
            <Weight size={16} />
            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>FG – Net Wt</span>
          </div>
          <div style={{ fontSize: "26px", fontWeight: 900, color: "#d97706" }}>{totalFgKg.toFixed(0)} kg</div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{totalFgNos.toFixed(0)} Nos total</div>
        </div>
      </div>

      {/* ── RM Stock by Material Type (Pallets + KGs) ──────────────────── */}
      {rmByType.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ddd6fe", borderRadius: "12px", padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: "10px", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Layers size={12} /> RM Stock — Pallets &amp; Net Wt by Material Type
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {rmByType.map(([type, { pallets, kg }]) => (
              <div key={type} style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "10px", padding: "10px 16px", minWidth: "150px" }}>
                <div style={{ fontSize: "10px", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>{type}</div>
                <div style={{ display: "flex", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 900, color: "#4c1d95" }}>{pallets.toFixed(0)}</div>
                    <div style={{ fontSize: "10px", color: "#a78bfa" }}>Pallets</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 900, color: "#4c1d95" }}>{kg.toFixed(0)}</div>
                    <div style={{ fontSize: "10px", color: "#a78bfa" }}>KG</div>
                  </div>
                </div>
              </div>
            ))}
            {/* RM Total */}
            <div style={{ background: "#e0e7ff", border: "1px solid #c7d2fe", borderRadius: "10px", padding: "10px 16px", minWidth: "150px" }}>
              <div style={{ fontSize: "10px", fontWeight: 800, color: "#4338ca", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>Total RM</div>
              <div style={{ display: "flex", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "20px", fontWeight: 900, color: "#312e81" }}>{totalRmPallets.toFixed(0)}</div>
                  <div style={{ fontSize: "10px", color: "#6366f1" }}>Pallets</div>
                </div>
                <div>
                  <div style={{ fontSize: "20px", fontWeight: 900, color: "#312e81" }}>{totalRmKg.toFixed(0)}</div>
                  <div style={{ fontSize: "10px", color: "#6366f1" }}>KG</div>
                </div>
              </div>
            </div>
            {/* FG Total */}
            {fgItems.length > 0 && (
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "10px", padding: "10px 16px", minWidth: "150px" }}>
                <div style={{ fontSize: "10px", fontWeight: 800, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>Total FG</div>
                <div style={{ display: "flex", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 900, color: "#78350f" }}>{totalFgPallets.toFixed(0)}</div>
                    <div style={{ fontSize: "10px", color: "#d97706" }}>Pallets</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 900, color: "#78350f" }}>{totalFgKg.toFixed(0)}</div>
                    <div style={{ fontSize: "10px", color: "#d97706" }}>KG</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bin-wise Material Allocation ──────────────────────────────── */}
      {stockBinAllocation.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: "10px", fontWeight: 800, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Grid3X3 size={12} /> Bin-wise Material Allocation
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr>
                  {[
                    { h: "BIN",         align: "left"  },
                    { h: "Material Code", align: "left" },
                    { h: "Description", align: "left"  },
                    { h: "HU Unit",     align: "left"  },
                    { h: "Type",        align: "left"  },
                    { h: "Category",    align: "left"  },
                    { h: "Pallets",     align: "right" },
                    { h: "Net Wt (kg)", align: "right" },
                    { h: "Qty (Nos)",   align: "right" },
                  ].map(({ h, align }) => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: align as any, fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1.5px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockBinAllocation.map(({ loc, bins, totalPallets, totalKg, totalItems }, li) => {
                  const isOpen = expandedLocs.has(loc);
                  return (
                    <React.Fragment key={loc}>
                      {/* ── Stock Location dropdown header ──────────── */}
                      <tr
                        onClick={() => toggleLoc(loc)}
                        style={{ background: "#f0fdf4", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "#dcfce7"}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "#f0fdf4"}
                      >
                        <td colSpan={9} style={{ padding: "7px 12px", fontWeight: 800, fontSize: "12px", color: "#059669", borderBottom: isOpen ? "1px solid #d1fae5" : "1px solid #e2e8f0", borderTop: li > 0 ? "2px solid #e2e8f0" : "none", userSelect: "none" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "11px", color: "#059669", lineHeight: 1 }}>{isOpen ? "▾" : "▸"}</span>
                            <span style={{ background: "#059669", color: "#fff", padding: "2px 10px", borderRadius: "4px", fontSize: "10px", letterSpacing: "0.06em" }}>{loc}</span>
                            <span style={{ color: "#6b7280", fontWeight: 600, fontSize: "10px" }}>
                              {totalPallets.toFixed(0)} pallets · {totalKg.toFixed(0)} kg · {totalItems} item{totalItems !== 1 ? "s" : ""}
                            </span>
                          </span>
                        </td>
                      </tr>
                      {/* ── Expanded: bins + material rows ──────────── */}
                      {isOpen && bins.map(({ bin, pallets, kg, items }, bi) => (
                        <React.Fragment key={bin}>
                          <tr style={{ background: "#f0f9ff" }}>
                            <td colSpan={9} style={{ padding: "4px 10px 4px 28px", fontWeight: 700, fontSize: "10px", color: "#0369a1", borderBottom: "1px solid #e2e8f0", borderTop: bi > 0 ? "1px dashed #e2e8f0" : "none" }}>
                              <span style={{ background: "#0369a1", color: "#fff", padding: "1px 7px", borderRadius: "4px", marginRight: "8px", fontSize: "9px" }}>{bin}</span>
                              <span style={{ color: "#94a3b8", fontWeight: 600 }}>{pallets.toFixed(0)} pallets · {kg.toFixed(0)} kg · {items.length} item{items.length !== 1 ? "s" : ""}</span>
                            </td>
                          </tr>
                          {items.map((item, ii) => (
                            <tr key={item.id} style={{ background: ii % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ padding: "5px 10px 5px 40px", color: "#cbd5e1", fontSize: "11px" }}>↳</td>
                              <td style={{ padding: "5px 10px", fontFamily: "monospace", fontWeight: 700, color: "#1e40af", fontSize: "11px", whiteSpace: "nowrap" }}>{item.material?.code || "—"}</td>
                              <td style={{ padding: "5px 10px", color: "#374151", whiteSpace: "normal", wordBreak: "break-word", maxWidth: "200px" }}>{item.material?.description || "—"}</td>
                              <td style={{ padding: "5px 10px", color: "#7c3aed", fontWeight: 600, fontSize: "11px", whiteSpace: "nowrap" }}>{item.huUnit || "—"}</td>
                              <td style={{ padding: "5px 10px", color: "#0891b2", fontWeight: 600, fontSize: "11px", whiteSpace: "nowrap" }}>{item.materialType || "—"}</td>
                              <td style={{ padding: "5px 10px" }}>
                                <span style={{ background: item.category.includes("FG") ? "#f5f3ff" : "#ecfdf5", color: item.category.includes("FG") ? "#7c3aed" : "#059669", border: `1px solid ${item.category.includes("FG") ? "#ddd6fe" : "#a7f3d0"}`, padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 700 }}>
                                  {item.category || "—"}
                                </span>
                              </td>
                              <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#7c3aed" }}>{item.displayQtyPallet > 0 ? item.displayQtyPallet.toFixed(0) : "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#059669" }}>{item.displayQtyKg > 0 ? item.displayQtyKg.toFixed(1) : "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right", color: "#374151" }}>{item.displayQtyNos.toFixed(0)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Rack-wise Allocation ──────────────────────────────────────── */}
      {/* Only shows batches actually linked to a real provisioned Rack Bin (see inward.ts
          commit route) — previously Rack/Row/Level data was never surfaced anywhere, only
          the flat BIN string above, even when the Excel sheet's BIN column matched a real
          rack bin code (e.g. "RA1-01"). */}
      {rackAllocation.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: "10px", fontWeight: 800, color: "#7c2d12", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Grid3X3 size={12} /> Rack-wise Allocation
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr>
                  {[
                    { h: "Bin",         align: "left"  },
                    { h: "Material Code", align: "left" },
                    { h: "Description", align: "left"  },
                    { h: "HU Unit",     align: "left"  },
                    { h: "Type",        align: "left"  },
                    { h: "Category",    align: "left"  },
                    { h: "Pallets",     align: "right" },
                    { h: "Net Wt (kg)", align: "right" },
                    { h: "Qty (Nos)",   align: "right" },
                  ].map(({ h, align }) => (
                    <th key={h} style={{ padding: "7px 10px", textAlign: align as any, fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1.5px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rackAllocation.map(({ rack, rows, totalPallets, totalKg, totalItems }, ri) => {
                  const isOpen = expandedRacks.has(rack);
                  return (
                    <React.Fragment key={rack}>
                      {/* ── Rack dropdown header ──────────── */}
                      <tr
                        onClick={() => toggleRack(rack)}
                        style={{ background: "#fff7ed", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "#ffedd5"}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "#fff7ed"}
                      >
                        <td colSpan={9} style={{ padding: "7px 12px", fontWeight: 800, fontSize: "12px", color: "#c2410c", borderBottom: isOpen ? "1px solid #fed7aa" : "1px solid #e2e8f0", borderTop: ri > 0 ? "2px solid #e2e8f0" : "none", userSelect: "none" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "11px", color: "#c2410c", lineHeight: 1 }}>{isOpen ? "▾" : "▸"}</span>
                            <span style={{ background: "#c2410c", color: "#fff", padding: "2px 10px", borderRadius: "4px", fontSize: "10px", letterSpacing: "0.06em" }}>Rack {rack}</span>
                            <span style={{ color: "#6b7280", fontWeight: 600, fontSize: "10px" }}>
                              {totalPallets.toFixed(0)} pallets · {totalKg.toFixed(0)} kg · {totalItems} item{totalItems !== 1 ? "s" : ""}
                            </span>
                          </span>
                        </td>
                      </tr>
                      {/* ── Expanded: rows + bin + material rows ──────────── */}
                      {isOpen && rows.map(({ row, pallets, kg, items }, rowi) => (
                        <React.Fragment key={row}>
                          <tr style={{ background: "#fffbeb" }}>
                            <td colSpan={9} style={{ padding: "4px 10px 4px 28px", fontWeight: 700, fontSize: "10px", color: "#b45309", borderBottom: "1px solid #e2e8f0", borderTop: rowi > 0 ? "1px dashed #e2e8f0" : "none" }}>
                              <span style={{ background: "#b45309", color: "#fff", padding: "1px 7px", borderRadius: "4px", marginRight: "8px", fontSize: "9px" }}>Row {row}</span>
                              <span style={{ color: "#94a3b8", fontWeight: 600 }}>{pallets.toFixed(0)} pallets · {kg.toFixed(0)} kg · {items.length} item{items.length !== 1 ? "s" : ""}</span>
                            </td>
                          </tr>
                          {items.map((item, ii) => (
                            <tr key={item.id} style={{ background: ii % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ padding: "5px 10px 5px 40px", color: "#7c2d12", fontWeight: 700, fontSize: "10px", whiteSpace: "nowrap" }}>{item.rackBinCode || "—"}</td>
                              <td style={{ padding: "5px 10px", fontFamily: "monospace", fontWeight: 700, color: "#1e40af", fontSize: "11px", whiteSpace: "nowrap" }}>{item.material?.code || "—"}</td>
                              <td style={{ padding: "5px 10px", color: "#374151", whiteSpace: "normal", wordBreak: "break-word", maxWidth: "200px" }}>{item.material?.description || "—"}</td>
                              <td style={{ padding: "5px 10px", color: "#7c3aed", fontWeight: 600, fontSize: "11px", whiteSpace: "nowrap" }}>{item.huUnit || "—"}</td>
                              <td style={{ padding: "5px 10px", color: "#0891b2", fontWeight: 600, fontSize: "11px", whiteSpace: "nowrap" }}>{item.materialType || "—"}</td>
                              <td style={{ padding: "5px 10px" }}>
                                <span style={{ background: item.category.includes("FG") ? "#f5f3ff" : "#ecfdf5", color: item.category.includes("FG") ? "#7c3aed" : "#059669", border: `1px solid ${item.category.includes("FG") ? "#ddd6fe" : "#a7f3d0"}`, padding: "1px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: 700 }}>
                                  {item.category || "—"}
                                </span>
                              </td>
                              <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#7c3aed" }}>{item.displayQtyPallet > 0 ? item.displayQtyPallet.toFixed(0) : "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#059669" }}>{item.displayQtyKg > 0 ? item.displayQtyKg.toFixed(1) : "—"}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right", color: "#374151" }}>{item.displayQtyNos.toFixed(0)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {/* View toggle */}
        <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
          {(["ALL", "RM", "FG"] as ViewMode[]).map(v => (
            <button key={v}
              onClick={() => setView(v)}
              style={{
                padding: "7px 14px", fontSize: "12px", fontWeight: 700,
                background: view === v ? "#2563eb" : "#fff",
                color: view === v ? "#fff" : "#64748b",
                border: "none", cursor: "pointer", transition: "all 0.12s",
              }}
            >{v === "ALL" ? "All Stock" : v === "RM" ? "RM – KGs" : "FG – Pallets"}</button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: "180px", maxWidth: "300px" }}>
          <Search size={13} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="text"
            placeholder="Material code, description, invoice…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: "100%", paddingLeft: "30px", paddingRight: "10px",
              paddingTop: "7px", paddingBottom: "7px",
              border: "1.5px solid #e2e8f0", borderRadius: "8px",
              fontSize: "12px", outline: "none", background: "#fff",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Type of Material filter */}
        {allMaterialTypes.length > 0 && (
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", background: "#fff", color: "#374151" }}
          >
            <option value="">All Material Types</option>
            {allMaterialTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as "" | "GOOD" | "DISCREPANCY")}
          style={{ border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", background: "#fff", color: "#374151" }}
        >
          <option value="">All Statuses</option>
          <option value="GOOD">Approved</option>
          <option value="DISCREPANCY">Discrepancy</option>
        </select>

        {/* Warehouse filter */}
        {warehouses.length > 1 && (
          <select
            value={filterWh}
            onChange={e => setFilterWh(e.target.value)}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", background: "#fff", color: "#374151" }}
          >
            <option value="">All Warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}

        <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "2000px" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={thStyle} onClick={() => toggleSort("materialCode")}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>Material Code <SortIcon field="materialCode" /></span>
                </th>
                <th style={{ ...thStyle, minWidth: "180px" }} onClick={() => toggleSort("description")}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>Description <SortIcon field="description" /></span>
                </th>
                <th style={thStyle} onClick={() => toggleSort("category")}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>Category <SortIcon field="category" /></span>
                </th>
                <th style={thStyle}>Type of Material</th>
                <th style={thStyle}>HU Unit</th>
                <th style={thStyle}>Invoice No</th>
                <th style={thStyle}>SAP Doc No</th>
                <th style={thStyle}>Gate Serial</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Invoice Plt</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Rcvd Plt</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Invoice Nos</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Rcvd Nos</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Invoice Wt (kg)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Rcvd Wt (kg)</th>
                <th style={thStyle}><span style={{ display: "flex", alignItems: "center", gap: "3px" }}><MapPin size={10} />BIN</span></th>
                <th style={thStyle}>Stock Location</th>
                <th style={thStyle} onClick={() => toggleSort("receiptDate")}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>Inward Date <SortIcon field="receiptDate" /></span>
                </th>
                <th style={thStyle}>Created By</th>
                <th style={thStyle}>TAT Remarks</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Short Plt</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Short/Excess Qty</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Short/Excess Kg</th>
                <th style={thStyle}>Disc Remarks</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, width: "40px" }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={26} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                  <RefreshCw size={20} style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={26} style={{ ...tdStyle, textAlign: "center", padding: "48px", color: "#94a3b8" }}>
                  <Package size={40} style={{ opacity: 0.2, margin: "0 auto 8px" }} />
                  <div style={{ fontWeight: 700, color: "#64748b" }}>No inventory found</div>
                  <div style={{ fontSize: "11px", marginTop: "4px" }}>Commit inward entries to populate inventory</div>
                </td></tr>
              )}
              {!loading && filtered.map((item, idx) => {
                const ss = statusStyle(item.stockStatus);
                const isZero = item.quantity <= 0;
                const disc = item.isDiscrepancy;
                const baseRowBg = disc ? "#fff5f5" : (isZero ? "#fafafa" : idx % 2 === 0 ? "#fff" : "#fafafa");
                const hoverBg   = disc ? "#fee2e2" : "#eff6ff";
                const rowStyle: React.CSSProperties = {
                  background: baseRowBg,
                  opacity: isZero ? 0.7 : 1,
                  transition: "background 0.1s",
                  cursor: "pointer",
                  borderLeft: disc ? "3px solid #dc2626" : "3px solid transparent",
                };
                return (
                  <tr
                    key={item.id}
                    onClick={() => disc ? setRectifyItem(item) : setSelectedItem(item)}
                    title={disc ? "Click to rectify discrepancy" : "Click to edit"}
                    style={rowStyle}
                    onMouseEnter={e => ((e.currentTarget as HTMLTableRowElement).style.background = hoverBg)}
                    onMouseLeave={e => ((e.currentTarget as HTMLTableRowElement).style.background = baseRowBg)}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#1e40af", background: "#eff6ff", padding: "2px 6px", borderRadius: "5px" }}>
                          {item.material?.code || "—"}
                        </span>
                        {disc && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "3px",
                                         fontSize: "9px", fontWeight: 800, color: "#b91c1c",
                                         background: "#fef2f2", border: "1px solid #fca5a5",
                                         padding: "2px 6px", borderRadius: "4px", cursor: "pointer" }}>
                            <AlertTriangle size={9} /> Rectify
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, minWidth: "180px" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "12px", whiteSpace: "normal", wordBreak: "break-word" }}>
                        {item.material?.description || "—"}
                      </div>
                      {item.source !== "—" && (
                        <div style={{ fontSize: "10px", color: "#94a3b8" }}>from {item.source}</div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        background: item.category.includes("FG") ? "#f5f3ff" : "#ecfdf5",
                        color:      item.category.includes("FG") ? "#7c3aed" : "#059669",
                        border:     `1px solid ${item.category.includes("FG") ? "#ddd6fe" : "#a7f3d0"}`,
                        padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
                      }}>
                        {item.category || "—"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "11px", color: "#0891b2" }}>
                      {item.materialType || "—"}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "11px", color: "#64748b" }}>
                      {item.huUnit || "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>
                      {item.invoiceNo !== "—" ? item.invoiceNo : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px", color: item.sapDocNo ? "#374151" : "#cbd5e1" }}>
                      {item.sapDocNo || "—"}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "11px", color: item.gateSerialNo ? "#0369a1" : "#cbd5e1" }}>
                      {item.gateSerialNo || "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.invoiceQtyInPallet > 0 ? "#6d28d9" : "#cbd5e1", fontWeight: 600 }}>
                      {item.invoiceQtyInPallet > 0 ? item.invoiceQtyInPallet.toFixed(0) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.receivedQtyInPallets > 0 ? "#7c3aed" : "#cbd5e1", fontWeight: 700 }}>
                      {item.receivedQtyInPallets > 0 ? item.receivedQtyInPallets.toFixed(0) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.invoiceQtyInNos > 0 ? "#374151" : "#cbd5e1", fontWeight: 600 }}>
                      {item.invoiceQtyInNos > 0 ? item.invoiceQtyInNos.toFixed(0) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.receivedQtyInNos > 0 ? "#059669" : "#cbd5e1", fontWeight: 700 }}>
                      {item.receivedQtyInNos > 0 ? item.receivedQtyInNos.toFixed(0) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.invoiceNetWeight > 0 ? "#374151" : "#cbd5e1", fontWeight: 600 }}>
                      {item.invoiceNetWeight > 0 ? `${item.invoiceNetWeight.toFixed(1)}` : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.receivedNetWeight > 0 ? "#059669" : "#cbd5e1", fontWeight: 700 }}>
                      {item.receivedNetWeight > 0 ? `${item.receivedNetWeight.toFixed(1)}` : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "11px" }}>
                      {(() => {
                        const bin = item.binLocation !== "—" ? item.binLocation : "";
                        const whCode = item.warehouse?.code || "";
                        const validSet = validBinsMap[whCode];
                        const isInvalid = bin && validSet && !validSet.has(bin.toLowerCase());
                        return (
                          <span
                            title={isInvalid ? `"${bin}" is not a valid bin in warehouse ${whCode}` : undefined}
                            style={{
                              color: bin
                                ? (isInvalid ? "#dc2626" : "#2563eb")
                                : "#cbd5e1",
                              fontWeight: bin ? 700 : 400,
                              background: isInvalid ? "#fef2f2" : "transparent",
                              border: isInvalid ? "1px solid #fecaca" : "none",
                              borderRadius: isInvalid ? "4px" : "0",
                              padding: isInvalid ? "1px 5px" : "0",
                              cursor: isInvalid ? "help" : "default",
                            }}
                          >
                            {bin || "—"}{isInvalid ? " ⚠" : ""}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "11px", color: item.stockLocation !== "—" ? "#374151" : "#cbd5e1" }}>
                      {item.stockLocation}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "11px", color: "#64748b", whiteSpace: "nowrap" }}>
                      {item.inwardDate
                        ? item.inwardDate
                        : item.receiptDate
                          ? new Date(item.receiptDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                          : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "11px", color: "#374151" }}>
                      {item.createdBy || "—"}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "11px", color: "#64748b", maxWidth: "120px" }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.tatRemarks}>
                        {item.tatRemarks || "—"}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.shortInPallet !== 0 ? "#b91c1c" : "#cbd5e1", fontWeight: item.shortInPallet !== 0 ? 700 : 400 }}>
                      {item.shortInPallet !== 0 ? item.shortInPallet : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.shortExcessInQty !== 0 ? "#b91c1c" : "#cbd5e1", fontWeight: item.shortExcessInQty !== 0 ? 700 : 400 }}>
                      {item.shortExcessInQty !== 0 ? item.shortExcessInQty : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: item.shortExcessInKg !== 0 ? "#b91c1c" : "#cbd5e1", fontWeight: item.shortExcessInKg !== 0 ? 700 : 400 }}>
                      {item.shortExcessInKg !== 0 ? item.shortExcessInKg : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "11px", minWidth: "120px" }}>
                      {item.discrepancyRemarks ? (
                        <span style={{ color: "#7f1d1d" }} title={item.discrepancyRemarks}>
                          {item.discrepancyRemarks.length > 30 ? item.discrepancyRemarks.slice(0, 30) + "…" : item.discrepancyRemarks}
                        </span>
                      ) : (
                        <span style={{ color: "#cbd5e1" }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                        padding: "2px 8px", borderRadius: "20px", fontSize: "10px", fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}>
                        {item.stockStatus}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", width: "80px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                        <span style={{ color: "#94a3b8" }}><Edit3 size={13} /></span>
                        {!isViewer && (
                          <button
                            onClick={(e) => handleDelete(item.id, e)}
                            disabled={deletingId === item.id}
                            title="Delete stock record"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#fca5a5", padding: "2px", display: "flex", alignItems: "center", borderRadius: "4px", transition: "color 0.1s" }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = "#dc2626")}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = "#fca5a5")}
                          >
                            {deletingId === item.id ? <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={12} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#f8fafc",
        }}>
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "#94a3b8" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <ArrowDownToLine size={10} style={{ color: "#2563eb" }} /> Inward adds to stock
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <ArrowUpFromLine size={10} style={{ color: "#dc2626" }} /> Outward reduces stock
            </span>
          </div>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>
            {filtered.length} of {raw.length} items
          </span>
        </div>
      </div>
    </div>
  );
}
