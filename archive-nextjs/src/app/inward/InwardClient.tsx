"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Upload, CheckCircle2, AlertCircle, Database, RefreshCw,
  Edit2, Trash2, ClipboardList, ChevronDown, ChevronUp,
  CheckSquare, XCircle, TriangleAlert, Save, BookOpen, Zap,
  ArrowRight, FileText, X
} from "lucide-react";
import { commitInwardEntries, type ManualEntryPayload } from "./actions";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ManualEntry extends ManualEntryPayload {
  id: string;
  entryStatus: "PENDING" | "APPROVED" | "DISCREPANCY" | "REJECTED";
}

const EMPTY_ENTRY: Omit<ManualEntry, "id"> = {
  entryStatus: "PENDING",
  status: "APPROVED",
  date: new Date().toISOString().split("T")[0],
  gateSerialNo: "", source: "", invoiceNumber: "", sapDocumentNumber: "",
  lrNumber: "", sealNumber: "", truckNumber: "", transporter: "",
  category: "RM", stockLocation: "",
  truckInTime: "", unloadStartTime: "", unloadEndTime: "", truckOutTime: "",
  tat: "", tatRemarks: "",
  materialCode: "", description: "", huUnit: "Nos",
  actualHuUnit: "", actualDescription: "", binLocation: "",
  invoiceQtyInPallet: 0, invoiceQtyInNos: 0, invoiceNetWeight: 0,
  receivedQtyInPallets: 0, receivedQtyInNos: 0, receivedQtyInKgs: 0,
  receivedNetWeight: 0, netWeight: 0, receivedPalletCount: 0,
  numberOfBoxes: 0, boxPerKg: 0, shortInPallet: 0, shortExcessInKg: 0,
  remarks: "", discrepancyRemarks: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// TAT helper
// ─────────────────────────────────────────────────────────────────────────────
function calcTAT(inTime: string, outTime: string): string {
  if (!inTime || !outTime) return "";
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  let mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel column guide
// ─────────────────────────────────────────────────────────────────────────────
const EXCEL_GUIDE = [
  { col: "Date", field: "Date" },
  { col: "Gate Serial No", field: "Gate Serial No" },
  { col: "Source / Vendor", field: "Source / Vendor" },
  { col: "Invoice / HU Number", field: "Invoice Number" },
  { col: "SAP Document No", field: "SAP Document No" },
  { col: "LR Number", field: "LR Number" },
  { col: "Material Description", field: "Description" },
  { col: "Category (RM/FG)", field: "Category" },
  { col: "Invoice Qty (Pallets)", field: "Invoice Qty (Pallets)" },
  { col: "Invoice Net Weight (Kg)", field: "Invoice Net Weight (Kg)" },
  { col: "Received Net Weight (Kg)", field: "Received Net Weight (Kg)" },
  { col: "BIN Location", field: "BIN Location" },
  { col: "Truck In Time", field: "Truck In Time" },
  { col: "Unload Start Time", field: "Unload Start" },
  { col: "Unload End Time", field: "Unload End" },
  { col: "Truck Out Time", field: "Truck Out Time" },
  { col: "TAT", field: "TAT (auto-calculated)" },
  { col: "Remarks", field: "Remarks" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Form field component
// ─────────────────────────────────────────────────────────────────────────────
const Field = ({
  label, value, onChange, type = "text", placeholder = "", step, required = false, readOnly = false
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; step?: string; required?: boolean; readOnly?: boolean;
}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      readOnly={readOnly}
      className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
        readOnly
          ? "bg-gray-50 border-gray-200 text-gray-500 cursor-default"
          : "bg-white border-gray-300 hover:border-gray-400"
      }`}
    />
  </div>
);

const SelectField = ({
  label, value, onChange, options, required = false
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; required?: boolean;
}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-gray-400 transition"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const SECTION_COLORS: Record<string, string> = {
  blue:   "text-blue-600",
  indigo: "text-indigo-600",
  green:  "text-green-600",
  purple: "text-purple-600",
  amber:  "text-amber-600",
};
const SectionHeader = ({ icon, title, color = "blue" }: { icon: React.ReactNode; title: string; color?: string }) => (
  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
    <div className={SECTION_COLORS[color] || "text-blue-600"}>{icon}</div>
    <h3 className={`text-xs font-bold uppercase tracking-widest ${SECTION_COLORS[color] || "text-blue-700"}`}>{title}</h3>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Discrepancy Panel
// ─────────────────────────────────────────────────────────────────────────────
const DiscrepancyPanel = ({ entry, onUpdate }: {
  entry: ManualEntry;
  onUpdate: (field: keyof ManualEntry, val: string | number) => void;
}) => {
  const diffNos = (entry.receivedQtyInNos || 0) - (entry.invoiceQtyInNos || 0);
  const diffPallets = (entry.receivedQtyInPallets || 0) - (entry.invoiceQtyInPallet || 0);
  const diffWt = (entry.receivedNetWeight || 0) - (entry.invoiceNetWeight || 0);

  const DiffBadge = ({ val, unit = "" }: { val: number; unit?: string }) => (
    <span className={`font-bold text-sm ${val === 0 ? "text-gray-400" : val > 0 ? "text-green-600" : "text-red-600"}`}>
      {val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}{unit ? ` ${unit}` : ""}
    </span>
  );

  const CellInput = ({ value, onChange, type = "text", placeholder = "" }: {
    value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
  }) => (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
    />
  );

  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TriangleAlert size={15} className="text-amber-600" />
          <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Discrepancy Report</span>
        </div>
        <span className="text-xs text-gray-400 italic">Click any cell to edit</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-amber-200 mb-3">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-amber-100">
              <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 w-32">Parameter</th>
              <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50">📋 Invoice (Expected)</th>
              <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50">📦 Received (Actual)</th>
              <th className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 w-28">Δ Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-amber-100">
              <td className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">HU Unit</td>
              <td className="px-2 py-1 bg-blue-50/60"><CellInput value={entry.huUnit} onChange={(v) => onUpdate("huUnit", v)} placeholder="e.g. Nos" /></td>
              <td className="px-2 py-1 bg-red-50/60"><CellInput value={entry.actualHuUnit} onChange={(v) => onUpdate("actualHuUnit", v)} placeholder={entry.huUnit || "Actual unit"} /></td>
              <td className="px-3 py-1.5">
                {entry.actualHuUnit && entry.actualHuUnit !== entry.huUnit
                  ? <span className="text-amber-600 font-bold text-xs">⚠ CHANGED</span>
                  : <span className="text-green-600 text-xs font-semibold">✓ Match</span>}
              </td>
            </tr>
            <tr className="border-t border-amber-100">
              <td className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Description</td>
              <td className="px-2 py-1 bg-blue-50/60"><CellInput value={entry.description} onChange={(v) => onUpdate("description", v)} placeholder="Material description" /></td>
              <td className="px-2 py-1 bg-red-50/60"><CellInput value={entry.actualDescription} onChange={(v) => onUpdate("actualDescription", v)} placeholder={entry.description || "Actual desc"} /></td>
              <td className="px-3 py-1.5">
                {entry.actualDescription && entry.actualDescription !== entry.description
                  ? <span className="text-amber-600 font-bold text-xs">⚠ CHANGED</span>
                  : <span className="text-green-600 text-xs font-semibold">✓ Match</span>}
              </td>
            </tr>
            <tr className="border-t border-amber-100">
              <td className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Qty (Nos)</td>
              <td className="px-2 py-1 bg-blue-50/60"><CellInput type="number" value={entry.invoiceQtyInNos} onChange={(v) => onUpdate("invoiceQtyInNos", parseFloat(v) || 0)} /></td>
              <td className="px-2 py-1 bg-red-50/60"><CellInput type="number" value={entry.receivedQtyInNos} onChange={(v) => onUpdate("receivedQtyInNos", parseFloat(v) || 0)} /></td>
              <td className={`px-3 py-1.5 ${diffNos !== 0 ? (diffNos > 0 ? "bg-green-50" : "bg-red-50") : ""}`}><DiffBadge val={diffNos} /></td>
            </tr>
            <tr className="border-t border-amber-100">
              <td className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Qty (Pallets)</td>
              <td className="px-2 py-1 bg-blue-50/60"><CellInput type="number" value={entry.invoiceQtyInPallet} onChange={(v) => onUpdate("invoiceQtyInPallet", parseFloat(v) || 0)} /></td>
              <td className="px-2 py-1 bg-red-50/60"><CellInput type="number" value={entry.receivedQtyInPallets} onChange={(v) => onUpdate("receivedQtyInPallets", parseFloat(v) || 0)} /></td>
              <td className={`px-3 py-1.5 ${diffPallets !== 0 ? (diffPallets > 0 ? "bg-green-50" : "bg-red-50") : ""}`}><DiffBadge val={diffPallets} /></td>
            </tr>
            <tr className="border-t border-amber-100">
              <td className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Net Weight</td>
              <td className="px-2 py-1 bg-blue-50/60"><CellInput type="number" value={entry.invoiceNetWeight} onChange={(v) => onUpdate("invoiceNetWeight", parseFloat(v) || 0)} /></td>
              <td className="px-2 py-1 bg-red-50/60"><CellInput type="number" value={entry.receivedNetWeight} onChange={(v) => onUpdate("receivedNetWeight", parseFloat(v) || 0)} /></td>
              <td className={`px-3 py-1.5 ${diffWt !== 0 ? (diffWt > 0 ? "bg-green-50" : "bg-red-50") : ""}`}><DiffBadge val={diffWt} unit="kg" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <label className="block text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Discrepancy Remarks</label>
        <textarea
          value={entry.discrepancyRemarks}
          onChange={(e) => onUpdate("discrepancyRemarks", e.target.value)}
          placeholder="Describe the discrepancy in detail..."
          rows={2}
          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-vertical"
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry Row (list item)
// ─────────────────────────────────────────────────────────────────────────────
const EntryRow = ({
  entry, index, onEdit, onDelete, onStatusChange, onUpdateField
}: {
  entry: ManualEntry; index: number;
  onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: ManualEntry["entryStatus"]) => void;
  onUpdateField: (field: keyof ManualEntry, val: string | number) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const diffNos = (entry.receivedQtyInNos || 0) - (entry.invoiceQtyInNos || 0);
  const diffWt = (entry.receivedNetWeight || 0) - (entry.invoiceNetWeight || 0);

  const statusConfig = {
    PENDING:     { bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-300",  label: "Pending" },
    APPROVED:    { bg: "bg-green-100",  text: "text-green-700",  border: "border-green-300",  label: "Approved" },
    DISCREPANCY: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", label: "Discrepancy" },
    REJECTED:    { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-300",    label: "Rejected" },
  };
  const cfg = statusConfig[entry.entryStatus];

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-2 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <div className="grid items-center gap-3 px-4 py-3"
        style={{ gridTemplateColumns: "1.5rem 1.5fr 1.8fr 0.7fr 0.7fr 0.9fr auto" }}>
        {/* Index */}
        <div className="text-xs font-bold text-gray-400">{index + 1}</div>

        {/* Material */}
        <div>
          <div className="font-semibold text-gray-900 text-sm truncate">{entry.description || entry.materialCode || "—"}</div>
          <div className="text-xs text-gray-400">{entry.materialCode} · {entry.category}</div>
        </div>

        {/* Invoice vs Received */}
        <div className="text-xs">
          <div className="text-gray-500">Invoice: <span className="text-blue-600 font-semibold">{entry.invoiceQtyInNos || "—"} {entry.huUnit}</span> · <span className="text-gray-600">{entry.invoiceNetWeight || "—"} kg</span></div>
          <div className="text-gray-500">Received: <span className="text-green-600 font-semibold">{entry.receivedQtyInNos || "—"} {entry.actualHuUnit || entry.huUnit}</span> · <span className={`font-semibold ${diffWt < 0 ? "text-red-600" : diffWt > 0 ? "text-green-600" : "text-gray-600"}`}>{entry.receivedNetWeight || "—"} kg</span></div>
        </div>

        {/* Δ Qty */}
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-0.5">Δ Qty</div>
          <div className={`font-bold text-sm ${diffNos === 0 ? "text-gray-400" : diffNos > 0 ? "text-green-600" : "text-red-600"}`}>
            {diffNos > 0 ? `+${diffNos}` : diffNos || "—"}
          </div>
        </div>

        {/* Δ Wt */}
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-0.5">Δ Wt</div>
          <div className={`font-bold text-sm ${diffWt === 0 ? "text-gray-400" : diffWt > 0 ? "text-green-600" : "text-red-600"}`}>
            {diffWt ? (diffWt > 0 ? `+${diffWt.toFixed(2)}` : diffWt.toFixed(2)) : "—"}
          </div>
        </div>

        {/* Status badge */}
        <div>
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 items-center">
          {entry.entryStatus === "PENDING" && (
            <>
              <button onClick={() => onStatusChange("APPROVED")} title="Approve"
                className="flex items-center gap-1 text-xs font-bold bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 rounded-md px-2 py-1 transition">
                <CheckCircle2 size={11} /> OK
              </button>
              <button onClick={() => { onStatusChange("DISCREPANCY"); setExpanded(true); }} title="Mark Discrepancy"
                className="flex items-center gap-1 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-300 rounded-md px-2 py-1 transition">
                <TriangleAlert size={11} /> Disc.
              </button>
              <button onClick={() => onStatusChange("REJECTED")} title="Reject"
                className="flex items-center gap-1 text-xs font-bold bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 rounded-md px-2 py-1 transition">
                <XCircle size={11} />
              </button>
            </>
          )}
          {entry.entryStatus !== "PENDING" && (
            <button onClick={() => onStatusChange("PENDING")}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 border border-gray-200 rounded-md px-2 py-1 transition">
              Reset
            </button>
          )}
          {entry.entryStatus === "DISCREPANCY" && (
            <button onClick={() => setExpanded((e) => !e)}
              className="p-1 bg-amber-100 border border-amber-200 rounded-md text-amber-700 hover:bg-amber-200 transition">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
          <button onClick={onEdit} title="Edit"
            className="p-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 rounded-md transition">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} title="Delete"
            className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-500 rounded-md transition">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {entry.entryStatus === "DISCREPANCY" && expanded && (
        <div className="px-4 pb-4 border-t border-amber-100">
          <DiscrepancyPanel entry={entry} onUpdate={onUpdateField} />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry Form Modal
// ─────────────────────────────────────────────────────────────────────────────
const EntryFormModal = ({
  entry, isEdit, onSave, onSaveAndNext, onClose
}: {
  entry: ManualEntry; isEdit: boolean;
  onSave: (e: ManualEntry) => void;
  onSaveAndNext?: (e: ManualEntry) => void;
  onClose: () => void;
}) => {
  const [form, setForm] = useState<ManualEntry>({ ...entry });
  const [guideOpen, setGuideOpen] = useState(false);
  const set = (field: keyof ManualEntry) => (val: string | number) =>
    setForm((p) => ({ ...p, [field]: val }));

  // Auto-TAT
  useEffect(() => {
    const tat = calcTAT(form.truckInTime, form.truckOutTime);
    if (tat) setForm((p) => ({ ...p, tat }));
  }, [form.truckInTime, form.truckOutTime]);

  // Auto short/excess
  useEffect(() => {
    if (form.invoiceQtyInPallet && form.receivedQtyInPallets) {
      setForm((p) => ({ ...p, shortInPallet: (p.receivedQtyInPallets || 0) - (p.invoiceQtyInPallet || 0) }));
    }
  }, [form.invoiceQtyInPallet, form.receivedQtyInPallets]);

  useEffect(() => {
    if (form.invoiceNetWeight && form.receivedNetWeight) {
      setForm((p) => ({ ...p, shortExcessInKg: parseFloat(((p.receivedNetWeight || 0) - (p.invoiceNetWeight || 0)).toFixed(2)) }));
    }
  }, [form.invoiceNetWeight, form.receivedNetWeight]);

  const gridCols = (n: number) => `grid grid-cols-${n} gap-4 mb-5`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-blue-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <ClipboardList size={22} className="text-blue-600" />
            <div>
              <div className="font-bold text-lg text-gray-900">{isEdit ? "Edit Entry" : "New Manual Entry"}</div>
              <div className="text-xs text-gray-500">Fill in all fields as verified against physical goods</div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={() => setGuideOpen((g) => !g)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${guideOpen ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"}`}>
              <BookOpen size={12} /> Excel Guide
            </button>
            <button onClick={onClose} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Excel Guide */}
        {guideOpen && (
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={13} className="text-amber-600" />
              <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Excel Column → Form Field Mapping</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {EXCEL_GUIDE.map(({ col, field }) => (
                <div key={col} className="flex items-center gap-2 text-xs bg-white rounded-md px-2 py-1.5 border border-amber-100">
                  <span className="font-bold text-blue-700 truncate">{col}</span>
                  <ArrowRight size={9} className="text-gray-400 flex-shrink-0" />
                  <span className="text-green-700 font-semibold truncate">{field}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-6 py-5 space-y-5">
          {/* 1. Document / Shipment Info */}
          <div>
            <SectionHeader icon={<FileText size={14} />} title="1. Document & Shipment Info" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Date" type="date" value={form.date} onChange={set("date")} required />
              <Field label="Gate Serial No" value={form.gateSerialNo} onChange={set("gateSerialNo")} placeholder="e.g. 333" />
              <Field label="Invoice / HU Number" value={form.invoiceNumber} onChange={set("invoiceNumber")} placeholder="e.g. HSSA1282..." required />
              <Field label="SAP Document No" value={form.sapDocumentNumber} onChange={set("sapDocumentNumber")} placeholder="490592..." />
              <Field label="LR Number" value={form.lrNumber} onChange={set("lrNumber")} placeholder="LR No." />
              <Field label="Seal Number" value={form.sealNumber} onChange={set("sealNumber")} />
              <Field label="Source / Vendor" value={form.source} onChange={set("source")} placeholder="Supplier name" />
              <SelectField label="Category" value={form.category} onChange={set("category")}
                options={[{ value: "RM", label: "RM – Raw Material" }, { value: "FG", label: "FG – Finished Goods" }]} />
            </div>
          </div>

          {/* 2. Truck Info */}
          <div>
            <SectionHeader icon={<FileText size={14} />} title="2. Truck & Transporter" color="indigo" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Truck Number" value={form.truckNumber} onChange={set("truckNumber")} placeholder="TN 00 AB 0000" />
              <Field label="Transporter" value={form.transporter} onChange={set("transporter")} />
              <Field label="Stock Location" value={form.stockLocation} onChange={set("stockLocation")} placeholder="e.g. RM Store" />
              <Field label="BIN Location" value={form.binLocation} onChange={set("binLocation")} placeholder="e.g. RM0456" />
            </div>
          </div>

          {/* 3. Material Details */}
          <div>
            <SectionHeader icon={<FileText size={14} />} title="3. Material Details" color="green" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Material Code" value={form.materialCode} onChange={set("materialCode")} placeholder="e.g. MAT001" />
              <div className="md:col-span-2">
                <Field label="Description" value={form.description} onChange={set("description")} placeholder="e.g. JAF FBB BXFP 285 GSM 724 X 998 MM" />
              </div>
              <Field label="HU Unit" value={form.huUnit} onChange={set("huUnit")} placeholder="e.g. Nos / Kg / Pallet" />
            </div>
          </div>

          {/* 4. Invoice Quantities */}
          <div>
            <SectionHeader icon={<FileText size={14} />} title="4. Invoice Quantities (Expected)" color="blue" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="Invoice Qty (Pallets)" type="number" value={form.invoiceQtyInPallet || ""} onChange={(v) => set("invoiceQtyInPallet")(parseFloat(v) || 0)} placeholder="0" />
              <Field label="Invoice Qty (Nos)" type="number" value={form.invoiceQtyInNos || ""} onChange={(v) => set("invoiceQtyInNos")(parseFloat(v) || 0)} placeholder="0" />
              <Field label="Invoice Net Weight (Kg)" type="number" step="0.01" value={form.invoiceNetWeight || ""} onChange={(v) => set("invoiceNetWeight")(parseFloat(v) || 0)} placeholder="0.00" />
            </div>
          </div>

          {/* 5. Received Quantities */}
          <div>
            <SectionHeader icon={<FileText size={14} />} title="5. Received Quantities (Actual)" color="green" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Received Pallets" type="number" value={form.receivedQtyInPallets || ""} onChange={(v) => set("receivedQtyInPallets")(parseFloat(v) || 0)} />
              <Field label="Received Nos" type="number" value={form.receivedQtyInNos || ""} onChange={(v) => set("receivedQtyInNos")(parseFloat(v) || 0)} />
              <Field label="Received Net Weight (Kg)" type="number" step="0.01" value={form.receivedNetWeight || ""} onChange={(v) => set("receivedNetWeight")(parseFloat(v) || 0)} />
              <Field label="Received Qty (Kgs)" type="number" step="0.01" value={form.receivedQtyInKgs || ""} onChange={(v) => set("receivedQtyInKgs")(parseFloat(v) || 0)} />
              <Field label="No. of Boxes" type="number" value={form.numberOfBoxes || ""} onChange={(v) => set("numberOfBoxes")(parseFloat(v) || 0)} />
              <Field label="Box per Kg" type="number" step="0.01" value={form.boxPerKg || ""} onChange={(v) => set("boxPerKg")(parseFloat(v) || 0)} />
              <Field label="Short in Pallet" type="number" step="0.01" value={form.shortInPallet || ""} onChange={(v) => set("shortInPallet")(parseFloat(v) || 0)} readOnly />
              <Field label="Short/Excess (Kg)" type="number" step="0.01" value={form.shortExcessInKg || ""} onChange={(v) => set("shortExcessInKg")(parseFloat(v) || 0)} readOnly />
            </div>
          </div>

          {/* 6. Timing & TAT */}
          <div>
            <SectionHeader icon={<FileText size={14} />} title="6. Timing & TAT" color="purple" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Truck In Time" type="time" value={form.truckInTime} onChange={set("truckInTime")} />
              <Field label="Unload Start" type="time" value={form.unloadStartTime} onChange={set("unloadStartTime")} />
              <Field label="Unload End" type="time" value={form.unloadEndTime} onChange={set("unloadEndTime")} />
              <Field label="Truck Out Time" type="time" value={form.truckOutTime} onChange={set("truckOutTime")} />
              <Field label="TAT (auto-calculated)" value={form.tat} onChange={set("tat")} readOnly placeholder="Enter truck times above" />
              <div className="md:col-span-3">
                <Field label="TAT Remarks" value={form.tatRemarks} onChange={set("tatRemarks")} placeholder="Any delay reasons..." />
              </div>
            </div>
          </div>

          {/* 7. Remarks */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Remarks</label>
            <textarea value={form.remarks} onChange={(e) => set("remarks")(e.target.value)}
              placeholder="Any additional remarks..." rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
            />
          </div>

          {/* Auto-calc info */}
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-2">
            <Zap size={12} className="text-green-600 flex-shrink-0" />
            <span className="text-xs text-green-700"><strong>Auto-calculated:</strong> TAT from Truck In/Out · Short/Excess Kg from Invoice vs Received Weight · Short Pallets from Invoice vs Received Pallets</span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition">
              Cancel
            </button>
            {!isEdit && onSaveAndNext && (
              <button onClick={() => onSaveAndNext({ ...form })}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-green-700 bg-green-100 hover:bg-green-200 border border-green-300 rounded-lg transition">
                <Plus size={14} /> Save & Add Another
              </button>
            )}
            <button onClick={() => onSave({ ...form })}
              className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition">
              <Save size={14} /> {isEdit ? "Save Changes" : "Add Entry"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function InwardClient() {
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ManualEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [smartUploading, setSmartUploading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartImported, setSmartImported] = useState(0);

  // ── Counts
  const pending     = entries.filter((e) => e.entryStatus === "PENDING").length;
  const approved    = entries.filter((e) => e.entryStatus === "APPROVED").length;
  const discrepancy = entries.filter((e) => e.entryStatus === "DISCREPANCY").length;
  const rejected    = entries.filter((e) => e.entryStatus === "REJECTED").length;

  // ── Entry management
  const handleAddEntry = (entry: ManualEntry) => {
    if (editingEntry) {
      setEntries((prev) => prev.map((e) => e.id === entry.id ? entry : e));
    } else {
      setEntries((prev) => [...prev, { ...entry, id: `entry-${Date.now()}`, entryStatus: "PENDING" }]);
    }
    setFormOpen(false);
    setEditingEntry(null);
  };

  const handleSaveAndNext = (entry: ManualEntry) => {
    setEntries((prev) => [...prev, { ...entry, id: `entry-${Date.now()}`, entryStatus: "PENDING" }]);
    setEditingEntry(null);
    setFormOpen(false);
    setTimeout(() => {
      setEditingEntry({
        ...(entry as ManualEntry),
        id: "",
        entryStatus: "PENDING",
        // Clear line-item specific fields but keep header
        materialCode: "", description: "", huUnit: "Nos", binLocation: "",
        invoiceQtyInPallet: 0, invoiceQtyInNos: 0, invoiceNetWeight: 0,
        receivedQtyInPallets: 0, receivedQtyInNos: 0, receivedQtyInKgs: 0,
        receivedNetWeight: 0, numberOfBoxes: 0, boxPerKg: 0,
        shortInPallet: 0, shortExcessInKg: 0, remarks: "", discrepancyRemarks: "",
        actualHuUnit: "", actualDescription: "",
      });
      setFormOpen(true);
    }, 50);
  };

  const handleStatusChange = (id: string, s: ManualEntry["entryStatus"]) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, entryStatus: s, status: s === "APPROVED" || s === "DISCREPANCY" ? s : e.status } : e));
  };

  const handleUpdateField = (id: string, field: keyof ManualEntry, val: string | number) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: val } : e));
  };

  // ── Excel Upload (client-side)
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSmartUploading(true); setSmartError(null); setSmartImported(0);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) throw new Error("No data rows found in the file.");

      const mapped: ManualEntry[] = rows.map((row, i) => ({
        ...EMPTY_ENTRY,
        id: `xl-${Date.now()}-${i}`,
        entryStatus: "PENDING" as const,
        date: String(row["Date"] || row["date"] || new Date().toISOString().split("T")[0]),
        gateSerialNo: String(row["Gate Serial No"] || row["gateSerialNo"] || ""),
        source: String(row["Source"] || row["Vendor"] || row["source"] || ""),
        invoiceNumber: String(row["Invoice Number"] || row["HU Number"] || row["invoiceNumber"] || ""),
        sapDocumentNumber: String(row["SAP Document No"] || row["sapDocumentNo"] || ""),
        lrNumber: String(row["LR Number"] || row["lrNumber"] || ""),
        sealNumber: String(row["Seal Number"] || row["sealNumber"] || ""),
        truckNumber: String(row["Truck Number"] || row["truckNumber"] || ""),
        transporter: String(row["Transporter"] || row["transporter"] || ""),
        category: String(row["Category"] || row["category"] || "RM"),
        stockLocation: String(row["Stock Location"] || row["stockLocation"] || ""),
        materialCode: String(row["Material Code"] || row["materialCode"] || ""),
        description: String(row["Material Description"] || row["description"] || ""),
        huUnit: String(row["HU Unit"] || row["huUnit"] || "Nos"),
        binLocation: String(row["BIN Location"] || row["binLocation"] || ""),
        invoiceQtyInPallet: parseFloat(String(row["Invoice Qty (Pallets)"] || row["invoiceQtyInPallet"] || 0)) || 0,
        invoiceQtyInNos: parseFloat(String(row["Invoice Qty (Nos)"] || row["invoiceQtyInNos"] || 0)) || 0,
        invoiceNetWeight: parseFloat(String(row["Invoice Net Weight (Kg)"] || row["invoiceNetWeight"] || 0)) || 0,
        receivedQtyInPallets: parseFloat(String(row["Received Qty (Pallets)"] || row["receivedQtyInPallets"] || 0)) || 0,
        receivedQtyInNos: parseFloat(String(row["Received Qty (Nos)"] || row["receivedQtyInNos"] || 0)) || 0,
        receivedNetWeight: parseFloat(String(row["Received Net Weight (Kg)"] || row["receivedNetWeight"] || 0)) || 0,
        truckInTime: String(row["Truck In Time"] || row["truckInTime"] || ""),
        unloadStartTime: String(row["Unload Start"] || row["unloadStartTime"] || ""),
        unloadEndTime: String(row["Unload End"] || row["unloadEndTime"] || ""),
        truckOutTime: String(row["Truck Out Time"] || row["truckOutTime"] || ""),
        tat: String(row["TAT"] || row["tat"] || ""),
        remarks: String(row["Remarks"] || row["remarks"] || ""),
        status: "APPROVED",
      }));

      setEntries((prev) => [...prev, ...mapped]);
      setSmartImported(mapped.length);
      setUploadOpen(false);
    } catch (err: unknown) {
      setSmartError(err instanceof Error ? err.message : String(err));
    } finally {
      setSmartUploading(false);
      e.target.value = "";
    }
  }, []);

  // ── Commit to DB
  const handleCommit = async () => {
    const toCommit = entries.filter((e) => e.entryStatus === "APPROVED" || e.entryStatus === "DISCREPANCY");
    if (!toCommit.length) { setSaveError("No approved or discrepancy entries to commit."); return; }
    setIsSaving(true); setSaveError(null);
    try {
      const payload: ManualEntryPayload[] = toCommit.map((e) => ({
        date: e.date, gateSerialNo: e.gateSerialNo, source: e.source,
        invoiceNumber: e.invoiceNumber, sapDocumentNumber: e.sapDocumentNumber,
        lrNumber: e.lrNumber, sealNumber: e.sealNumber, truckNumber: e.truckNumber,
        transporter: e.transporter, category: e.category, stockLocation: e.stockLocation,
        truckInTime: e.truckInTime, unloadStartTime: e.unloadStartTime,
        unloadEndTime: e.unloadEndTime, truckOutTime: e.truckOutTime,
        tat: e.tat, tatRemarks: e.tatRemarks,
        materialCode: e.materialCode, description: e.description,
        huUnit: e.huUnit, actualHuUnit: e.actualHuUnit, actualDescription: e.actualDescription,
        binLocation: e.binLocation,
        invoiceQtyInPallet: e.invoiceQtyInPallet, invoiceQtyInNos: e.invoiceQtyInNos,
        invoiceNetWeight: e.invoiceNetWeight, receivedQtyInPallets: e.receivedQtyInPallets,
        receivedQtyInNos: e.receivedQtyInNos, receivedQtyInKgs: e.receivedQtyInKgs,
        receivedNetWeight: e.receivedNetWeight, netWeight: e.netWeight,
        receivedPalletCount: e.receivedPalletCount, numberOfBoxes: e.numberOfBoxes,
        boxPerKg: e.boxPerKg, shortInPallet: e.shortInPallet, shortExcessInKg: e.shortExcessInKg,
        remarks: e.remarks + (e.discrepancyRemarks ? ` | DISCREPANCY: ${e.discrepancyRemarks}` : ""),
        discrepancyRemarks: e.discrepancyRemarks,
        status: e.entryStatus === "DISCREPANCY" ? "DISCREPANCY" : "APPROVED",
      }));
      await commitInwardEntries(payload);
      setSavedOk(true);
      setEntries([]);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ── Page Header */}
      <div className="flex items-start justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-blue-600" /> Inward Entry
          </h1>
          <p className="text-sm text-gray-500 mt-1">Record goods received at the gate — manually or via Excel upload</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setUploadOpen((o) => !o)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg border transition ${
              uploadOpen ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
            }`}>
            <Upload size={15} /> {uploadOpen ? "Hide Upload" : "Upload Excel"}
          </button>
          <button onClick={() => { setEditingEntry(null); setFormOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition">
            <Plus size={15} /> Add Manually
          </button>
        </div>
      </div>

      {/* ── Upload Panel */}
      {uploadOpen && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-center gap-6 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-3">
            <Upload size={24} className="text-blue-600" />
            <div>
              <div className="font-bold text-gray-900 text-sm">Smart Excel Ingestion</div>
              <div className="text-xs text-gray-500">Upload your JSM Logistics Excel sheet — rows auto-populate the list below</div>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-1">
            <label className="flex items-center gap-2 px-4 py-2 bg-white border border-dashed border-blue-400 text-blue-700 text-sm font-bold rounded-lg cursor-pointer hover:bg-blue-50 transition">
              <FileText size={14} /> Choose File (.xlsx / .xls / .csv)
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={smartUploading} className="hidden" />
            </label>
            {smartUploading && <div className="flex items-center gap-2 text-blue-600 text-sm font-semibold"><RefreshCw size={14} className="animate-spin" /> Processing...</div>}
            {!smartUploading && smartImported > 0 && <div className="flex items-center gap-2 text-green-600 text-sm font-bold"><CheckCircle2 size={14} /> {smartImported} rows imported</div>}
            {smartError && <div className="flex items-center gap-2 text-red-600 text-sm"><AlertCircle size={14} /> {smartError}</div>}
          </div>
        </div>
      )}

      {/* ── Banners */}
      {savedOk && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex-shrink-0">
          <CheckCircle2 size={18} className="text-green-600" />
          <div>
            <div className="font-bold text-green-700 text-sm">Transaction Committed Successfully!</div>
            <div className="text-xs text-gray-500">All approved entries saved to the database and inventory updated.</div>
          </div>
          <button onClick={() => setSavedOk(false)} className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded border border-gray-200 bg-white">Dismiss</button>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm flex-shrink-0">
          <AlertCircle size={16} /> {saveError}
        </div>
      )}

      {/* ── Stats + Controls */}
      <div className="flex gap-3 items-stretch flex-shrink-0 flex-wrap">
        {[
          { label: "Total",       val: entries.length, color: "text-gray-700",  bg: "bg-gray-50",   border: "border-gray-200"  },
          { label: "Pending",     val: pending,        color: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-200" },
          { label: "Approved",    val: approved,       color: "text-green-700", bg: "bg-green-50",  border: "border-green-200" },
          { label: "Discrepancy", val: discrepancy,    color: "text-orange-700",bg: "bg-orange-50", border: "border-orange-200"},
          { label: "Rejected",    val: rejected,       color: "text-red-700",   bg: "bg-red-50",    border: "border-red-200"   },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} ${s.border} border rounded-xl px-4 py-2 text-center min-w-[72px]`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
        <div className="flex-1" />
        {entries.length > 0 && (
          <>
            <button onClick={() => setEntries((prev) => prev.map((e) => e.entryStatus === "PENDING" ? { ...e, entryStatus: "APPROVED" } : e))}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition">
              <CheckSquare size={14} /> Approve All
            </button>
            <button onClick={handleCommit} disabled={isSaving || (approved + discrepancy === 0)}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-bold text-white rounded-lg shadow-md transition ${
                approved + discrepancy > 0
                  ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                  : "bg-gray-300 cursor-not-allowed"
              }`}>
              {isSaving
                ? <><RefreshCw size={14} className="animate-spin" /> Saving...</>
                : <><Database size={14} /> Commit to Database ({approved + discrepancy})</>}
            </button>
          </>
        )}
      </div>

      {/* ── Entries List */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
            <ClipboardList size={52} className="opacity-20" />
            <div className="font-bold text-lg text-gray-500">No entries yet</div>
            <div className="text-sm text-center text-gray-400">
              Click <strong className="text-blue-600">+ Add Manually</strong> to fill in a row, or use{" "}
              <strong className="text-blue-600">Upload Excel</strong> to bulk-import.
            </div>
            <div className="flex gap-3 mt-2">
              <button onClick={() => setFormOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition">
                <Plus size={15} /> Add Manually
              </button>
              <button onClick={() => setUploadOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition">
                <Upload size={15} /> Upload Excel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid items-center gap-3 px-4 py-2 mb-1"
              style={{ gridTemplateColumns: "1.5rem 1.5fr 1.8fr 0.7fr 0.7fr 0.9fr auto" }}>
              {["#", "Material", "Invoice vs Received", "Δ Qty", "Δ Wt", "Status", "Actions"].map((h) => (
                <div key={h} className="text-xs font-bold uppercase tracking-widest text-gray-400">{h}</div>
              ))}
            </div>
            {entries.map((entry, idx) => (
              <EntryRow
                key={entry.id} entry={entry} index={idx}
                onEdit={() => { setEditingEntry(entry); setFormOpen(true); }}
                onDelete={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                onStatusChange={(s) => handleStatusChange(entry.id, s)}
                onUpdateField={(field, val) => handleUpdateField(entry.id, field, val)}
              />
            ))}
          </>
        )}
      </div>

      {/* ── Form Modal */}
      {formOpen && (
        <EntryFormModal
          entry={editingEntry || ({ ...EMPTY_ENTRY, id: "", entryStatus: "PENDING" } as ManualEntry)}
          isEdit={!!editingEntry}
          onSave={handleAddEntry}
          onSaveAndNext={handleSaveAndNext}
          onClose={() => { setFormOpen(false); setEditingEntry(null); }}
        />
      )}
    </div>
  );
}
