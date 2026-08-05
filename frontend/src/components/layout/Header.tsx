import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

export default function Header() {
  const { user } = useAuthStore();
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header style={{
        height: "72px",
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: "16px",
        flexShrink: 0,
        zIndex: 10,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        {/* Left — Logo */}
        <div style={{ flexShrink: 0 }}>
          <img
            src="/jsm-logo.svg"
            alt="JSM Logistics"
            style={{ height: "52px", width: "auto", display: "block" }}
          />
        </div>

        {/* Center — Live clock (flex:1, centered) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "5px 14px",
          }}>
            <Activity size={11} style={{ color: "#10b981" }} />
            <span style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#475569",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.04em",
            }}>
              {now}
            </span>
            <div style={{
              width: "6px", height: "6px",
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 5px rgba(16,185,129,0.6)",
            }} />
            <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 600 }}>Live</span>
          </div>
        </div>

        {/* Right — User */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>

          <div style={{ display: "flex", alignItems: "center", gap: "9px", cursor: "pointer" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>{user?.name}</div>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>{user?.role}</div>
            </div>
            <div style={{
              width: "34px", height: "34px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "13px",
              fontWeight: 700,
              color: "#fff",
              boxShadow: "0 2px 8px rgba(37,99,235,0.30)",
            }}>
              {user?.name?.charAt(0) ?? "U"}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
