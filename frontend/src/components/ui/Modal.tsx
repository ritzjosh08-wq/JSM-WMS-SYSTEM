"use client";

import React from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  if (!isOpen) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a2235",
          border: "1px solid rgba(59,130,246,0.20)",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.8), 0 0 32px rgba(59,130,246,0.10)",
          overflow: "hidden",
          animation: "fadeSlideIn 0.18s ease-out",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(148,163,184,0.08)",
        }}>
          <h3 style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "#f1f5f9",
            margin: 0,
            letterSpacing: "0.01em",
          }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(148,163,184,0.12)",
              borderRadius: "6px",
              color: "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "5px",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(148,163,184,0.12)";
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>{children}</div>

        {/* Footer */}
        {footer && (
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "14px 20px",
            borderTop: "1px solid rgba(148,163,184,0.08)",
            background: "rgba(0,0,0,0.15)",
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
