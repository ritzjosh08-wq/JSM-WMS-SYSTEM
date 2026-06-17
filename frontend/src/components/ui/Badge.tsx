import React from "react";

type Variant = "success" | "warning" | "danger" | "neutral" | "primary" | "info";

const variants: Record<Variant, { bg: string; text: string; border: string }> = {
  success: { bg: "rgba(16,185,129,0.15)",  text: "#34d399", border: "rgba(16,185,129,0.30)"  },
  warning: { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24", border: "rgba(245,158,11,0.30)"  },
  danger:  { bg: "rgba(239,68,68,0.15)",   text: "#f87171", border: "rgba(239,68,68,0.30)"   },
  neutral: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "rgba(100,116,139,0.25)" },
  primary: { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa", border: "rgba(59,130,246,0.30)"  },
  info:    { bg: "rgba(99,102,241,0.15)",  text: "#818cf8", border: "rgba(99,102,241,0.30)"  },
};

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
}

export function Badge({ variant = "neutral", children }: BadgeProps) {
  const v = variants[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "20px",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: v.bg,
        color: v.text,
        border: `1px solid ${v.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
