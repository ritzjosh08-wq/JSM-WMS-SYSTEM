const XLSX = require("xlsx");
const fs = require("fs");
const buf = fs.readFileSync("/sessions/ecstatic-fervent-thompson/mnt/uploads/INWARD Wareshouse ctvity for testing .xlsx");
const wb = XLSX.read(buf, { type: "buffer", raw: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
let headerRowIdx = 0;
for (let i = 0; i < Math.min(5, rawData.length); i++) {
  if (rawData[i].filter(c => String(c).trim()).length >= 3) { headerRowIdx = i; break; }
}
const headers = rawData[headerRowIdx].map(h => String(h).trim());
const rowsAfterHeader = rawData.slice(headerRowIdx + 1);
const dataRows = rowsAfterHeader.filter(r => r.filter(c => String(c).trim()).length >= 2);

const convertCell = (val, headerName) => {
  if (val === "" || val === null || val === undefined) return "";
  if (typeof val === "number") return val;
  if (typeof val === "string") return val.trim();
  return String(val).trim();
};
const parsedRows = dataRows.map(row => {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = convertCell(row[i], h); });
  return obj;
});

const toNum = v => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;
const row = parsedRows[0];
const rowLower = {};
Object.keys(row).forEach(k => { rowLower[k.toLowerCase().trim().replace(/\s+/g,' ')] = row[k]; });
const col = name => rowLower[name.toLowerCase().trim().replace(/\s+/g,' ')];

console.log("row keys:", Object.keys(row));
console.log("invPallets:", toNum(col("Invoice Qty in Pallet")));
console.log("invNos:", toNum(col("Invoice Qty in Nos")));
console.log("rcvPallets:", toNum(col("Received Qty In Pallets")));
console.log("rcvNos:", toNum(col("Received Qty In Nos")));
console.log("netWt:", toNum(col("Net Weight in Kg")));
