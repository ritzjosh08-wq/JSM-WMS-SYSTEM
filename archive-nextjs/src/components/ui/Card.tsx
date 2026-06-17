import React from "react";

interface CardProps {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  glow?: boolean;
}

export function Card({ title, children, footer, className = "", glow = false }: CardProps) {
  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid rgba(148,163,184,0.10)",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: glow
          ? "0 4px 16px rgba(0,0,0,0.5), 0 0 20px rgba(59,130,246,0.08)"
          : "0 2px 8px rgba(0,0,0,0.4)",
      }}
      className={className}
    >
      {title && (
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid rgba(148,163,184,0.08)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "3px",
              height: "16px",
              background: "linear-gradient(180deg, #3b82f6, #1d4ed8)",
              borderRadius: "2px",
              flexShrink: 0,
            }}
          />
          <h2
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              margin: 0,
            }}
          >
            {title}
          </h2>
        </div>
      )}
      <div style={{ padding: "20px" }}>{children}</div>
      {footer && (
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid rgba(148,163,184,0.08)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
