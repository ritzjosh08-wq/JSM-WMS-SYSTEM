import { useEffect, useState } from 'react';
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import {
  ArrowDownToLine, ArrowUpFromLine, Package, ClipboardList,
  AlertTriangle, Activity, TrendingUp, Layers, Users
} from "lucide-react";
import { useAuthStore, whQuery } from '../store/authStore';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api';

export default function Dashboard() {
  const user          = useAuthStore(s => s.user);
  const selectedWorker = useAuthStore(s => s.selectedWorker);
  const isAdmin = user?.role === 'ADMIN';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rmOpen, setRmOpen] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);

  // All-workers overview (admin only, when no worker selected)
  const [allWorkers, setAllWorkers] = useState<any[]>([]);
  const [allWorkersLoading, setAllWorkersLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    const url = `${API}/dashboard${whQuery(selectedWorker)}`;
    fetch(url)
      .then(res => res.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);
        setLoading(false);
      })
      .catch((err: Error) => { setError(err.message || 'Failed to load'); setLoading(false); });
  }, [selectedWorker]);

  // When Admin has no worker selected, also fetch the per-worker summary
  useEffect(() => {
    if (!isAdmin || selectedWorker) { setAllWorkers([]); return; }
    setAllWorkersLoading(true);
    fetch(`${API}/dashboard/all-workers`)
      .then(r => r.json())
      .then(json => { setAllWorkers(json.workers || []); setAllWorkersLoading(false); })
      .catch(() => setAllWorkersLoading(false));
  }, [isAdmin, selectedWorker]);

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
    { label: "Discrepancies",    value: data.discrepancyCount,  icon: AlertTriangle,   color: "#dc2626", bg: "#fef2f2", border: "#fecaca", isDisc: true },
  ];

  const rmByType: { type: string; pallets: number }[] = data.rmByType || [];
  const discByCategory: { category: string; count: number }[] = data.discrepancyByCategory || [];

  // Title for the current view
  const viewTitle = selectedWorker
    ? `${selectedWorker.name}'s Dashboard`
    : 'Operations Dashboard';
  const whLabel = selectedWorker
    ? (selectedWorker.warehouseCode || selectedWorker.warehouseCodes?.join(', ') || '—')
    : null;
  const viewSubtitle = selectedWorker
    ? `Warehouse: ${whLabel}${selectedWorker.location ? ` · ${selectedWorker.location}` : ''}`
    : new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.01em" }}>
            {viewTitle}
          </h1>
          <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
            {viewSubtitle}
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
          const isRm   = (card as any).isRM;
          const isDisc = (card as any).isDisc;
          const hasBreakdown = (isRm && rmByType.length > 0) || (isDisc && discByCategory.length > 0);
          const isOpen = isRm ? rmOpen : isDisc ? discOpen : false;
          const toggleOpen = isRm ? () => setRmOpen(o => !o) : isDisc ? () => setDiscOpen(o => !o) : undefined;
          return (
            <div
              key={card.label}
              onClick={hasBreakdown ? toggleOpen : undefined}
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
                cursor: hasBreakdown ? "pointer" : "default",
                zIndex: isOpen ? 100 : "auto",
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
                  background: card.bg, border: `1px solid ${card.border}`,
                  borderRadius: "8px", padding: "7px",
                  display: "flex", alignItems: "center", justifyContent: "center",
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

              {hasBreakdown && (
                <div style={{ fontSize: "10px", color: isDisc ? "#f87171" : "#a78bfa", fontWeight: 600, marginTop: "-4px" }}>
                  {isOpen ? "▲ Hide breakdown" : "▼ View breakdown"}
                </div>
              )}

              {/* RM breakdown */}
              {isRm && rmOpen && rmByType.length > 0 && (
                <div onClick={e => e.stopPropagation()} style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                  background: "#fff", border: "1.5px solid #ddd6fe", borderRadius: "10px",
                  padding: "12px 14px", boxShadow: "0 8px 24px rgba(124,58,237,0.12)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.1em" }}>RM by Material Type</div>
                    <button onClick={e => { e.stopPropagation(); setRmOpen(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "14px", lineHeight: 1, padding: "0 2px" }}>×</button>
                  </div>
                  {rmByType.map(({ type, pallets }) => (
                    <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <span style={{ fontSize: "11px", color: "#374151", fontWeight: 600 }}>{type}</span>
                      <span style={{ fontSize: "12px", fontWeight: 800, color: "#7c3aed" }}>{pallets} pallets</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Discrepancy breakdown */}
              {isDisc && discOpen && discByCategory.length > 0 && (
                <div onClick={e => e.stopPropagation()} style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                  background: "#fff", border: "1.5px solid #fecaca", borderRadius: "10px",
                  padding: "12px 14px", boxShadow: "0 8px 24px rgba(220,38,38,0.10)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 800, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.1em" }}>Discrepancies by Category</div>
                    <button onClick={e => { e.stopPropagation(); setDiscOpen(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "14px", lineHeight: 1, padding: "0 2px" }}>×</button>
                  </div>
                  {discByCategory.map(({ category, count }) => {
                    const isRM = category === "RM";
                    return (
                      <div key={category} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #fef2f2" }}>
                        <span style={{
                          fontSize: "9px", fontWeight: 800, padding: "2px 7px", borderRadius: "10px",
                          background: isRM ? "#ecfdf5" : "#f5f3ff", color: isRM ? "#059669" : "#7c3aed",
                          border: `1px solid ${isRM ? "#a7f3d0" : "#ddd6fe"}`,
                        }}>{category}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ fontSize: "14px", fontWeight: 900, color: "#dc2626" }}>{count}</span>
                          <span style={{ fontSize: "9px", color: "#f87171", fontWeight: 600 }}>batches</span>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#374151" }}>Total</span>
                    <span style={{ fontSize: "13px", fontWeight: 900, color: "#dc2626" }}>
                      {discByCategory.reduce((s, d) => s + d.count, 0)}
                    </span>
                  </div>
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
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151", flex: 1 }}>
              Recent Inward Entries{selectedWorker ? ` — ${selectedWorker.name}` : ''}
            </span>
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

        {/* Stock Location */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", background: "#7c3aed", borderRadius: "2px" }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151", flex: 1 }}>Stock Location — Pallets</span>
            <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600 }}>{data.totalPallets ?? 0} total</span>
            <Activity size={13} style={{ color: "#7c3aed" }} />
          </div>
          <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: "10px", maxHeight: "280px", overflowY: "auto" }}>
            {(data.stockLocations || []).length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>No stock data available</div>
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

      {/* Admin All-Workers Overview — only when no worker is selected */}
      {isAdmin && !selectedWorker && (
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", background: "#f59e0b", borderRadius: "2px" }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151", flex: 1 }}>All Worker Warehouses</span>
            <Users size={13} style={{ color: "#f59e0b" }} />
          </div>
          <div style={{ padding: "16px 20px" }}>
            {allWorkersLoading ? (
              <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "13px", padding: "20px" }}>Loading workers...</div>
            ) : allWorkers.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94a3b8", fontSize: "13px", padding: "20px" }}>No worker warehouses found</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
                {allWorkers.map((w: any) => (
                  <div key={w.username} style={{
                    border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px",
                    background: "#f8fafc",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                      <div style={{
                        width: "30px", height: "30px", borderRadius: "8px",
                        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "11px", fontWeight: 800, color: "#fff", flexShrink: 0,
                      }}>
                        {w.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {w.name}
                        </div>
                        <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                          {w.warehouseCode || 'No WH'} · {w.username}
                        </div>
                      </div>
                    </div>
                    {w.stats ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                        {[
                          { label: "Inward Today",  value: w.stats.todaysInward,  color: "#2563eb" },
                          { label: "Outward Today", value: w.stats.todaysOutward, color: "#059669" },
                          { label: "RM Pallets",    value: w.stats.inventoryRMPallets, color: "#7c3aed" },
                          { label: "Discrepancies", value: w.stats.discrepancyCount,   color: "#dc2626" },
                        ].map(item => (
                          <div key={item.label} style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: "7px", padding: "7px 9px" }}>
                            <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 600, marginBottom: "2px" }}>{item.label}</div>
                            <div style={{ fontSize: "18px", fontWeight: 900, color: item.color }}>{item.value ?? 0}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>No warehouse linked</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
