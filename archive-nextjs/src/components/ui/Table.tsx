import React from "react";

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
}

export function Table<T>({ data, columns, keyExtractor }: TableProps<T>) {
  return (
    <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid rgba(148,163,184,0.08)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(148,163,184,0.10)" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#475569",
                  textTransform: "uppercase",
                  letterSpacing: "0.10em",
                  whiteSpace: "nowrap",
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  textAlign: "center",
                  padding: "32px",
                  color: "#334155",
                  fontSize: "13px",
                }}
              >
                No data available
              </td>
            </tr>
          ) : (
            data.map((item, idx) => (
              <tr
                key={keyExtractor(item)}
                style={{
                  background: idx % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent",
                  borderBottom: "1px solid rgba(148,163,184,0.06)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = "rgba(59,130,246,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    idx % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent";
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ padding: "10px 14px", color: "#94a3b8", verticalAlign: "middle" }}
                  >
                    {col.render
                      ? col.render(item)
                      : String((item as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
