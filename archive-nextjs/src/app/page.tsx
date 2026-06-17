import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import { ArrowDownToLine, ArrowUpFromLine, Package, Truck, ClipboardList, AlertTriangle, Activity, TrendingUp } from "lucide-react";

export const metadata = {
  title: "Dashboard — JSM Logistics Control Tower",
};

export default async function Dashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalInventory,
    todaysInward,
    todaysOutward,
    activeTrucks,
    damagedStockCount,
    pendingCycleCounts,
    warehouses,
    recentInwards,
  ] = await Promise.all([
    prisma.inventoryBatch.aggregate({ _sum: { quantity: true } }),
    prisma.inwardEntry.count({ where: { createdAt: { gte: today } } }),
    prisma.outwardEntry.count({ where: { createdAt: { gte: today } } }),
    prisma.truckMovement.count({ where: { status: { notIn: ["COMPLETED", "DISPATCHED"] } } }),
    prisma.damageRecord.count({ where: { status: "DAMAGED" } }),
    prisma.cycleCount.count({ where: { status: "PENDING" } }),
    prisma.warehouse.findMany(),
    prisma.inwardEntry.findMany({ take: 6, orderBy: { createdAt: "desc" } }),
  ]);

  const kpiCards = [
    {
      label: "Today's Inward",
      value: todaysInward,
      icon: <ArrowDownToLine size={22} />,
      color: "#3b82f6",
      glow: "rgba(59,130,246,0.20)",
      bg: "rgba(59,130,246,0.08)",
      border: "rgba(59,130,246,0.20)",
    },
    {
      label: "Today's Outward",
      value: todaysOutward,
      icon: <ArrowUpFromLine size={22} />,
      color: "#10b981",
      glow: "rgba(16,185,129,0.20)",
      bg: "rgba(16,185,129,0.08)",
      border: "rgba(16,185,129,0.20)",
    },
    {
      label: "Inventory (Total Units)",
      value: Math.round(totalInventory._sum.quantity || 0),
      icon: <Package size={22} />,
      color: "#8b5cf6",
      glow: "rgba(139,92,246,0.20)",
      bg: "rgba(139,92,246,0.08)",
      border: "rgba(139,92,246,0.20)",
    },
    {
      label: "Active Trucks",
      value: activeTrucks,
      icon: <Truck size={22} />,
      color: "#f59e0b",
      glow: "rgba(245,158,11,0.20)",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.20)",
    },
    {
      label: "Pending Cycle Counts",
      value: pendingCycleCounts,
      icon: <ClipboardList size={22} />,
      color: "#06b6d4",
      glow: "rgba(6,182,212,0.20)",
      bg: "rgba(6,182,212,0.08)",
      border: "rgba(6,182,212,0.20)",
    },
    {
      label: "Damage Cases",
      value: damagedStockCount,
      icon: <AlertTriangle size={22} />,
      color: "#ef4444",
      glow: "rgba(239,68,68,0.20)",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.20)",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: "-0.01em" }}>
            Operations Dashboard
          </h1>
          <p style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            width: "8px", height: "8px", borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 8px rgba(16,185,129,0.7)",
            animation: "pulse 2s infinite",
          }} />
          <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 600 }}>Live</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
        {kpiCards.map((card) => (
          <div
            key={card.label}
            style={{
              background: card.bg,
              border: `1px solid ${card.border}`,
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: `0 4px 16px ${card.glow}`,
              transition: "transform 0.15s, box-shadow 0.15s",
              cursor: "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.10em" }}>
                {card.label}
              </span>
              <div style={{ color: card.color, opacity: 0.7 }}>{card.icon}</div>
            </div>
            <div style={{ fontSize: "36px", fontWeight: 900, color: card.color, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "20px" }}>
        {/* Recent Inward */}
        <div style={{ background: "#111827", border: "1px solid rgba(148,163,184,0.10)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(148,163,184,0.08)", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", background: "linear-gradient(180deg, #3b82f6, #1d4ed8)", borderRadius: "2px" }} />
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.10em" }}>
              Recent Inward Entries
            </span>
            <TrendingUp size={13} style={{ color: "#3b82f6", marginLeft: "auto" }} />
          </div>
          <div style={{ padding: "16px" }}>
            <Table
              data={recentInwards}
              keyExtractor={(item) => item.id}
              columns={[
                { key: "inwardNumber", header: "Entry No." },
                { key: "truckNumber",  header: "Truck" },
                { key: "source",       header: "Source" },
                {
                  key: "status",
                  header: "Status",
                  render: (item) => (
                    <Badge variant={item.status === "COMPLETED" ? "success" : "warning"}>
                      {item.status}
                    </Badge>
                  ),
                },
                {
                  key: "createdAt",
                  header: "Date",
                  render: (item) => new Date(item.createdAt).toLocaleDateString("en-IN"),
                },
              ]}
            />
          </div>
        </div>

        {/* Warehouse Utilization */}
        <div style={{ background: "#111827", border: "1px solid rgba(148,163,184,0.10)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(148,163,184,0.08)", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "3px", height: "16px", background: "linear-gradient(180deg, #8b5cf6, #6d28d9)", borderRadius: "2px" }} />
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.10em" }}>
              Warehouse Utilization
            </span>
            <Activity size={13} style={{ color: "#8b5cf6", marginLeft: "auto" }} />
          </div>
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>
            {warehouses.length === 0 ? (
              <div style={{ color: "#334155", fontSize: "13px", textAlign: "center", padding: "20px" }}>
                No warehouses configured
              </div>
            ) : (
              warehouses.map((wh) => {
                const pct = wh.totalCapacity > 0
                  ? Math.min((wh.usedCapacity / wh.totalCapacity) * 100, 100)
                  : 0;
                const barColor = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#3b82f6";
                const glowColor = pct > 90 ? "rgba(239,68,68,0.4)" : pct > 70 ? "rgba(245,158,11,0.4)" : "rgba(59,130,246,0.4)";
                return (
                  <div key={wh.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#94a3b8" }}>{wh.name}</span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: barColor }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ fontSize: "10px", color: "#334155", marginBottom: "5px" }}>
                      {wh.usedCapacity} / {wh.totalCapacity} units
                    </div>
                    <div style={{ height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: barColor,
                        borderRadius: "3px",
                        boxShadow: `0 0 8px ${glowColor}`,
                        transition: "width 0.5s ease",
                      }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
