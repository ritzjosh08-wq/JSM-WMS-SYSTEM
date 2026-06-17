"use client";

import React, { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import * as XLSX from "xlsx";
import {
  ClipboardList, Download, Search, RefreshCw,
  CheckCircle2, AlertTriangle, Package, TrendingUp, TrendingDown,
  Calculator, XCircle
} from "lucide-react";

const API = "http://localhost:5001/api";

interface CycleRow {
  id: string;
  materialCode: string;
  description: string;
  batchNumber: string;
  category: string;
  huUnit: string;
  stockLocation: string;
  binLocation: string;
  systemQty: number;
  location: string;
  physicalQty: number | null;
  variance: number | null;
  status: string;
}

interface Stats {
  totalItems: number;
  pendingCounts: number;
  variances: number;
}

export default function CycleCount() {
  const user = useAuthStore(s => s.user);
  const isViewer = user?.role === 'CUSTOMER';
  const [rows, setRows]               = useState<CycleRow[]>([]);
  const [editedRows, setEditedRows]   = useState<Record<string, number | null>>({});
  const [stats, setStats]             = useState<Stats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [filterCat, setFilterCat]     = useState<"ALL" | "RM" | "FG">("ALL");
  const [search, setSearch]           = useState("");

  const load = () => {
    setLoading(true);
    fetch(`${API}/cycle-count`)
      .then(r => r.json())
      .then(data => {
        setRows(data.rows || []);
        setStats(data.stats || null);
        setEditedRows({});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const setPhysical = (id: string, val: number | null) => {
    setEditedRows(prev => ({ ...prev, [id]: val }));
  };

  const getPhys = (row: CycleRow): number | null =>
    row.id in editedRows ? editedRows[row.id] : row.physicalQty;

  const getVariance = (row: CycleRow): number | null => {
    const p = getPhys(row);
    return p !== null && p !== undefined ? p - row.systemQty : null;
  };

  const filtered = rows.filter(r => {
    const catMatch = filterCat === "ALL" || r.category?.toUpperCase().includes(filterCat);
    const searchMatch =
      !search ||
      r.materialCode.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.batchNumber.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  const countedRows   = filtered.filter(r => getPhys(r) !== null);
  const varianceRows  = filtered.filter(r => { const v = getVariance(r); return v !== null && v !== 0; });
  const matchRows     = filtered.filter(r => { const v = getVariance(r); return v !== null && v === 0; });

  const handleSubmit = async () => {
    const toSubmit = filtered.filter(r => getPhys(r) !== null).map(r => ({
      id:            r.id,
      materialCode:  r.materialCode,
      batchNumber:   r.batchNumber,
      location:      r.location,
      systemQty:     r.systemQty,
      physicalQty:   getPhys(r),
      variance:      getVariance(r),
    }));
    if (!toSubmit.length) { setSubmitError("No physical counts entered."); return; }
    setSubmitting(true); setSubmitError(null);
    try {
      const res = await fetch(`${API}/cycle-count/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counts: toSubmit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      setSubmitResult(`${toSubmit.length} cycle count record${toSubmit.length !== 1 ? "s" : ""} submitted successfully.`);
      load();
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const exportExcel = () => {
    const data = filtered.map((r, i) => ({
      "#": i + 1,
      "Material Code":   r.materialCode,
      "Description":     r.description,
      "Batch / Invoice": r.batchNumber,
      "Category":        r.category,
      "HU Unit":         r.huUnit,
      "Stock Location":  r.stockLocation || r.location,
      "Bin Location":    r.binLocation,
      "System Qty":      r.systemQty,
      "Physical Qty":    getPhys(r) ?? "",
      "Variance":        getVariance(r) ?? "",
      "Status":          getVariance(r) === null ? "NOT COUNTED"
                       : getVariance(r) === 0    ? "MATCH"
                       : getVariance(r)! > 0     ? "OVERAGE"
                       :                           "SHORTAGE",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cycle Count");
    XLSX.writeFile(wb, `CycleCount_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 900, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <ClipboardList size={22} style={{ color: "#d97706" }} /> Cycle Count
          </h1>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
            Enter physical stock counts · Variance = Physical − System
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={load} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "9px", color: "#64748b", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={exportExcel} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "#ecfdf5", border: "1.5px solid #a7f3d0", borderRadius: "9px", color: "#059669", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            <Download size={13} /> Export Excel
          </button>
          {!isViewer && countedRows.length > 0 && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 18px", background: "#d97706", border: "none", borderRadius: "9px", color: "#fff", fontSize: "12px", fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer" }}
            >
              {submitting ? <><RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</> : <><CheckCircle2 size={12} /> Submit Count</>}
            </button>
          )}
        </div>
      </div>

      {/* Feedback */}
      {submitResult && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "10px", padding: "12px 16px", color: "#065f46", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 size={15} /> {submitResult}
          <button onClick={() => setSubmitResult(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#059669" }}><XCircle size={14} /></button>
        </div>
      )}
      {submitError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "10px", padding: "12px 16px", color: "#dc2626", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertTriangle size={15} /> {submitError}
          <button onClick={() => setSubmitError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}><XCircle size={14} /></button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        {[
          { label: "Total Items",     value: filtered.length,        color: "#2563eb",  bg: "#eff6ff",  border: "#bfdbfe", icon: <Package size={16} /> },
          { label: "Counted",         value: countedRows.length,     color: "#059669",  bg: "#ecfdf5",  border: "#a7f3d0", icon: <CheckCircle2 size={16} /> },
          { label: "With Variance",   value: varianceRows.length,    color: "#d97706",  bg: "#fffbeb",  border: "#fde68a", icon: <AlertTriangle size={16} /> },
          { label: "Exact Match",     value: matchRows.length,       color: "#7c3aed",  bg: "#f5f3ff",  border: "#ddd6fe", icon: <Calculator size={16} /> },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: "12px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ color: s.color }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <Search size={13} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search material code, description or batch…"
            style={{ width: "100%", border: "1.5px solid #e2e8f0", borderRadius: "8px", padding: "7px 10px 7px 30px", fontSize: "12px", color: "#0f172a", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", border: "1.5px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
          {(["ALL", "RM", "FG"] as const).map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 700, cursor: "pointer", border: "none", background: filterCat === cat ? "#2563eb" : "#fff", color: filterCat === cat ? "#fff" : "#64748b" }}>
              {cat}
            </button>
          ))}
        </div>
        <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto" }}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
            <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", margin: "0 auto 8px", display: "block", opacity: 0.4 }} />
            <div style={{ fontSize: "13px" }}>Loading inventory…</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["#", "Material Code", "Description", "Batch / Invoice", "Category", "HU Unit", "Stock Location", "Bin Location", "System Qty", "Physical Qty", "Variance", "Status"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "System Qty" || h === "Physical Qty" || h === "Variance" ? "right" : "left", fontWeight: 700, fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: "center", padding: "48px", color: "#94a3b8" }}>
                      <ClipboardList size={36} style={{ margin: "0 auto 10px", display: "block", opacity: 0.2 }} />
                      <div style={{ fontSize: "13px", fontWeight: 700 }}>No inventory data found</div>
                      <div style={{ fontSize: "11px", marginTop: "4px" }}>Add inward entries to populate cycle count</div>
                    </td>
                  </tr>
                ) : filtered.map((row, idx) => {
                  const phys    = getPhys(row);
                  const variance = getVariance(row);
                  const isShortage = variance !== null && variance < 0;
                  const isOverage  = variance !== null && variance > 0;
                  const isMatch    = variance !== null && variance === 0;

                  return (
                    <tr key={row.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 12px", color: "#94a3b8", fontSize: "10px", fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 800, color: "#1e40af", fontSize: "11px" }}>{row.materialCode}</td>
                      <td style={{ padding: "8px 12px", color: "#374151", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.description}>{row.description}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#64748b", fontSize: "10px" }}>{row.batchNumber}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ background: row.category?.toUpperCase().includes("FG") ? "#f5f3ff" : "#ecfdf5", color: row.category?.toUpperCase().includes("FG") ? "#7c3aed" : "#059669", border: `1px solid ${row.category?.toUpperCase().includes("FG") ? "#ddd6fe" : "#a7f3d0"}`, borderRadius: "20px", padding: "2px 8px", fontSize: "9px", fontWeight: 700 }}>
                          {row.category || "RM"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", color: "#64748b", fontSize: "11px" }}>{row.huUnit}</td>
                      <td style={{ padding: "8px 12px", color: "#7c3aed", fontSize: "11px", fontWeight: 600 }}>{row.stockLocation || row.location || "—"}</td>
                      <td style={{ padding: "8px 12px", color: "#0891b2", fontSize: "11px", fontWeight: 600 }}>{row.binLocation || "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#2563eb" }}>{row.systemQty.toFixed(2)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={phys ?? ""}
                          onChange={e => !isViewer && setPhysical(row.id, e.target.value === "" ? null : parseFloat(e.target.value))}
                          readOnly={isViewer}
                          placeholder={isViewer ? "—" : "Enter count"}
                          style={{ width: "90px", border: `1.5px solid ${phys !== null ? "#2563eb" : "#e2e8f0"}`, borderRadius: "7px", padding: "5px 8px", fontSize: "12px", fontWeight: 700, color: "#0f172a", textAlign: "right", outline: "none", background: isViewer ? "#f8fafc" : phys !== null ? "#eff6ff" : "#fff", cursor: isViewer ? "default" : "text" }}
                        />
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 800, fontSize: "13px",
                        color: isShortage ? "#dc2626" : isOverage ? "#d97706" : isMatch ? "#059669" : "#94a3b8" }}>
                        {variance === null ? "—" : (
                          <>
                            {isShortage && <TrendingDown size={11} style={{ display: "inline", marginRight: "2px" }} />}
                            {isOverage  && <TrendingUp  size={11} style={{ display: "inline", marginRight: "2px" }} />}
                            {variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)}
                          </>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          background: isShortage ? "#fef2f2" : isOverage ? "#fffbeb" : isMatch ? "#ecfdf5" : "#f8fafc",
                          color:      isShortage ? "#dc2626" : isOverage ? "#d97706" : isMatch ? "#059669" : "#94a3b8",
                          border:     `1px solid ${isShortage ? "#fca5a5" : isOverage ? "#fde68a" : isMatch ? "#a7f3d0" : "#e2e8f0"}`,
                          borderRadius: "20px", padding: "2px 8px", fontSize: "9px", fontWeight: 700, whiteSpace: "nowrap",
                        }}>
                          {variance === null ? "NOT COUNTED" : isShortage ? "SHORTAGE" : isOverage ? "OVERAGE" : "MATCH"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
                  <tr>
                    <td colSpan={8} style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 800, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>TOTALS</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "#2563eb" }}>
                      {filtered.reduce((s, r) => s + r.systemQty, 0).toFixed(2)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "#2563eb" }}>
                      {filtered.filter(r => getPhys(r) !== null).reduce((s, r) => s + (getPhys(r) || 0), 0).toFixed(2)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 900, color: "#d97706" }}>
                      {filtered.filter(r => getVariance(r) !== null).reduce((s, r) => s + (getVariance(r) || 0), 0).toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
