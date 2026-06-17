import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, style, ...rest }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${error ? "rgba(239,68,68,0.4)" : "rgba(148,163,184,0.18)"}`,
          borderRadius: "8px",
          padding: "8px 12px",
          fontSize: "13px",
          color: "#f1f5f9",
          outline: "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          fontFamily: "inherit",
          ...style,
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLInputElement).style.borderColor = "rgba(59,130,246,0.5)";
          (e.currentTarget as HTMLInputElement).style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)";
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLInputElement).style.borderColor = error ? "rgba(239,68,68,0.4)" : "rgba(148,163,184,0.18)";
          (e.currentTarget as HTMLInputElement).style.boxShadow = "none";
        }}
        {...rest}
      />
      {error && (
        <span style={{ fontSize: "11px", color: "#f87171" }}>{error}</span>
      )}
    </div>
  );
}
