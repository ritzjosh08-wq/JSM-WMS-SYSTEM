import React, { useEffect, useState } from 'react';
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import {
  ArrowDownToLine, ArrowUpFromLine, Package, ClipboardList,
  AlertTriangle, Activity, TrendingUp, Layers
} from "lucide-react";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rmOpen, setRmOpen] = useState(false);

  useEffect(() => {
    fetch('http://localhost:5001/api/dashboard')
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#64748b', fontSize: '14px' }}>
      Loading dashboard...
    </div>
  );
  if (error) return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px', color: '#dc2626', fontSize: '14px' }}>
      Error: {error}
    </div>
  );

  const kpiCards = [
    { label: "Today's Inward",   value: data.todaysInward,      icon: ArrowDownToLine, color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
    { label: "Today's Outward",  value: data.todaysOutward,     icon: ArrowUpFromLine, color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
    { label: "RM Inventory",     value: data.inventoryRMPallets ?? data.inventoryRM, icon: Package, color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", sub: "pallets", isRM: true },
    { label: "FG Inventory",     value: data.inventoryFGPallets ?? data.inventoryFG, icon: Layers,  color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc", sub: "pallets" },
    { label: "Pending Counts",   value: data.pendingCycleCounts, icon: ClipboardList,  color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
    { label: "Discrepancies",    value: data.discrepancyCount,  icon: AlertTriangle,   color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  ];

  const rmByType: { type: string; pallets: number }[] = data.rmByType || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.01em" }}>
            Operations Dashboard
          </h1>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "6px 12px" }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.6)" }} />
          <span style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>Live</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
        {kpiCards.map((card) => {
          const Icon = card.icon;
          const isRm = (card as any).isRM;
          return (
            <div
              key={card.label}
              onClick={isRm ? () => setRmOpen(o => !o) : undefined}
              style={{
                background: "#ffffff",
                border: `1px solid ${card.border}`,
                borderRadius: "12px",
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                transition: "transform 0.15s, box-shadow 0.15s",
                position: "relative",
                cursor: isRm ? "pointer" : "default",
                zIndex: isRm && rmOpen ? 100 : "auto",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)";
                (e.currentTarget as HTMLDivElement).style.transform = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {card.label}
                </span>
                <div style={{
                  background: card.bg,
                  border: `1px solid ${card.border}`,
                  borderRadius: "8px",
                  padding: "7px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Icon size={16} style={{ color: card.color }} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                <span style={{ fontSize: "36px", fontWeight: 900, color: card.color, lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {(card.value ?? 0).toLocaleString()}
                </span>
                {card.sub && (
                  <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>{card.sub}</span>
                )}
              </div>

              {/* RM click-to-expand: material-type breakdown */}
              {isRm && rmByType.length > 0 && (
                <div style={{ fontSize: "10px", color: "#a78bfa", fontWeight: 600, marginTop: "-4px" }}>
                  {rmOpen ? "▲ Hide breakdown" : "▼ View breakdown"}
                </div>
              )}
              {isRm && rmOpen && rmByType.length > 0 && (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: "#fff",
                    border: "1.5px solid #ddd6fe",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    boxShadow: "0 8px 24px rgba(124,58,237,0.12)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      RM by Material Type
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setRmOpen(false); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "14px", lineHeight: 1, padding: "0 2px" }}
                    >×</button>
                  </div>
                  {rmByType.map(({ type, pallets }) => (
                    <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <span style={{ fontSize: "11px", color: "#374151", fontWeight: 600 }}>{type}</span>
                      <span style={{ fontSize: "12px", fontWeight: 800, color: "#7c3aed" }}>{pallets} pallets</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "16px" }}>
        {/* Recent Inward */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", background: "#2563eb", borderRadius: "2px" }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151", flex: 1 }}>Recent Inward Entries</span>
            <TrendingUp size={13} style={{ color: "#2563eb" }} />
          </div>
          <div style={{ padding: "12px 16px" }}>
            {(data.recentInwards || []).length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>
                No inward entries yet
              </div>
            ) : (
              <Table
                data={data.recentInwards}
                keyExtractor={(item: any) => item.id}
                columns={[
                  { key: "inwardNumber", header: "Entry No." },
                  { key: "truckNumber",  header: "Truck" },
                  { key: "source",       header: "Source" },
                  {
                    key: "status",
                    header: "Status",
                    render: (item: any) => (
                      <Badge variant={item.status === "COMPLETED" ? "success" : "warning"}>
                        {item.status}
                      </Badge>
                    ),
                  },
                  {
                    key: "createdAt",
                    header: "Date",
                    render: (item: any) => new Date(item.createdAt).toLocaleDateString("en-IN"),
                  },
                ]}
              />
            )}
          </div>
        </div>

        {/* Stock Location Utilization — pallets only, no % bar */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", background: "#7c3aed", borderRadius: "2px" }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151", flex: 1 }}>Stock Location — Pallets</span>
            <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600 }}>{data.totalPallets ?? 0} total</span>
            <Activity size={13} style={{ color: "#7c3aed" }} />
          </div>
          <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "280px", overflowY: "auto" }}>
            {(data.stockLocations || []).length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>
                No stock data available
              </div>
            ) : (
              (data.stockLocations || []).map((loc: any) => (
                <div key={loc.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>{loc.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "20px", fontWeight: 900, color: "#7c3aed" }}>{loc.pallets}</span>
                    <span style={{ fontSize: "10px", color: "#a78bfa", fontWeight: 600 }}>pallets</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
