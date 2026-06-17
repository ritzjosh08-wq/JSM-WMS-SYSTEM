import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "JSM Logistics WMS — Control Tower",
  description: "Enterprise-grade dark Warehouse Management System for JSM Logistics Private Limited",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#0a0f1e",
        color: "#f1f5f9",
        fontFamily: "'Inter', sans-serif",
      }}>
        <Sidebar />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <Header />
          <main style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 32px",
            background: "#0a0f1e",
          }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
