"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Settings, FileUp, ArrowDownToLine,
  ArrowUpFromLine, PackageSearch, Map, Truck,
  ClipboardList, AlertTriangle, FileBarChart, Box, ChevronRight
} from "lucide-react";

const navLinks = [
  { name: "Dashboard",          href: "/",                icon: LayoutDashboard,   section: "main" },
  { name: "Inward Entry",       href: "/inward",          icon: ArrowDownToLine,   section: "operations" },
  { name: "Outbound Dispatch",  href: "/outward",         icon: ArrowUpFromLine,   section: "operations" },
  { name: "Inventory",          href: "/inventory",       icon: PackageSearch,     section: "operations" },
  { name: "Cycle Count",        href: "/cycle-count",     icon: ClipboardList,     section: "operations" },
  { name: "Smart Ingestion",    href: "/smart-ingestion", icon: FileUp,            section: "tools" },
  { name: "Warehouse Map",      href: "/warehouse-map",   icon: Map,               section: "tools" },
  { name: "Truck Tracking",     href: "/trucks",          icon: Truck,             section: "tools" },
  { name: "Damage Management",  href: "/damage",          icon: AlertTriangle,     section: "tools" },
  { name: "Reports",            href: "/reports",         icon: FileBarChart,      section: "tools" },
  { name: "Material Master",    href: "/material-master", icon: Box,               section: "config" },
  { name: "Settings",           href: "/settings",        icon: Settings,          section: "config" },
];

const sections = [
  { id: "main",       label: null },
  { id: "operations", label: "Operations" },
  { id: "tools",      label: "Tools & Tracking" },
  { id: "config",     label: "Configuration" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: "260px",
      background: "linear-gradient(180deg, #060c18 0%, #080d1a 100%)",
      borderRight: "1px solid rgba(148,163,184,0.08)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      flexShrink: 0,
      position: "relative",
      zIndex: 20,
    }}>
      {/* Logo / Brand */}
      <div style={{
        padding: "24px 20px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ width: "160px", marginBottom: "14px" }}>
          <Image
            src="/Logo.png"
            alt="JSM Logistics Logo"
            width={280}
            height={112}
            loading="eager"
            className="object-contain w-full h-auto"
            style={{ filter: "brightness(1.1) drop-shadow(0 0 8px rgba(59,130,246,0.3))" }}
          />
        </div>
        <div>
          <div style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#f1f5f9",
            letterSpacing: "0.02em",
            lineHeight: 1.2,
          }}>
            JSM Logistics
          </div>
          <div style={{
            fontSize: "9px",
            fontWeight: 600,
            color: "#3b82f6",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginTop: "4px",
          }}>
            Control Tower
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "12px 10px 16px" }}>
        {sections.map(({ id, label }) => {
          const links = navLinks.filter((l) => l.section === id);
          return (
            <div key={id} style={{ marginBottom: "4px" }}>
              {label && (
                <div style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "#334155",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "12px 10px 6px",
                }}>
                  {label}
                </div>
              )}
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
                return (
                  <Link key={link.href} href={link.href}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      marginBottom: "1px",
                      transition: "all 0.15s ease",
                      cursor: "pointer",
                      background: isActive
                        ? "rgba(59,130,246,0.15)"
                        : "transparent",
                      borderLeft: `3px solid ${isActive ? "#3b82f6" : "transparent"}`,
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }
                    }}>
                      <Icon
                        size={17}
                        style={{
                          color: isActive ? "#3b82f6" : "#475569",
                          flexShrink: 0,
                          transition: "color 0.15s",
                        }}
                      />
                      <span style={{
                        fontSize: "13px",
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? "#e2e8f0" : "#64748b",
                        letterSpacing: "0.01em",
                        flex: 1,
                      }}>
                        {link.name}
                      </span>
                      {isActive && (
                        <ChevronRight size={12} style={{ color: "#3b82f6", opacity: 0.7 }} />
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: "14px 20px",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}>
        <div style={{
          width: "8px", height: "8px",
          borderRadius: "50%",
          background: "#10b981",
          boxShadow: "0 0 6px rgba(16,185,129,0.6)",
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>System Online</div>
          <div style={{ fontSize: "10px", color: "#334155" }}>v2.0 · SQLite</div>
        </div>
      </div>
    </aside>
  );
}
