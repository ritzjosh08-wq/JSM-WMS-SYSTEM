import { useState, useEffect } from "react";
import { Search, Command, Bell, Activity, ChevronDown } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

export default function Header() {
  const { user, logout } = useAuthStore();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [now, setNow] = useState("");

  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setIsSearchOpen(true); }
      if (e.key === "Escape") setIsSearchOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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

        {/* Right — Search + Bell + User */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          {/* Search */}
          <button
            onClick={() => setIsSearchOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#f8fafc",
              border: "1.5px solid #e2e8f0",
              borderRadius: "9px",
              padding: "7px 14px",
              cursor: "pointer",
              width: "220px",
              color: "#94a3b8",
              fontSize: "13px",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#93c5fd"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; }}
          >
            <Search size={14} style={{ color: "#94a3b8" }} />
            <span style={{ flex: 1, textAlign: "left" }}>Search...</span>
            <span style={{
              display: "flex", alignItems: "center", gap: "2px",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "5px",
              padding: "2px 6px",
              fontSize: "10px",
              color: "#94a3b8",
              fontWeight: 600,
            }}>
              <Command size={10} /> K
            </span>
          </button>

          <div style={{ width: "1px", height: "22px", background: "#e2e8f0" }} />

          <div style={{ position: "relative", cursor: "pointer" }}>
            <Bell size={17} style={{ color: "#94a3b8" }} />
          </div>

          <div style={{ width: "1px", height: "22px", background: "#e2e8f0" }} />

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

      {/* Search Modal */}
      {isSearchOpen && (
        <div
          onClick={() => setIsSearchOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.4)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "100px",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "560px",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px 18px",
              borderBottom: "1px solid #f1f5f9",
            }}>
              <Search size={17} style={{ color: "#2563eb", flexShrink: 0 }} />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search material, batch, truck, SAP document..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "#0f172a",
                  fontSize: "15px",
                  outline: "none",
                }}
              />
              <kbd style={{
                fontSize: "10px", color: "#94a3b8",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "5px",
                padding: "3px 7px",
              }}>ESC</kbd>
            </div>
            <div style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px" }}>
                Quick searches
              </div>
              {[
                "Find where Batch \"B-204\" is located",
                "Track Truck \"KA-01-AB-1234\"",
                "Locate Material \"MAT-001\" across all warehouses",
              ].map(hint => (
                <div
                  key={hint}
                  onClick={() => setSearchQuery(hint)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 10px", borderRadius: "6px",
                    cursor: "pointer", fontSize: "13px", color: "#64748b",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#f8fafc"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <Search size={12} style={{ color: "#94a3b8" }} />
                  {hint}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
