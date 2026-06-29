import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Settings, ArrowDownToLine,
  ArrowUpFromLine, PackageSearch, Map,
  ClipboardList, FileBarChart, Box, ChevronRight, LogOut
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import WorkerSwitcher from "./WorkerSwitcher";

// roles: ADMIN = super-user all warehouses | WORKER = full ops | CUSTOMER = view-only all modules
const ALL_NAV_LINKS = [
  { name: "Dashboard",          href: "/",                icon: LayoutDashboard,   section: "main",       roles: ["ADMIN","WORKER","CUSTOMER"] },
  { name: "Inward Entry",       href: "/inward",          icon: ArrowDownToLine,   section: "operations", roles: ["ADMIN","WORKER"] },
  { name: "Outbound Dispatch",  href: "/outward",         icon: ArrowUpFromLine,   section: "operations", roles: ["ADMIN","WORKER"] },
  { name: "Inventory",          href: "/inventory",       icon: PackageSearch,     section: "operations", roles: ["ADMIN","WORKER","CUSTOMER"] },
  { name: "Cycle Count",        href: "/cycle-count",     icon: ClipboardList,     section: "operations", roles: ["ADMIN","WORKER","CUSTOMER"] },
  { name: "Reports",            href: "/reports",         icon: FileBarChart,      section: "operations", roles: ["ADMIN","WORKER","CUSTOMER"] },
  { name: "Warehouse Map",      href: "/warehouse-map",   icon: Map,               section: "tools",      roles: ["ADMIN","WORKER","CUSTOMER"] },
  { name: "Material Master",    href: "/material-master", icon: Box,               section: "tools",      roles: ["ADMIN","WORKER","CUSTOMER"] },
  { name: "Settings",           href: "/settings",        icon: Settings,          section: "config",     roles: ["ADMIN"] },
];

const sections = [
  { id: "main",       label: null },
  { id: "operations", label: "Operations" },
  { id: "tools",      label: "Analytics & Maps" },
  { id: "config",     label: "Configuration" },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();

  const role = user?.role ?? '';
  const isAdmin = role === 'ADMIN';
  const navLinks = ALL_NAV_LINKS.filter(l => l.roles.includes(role));
  const isCustomer = role === 'CUSTOMER';

  return (
    <aside style={{
      width: "248px",
      background: "#ffffff",
      borderRight: "1px solid #e2e8f0",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      flexShrink: 0,
      position: "relative",
      zIndex: 20,
      boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
    }}>
      {/* Brand label */}
      <div style={{
        padding: "18px 20px 14px",
        borderBottom: "1px solid #f1f5f9",
      }}>
        <div style={{
          fontSize: "9px",
          fontWeight: 700,
          color: "#2563eb",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}>
          Control Tower
        </div>
        <div style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "#94a3b8",
          letterSpacing: "0.04em",
          marginTop: "2px",
        }}>
          Warehouse Management System
        </div>
        {isCustomer && (
          <div style={{
            marginTop: "8px",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: "#fef9c3",
            border: "1px solid #fde68a",
            borderRadius: "6px",
            padding: "3px 8px",
            fontSize: "10px",
            fontWeight: 700,
            color: "#92400e",
            letterSpacing: "0.06em",
          }}>
            👁 VIEW &amp; DOWNLOAD ONLY
          </div>
        )}
      </div>

      {/* Worker Switcher — Admin only */}
      {(isAdmin || isCustomer) && <WorkerSwitcher />}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px 10px 12px" }}>
        {sections.map(({ id, label }) => {
          const links = navLinks.filter((l) => l.section === id);
          if (links.length === 0) return null;
          return (
            <div key={id} style={{ marginBottom: "2px" }}>
              {label && (
                <div style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "#94a3b8",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "10px 10px 5px",
                }}>
                  {label}
                </div>
              )}
              {links.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
                return (
                  <Link key={link.href} to={link.href} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                        padding: "8px 11px",
                        borderRadius: "8px",
                        marginBottom: "1px",
                        transition: "all 0.12s ease",
                        cursor: "pointer",
                        background: isActive ? "#eff6ff" : "transparent",
                        borderLeft: `3px solid ${isActive ? "#2563eb" : "transparent"}`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "#f8fafc";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }}
                    >
                      <Icon
                        size={16}
                        style={{ color: isActive ? "#2563eb" : "#94a3b8", flexShrink: 0 }}
                      />
                      <span style={{
                        fontSize: "13px",
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? "#1d4ed8" : "#64748b",
                        flex: 1,
                      }}>
                        {link.name}
                      </span>
                      {isActive && (
                        <ChevronRight size={11} style={{ color: "#2563eb", opacity: 0.6 }} />
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User + Logout Footer */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid #f1f5f9",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <div style={{
            width: "34px", height: "34px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: "13px",
            fontWeight: 700,
            color: "#fff",
          }}>
            {user?.name?.charAt(0) ?? "U"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.name}
            </div>
            <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 500 }}>
              {user?.role}
            </div>
            {user?.location && (
              <div style={{
                fontSize: "9px",
                color: "#2563eb",
                fontWeight: 600,
                letterSpacing: "0.04em",
                marginTop: "1px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                📍 {user.location}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "7px",
            padding: "8px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
            color: "#64748b",
            transition: "all 0.12s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "#fef2f2";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#fca5a5";
            (e.currentTarget as HTMLButtonElement).style.color = "#dc2626";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0";
            (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
          }}
        >
          <LogOut size={13} />
          Sign Out
        </button>

        {/* System status */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px" }}>
          <div style={{
            width: "6px", height: "6px",
            borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 5px rgba(16,185,129,0.5)",
            flexShrink: 0,
          }} />
          <span style={{ fontSize: "10px", color: "#94a3b8" }}>System Online · v2.0 · SQLite</span>
        </div>
      </div>
    </aside>
  );
}
