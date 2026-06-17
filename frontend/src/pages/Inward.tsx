"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Upload, CheckCircle2, AlertCircle, Database, RefreshCw,
  Trash2, ClipboardList, ChevronDown, ChevronUp,
  CheckSquare, XCircle, TriangleAlert, Save, BookOpen, Zap,
  ArrowRight, FileText, X
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
export interface ManualEntryPayload {
  date: string; gateSerialNo: string; source: string; invoiceNumber: string; sapDocumentNumber: string;
  lrNumber: string; sealNumber: string; truckNumber: string; transporter: string; category: string;
  stockLocation: string; truckInTime: string; unloadStartTime: string; unloadEndTime: string; truckOutTime: string;
  tat: string; tatRemarks: string; materialCode: string; description: string; huUnit: string; actualHuUnit: string;
  actualDescription: string; binLocation: string; invoiceQtyInPallet: number; invoiceQtyInNos: number; invoiceNetWeight: number;
  receivedQtyInPallets: number; receivedQtyInNos: number; receivedQtyInKgs: number; receivedNetWeight: number;
  netWeight: number; receivedPalletCount: number; numberOfBoxes: number; boxPerKg: number; shortInPallet: number;
  shortExcessInKg: number; remarks: string; discrepancyRemarks: string; status: string;
  materialType: string;
}

async function commitInwardEntries(entries: ManualEntryPayload[], createdBy: string) {
  const res = await fetch('http://localhost:5001/api/inward/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries, createdBy })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to commit');
  }
  return res.json();
}

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
  date: (() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; })(),
  gateSerialNo: "", source: "", invoiceNumber: "", sapDocumentNumber: "",
  lrNumber: "", sealNumber: "", truckNumber: "", transporter: "",
  category: "RM", stockLocation: "",
  truckInTime: "", unloadStartTime: "", unloadEndTime: "", truckOutTime: "",
  tat: "", tatRemarks: "",
  materialCode: "", description: "", huUnit: "Nos", materialType: "",
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
// Excel column header → ManualEntry field mapping (exact header names from JSM sheet)
const EXCEL_COL_MAP: { header: string; field: keyof typeof EMPTY_ENTRY | "__short_plt" | "__short_kg" }[] = [
  { header: "Gate Serial No",        field: "gateSerialNo"        },
  { header: "Date",                  field: "date"                },
  { header: "Source",                field: "source"              },
  { header: "Invoice No",            field: "invoiceNumber"       },
  { header: "SAP Doc No",            field: "sapDocumentNumber"   },
  { header: "Materials Code",        field: "materialCode"        },
  { header: "Description",           field: "description"         },
  { header: "Type of material",      field: "materialType"        },
  { header: "Category",              field: "category"            },
  { header: "Stock Location",        field: "stockLocation"       },
  { header: "BIN",                   field: "binLocation"         },
  { header: "Invoice Qty in Pallet", field: "invoiceQtyInPallet"  },
  { header: "Invoice Qty in Nos",    field: "invoiceQtyInNos"     },
  { header: "Received Qty In Pallets",field: "receivedQtyInPallets"},
  { header: "Received Qty In Nos",   field: "receivedQtyInNos"    },
  { header: "No of Boxes",           field: "numberOfBoxes"       },
  { header: "Net Weight in Kg",      field: "netWeight"           },
  { header: "Truck No",              field: "truckNumber"         },
  { header: "Transporter",           field: "transporter"         },
  { header: "LR No",                 field: "lrNumber"            },
  { header: "Short in Pallet",       field: "__short_plt"         },
  { header: "Short / Excess in Kg",  field: "__short_kg"          },
  { header: "Truck In time",         field: "truckInTime"         },
  { header: "Unload Start Time",     field: "unloadStartTime"     },
  { header: "End Time",              field: "unloadEndTime"       },
  { header: "Truck Out Time",        field: "truckOutTime"        },
  { header: "TAT",                   field: "tat"                 },
  { header: "Seal No",               field: "sealNumber"          },
  { header: "Box Per kg",            field: "boxPerKg"            },
  { header: "Remarks",               field: "remarks"             },
  { header: "HU Unit",               field: "huUnit"              },
];

const EXCEL_GUIDE = [
  { col: "Gate Serial No",         field: "Gate Serial No"         },
  { col: "Date",                   field: "Date"                   },
  { col: "Source",                 field: "Source"                 },
  { col: "Invoice No",             field: "Invoice No"             },
  { col: "SAP Doc No",             field: "SAP Doc No"             },
  { col: "Materials Code",         field: "Materials Code"         },
  { col: "Description",            field: "Description"            },
  { col: "Type of material",       field: "Type of material"       },
  { col: "Category",               field: "Category"               },
  { col: "Stock Location",         field: "Stock Location"         },
  { col: "BIN",                    field: "BIN"                    },
  { col: "Invoice Qty in Pallet",  field: "Invoice Qty in Pallet"  },
  { col: "Invoice Qty in Nos",     field: "Invoice Qty in Nos"     },
  { col: "Received Qty In Pallets",field: "Received Qty In Pallets"},
  { col: "Received Qty In Nos",    field: "Received Qty In Nos"    },
  { col: "No of Boxes",            field: "No of Boxes"            },
  { col: "Net Weight in Kg",       field: "Net Weight in Kg"       },
  { col: "Truck No",               field: "Truck No"               },
  { col: "Transporter",            field: "Transporter"            },
  { col: "LR No",                  field: "LR No"                  },
  { col: "Short in Pallet",        field: "Short in Pallet"        },
  { col: "Short / Excess in Kg",   field: "Short / Excess in Kg"   },
  { col: "Truck In time",          field: "Truck In time"          },
  { col: "Unload Start Time",      field: "Unload Start Time"      },
  { col: "End Time",               field: "End Time (Unload End)"  },
  { col: "Truck Out Time",         field: "Truck Out Time"         },
  { col: "TAT",                    field: "TAT"                    },
  { col: "Seal No",                field: "Seal No"                },
  { col: "Box Per kg",             field: "Box Per kg"             },
  { col: "Remarks",                field: "Remarks"                },
  { col: "HU Unit (optional)",     field: "HU Unit"                },
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
// Discrepancy sub-components — defined at MODULE LEVEL (not inside DiscrepancyPanel)
// so React sees the same component type on every render and never unmounts the
// inputs, preserving focus while the user types.
// ─────────────────────────────────────────────────────────────────────────────
const DiscInvoiceInput = ({
  value, onChange, type = "text", placeholder = ""
}: {
  value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full border-2 border-blue-200 rounded px-3 py-2 text-sm font-semibold text-blue-900
               bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400
               focus:bg-white transition"
  />
);

const DiscActualInput = ({
  value, onChange, type = "text", placeholder = ""
}: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full border-2 border-red-200 rounded px-3 py-2 text-sm font-semibold text-gray-900
               bg-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400
               placeholder-red-200 transition"
  />
);

const DiscDiffBadge = ({ val }: { val: number | null }) => {
  if (val === null) return <span className="text-gray-300 text-xs italic">—</span>;
  if (val === 0) return <span className="text-green-600 font-bold text-sm">✓ Match</span>;
  const cls = val > 0 ? "text-blue-600" : "text-red-600";
  return <span className={`font-bold text-sm ${cls}`}>{val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}</span>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Discrepancy Panel
// Invoice (Expected) = editable, pre-filled from entry invoice fields
// Received (Actual)  = blank editable inputs; user types physical count
// ─────────────────────────────────────────────────────────────────────────────
const DiscrepancyPanel = ({ entry, onUpdate, onMarkDiscrepancy }: {
  entry: ManualEntry;
  onUpdate: (field: keyof ManualEntry, val: string | number) => void;
  onMarkDiscrepancy: () => void;
}) => {
  // Invoice Expected — editable, pre-filled from uploaded entry data
  const [invHuUnit,  setInvHuUnit]  = useState(String(entry.huUnit       || ""));
  const [invDesc,    setInvDesc]    = useState(String(entry.description   || ""));
  const [invNos,     setInvNos]     = useState(String(entry.invoiceQtyInNos    || ""));
  const [invPallets, setInvPallets] = useState(String(entry.invoiceQtyInPallet || ""));
  const [invWt,      setInvWt]      = useState(String(entry.invoiceNetWeight   || ""));

  // Received Actual — pre-filled from entry data (upload or manual), user can override
  const [actHuUnit,  setActHuUnit]  = useState(entry.actualHuUnit || entry.huUnit || "");
  const [actDesc,    setActDesc]    = useState(entry.actualDescription || entry.description || "");
  const [actNos,     setActNos]     = useState(entry.receivedQtyInNos     ? String(entry.receivedQtyInNos)     : "");
  const [actPallets, setActPallets] = useState(entry.receivedQtyInPallets ? String(entry.receivedQtyInPallets) : "");
  const [actWt,      setActWt]      = useState(entry.receivedNetWeight     ? String(entry.receivedNetWeight)   : "");
  const [remarks,    setRemarks]    = useState(entry.discrepancyRemarks || "");

  // Live diffs — null when Received field is still blank
  const diff = (actual: string, inv: string) => {
    if (actual === "") return null;
    return (parseFloat(actual) || 0) - (parseFloat(inv) || 0);
  };
  const diffNos     = diff(actNos,     invNos);
  const diffPallets = diff(actPallets, invPallets);
  const diffWt      = diff(actWt,      invWt);
  const huMismatch  = Boolean(actHuUnit && invHuUnit && actHuUnit.trim() !== invHuUnit.trim());

  // ── Auto-detect and mark discrepancy whenever any diff is found ───────────────
  useEffect(() => {
    const anyDiff =
      (diffNos     !== null && diffNos     !== 0) ||
      (diffPallets !== null && diffPallets !== 0) ||
      (diffWt      !== null && diffWt      !== 0) ||
      huMismatch;

    if (anyDiff) {
      onUpdate("entryStatus", "DISCREPANCY");
      if (diffPallets !== null) onUpdate("shortInPallet",   diffPallets);
      if (diffWt      !== null) onUpdate("shortExcessInKg", parseFloat(diffWt.toFixed(2)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actNos, actPallets, actWt, actHuUnit]);

  return (
    <div className="mt-3 bg-amber-50 border-2 border-amber-300 rounded-xl overflow-hidden shadow-sm">
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-3 bg-amber-100 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <TriangleAlert size={15} className="text-amber-600" />
          <span className="text-xs font-black uppercase tracking-widest text-amber-800">Discrepancy Report</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 bg-blue-100 border-2 border-blue-300 rounded-sm" />
            Invoice Expected (editable)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 bg-red-50 border-2 border-red-300 rounded-sm" />
            Received Actual (type count)
          </span>
        </div>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200 w-36">Parameter</th>
              <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border-b border-blue-200">
                📋 Invoice (Expected)
                <div className="text-blue-400 font-normal normal-case tracking-normal mt-0.5 text-xs">Pre-filled · editable if needed</div>
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50 border-b border-red-200">
                📦 Received (Actual)
                <div className="text-red-400 font-normal normal-case tracking-normal mt-0.5 text-xs">Pre-filled from entry · edit if different</div>
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-600 bg-gray-50 border-b border-gray-200 w-32">Δ Difference</th>
            </tr>
          </thead>
          <tbody>
            {/* HU Unit */}
            <tr className="border-t border-amber-100">
              <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">HU Unit</td>
              <td className="px-3 py-2 bg-blue-50/40">
                <DiscInvoiceInput
                  value={invHuUnit}
                  onChange={(v) => { setInvHuUnit(v); onUpdate("huUnit", v); }}
                />
              </td>
              <td className="px-3 py-2 bg-red-50/40">
                <DiscActualInput
                  value={actHuUnit}
                  onChange={(v) => { setActHuUnit(v); onUpdate("actualHuUnit", v); }}
                />
              </td>
              <td className="px-4 py-3">
                {actHuUnit === "" ? (
                  <span className="text-gray-300 text-xs italic">—</span>
                ) : actHuUnit !== invHuUnit ? (
                  <span className="text-amber-600 font-bold text-xs">⚠ CHANGED</span>
                ) : (
                  <span className="text-green-600 font-bold text-xs">✓ Match</span>
                )}
              </td>
            </tr>

            {/* Description */}
            <tr className="border-t border-amber-100">
              <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Description</td>
              <td className="px-3 py-2 bg-blue-50/40">
                <DiscInvoiceInput
                  value={invDesc}
                  onChange={(v) => { setInvDesc(v); onUpdate("description", v); }}
                />
              </td>
              <td className="px-3 py-2 bg-red-50/40">
                <DiscActualInput
                  value={actDesc}
                  onChange={(v) => { setActDesc(v); onUpdate("actualDescription", v); }}
                />
              </td>
              <td className="px-4 py-3">
                {actDesc === "" ? (
                  <span className="text-gray-300 text-xs italic">—</span>
                ) : actDesc !== invDesc ? (
                  <span className="text-amber-600 font-bold text-xs">⚠ CHANGED</span>
                ) : (
                  <span className="text-green-600 font-bold text-xs">✓ Match</span>
                )}
              </td>
            </tr>

            {/* Qty Nos */}
            <tr className="border-t border-amber-100">
              <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Qty (Nos)</td>
              <td className="px-3 py-2 bg-blue-50/40">
                <DiscInvoiceInput
                  type="number"
                  value={invNos}
                  onChange={(v) => { setInvNos(v); onUpdate("invoiceQtyInNos", parseFloat(v) || 0); }}
                />
              </td>
              <td className="px-3 py-2 bg-red-50/40">
                <DiscActualInput
                  type="number"
                  value={actNos}
                  onChange={(v) => { setActNos(v); onUpdate("receivedQtyInNos", parseFloat(v) || 0); }}
                />
              </td>
              <td className={`px-4 py-3 ${diffNos !== null && diffNos < 0 ? "bg-red-50" : diffNos !== null && diffNos > 0 ? "bg-green-50" : ""}`}>
                <DiscDiffBadge val={diffNos} />
              </td>
            </tr>

            {/* Qty Pallets */}
            <tr className="border-t border-amber-100">
              <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Qty (Pallets)</td>
              <td className="px-3 py-2 bg-blue-50/40">
                <DiscInvoiceInput
                  type="number"
                  value={invPallets}
                  onChange={(v) => { setInvPallets(v); onUpdate("invoiceQtyInPallet", parseFloat(v) || 0); }}
                />
              </td>
              <td className="px-3 py-2 bg-red-50/40">
                <DiscActualInput
                  type="number"
                  value={actPallets}
                  onChange={(v) => { setActPallets(v); onUpdate("receivedQtyInPallets", parseFloat(v) || 0); }}
                />
              </td>
              <td className={`px-4 py-3 ${diffPallets !== null && diffPallets < 0 ? "bg-red-50" : diffPallets !== null && diffPallets > 0 ? "bg-green-50" : ""}`}>
                <DiscDiffBadge val={diffPallets} />
              </td>
            </tr>

            {/* Net Weight */}
            <tr className="border-t border-amber-100">
              <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Net Weight (Kg)</td>
              <td className="px-3 py-2 bg-blue-50/40">
                <DiscInvoiceInput
                  type="number"
                  value={invWt}
                  onChange={(v) => { setInvWt(v); onUpdate("invoiceNetWeight", parseFloat(v) || 0); }}
                />
              </td>
              <td className="px-3 py-2 bg-red-50/40">
                <DiscActualInput
                  type="number"
                  value={actWt}
                  onChange={(v) => { setActWt(v); onUpdate("receivedNetWeight", parseFloat(v) || 0); }}
                />
              </td>
              <td className={`px-4 py-3 ${diffWt !== null && diffWt < 0 ? "bg-red-50" : diffWt !== null && diffWt > 0 ? "bg-green-50" : ""}`}>
                <DiscDiffBadge val={diffWt} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Discrepancy Remarks + Mark button */}
      <div className="px-5 py-4 border-t border-amber-200 bg-white">
        <label className="block text-xs font-black uppercase tracking-widest text-amber-700 mb-2">
          📝 Discrepancy Remarks <span className="text-red-500">*</span>
        </label>
        <textarea
          value={remarks}
          onChange={(e) => { setRemarks(e.target.value); onUpdate("discrepancyRemarks", e.target.value); }}
          placeholder="Describe the discrepancy in detail — e.g. 'Received 2900 Nos instead of 2996, 3 pallets damaged, seal broken on arrival. Short by 96 pieces.'"
          rows={3}
          className="w-full border-2 border-amber-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white
                     focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500
                     placeholder-amber-200 resize-vertical transition"
        />
        {/* Auto-detection notice */}
        {((diffNos !== null && diffNos !== 0) || (diffPallets !== null && diffPallets !== 0) || (diffWt !== null && diffWt !== 0) || huMismatch) ? (
          <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-semibold">
            <TriangleAlert size={11} /> Discrepancy auto-detected and marked.{huMismatch ? " HU unit mismatch." : ""} Add remarks for detail.
          </p>
        ) : (diffNos !== null || diffPallets !== null || diffWt !== null) ? (
          <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
            ✓ No differences — quantities and HU unit match invoice.
          </p>
        ) : null}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-amber-200 bg-amber-50/60 flex items-center justify-between gap-3">
        <span className="text-xs text-amber-700">
          {((diffNos !== null && diffNos !== 0) || (diffPallets !== null && diffPallets !== 0) || (diffWt !== null && diffWt !== 0) || huMismatch)
            ? "⚠ Status automatically set to Discrepancy — remarks optional."
            : "No differences detected — status will remain unchanged."}
        </span>
        <button
          onClick={onMarkDiscrepancy}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg transition text-white bg-amber-600 hover:bg-amber-700 shadow-md"
        >
          <TriangleAlert size={14} /> Done
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry Row (list item)
// ─────────────────────────────────────────────────────────────────────────────
const EntryRow = ({
  entry, index, onEdit, onDelete, onStatusChange, onUpdateField, isDupeHU, isViewer
}: {
  entry: ManualEntry; index: number;
  onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: ManualEntry["entryStatus"]) => void;
  onUpdateField: (field: keyof ManualEntry, val: string | number) => void;
  isDupeHU?: boolean;
  isViewer?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const diffNos     = (entry.receivedQtyInNos      || 0) - (entry.invoiceQtyInNos    || 0);
  const diffPallets = (entry.receivedQtyInPallets   || 0) - (entry.invoiceQtyInPallet || 0);
  const diffWt      = (entry.receivedNetWeight      || 0) - (entry.invoiceNetWeight   || 0);

  // Flag as discrepancy if: explicit short/excess, status set, or any qty/HU diff
  const hasDiscrepancy =
    (entry.shortInPallet   || 0) !== 0 ||
    (entry.shortExcessInKg || 0) !== 0 ||
    entry.entryStatus === "DISCREPANCY" ||
    ((entry.receivedQtyInPallets || 0) > 0 && diffPallets !== 0) ||
    ((entry.receivedQtyInNos     || 0) > 0 && diffNos     !== 0) ||
    ((entry.receivedNetWeight    || 0) > 0 && diffWt      !== 0) ||
    Boolean(entry.actualHuUnit && entry.huUnit && entry.actualHuUnit.trim() !== entry.huUnit.trim());

  const statusConfig = {
    PENDING:     { bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-300",  label: "Pending" },
    APPROVED:    { bg: "bg-green-100",  text: "text-green-700",  border: "border-green-300",  label: "Approved" },
    DISCREPANCY: { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-300",    label: "Discrepancy" },
    REJECTED:    { bg: "bg-gray-100",   text: "text-gray-600",   border: "border-gray-300",   label: "Rejected" },
  };
  const cfg = statusConfig[entry.entryStatus];

  // Row background / border driven by discrepancy state
  const rowClass = hasDiscrepancy
    ? "bg-red-50 border-red-400 shadow-red-100"
    : isDupeHU
      ? "bg-orange-50 border-orange-300"
      : "bg-white border-gray-200";

  return (
    <div className={`border-2 rounded-xl mb-2 shadow-sm hover:shadow-md transition-shadow overflow-hidden ${rowClass}`}>

      {/* Red discrepancy stripe across the top */}
      {hasDiscrepancy && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500 text-white flex-wrap">
          <TriangleAlert size={12} className="flex-shrink-0" />
          <span className="text-xs font-black uppercase tracking-widest">Discrepancy Detected</span>
          {diffPallets !== 0 && (entry.receivedQtyInPallets || 0) > 0 && (
            <span className="ml-1 bg-white/20 px-2 py-0.5 rounded text-xs font-bold">
              Pallets: {diffPallets > 0 ? "+" : ""}{diffPallets}
            </span>
          )}
          {diffNos !== 0 && (entry.receivedQtyInNos || 0) > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold">
              Nos: {diffNos > 0 ? "+" : ""}{diffNos}
            </span>
          )}
          {diffWt !== 0 && (entry.receivedNetWeight || 0) > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold">
              Kg: {diffWt > 0 ? "+" : ""}{Number(diffWt).toFixed(2)}
            </span>
          )}
          {Boolean(entry.actualHuUnit && entry.huUnit && entry.actualHuUnit.trim() !== entry.huUnit.trim()) && (
            <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold">
              HU: {entry.huUnit} → {entry.actualHuUnit}
            </span>
          )}
        </div>
      )}

      <div
        className="grid items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50/60 transition-colors"
        style={{ gridTemplateColumns: "1.5rem 1.5fr 1.8fr 0.7fr 0.7fr 0.9fr auto" }}
        onClick={onEdit}
      >
        {/* Index */}
        <div className="text-xs font-bold text-gray-400">{index + 1}</div>

        {/* Material */}
        <div>
          <div className="font-semibold text-gray-900 text-sm truncate">{entry.description || entry.materialCode || "—"}</div>
          <div className="text-xs text-gray-400">{entry.materialCode} · {entry.category}</div>
        </div>

        {/* Invoice vs Received — highlight mismatched values */}
        <div className="text-xs space-y-0.5">
          <div className="text-gray-500">
            Invoice:{" "}
            <span className={`font-semibold ${diffPallets !== 0 ? "text-red-600 underline decoration-dotted" : "text-blue-600"}`}>
              {entry.invoiceQtyInPallet || "—"} pallets
            </span>{" "}·{" "}
            <span className={`font-semibold ${diffWt !== 0 ? "text-red-600 underline decoration-dotted" : "text-gray-600"}`}>
              {entry.invoiceNetWeight || "—"} kg
            </span>
          </div>
          <div className="text-gray-500">
            Received:{" "}
            <span className={`font-semibold ${diffPallets !== 0 ? "text-red-600" : "text-green-600"}`}>
              {entry.receivedQtyInPallets || "—"} pallets
            </span>{" "}·{" "}
            <span className={`font-semibold ${diffWt !== 0 ? "text-red-600" : "text-gray-600"}`}>
              {entry.receivedNetWeight || "—"} kg
            </span>
          </div>
        </div>

        {/* Δ Qty */}
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-0.5">Δ Qty</div>
          <div className={`font-bold text-sm ${diffNos === 0 ? "text-gray-400" : diffNos > 0 ? "text-green-600" : "text-red-600"}`}>
            {diffNos !== 0 ? (diffNos > 0 ? `+${diffNos}` : diffNos) : "—"}
          </div>
        </div>

        {/* Δ Wt */}
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-0.5">Δ Wt (kg)</div>
          <div className={`font-bold text-sm ${diffWt === 0 ? "text-gray-400" : diffWt > 0 ? "text-green-600" : "text-red-600"}`}>
            {diffWt !== 0 ? (diffWt > 0 ? `+${diffWt.toFixed(2)}` : diffWt.toFixed(2)) : "—"}
          </div>
        </div>

        {/* Status badge */}
        <div className="flex flex-col gap-1 items-start">
          {isDupeHU && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-300 whitespace-nowrap">
              ⚠ Duplicate HU
            </span>
          )}
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 items-center" onClick={e => e.stopPropagation()}>
          {!isViewer && entry.entryStatus === "PENDING" && (
            <>
              <button onClick={() => onStatusChange("APPROVED")} title="Approve"
                className="flex items-center gap-1 text-xs font-bold bg-green-100 hover:bg-green-200 text-green-700 border border-green-300 rounded-md px-2 py-1 transition">
                <CheckCircle2 size={11} /> OK
              </button>
              {/* Disc. button: prominent red when discrepancy auto-detected */}
              <button
                onClick={() => { onStatusChange("DISCREPANCY"); setExpanded(true); }}
                title="Mark Discrepancy"
                className={`flex items-center gap-1 text-xs font-bold border rounded-md px-2 py-1 transition
                  ${hasDiscrepancy
                    ? "bg-red-500 hover:bg-red-600 text-white border-red-600 shadow-sm"
                    : "bg-amber-100 hover:bg-amber-200 text-amber-700 border-amber-300"}`}>
                <TriangleAlert size={11} /> Disc.
              </button>
              <button onClick={() => onStatusChange("REJECTED")} title="Reject"
                className="flex items-center gap-1 text-xs font-bold bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 rounded-md px-2 py-1 transition">
                <XCircle size={11} />
              </button>
            </>
          )}
          {!isViewer && entry.entryStatus !== "PENDING" && (
            <button onClick={() => onStatusChange("PENDING")}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 border border-gray-200 rounded-md px-2 py-1 transition">
              Reset
            </button>
          )}
          {(entry.entryStatus === "DISCREPANCY" || (hasDiscrepancy && entry.entryStatus === "PENDING")) && (
            <button onClick={() => setExpanded((e) => !e)}
              className={`p-1 border rounded-md transition ${
                hasDiscrepancy
                  ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                  : "bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200"
              }`}>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
          {!isViewer && (
            <button onClick={onDelete} title="Delete"
              className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-500 rounded-md transition">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {entry.entryStatus === "DISCREPANCY" && expanded && (
        <div className="px-4 pb-4 border-t border-amber-100">
          <DiscrepancyPanel
            entry={entry}
            onUpdate={onUpdateField}
            onMarkDiscrepancy={() => setExpanded(false)}
          />
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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-6">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-blue-50 rounded-t-2xl">
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

        <div className="px-8 py-6 space-y-5">

          {/* ── Row 1: Gate Entry */}
          <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
            <SectionHeader icon={<FileText size={15} />} title="Gate Entry" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Field label="Gate Serial No"  value={form.gateSerialNo}       onChange={set("gateSerialNo")}       placeholder="e.g. 253" />
              <Field label="Date"            type="text" value={form.date}   onChange={set("date")}  placeholder="e.g. 12-06-2026"  required />
              <Field label="Source"          value={form.source}             onChange={set("source")}             placeholder="e.g. TVT" />
              <Field label="Invoice No"      value={form.invoiceNumber}      onChange={set("invoiceNumber")}      placeholder="H33A126..." required />
              <Field label="SAP Doc No"      value={form.sapDocumentNumber}  onChange={set("sapDocumentNumber")}  placeholder="4905927..." />
            </div>
          </div>

          {/* ── Row 2: Transport + Storage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-indigo-50/40 rounded-xl p-5 border border-indigo-100">
              <SectionHeader icon={<FileText size={15} />} title="Transport" color="indigo" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Truck No"    value={form.truckNumber}  onChange={set("truckNumber")}  placeholder="TN04AV4246" />
                <Field label="Transporter" value={form.transporter}  onChange={set("transporter")}  placeholder="e.g. PROWAY" />
                <Field label="LR No"       value={form.lrNumber}     onChange={set("lrNumber")}     placeholder="LR No." />
                <Field label="Seal No"     value={form.sealNumber}   onChange={set("sealNumber")}   placeholder="e.g. RM0536" />
              </div>
            </div>
            <div className="bg-teal-50/40 rounded-xl p-5 border border-teal-100">
              <SectionHeader icon={<FileText size={15} />} title="Storage" color="green" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Stock Location" value={form.stockLocation} onChange={set("stockLocation")} placeholder="e.g. CM35" />
                <Field label="BIN"            value={form.binLocation}   onChange={set("binLocation")}   placeholder="e.g. J2-03" />
                <Field label="HU Unit"        value={form.huUnit}        onChange={set("huUnit")}        placeholder="e.g. J2-03 / Nos" />
                <SelectField label="Category" value={form.category}      onChange={set("category")}
                  options={[{ value: "RM", label: "RM – Raw Material" }, { value: "FG", label: "FG – Finished Goods" }]} />
              </div>
            </div>
          </div>

          {/* ── Row 3: Material */}
          <div className="bg-green-50/40 rounded-xl p-5 border border-green-100">
            <SectionHeader icon={<FileText size={15} />} title="Material" color="green" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Materials Code"    value={form.materialCode}  onChange={set("materialCode")}  placeholder="316-02500..." required />
              <Field label="Type of material"  value={form.materialType}  onChange={set("materialType")}  placeholder="e.g. Board, Film, Reel" required />
              <div className="md:col-span-2">
                <Field label="Description" value={form.description} onChange={set("description")} placeholder="e.g. PSPD CYBER XL 250 GSM 860 X 670 MM GLW" />
              </div>
            </div>
          </div>

          {/* ── Row 4: Quantities (Invoice | Received) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Invoice */}
            <div className="bg-blue-50/40 rounded-xl p-5 border border-blue-100">
              <SectionHeader icon={<FileText size={15} />} title="Invoice Quantities (Expected)" color="blue" />
              <div className="grid grid-cols-3 gap-4">
                <Field label="Invoice Qty in Pallet" type="number" value={form.invoiceQtyInPallet || ""}
                  onChange={(v) => set("invoiceQtyInPallet")(parseFloat(v) || 0)} placeholder="0" />
                <Field label="Invoice Qty in Nos"    type="number" value={form.invoiceQtyInNos || ""}
                  onChange={(v) => set("invoiceQtyInNos")(parseFloat(v) || 0)} placeholder="0" />
                <Field label="Net Weight in Kg"      type="number" step="0.01" value={form.invoiceNetWeight || ""}
                  onChange={(v) => { const n = parseFloat(v)||0; set("invoiceNetWeight")(n); set("netWeight")(n); }} placeholder="0.00" />
              </div>
            </div>

            {/* Received */}
            <div className="bg-emerald-50/40 rounded-xl p-5 border border-emerald-100">
              <SectionHeader icon={<FileText size={15} />} title="Received Quantities (Actual)" color="green" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Received Qty In Pallets" type="number" value={form.receivedQtyInPallets || ""}
                  onChange={(v) => set("receivedQtyInPallets")(parseFloat(v) || 0)} />
                <Field label="Received Qty In Nos"     type="number" value={form.receivedQtyInNos || ""}
                  onChange={(v) => set("receivedQtyInNos")(parseFloat(v) || 0)} />
                <Field label="No of Boxes"             type="number" value={form.numberOfBoxes || ""}
                  onChange={(v) => set("numberOfBoxes")(parseFloat(v) || 0)} />
                <Field label="Box Per kg"              type="number" step="0.01" value={form.boxPerKg || ""}
                  onChange={(v) => set("boxPerKg")(parseFloat(v) || 0)} />
              </div>
            </div>
          </div>

          {/* ── Row 5: Short / Excess (auto) */}
          <div className="bg-amber-50/40 rounded-xl p-5 border border-amber-100">
            <SectionHeader icon={<FileText size={15} />} title="Short / Discrepancy (auto-calculated)" color="amber" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Short in Pallet"      type="number" step="0.01" value={form.shortInPallet || ""}
                onChange={(v) => set("shortInPallet")(parseFloat(v) || 0)} readOnly />
              <Field label="Short / Excess in Kg" type="number" step="0.01" value={form.shortExcessInKg || ""}
                onChange={(v) => set("shortExcessInKg")(parseFloat(v) || 0)} readOnly />
            </div>
          </div>

          {/* ── Row 6: Timing */}
          <div className="bg-purple-50/40 rounded-xl p-5 border border-purple-100">
            <SectionHeader icon={<FileText size={15} />} title="Timing" color="purple" />
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Field label="Truck In time"    type="time" value={form.truckInTime}     onChange={set("truckInTime")}     />
              <Field label="Unload Start Time" type="time" value={form.unloadStartTime} onChange={set("unloadStartTime")} />
              <Field label="End Time"         type="time" value={form.unloadEndTime}   onChange={set("unloadEndTime")}   />
              <Field label="Truck Out Time"   type="time" value={form.truckOutTime}    onChange={set("truckOutTime")}    />
              <Field label="TAT (auto)"       value={form.tat}                         onChange={set("tat")}              readOnly placeholder="e.g. 2h 00m" />
            </div>
            <div className="mt-4">
              <Field label="TAT Remarks" value={form.tatRemarks} onChange={set("tatRemarks")} placeholder="Any delay reasons..." />
            </div>
          </div>

          {/* ── Row 7: Remarks */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Remarks</label>
            <textarea value={form.remarks} onChange={(e) => set("remarks")(e.target.value)}
              placeholder="Any additional remarks..." rows={2}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
            />
          </div>

          {/* Auto-calc note */}
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-lg px-4 py-2.5">
            <Zap size={12} className="text-green-600 flex-shrink-0" />
            <span className="text-xs text-green-700"><strong>Auto-calculated:</strong> TAT from Truck In/Out times · Short in Pallet = Received Pallets − Invoice Pallets · Short/Excess in Kg = Received Wt − Invoice Wt</span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition">
              Cancel
            </button>
            {!isEdit && onSaveAndNext && (
              <button onClick={() => onSaveAndNext({ ...form })}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-green-700 bg-green-100 hover:bg-green-200 border border-green-300 rounded-lg transition">
                <Plus size={14} /> Save & Add Another
              </button>
            )}
            <button onClick={() => onSave({ ...form })}
              className="flex items-center gap-2 px-7 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition">
              <Save size={14} /> {isEdit ? "Save Changes" : "Add Entry"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Clear any stale localStorage work order data from previous sessions
try { localStorage.removeItem('jsm_wo_entries'); localStorage.removeItem('jsm_wo_meta'); } catch {}

// Returns true if the HU unit is a specific physical identifier (not a generic unit of measure).
// Defined at module level so it's available before the component renders.
const isSpecificHU = (hu: string | undefined | null): boolean => {
  if (!hu) return false;
  const v = hu.trim().toLowerCase();
  return v !== "" && v !== "nos" && v !== "pallet" && v !== "pallets" && v !== "box" && v !== "boxes" && v !== "kg" && v !== "kgs";
};

// Returns true if the entry has any detectable discrepancy (qty diff or explicit short/excess)
const hasEntryDiscrepancy = (e: ManualEntry): boolean =>
  (e.shortInPallet   || 0) !== 0 ||
  (e.shortExcessInKg || 0) !== 0 ||
  ((e.receivedQtyInPallets || 0) > 0 && e.receivedQtyInPallets !== e.invoiceQtyInPallet) ||
  ((e.receivedQtyInNos     || 0) > 0 && e.receivedQtyInNos     !== e.invoiceQtyInNos) ||
  ((e.receivedNetWeight    || 0) > 0 && Math.abs((e.receivedNetWeight || 0) - (e.invoiceNetWeight || 0)) > 0.01);

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component  (no localStorage, no work order — pure in-memory state)
// ─────────────────────────────────────────────────────────────────────────────
export default function InwardClient() {
  const user = useAuthStore(s => s.user);
  const isViewer = user?.role === 'CUSTOMER';
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ManualEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [createdBy, setCreatedBy] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [smartUploading, setSmartUploading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartImported, setSmartImported] = useState(0);
  const [dupeError, setDupeError] = useState<string | null>(null);

  // ── Duplicate HU detection — computed from current entries, updates automatically
  const duplicateHUs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (isSpecificHU(e.huUnit)) counts.set(e.huUnit!, (counts.get(e.huUnit!) || 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([hu]) => hu));
  }, [entries]);

  // ── Counts
  const pending     = entries.filter((e) => e.entryStatus === "PENDING").length;
  const approved    = entries.filter((e) => e.entryStatus === "APPROVED").length;
  const discrepancy = entries.filter((e) => e.entryStatus === "DISCREPANCY").length;
  const rejected    = entries.filter((e) => e.entryStatus === "REJECTED").length;

  const handleAddEntry = (entry: ManualEntry) => {
    setDupeError(null);
    // Warn (but allow) if HU unit is shared — rows will be highlighted in the table
    if (isSpecificHU(entry.huUnit)) {
      const conflict = entries.find(
        (e) => e.id !== entry.id && isSpecificHU(e.huUnit) && e.huUnit.trim() === entry.huUnit.trim()
      );
      if (conflict) {
        setDupeError(`⚠ HU Unit "${entry.huUnit}" is shared with material ${conflict.materialCode || conflict.description}. Both rows are flagged for discrepancy review.`);
      }
    }
    if (editingEntry) {
      setEntries((prev) => prev.map((e) => e.id === entry.id ? entry : e));
    } else {
      const autoStatus: ManualEntry["entryStatus"] = hasEntryDiscrepancy(entry) ? "DISCREPANCY" : "PENDING";
      setEntries((prev) => [...prev, { ...entry, id: `entry-${Date.now()}`, entryStatus: autoStatus }]);
    }
    setFormOpen(false);
    setEditingEntry(null);
  };

  const handleSaveAndNext = (entry: ManualEntry) => {
    setDupeError(null);
    const autoStatus: ManualEntry["entryStatus"] = hasEntryDiscrepancy(entry) ? "DISCREPANCY" : "PENDING";
    setEntries((prev) => [...prev, { ...entry, id: `entry-${Date.now()}`, entryStatus: autoStatus }]);
    setEditingEntry(null);
    setFormOpen(false);
    setTimeout(() => {
      setEditingEntry({
        ...(entry as ManualEntry),
        id: "",
        entryStatus: "PENDING",
        // Clear line-item specific fields but keep header fields (truck, source, etc.)
        materialCode: "", description: "", materialType: "", huUnit: "Nos", binLocation: "",
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

  const handleClearAll = () => {
    if (entries.length === 0) return;
    if (!window.confirm(`Clear all ${entries.length} entries and start fresh?`)) return;
    setEntries([]);
    setSmartImported(0);
    setSmartError(null);
    setSaveError(null);
    setSavedOk(false);
  };

  // ── Excel Upload (client-side)
  // Reads by column INDEX to handle the template's duplicate "Received Qty In Pallets"
  // header (cols 13=pallets, 14=Nos — mislabeled in the JSM template).
  //
  // JSM Inward Excel column layout (1-based):
  //  1  Gate Serial No       11  BIN                     21  Short in Pallet
  //  2  Date                 12  Invoice Qty in Pallet    22  Short / Excess in Kg
  //  3  Source               13  Invoice Qty in Nos       23  Truck In time
  //  4  Invoice No           14  Received Qty In Pallets  24  Unload Start Time
  //  5  SAP Doc No           15  Received Qty In Nos      25  End Time (Unload End)
  //  6  Materials Code       16  No of Boxes              26  Truck Out Time
  //  7  Description          17  Net Weight in Kg         27  TAT
  //  8  Type of material     18  Truck No                 28  Seal No
  //  9  Category             19  Transporter              29  Box Per kg
  // 10  Stock Location       20  LR No                    30  Remarks
  //
  // Optional: add a column with header "HU Unit" anywhere in the sheet.
  // It will be auto-detected by header name. If absent, BIN (col 11) is used as the HU identifier.
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSmartUploading(true); setSmartError(null); setSmartImported(0);
    try {
      // Send file to backend for Excel parsing (avoids timezone/date issues in frontend JS)
      const arrayBuf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      const parseRes = await fetch('http://localhost:5001/api/inward/parse-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
      });
      if (!parseRes.ok) {
        const err = await parseRes.json();
        throw new Error(err.error || 'Failed to parse Excel on backend');
      }
      const { rows: parsedRows } = await parseRes.json();
      if (!parsedRows || !parsedRows.length) throw new Error("No data rows found in the file.");

      // Helpers that work on the backend-parsed objects (dates/times already converted to strings)
      const toStr = (v: any): string =>
        (v !== null && v !== undefined && v !== "") ? String(v).trim() : "";

      const toNum = (v: any): number =>
        parseFloat(String(v ?? "").replace(/,/g, "")) || 0;

      // Dates are already "DD-MM-YYYY" strings from backend, pass through
      const toDate = (v: any): string => (v !== null && v !== undefined && v !== "") ? String(v).trim() : "";

      // Times are already "HH:MM" strings from backend, pass through
      const toTime = (v: any): string => (v !== null && v !== undefined && v !== "") ? String(v).trim() : "";

      const mapped: ManualEntry[] = parsedRows.map((row: any, i: number) => {
        // Case-insensitive column lookup on backend-returned objects
        const rowLower: Record<string, any> = {};
        Object.keys(row).forEach(k => { rowLower[k.toLowerCase().trim().replace(/\s+/g,' ')] = row[k]; });
        const col = (name: string): any => rowLower[name.toLowerCase().trim().replace(/\s+/g,' ')];

        const invPallets  = toNum(col("Invoice Qty in Pallet"));
        const invNos      = toNum(col("Invoice Qty in Nos"));
        const rcvPallets  = toNum(col("Received Qty In Pallets"));
        const rcvNos      = toNum(col("Received Qty In Nos"));
        const netWt       = toNum(col("Net Weight in Kg"));

        // Short/Excess: fall back to computing from invoice vs received quantities
        const rawShortPlt = col("Short in Pallet");
        const rawShortKg  = col("Short / Excess in Kg");
        const shortInPallet   = typeof rawShortPlt === "number" ? rawShortPlt
                              : String(rawShortPlt ?? "").startsWith("=") ? (invPallets - rcvPallets)
                              : toNum(rawShortPlt);
        const shortExcessInKg = typeof rawShortKg  === "number" ? rawShortKg
                              : String(rawShortKg  ?? "").startsWith("=") ? (invNos - rcvNos)
                              : toNum(rawShortKg);

        const binVal    = toStr(col("BIN"));
        const huUnitVal = toStr(col("HU Unit")) || binVal || "Nos";

        const uploadedDiscrepant =
          (shortInPallet    || 0) !== 0 ||
          (shortExcessInKg  || 0) !== 0 ||
          ((rcvPallets || 0) > 0 && rcvPallets !== invPallets) ||
          ((rcvNos     || 0) > 0 && rcvNos     !== invNos);

        return {
          ...EMPTY_ENTRY,
          id: `xl-${Date.now()}-${i}`,
          entryStatus: (uploadedDiscrepant ? "DISCREPANCY" : "PENDING") as "PENDING" | "DISCREPANCY",
          status: "APPROVED",
          gateSerialNo:         toStr(col("Gate Serial No")),
          date:                 toDate(col("Date")),
          source:               toStr(col("Source")),
          invoiceNumber:        toStr(col("Invoice No")),
          sapDocumentNumber:    toStr(col("SAP Doc No")),
          materialCode:         toStr(col("Materials Code")),
          description:          toStr(col("Description")),
          materialType:         toStr(col("Type of material")),
          category:             toStr(col("Category")).trim() || "RM",
          stockLocation:        toStr(col("Stock Location")),
          binLocation:          binVal,
          invoiceQtyInPallet:   invPallets,
          invoiceQtyInNos:      invNos,
          receivedQtyInPallets: rcvPallets,
          receivedQtyInNos:     rcvNos,
          numberOfBoxes:        toNum(col("No of Boxes")),
          invoiceNetWeight:     netWt,
          receivedNetWeight:    netWt,
          receivedQtyInKgs:     netWt,
          netWeight:            netWt,
          truckNumber:          toStr(col("Truck No")),
          transporter:          toStr(col("Transporter")),
          lrNumber:             toStr(col("LR No")),
          shortInPallet,
          shortExcessInKg,
          truckInTime:          toTime(col("Truck In time")),
          unloadStartTime:      toTime(col("Unload Start Time")),
          unloadEndTime:        toTime(col("End Time")),
          truckOutTime:         toTime(col("Truck Out Time")),
          tat:                  toTime(col("TAT")),
          sealNumber:           toStr(col("Seal No")),
          boxPerKg:             toNum(col("Box Per kg")),
          remarks:              toStr(col("Remarks")),
          tatRemarks:           "",
          receivedPalletCount:  rcvPallets,
          huUnit:               huUnitVal,
          actualHuUnit:         "",
          actualDescription:    "",
          discrepancyRemarks:   "",
        };
      });

      // Detect rows with actual numerical discrepancies (shortInPallet or shortExcessInKg ≠ 0)
      const discrepantRows = mapped.filter(e => e.shortInPallet !== 0 || e.shortExcessInKg !== 0);
      // Detect shared HU units (for visual flagging in the table)
      const huCounts = new Map<string, number>();
      for (const entry of mapped) {
        if (isSpecificHU(entry.huUnit)) huCounts.set(entry.huUnit, (huCounts.get(entry.huUnit) || 0) + 1);
      }
      const sharedHUs = [...huCounts.entries()].filter(([, c]) => c > 1).map(([hu]) => hu);
      // Only show a notification when there are REAL discrepancies, not just shared HU units
      if (discrepantRows.length > 0) {
        setSmartError(`⚠ ${discrepantRows.length} row(s) have quantity discrepancies — review and mark discrepancy before committing.`);
      } else if (sharedHUs.length > 0) {
        setSmartError(`⚠ ${sharedHUs.length} HU unit(s) shared across multiple rows — highlighted for review.`);
      }

      // Accept all rows — duplicates are flagged visually, not skipped
      setEntries(mapped);
      setSmartImported(mapped.length);
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

    // Block commit if any entry being committed has a duplicate HU unit
    const dupeInCommit = toCommit.filter((e) => isSpecificHU(e.huUnit) && duplicateHUs.has(e.huUnit));
    if (dupeInCommit.length > 0) {
      const dupeList = [...new Set(dupeInCommit.map((e) => e.huUnit))].join(", ");
      setSaveError(`Duplicate HU Unit detected: ${dupeList}. Resolve duplicate HU units before committing — these entries cannot be added to inventory.`);
      return;
    }

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
        materialType: e.materialType,
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
      await commitInwardEntries(payload, createdBy);
      setSavedOk(true);
      setEntries([]);
      setSmartError(null);
      setDupeError(null);
      setSmartImported(0);
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
        <div className="flex gap-2 items-center">
          {isViewer && (
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: '6px', padding: '4px 10px' }}>
              👁 View Only
            </span>
          )}
          {!isViewer && entries.length > 0 && (
            <button onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition">
              <Trash2 size={14} /> Clear All
            </button>
          )}
          {!isViewer && (
            <button onClick={() => setUploadOpen((o) => !o)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg border transition ${
                uploadOpen ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}>
              <Upload size={15} /> {uploadOpen ? "Hide Upload" : "Upload Excel"}
            </button>
          )}
          {!isViewer && (
            <button onClick={() => { setEditingEntry(null); setFormOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition">
              <Plus size={15} /> Add Manually
            </button>
          )}
        </div>
      </div>

      {/* ── Upload Panel */}
      {uploadOpen && (
        <div className={`border rounded-xl px-5 py-4 flex items-center gap-6 flex-shrink-0 flex-wrap transition ${smartImported > 0 ? 'bg-green-50 border-green-300' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-3">
            <Upload size={24} className={smartImported > 0 ? 'text-green-600' : 'text-blue-600'} />
            <div>
              <div className="font-bold text-gray-900 text-sm">Smart Excel Ingestion</div>
              <div className="text-xs text-gray-500">Upload your JSM Logistics Excel sheet — rows appear in the list below</div>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-1 flex-wrap">
            <label className="flex items-center gap-2 px-4 py-2 bg-white border border-dashed border-blue-400 text-blue-700 text-sm font-bold rounded-lg cursor-pointer hover:bg-blue-50 transition">
              <FileText size={14} /> {smartImported > 0 ? 'Upload Another File' : 'Choose File (.xlsx / .xls / .csv)'}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} disabled={smartUploading} className="hidden" />
            </label>
            {smartUploading && <div className="flex items-center gap-2 text-blue-600 text-sm font-semibold"><RefreshCw size={14} className="animate-spin" /> Processing...</div>}
            {!smartUploading && smartImported > 0 && (
              <div className="flex items-center gap-2 text-green-700 text-sm font-bold bg-green-100 border border-green-300 rounded-lg px-3 py-1.5">
                <CheckCircle2 size={14} /> {smartImported} rows processed — scroll down to review ↓
              </div>
            )}
            {smartError && <div className="flex items-center gap-2 text-red-600 text-sm"><AlertCircle size={14} /> {smartError}</div>}
          </div>
          <button onClick={() => { setUploadOpen(false); setSmartImported(0); setSmartError(null); }}
            className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition flex-shrink-0" title="Close upload panel">
            <X size={14} />
          </button>
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
      {dupeError && (
        <div className="flex items-center gap-2 bg-orange-50 border-2 border-orange-300 rounded-xl px-4 py-3 text-orange-800 text-sm flex-shrink-0">
          <TriangleAlert size={16} className="flex-shrink-0" />
          <span><strong>Duplicate Entry Blocked:</strong> {dupeError}</span>
          <button onClick={() => setDupeError(null)} className="ml-auto text-orange-400 hover:text-orange-600"><XCircle size={16} /></button>
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
        {!isViewer && entries.length > 0 && (
          <>
            <button onClick={() => setEntries((prev) => prev.map((e) => {
                if (e.entryStatus !== "PENDING") return e;
                // If the entry has any discrepancy signal, keep it (or promote to) DISCREPANCY — never auto-approve it
                if (hasEntryDiscrepancy(e)) return { ...e, entryStatus: "DISCREPANCY" };
                return { ...e, entryStatus: "APPROVED" };
              }))}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition">
              <CheckSquare size={14} /> Approve All
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>Created By</label>
              <input
                value={createdBy}
                onChange={e => setCreatedBy(e.target.value)}
                placeholder="Your name"
                style={{ border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", color: "#0f172a", outline: "none", width: "150px", background: "#fff" }}
              />
            </div>
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
            <div className="font-bold text-lg text-gray-500">{isViewer ? "No inward entries to display" : "No entries yet"}</div>
            {!isViewer && (
              <>
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
              </>
            )}
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
                isDupeHU={isSpecificHU(entry.huUnit) && duplicateHuUnits.has(entry.huUnit)}
                onEdit={() => setEditingEntry(entry)}
                onDelete={() => setEntries(prev => prev.filter(e => e.id !== entry.id))}
                onStatusChange={(s) => handleStatusChange(entry.id, s)}
                onUpdateField={(f, v) => handleUpdateField(entry.id, f, v)}
                isViewer={isViewer}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
