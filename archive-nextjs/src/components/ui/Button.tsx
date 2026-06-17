import React from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary:   { background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff", border: "1px solid #3b82f6", boxShadow: "0 2px 8px rgba(59,130,246,0.3)" },
  secondary: { background: "rgba(255,255,255,0.05)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.18)" },
  danger:    { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.30)" },
  success:   { background: "rgba(16,185,129,0.12)", color: "#34d399", border: "1px solid rgba(16,185,129,0.30)" },
  ghost:     { background: "transparent", color: "#64748b", border: "1px solid transparent" },
};

const sizeStyles: Record<Size, React.CSSProperties> = {
  sm: { fontSize: "11px", padding: "4px 10px", borderRadius: "6px", fontWeight: 600 },
  md: { fontSize: "13px", padding: "7px 16px", borderRadius: "8px", fontWeight: 600 },
  lg: { fontSize: "14px", padding: "10px 22px", borderRadius: "10px", fontWeight: 700 },
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: React.ReactNode;
}

export function Button({ variant = "primary", size = "md", children, style, disabled, ...rest }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.45 : 1,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.15)";
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.filter = "";
        (e.currentTarget as HTMLButtonElement).style.transform = "";
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
