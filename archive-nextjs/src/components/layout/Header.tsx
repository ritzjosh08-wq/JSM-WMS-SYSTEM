"use client";

import { useState, useEffect } from "react";
import { Search, User, Command, Bell, Activity } from "lucide-react";

export default function Header() {
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
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === "Escape") setIsSearchOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <header style={{
        height: "58px",
        background: "rgba(6,12,24,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(148,163,184,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        flexShrink: 0,
        zIndex: 10,
        position: "relative",
      }}>
        {/* Left — Search */}
        <button
          onClick={() => setIsSearchOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(148,163,184,0.12)",
            borderRadius: "8px",
            padding: "7px 14px",
            cursor: "pointer",
            width: "280px",
            color: "#475569",
            fontSize: "13px",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(59,130,246,0.4)";
            (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(148,163,184,0.12)";
            (e.currentTarget as HTMLButtonElement).style.color = "#475569";
          }}
        >
          <Search size={14} />
          <span style={{ flex: 1, textAlign: "left" }}>Global Search...</span>
          <span style={{
            display: "flex", alignItems: "center", gap: "2px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(148,163,184,0.15)",
            borderRadius: "5px",
            padding: "2px 6px",
            fontSize: "10px",
            color: "#475569",
            fontWeight: 600,
          }}>
            <Command size={10} /> K
          </span>
        </button>

        {/* Center — Live clock */}
        <div style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <Activity size={12} style={{ color: "#10b981" }} />
          <span style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#475569",
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.05em",
          }}>
            {now}
          </span>
        </div>

        {/* Right — User */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Notification bell */}
          <div style={{ position: "relative", cursor: "pointer" }}>
            <Bell size={16} style={{ color: "#475569" }} />
          </div>

          {/* Divider */}
          <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.06)" }} />

          {/* User info */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0" }}>Operator</div>
              <div style={{ fontSize: "10px", color: "#475569" }}>Main Warehouse</div>
            </div>
            <div style={{
              width: "32px", height: "32px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 10px rgba(59,130,246,0.35)",
              border: "1px solid rgba(59,130,246,0.4)",
            }}>
              <User size={15} style={{ color: "#f1f5f9" }} />
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
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "120px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "560px",
              background: "#111827",
              border: "1px solid rgba(59,130,246,0.25)",
              borderRadius: "14px",
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 32px rgba(59,130,246,0.12)",
              animation: "fadeSlideIn 0.15s ease-out",
            }}
          >
            {/* Search input */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <Search size={18} style={{ color: "#3b82f6", flexShrink: 0 }} />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search material, batch, truck, SAP document..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "#f1f5f9",
                  fontSize: "15px",
                  outline: "none",
                }}
              />
              <kbd style={{
                fontSize: "10px",
                color: "#475569",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(148,163,184,0.15)",
                borderRadius: "5px",
                padding: "3px 7px",
              }}>ESC</kbd>
            </div>

            {/* Hints */}
            <div style={{ padding: "16px 18px" }}>
              {searchQuery ? (
                <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Searching for <strong style={{ color: "#f1f5f9" }}>"{searchQuery}"</strong>…
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#334155", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "10px" }}>Quick searches</div>
                  {[
                    "Find where Batch \"B-204\" is located",
                    "Track Truck \"KA-01-AB-1234\"",
                    "Locate Material \"MAT-001\" across all warehouses",
                  ].map((hint) => (
                    <div
                      key={hint}
                      onClick={() => setSearchQuery(hint)}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "8px 10px", borderRadius: "6px",
                        cursor: "pointer", fontSize: "13px", color: "#64748b",
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                        (e.currentTarget as HTMLDivElement).style.color = "#94a3b8";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                        (e.currentTarget as HTMLDivElement).style.color = "#64748b";
                      }}
                    >
                      <Search size={12} />
                      {hint}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
