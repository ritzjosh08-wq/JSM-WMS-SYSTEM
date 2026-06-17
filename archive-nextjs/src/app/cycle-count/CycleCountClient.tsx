"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  ClipboardList, Download, FileText, Calculator,
  TrendingUp, TrendingDown, Package, ArrowDown, ArrowUp, AlertCircle
} from "lucide-react";

interface CycleRow {
  materialCode: string;
  description: string;
  category: string;
  existingQty: number;
  inwardQty: number;
  outwardQty: number;
  computedQty: number;
  warehouse: string;
  huUnit: string;
}

interface Stats {
  totalMaterials: number;
  totalInward: number;
  totalOutward: number;
  totalExisting: number;
  totalComputed: number;
}

export default function CycleCountClient({
  rows, stats, generatedAt
}: {
  rows: CycleRow[];
  stats: Stats;
  generatedAt: string;
}) {
  const [filterCat, setFilterCat] = useState<"ALL" | "RM" | "FG">("ALL");
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) => {
    const catMatch = filterCat === "ALL" || r.category.toUpperCase().includes(filterCat);
    const searchMatch =
      !search ||
      r.materialCode.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  // ── Export to Excel
  const exportExcel = () => {
    const data = filtered.map((r) => ({
      "Material Code": r.materialCode,
      "Description": r.description,
      "Category": r.category,
      "Warehouse": r.warehouse,
      "HU Unit": r.huUnit,
      "Existing Stock": r.existingQty,
      "Inward (Last 30d)": r.inwardQty,
      "Outward (Last 30d)": r.outwardQty,
      "Computed Balance": r.computedQty,
      "Generated At": new Date(generatedAt).toLocaleString(),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cycle Count");
    XLSX.writeFile(wb, `CycleCount_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // ── Export to PDF (simple print)
  const exportPDF = () => {
    window.print();
  };

  const statCards = [
    {
      label: "Materials Tracked",
      val: stats.totalMaterials,
      icon: <Package size={20} />,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
    {
      label: "Existing Stock",
      val: stats.totalExisting.toFixed(0),
      icon: <ClipboardList size={20} />,
      color: "text-gray-700",
      bg: "bg-gray-50",
      border: "border-gray-200",
    },
    {
      label: "Inward (Last 30d)",
      val: stats.totalInward.toFixed(0),
      icon: <ArrowDown size={20} />,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
    },
    {
      label: "Outward (Last 30d)",
      val: stats.totalOutward.toFixed(0),
      icon: <ArrowUp size={20} />,
      color: "text-orange-600",
      bg: "bg-orange-50",
      border: "border-orange-200",
    },
    {
      label: "Computed Balance",
      val: stats.totalComputed.toFixed(0),
      icon: <Calculator size={20} />,
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "border-purple-200",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList size={24} className="text-blue-600" /> Cycle Count
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            New Master = <span className="font-semibold text-blue-700">(Existing Stock</span>{" "}
            − <span className="font-semibold text-green-700">Inward</span>){" "}
            − <span className="font-semibold text-orange-700">Outward</span>{" "}
            <span className="text-gray-400 ml-2 text-xs">Generated: {new Date(generatedAt).toLocaleString()}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition">
            <Download size={14} /> Export Excel
          </button>
          <button onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition">
            <FileText size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* Formula banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3">
        <Calculator size={18} className="text-amber-600 flex-shrink-0" />
        <div className="text-sm">
          <span className="font-bold text-amber-700">Cycle Count Formula: </span>
          <span className="text-gray-700">Computed Balance = </span>
          <span className="font-bold text-blue-700">Existing Inventory</span>
          <span className="text-gray-500"> − </span>
          <span className="font-bold text-green-700">Inward (last 30 days)</span>
          <span className="text-gray-500"> − </span>
          <span className="font-bold text-orange-700">Outward (last 30 days)</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className={`${s.bg} ${s.border} border rounded-xl p-4 flex flex-col gap-1`}>
            <div className={`${s.color}`}>{s.icon}</div>
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search material code or description..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
        />
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {(["ALL", "RM", "FG"] as const).map((cat) => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              className={`px-4 py-2 text-sm font-bold transition ${
                filterCat === cat
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}>
              {cat}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} material{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">#</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Material Code</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Description</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Cat.</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Warehouse</th>
                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50">Existing Stock</th>
                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-green-700 bg-green-50">− Inward</th>
                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-orange-700 bg-orange-50">− Outward</th>
                <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50">= Balance</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Unit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-gray-400">
                    <AlertCircle size={32} className="mx-auto mb-2 opacity-30" />
                    <div className="font-semibold">No data found</div>
                    <div className="text-xs mt-1">Start by adding inward entries to populate inventory</div>
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => {
                  const isNegative = row.computedQty < 0;
                  const isZero = row.computedQty === 0;
                  return (
                    <tr key={row.materialCode} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400 font-bold">{idx + 1}</td>
                      <td className="px-4 py-3 font-mono font-bold text-blue-700 text-xs">{row.materialCode}</td>
                      <td className="px-4 py-3 text-gray-800 max-w-[220px] truncate" title={row.description}>{row.description}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          row.category.toUpperCase().includes("FG")
                            ? "bg-purple-100 text-purple-700"
                            : "bg-green-100 text-green-700"
                        }`}>{row.category}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{row.warehouse}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700 bg-blue-50/40">{row.existingQty.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700 bg-green-50/40">{row.inwardQty.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-700 bg-orange-50/40">{row.outwardQty.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-black text-base ${
                        isNegative ? "text-red-600 bg-red-50" : isZero ? "text-gray-400 bg-gray-50" : "text-purple-700 bg-purple-50/40"
                      }`}>
                        {isNegative && <TrendingDown size={12} className="inline mr-1" />}
                        {!isNegative && !isZero && <TrendingUp size={12} className="inline mr-1" />}
                        {row.computedQty.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{row.huUnit}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-xs font-bold uppercase text-gray-500">TOTALS</td>
                  <td className="px-4 py-3 text-right font-black text-blue-700">{filtered.reduce((s, r) => s + r.existingQty, 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-black text-green-700">{filtered.reduce((s, r) => s + r.inwardQty, 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-black text-orange-700">{filtered.reduce((s, r) => s + r.outwardQty, 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-black text-purple-700">{filtered.reduce((s, r) => s + r.computedQty, 0).toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
