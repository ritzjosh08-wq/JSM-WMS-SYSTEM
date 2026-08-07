import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileBarChart, Download, Calendar, RefreshCw, Trash2,
  ArrowDownToLine, ArrowUpFromLine, Package, ClipboardList,
  AlertTriangle, XCircle, Search, FileText, MonitorPlay, Loader
} from 'lucide-react';
import { useAuthStore, whQuery } from '../store/authStore';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:5001/api';

type ReportType = 'inward' | 'outward' | 'inventory' | 'cycle-count' | 'discrepancy' | 'cc-discrepancy';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Parse dates stored in both ISO (YYYY-MM-DD / DateTime) and DD-MM-YYYY / DD/MM/YYYY formats
function parseAnyDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  // Try DD-MM-YYYY or DD/MM/YYYY
  const ddmm = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/.exec(d.trim());
  if (ddmm) return new Date(Number(ddmm[3]), Number(ddmm[2]) - 1, Number(ddmm[1]));
  // Try ISO / standard
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const dt = parseAnyDate(d);
  if (!dt) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
// For Excel export — returns formatted date string ('' for empty/invalid so cells stay blank)
function fmtDateExport(d: string | null | undefined) {
  if (!d) return '';
  const dt = parseAnyDate(d);
  if (!dt) return typeof d === 'string' ? d : '';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function parseCF(s: string | null | undefined): any {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

function flattenDiscrepancy(rows: any[]): any[] {
  return rows.map(r => ({
    inwardNumber: r.inwardNumber, date: r.date, truckNumber: r.truckNumber,
    source: r.source, invoiceNumber: r.invoiceNumber,
    materialCode: r.materialCode, description: r.description, huUnit: r.huUnit,
    invoiceQtyInPallet: r.invoiceQtyInPallet, invoiceQtyInNos: r.invoiceQtyInNos,
    invoiceNetWeight: r.invoiceNetWeight, receivedQtyInPallets: r.receivedQtyInPallets,
    receivedQtyInNos: r.receivedQtyInNos, receivedNetWeight: r.receivedNetWeight,
    shortInPallet: r.shortInPallet, shortExcessInKg: r.shortExcessInKg,
    discrepancyRemarks: r.discrepancyRemarks,
  }));
}

function flattenCCDiscrepancy(rows: any[]): any[] {
  return rows.map(r => ({
    weekStart:     r.weekStart,
    scheduledDate: r.scheduledDate,
    warehouseCode: r.warehouseCode,
    warehouseName: r.warehouseName,
    locationType:  r.locationType,
    zone:          r.zone,
    binCode:       r.binCode,
    checkedBy:     r.checkedBy,
    checkedAt:     r.checkedAt ? new Date(r.checkedAt).toLocaleString('en-IN') : '—',
    completedBy:   r.completedBy,
    remarks:       r.remarks || '—',
  }));
}

function flattenForExport(rows: any[], type: ReportType): any[] {
  if (type === 'inward') {
    return rows.flatMap((entry: any) => {
      const { lineItems, customFields: eCF, ...h } = entry;
      const eExtra = parseCF(eCF);
      if (!lineItems?.length) return [{ ...h, ...eExtra }];
      return lineItems.map((item: any) => {
        const cf = parseCF(item.customFields);
        return {
          inwardNumber: h.inwardNumber, date: fmtDateExport(h.inwardDate || eExtra.date || h.createdAt),
          gateSerialNo: h.gateSerialNo, invoiceNumber: h.invoiceNumber,
          sapDocumentNo: h.sapDocumentNo, source: h.source, category: h.category,
          truckNumber: h.truckNumber, transporter: h.transporter,
          lrNumber: h.lrNumber, truckInTime: h.truckInTime,
          unloadStartTime: h.unloadStartTime, unloadEndTime: h.unloadEndTime,
          truckOutTime: h.truckOutTime, tat: h.tatStr, status: h.status,
          stockLocation: eExtra.stockLocation,
          materialCode: item.materialCode, description: item.description,
          huUnit: item.huUnit, binLocation: item.binLocation,
          quantity: item.quantity, lineItemStatus: item.lineItemStatus,
          invoiceQtyInPallet: cf.invoiceQtyInPallet, invoiceQtyInNos: cf.invoiceQtyInNos,
          invoiceNetWeight: cf.invoiceNetWeight, receivedQtyInPallets: cf.receivedQtyInPallets,
          receivedQtyInNos: cf.receivedQtyInNos, receivedNetWeight: cf.receivedNetWeight,
          numberOfBoxes: cf.numberOfBoxes, shortInPallet: cf.shortInPallet,
          shortExcessInQty: cf.shortExcessInQty, shortExcessInKg: cf.shortExcessInKg,
          discrepancyRemarks: cf.discrepancyRemarks,
        };
      });
    });
  }
  if (type === 'outward') {
    return rows.flatMap((entry: any) => {
      const { lineItems, ...h } = entry;
      // remarks format: "Source: X | LR: Y"
      const remarkParts: Record<string,string> = {};
      (h.remarks || '').split(' | ').forEach((p: string) => {
        const [k, ...v] = p.split(': ');
        if (k) remarkParts[k.trim()] = v.join(': ').trim();
      });
      const src = remarkParts['Source'] || '';
      const lrNumber = remarkParts['LR'] || h.lrNumber || '';
      if (!lineItems?.length) return [{ ...h, source: src, lrNumber }];
      return lineItems.map((item: any) => {
        const cf = parseCF(item.customFields);
        return {
          outwardNumber: h.outwardNumber, dispatchDate: fmtDateExport(h.dispatchDate || h.createdAt),
          truckNumber: h.truckNumber, transporter: h.transporter,
          source: src, destination: h.destination,
          sapDocumentNo: h.sapDocumentNo, lrNumber, status: h.status,
          loaded: h.loaded ? 'Loaded' : 'Not Loaded',
          materialCode: item.materialCode, description: cf.description || item.description,
          materialType: cf.materialType, huUnit: cf.huUnit, category: cf.category,
          invoiceNo: cf.invoiceNo || item.batchNumber, stockLocation: cf.stockLocation,
          pickedQty: item.pickedQty,
        };
      });
    });
  }
  if (type === 'inventory') {
    return rows.map((item: any) => {
      const cf = parseCF(item.customFields);
      return {
        materialCode:        item.material?.code,
        description:         item.material?.description,
        category:            cf.category || item.material?.category,
        materialType:        cf.materialType || item.material?.materialType,
        huUnit:              cf.huUnit || item.material?.huUnit,
        invoiceNo:           cf.invoiceNo || item.batchNumber,
        quantity:            item.quantity,
        invoiceQtyInNos:     cf.invoiceQtyInNos,
        receivedQtyInNos:    cf.receivedQtyInNos,
        netWeight:           cf.netWeight,
        invoiceNetWeight:    cf.invoiceNetWeight,
        receivedNetWeight:   cf.receivedNetWeight,
        pallets:             cf.pallets,
        invoiceQtyInPallet:  cf.invoiceQtyInPallet,
        receivedQtyInPallets:cf.receivedQtyInPallets,
        numberOfBoxes:       cf.numberOfBoxes,
        binLocation:         cf.binLocation,
        stockLocation:       cf.stockLocation,
        inwardDate:          fmtDateExport(cf.inwardDate || item.receiptDate),
        sapDocNo:            cf.sapDocNo,
        gateSerialNo:        cf.gateSerialNo,
        source:              cf.source,
        createdBy:           cf.createdBy,
        shortInPallet:       cf.shortInPallet,
        shortExcessInKg:     cf.shortExcessInKg,
        shortExcessInQty:    cf.shortExcessInQty,
        discrepancyRemarks:  cf.discrepancyRemarks,
        tatRemarks:          cf.tatRemarks,
        stockStatus:         item.stockStatus,
      };
    });
  }
  if (type === 'cycle-count') {
    return rows.map((r: any) => ({
      weekStart:        r.weekStart,
      weekEnd:          r.weekEnd,
      warehouseCode:    r.warehouseCode,
      warehouseName:    r.warehouseName,
      totalLocations:   r.totalBins,
      checkedOK:        r.okCount,
      discrepancies:    r.discrepancyCount,
      unchecked:        r.uncheckedCount,
      completedOn:      r.completedAt ? new Date(r.completedAt).toLocaleString('en-IN') : '—',
      status:           r.status,
    }));
  }
  if (type === 'discrepancy')    return flattenDiscrepancy(rows);
  if (type === 'cc-discrepancy') return flattenCCDiscrepancy(rows);
  return rows;
}

// Numeric fields to sum per report type for the totals row
const TOTAL_FIELDS: Partial<Record<ReportType, string[]>> = {
  inward: ['invoiceQtyInPallet','receivedQtyInPallets','invoiceNetWeight','receivedNetWeight','numberOfBoxes','shortInPallet','shortExcessInQty','shortExcessInKg'],
  outward: ['pickedQty'],
  inventory: ['quantity','pallets','netWeight','numberOfBoxes','invoiceQtyInNos','receivedQtyInNos','invoiceNetWeight','receivedNetWeight','invoiceQtyInPallet','receivedQtyInPallets','shortInPallet','shortExcessInQty','shortExcessInKg'],
  discrepancy: ['invoiceQtyInPallet','receivedQtyInPallets','invoiceNetWeight','receivedNetWeight','shortInPallet','shortExcessInQty','shortExcessInKg'],
};

function appendTotalsRow(flat: any[], type: ReportType): any[] {
  const fields = TOTAL_FIELDS[type];
  if (!fields || !flat.length) return flat;
  const totals: any = { _isTotal: true };
  // Use first key as label
  const keys = Object.keys(flat[0]);
  keys.forEach((k, i) => {
    if (i === 0) { totals[k] = 'TOTAL'; return; }
    if (fields.includes(k)) {
      totals[k] = flat.reduce((sum, r) => sum + (Number(r[k]) || 0), 0);
    } else {
      totals[k] = '';
    }
  });
  return [...flat, totals];
}

function exportXLSX(rows: any[], type: ReportType, label: string) {
  const flat = appendTotalsRow(flattenForExport(rows, type), type);
  const ws = XLSX.utils.json_to_sheet(flat.map(r => { const {_isTotal, ...rest} = r; return rest; }));
  // Bold the last (totals) row
  const totalRowIdx = flat.length; // 1-indexed with header
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: totalRowIdx, c })];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'EFF6FF' } } };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, label);
  XLSX.writeFile(wb, `JSM_${label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportCSV(rows: any[], type: ReportType, label: string) {
  const flat = appendTotalsRow(flattenForExport(rows, type), type);
  const ws = XLSX.utils.json_to_sheet(flat.map(r => { const {_isTotal, ...rest} = r; return rest; }));
  const csv = XLSX.utils.sheet_to_csv(ws);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `JSM_${label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function exportPDF(rows: any[], type: ReportType, label: string, dateFrom: string, dateTo: string) {
  const flat = flattenForExport(rows, type);
  if (!flat.length) return;
  const withTotals = appendTotalsRow(flat, type);
  const cols = Object.keys(flat[0]);
  const colStyle = `padding:5px 8px;border:1px solid #cbd5e1;font-size:9px;white-space:nowrap;`;
  const thStyle  = `${colStyle}background:#1e40af;color:#fff;font-weight:700;text-align:left;`;
  const headerRow = `<tr>${cols.map(c => `<th style="${thStyle}">${c}</th>`).join('')}</tr>`;
  const bodyRows = flat.map((row, i) =>
    `<tr>${cols.map(c => `<td style="${colStyle}background:${i%2===0?'#f8fafc':'#fff'};">${row[c]==null?'':String(row[c]).slice(0,60)}</td>`).join('')}</tr>`
  ).join('');
  const totalsRow = withTotals.length > flat.length
    ? `<tr style="background:#eff6ff;font-weight:800;">${cols.map(c => { const v = withTotals[withTotals.length-1][c]; return `<td style="${colStyle}color:#1e3a8a;">${v==null||v===''?'':typeof v==='number'?Number(v).toFixed(2):String(v)}</td>`; }).join('')}</tr>`
    : '';
  const dr = (dateFrom || dateTo) ? `${dateFrom||'—'} to ${dateTo||'—'}` : 'All dates';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${label}</title>
<style>@page{size:A3 landscape;margin:0}body{font-family:Arial,sans-serif;padding:14mm 15mm;box-sizing:border-box}
h2{margin:0 0 4px;font-size:16px;color:#1e40af}p{margin:0 0 10px;font-size:11px;color:#64748b}
table{border-collapse:collapse;width:100%}@media print{button{display:none}}</style>
</head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px">
<div><h2>JSM Logistics — ${label}</h2><p>${dr} · ${flat.length} records · Generated ${new Date().toLocaleString('en-IN')}</p></div>
<button onclick="window.print()" style="padding:6px 16px;background:#1e40af;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700">🖨 Print</button>
</div><table><thead>${headerRow}</thead><tbody>${bodyRows}${totalsRow}</tbody></table></body></html>`;
  const win = window.open('', '_blank');
  if (!win) { alert('Allow pop-ups to export PDF'); return; }
  win.document.write(html); win.document.close();
  win.onload = () => win.print();
}

// ─── Report configs ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'inward'      as ReportType, label: 'Inward Report',      icon: ArrowDownToLine,  color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', endpoint: '/inward' },
  { id: 'outward'     as ReportType, label: 'Outward Report',     icon: ArrowUpFromLine,  color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', endpoint: '/outward' },
  { id: 'inventory'   as ReportType, label: 'Inventory Report',   icon: Package,          color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', endpoint: '/inventory' },
  { id: 'cycle-count'  as ReportType, label: 'Cycle Count Report',  icon: ClipboardList, color: '#d97706', bg: '#fffbeb', border: '#fde68a', endpoint: '/cycle-count/records' },
  { id: 'discrepancy'    as ReportType, label: 'Inward Discrepancy',    icon: AlertTriangle, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', endpoint: '/inward/discrepancies' },
  { id: 'cc-discrepancy' as ReportType, label: 'Cycle Count Discrepancy', icon: XCircle,      color: '#be185d', bg: '#fdf2f8', border: '#f9a8d4', endpoint: '/cycle-count/discrepancy-report' },
];

// ─── Delete endpoint per type ─────────────────────────────────────────────────
function deleteEndpoint(type: ReportType, id: string) {
  if (type === 'inward')       return `/inward/${id}`;
  if (type === 'outward')      return `/outward/${id}`;
  if (type === 'inventory')    return `/inventory/${id}`;
  if (type === 'cycle-count')  return `/cycle-count/${id}`;
  if (type === 'discrepancy')  return `/inward/line-item/${id}`;
  return '';
}

// ─── Row renderers ────────────────────────────────────────────────────────────
const TD: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' };
const TH: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap', background: '#f8fafc' };

function InwardTable({ rows, onDelete, canDelete }: { rows: any[]; onDelete: (id: string) => void; canDelete?: boolean }) {
  const totals = rows.reduce((acc, entry) => {
    (entry.lineItems || []).forEach((item: any) => {
      const cf = parseCF(item?.customFields);
      acc.invPallets  += Number(cf.invoiceQtyInPallet)  || 0;
      acc.rcvPallets  += Number(cf.receivedQtyInPallets)|| 0;
      acc.invWt       += Number(cf.invoiceNetWeight)    || 0;
      acc.rcvWt       += Number(cf.receivedNetWeight)   || 0;
      acc.shortPlt    += Number(cf.shortInPallet)       || 0;
      acc.shortKg     += Number(cf.shortExcessInKg)     || 0;
    });
    return acc;
  }, { invPallets:0, rcvPallets:0, invWt:0, rcvWt:0, shortPlt:0, shortKg:0 });

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        {[
          'Inward No.','Date','Truck','Transporter','Source','Invoice No.','SAP Doc','LR No.','Stock Location',
          'Material Code','Description','Type of Material','HU Unit','Category',
          'Invoice Pallets','Invoice Nos','Invoice Wt (kg)',
          'Received Pallets','Received Nos','Received Wt (kg)',
          'Short Pallets','Short/Excess Kg',
          'Status',''
        ].map(h => <th key={h} style={TH}>{h}</th>)}
      </tr></thead>
      <tbody>{rows.map((entry: any, ei) => {
        const eCF = parseCF(entry.customFields);
        const lineItems: any[] = entry.lineItems?.length ? entry.lineItems : [null];
        const rowBg = ei % 2 === 0 ? '#fff' : '#f8fafc';
        return lineItems.map((item: any, li) => {
          const cf = item ? parseCF(item.customFields) : {};
          const isFirst = li === 0;
          const spanCount = lineItems.length;
          const isFG = String(item?.category || entry.category || '').toUpperCase().includes('FG');
          return (
            <tr key={`${entry.id}-${li}`} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
              {/* ── Entry-level columns (rowspan) */}
              {isFirst && <>
                <td style={{...TD,fontFamily:'monospace',fontWeight:700,color:'#1e40af',verticalAlign:'middle'}} rowSpan={spanCount}>{entry.inwardNumber}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{fmtDate(entry.inwardDate || eCF.date || entry.createdAt)}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{entry.truckNumber||'—'}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{entry.transporter||'—'}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{entry.source||'—'}</td>
                <td style={{...TD,fontFamily:'monospace',verticalAlign:'middle'}} rowSpan={spanCount}>{entry.invoiceNumber||'—'}</td>
                <td style={{...TD,fontFamily:'monospace',verticalAlign:'middle'}} rowSpan={spanCount}>{entry.sapDocumentNo||'—'}</td>
                <td style={{...TD,fontFamily:'monospace',verticalAlign:'middle'}} rowSpan={spanCount}>{entry.lrNumber||'—'}</td>
                <td style={{...TD,color:'#7c3aed',fontWeight:600,verticalAlign:'middle'}} rowSpan={spanCount}>{eCF.stockLocation||'—'}</td>
              </>}
              {/* ── Line-item columns */}
              {item ? <>
                <td style={{...TD,fontFamily:'monospace',fontWeight:700,color:'#1e40af'}}>{item.materialCode||'—'}</td>
                <td style={{...TD,minWidth:'180px',whiteSpace:'normal',wordBreak:'break-word'}}>{item.description||'—'}</td>
                <td style={TD}>{cf.materialType||'—'}</td>
                <td style={{...TD,fontWeight:700,color:'#1e40af'}}>{item.huUnit||cf.huUnit||'—'}</td>
                <td style={{...TD}}>
                  <span style={{background:isFG?'#f5f3ff':'#ecfdf5',color:isFG?'#7c3aed':'#059669',border:`1px solid ${isFG?'#ddd6fe':'#a7f3d0'}`,borderRadius:'20px',padding:'1px 8px',fontSize:'10px',fontWeight:700}}>
                    {item.category||entry.category||'—'}
                  </span>
                </td>
                <td style={{...TD,textAlign:'right',fontWeight:700}}>{cf.invoiceQtyInPallet??'—'}</td>
                <td style={{...TD,textAlign:'right'}}>{cf.invoiceQtyInNos??'—'}</td>
                <td style={{...TD,textAlign:'right'}}>{cf.invoiceNetWeight!=null?Number(cf.invoiceNetWeight).toFixed(2):'—'}</td>
                <td style={{...TD,textAlign:'right',fontWeight:700}}>{cf.receivedQtyInPallets??'—'}</td>
                <td style={{...TD,textAlign:'right'}}>{cf.receivedQtyInNos??'—'}</td>
                <td style={{...TD,textAlign:'right'}}>{cf.receivedNetWeight!=null?Number(cf.receivedNetWeight).toFixed(2):'—'}</td>
                <td style={{...TD,textAlign:'right',fontWeight:700,color:(cf.shortInPallet&&cf.shortInPallet!==0)?'#dc2626':'#374151'}}>{cf.shortInPallet??'—'}</td>
                <td style={{...TD,textAlign:'right',fontWeight:700,color:(cf.shortExcessInKg&&cf.shortExcessInKg!==0)?'#dc2626':'#374151'}}>{cf.shortExcessInKg!=null?Number(cf.shortExcessInKg).toFixed(2):'—'}</td>
              </> : <>
                <td colSpan={14} style={{...TD,color:'#94a3b8',fontStyle:'italic'}}>No line items</td>
              </>}
              {/* ── Status + delete (rowspan) */}
              {isFirst && <>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>
                  <span style={{
                    background: entry.status==='COMPLETED'?'#ecfdf5':entry.status==='DISCREPANCY'?'#fef2f2':'#fffbeb',
                    color:      entry.status==='COMPLETED'?'#059669':entry.status==='DISCREPANCY'?'#dc2626':'#d97706',
                    border:     `1px solid ${entry.status==='COMPLETED'?'#a7f3d0':entry.status==='DISCREPANCY'?'#fca5a5':'#fde68a'}`,
                    borderRadius:'20px',padding:'1px 8px',fontSize:'10px',fontWeight:700
                  }}>{entry.status}</span>
                </td>
                <td style={{...TD,textAlign:'center',verticalAlign:'middle'}} rowSpan={spanCount}>
                  <DeleteBtn onDelete={() => onDelete(entry.id)} canDelete={canDelete} />
                </td>
              </>}
            </tr>
          );
        });
      })}
      </tbody>
      <tfoot>
        <tr style={{background:'#eff6ff',fontWeight:800,borderTop:'2px solid #bfdbfe'}}>
          <td style={{...TD,color:'#1e3a8a'}} colSpan={9}>TOTAL ({rows.length} entries)</td>
          <td colSpan={5} style={TD}></td>
          <td style={{...TD,textAlign:'right',color:'#1e3a8a'}}>{totals.invPallets.toFixed(2)}</td>
          <td style={TD}></td>
          <td style={{...TD,textAlign:'right',color:'#1e3a8a'}}>{totals.invWt.toFixed(2)}</td>
          <td style={{...TD,textAlign:'right',color:'#1e3a8a'}}>{totals.rcvPallets.toFixed(2)}</td>
          <td style={TD}></td>
          <td style={{...TD,textAlign:'right',color:'#1e3a8a'}}>{totals.rcvWt.toFixed(2)}</td>
          <td style={{...TD,textAlign:'right',color:'#dc2626'}}>{totals.shortPlt.toFixed(2)}</td>
          <td style={{...TD,textAlign:'right',color:'#dc2626'}}>{totals.shortKg.toFixed(2)}</td>
          <td colSpan={2} style={TD}></td>
        </tr>
      </tfoot>
    </table>
  );
}

function OutwardTable({ rows, onDelete, canDelete, onToggleLoaded }: { rows: any[]; onDelete: (id: string) => void; canDelete?: boolean; onToggleLoaded?: (id: string, loaded: boolean) => void }) {
  const totalPickedQty = rows.reduce((sum, entry) =>
    sum + (entry.lineItems||[]).reduce((s: number, item: any) => s + (Number(item?.pickedQty)||0), 0), 0);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        {['Outward No.','Date','Truck','Transporter','Source','Destination','SAP Doc','LR No.','Material Code','Description','Type of Material','HU Unit','Invoice No.','Stock Location','Picked Qty','Status','Loaded',''].map(h =>
          <th key={h} style={TH}>{h}</th>)}
      </tr></thead>
      <tbody>{rows.map((entry: any, ei) => {
        // remarks format: "Source: X | LR: Y"
        const remarkMap: Record<string,string> = {};
        (entry.remarks || '').split(' | ').forEach((p: string) => {
          const idx = p.indexOf(': ');
          if (idx !== -1) remarkMap[p.slice(0, idx).trim()] = p.slice(idx + 2).trim();
        });
        const src = remarkMap['Source'] || '';
        const lrNum = remarkMap['LR'] || entry.lrNumber || '';
        const lineItems: any[] = entry.lineItems?.length ? entry.lineItems : [null];
        return lineItems.map((item: any, li) => {
          const cf = item ? parseCF(item.customFields) : {};
          const rowBg = ei % 2 === 0 ? '#fff' : '#f8fafc';
          const isFirst = li === 0;
          const spanCount = lineItems.length;
          return (
            <tr key={`${entry.id}-${li}`} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
              {isFirst && <>
                <td style={{...TD,fontFamily:'monospace',fontWeight:700,color:'#059669',verticalAlign:'middle'}} rowSpan={spanCount}>{entry.outwardNumber}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{fmtDate(entry.dispatchDate||entry.createdAt)}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{entry.truckNumber||'—'}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{entry.transporter||'—'}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{src||'—'}</td>
                <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>{entry.destination||'—'}</td>
                <td style={{...TD,fontFamily:'monospace',verticalAlign:'middle'}} rowSpan={spanCount}>{entry.sapDocumentNo||'—'}</td>
                <td style={{...TD,fontFamily:'monospace',verticalAlign:'middle'}} rowSpan={spanCount}>{lrNum||'—'}</td>
              </>}
              {item ? <>
                <td style={{...TD,fontFamily:'monospace',fontWeight:700,color:'#1e40af'}}>{item.materialCode||'—'}</td>
                <td style={{...TD,minWidth:'180px',whiteSpace:'normal',wordBreak:'break-word'}}>{cf.description||item.description||'—'}</td>
                <td style={TD}>{cf.materialType||'—'}</td>
                <td style={{...TD,fontWeight:700,color:'#1e40af'}}>{cf.huUnit||'—'}</td>
                <td style={{...TD,fontFamily:'monospace',fontSize:'10px'}}>{cf.invoiceNo||item.batchNumber||'—'}</td>
                <td style={{...TD,color:'#7c3aed',fontWeight:600}}>{cf.stockLocation||'—'}</td>
                <td style={{...TD,textAlign:'right',fontWeight:800,color:'#059669'}}>{item.pickedQty!=null?Number(item.pickedQty).toFixed(2):'—'}</td>
              </> : <>
                <td colSpan={7} style={{...TD,color:'#94a3b8',fontStyle:'italic'}}>No line items</td>
              </>}
              {isFirst && (
                <>
                  <td style={{...TD,verticalAlign:'middle'}} rowSpan={spanCount}>
                    <span style={{background:'#ecfdf5',color:'#059669',border:'1px solid #a7f3d0',borderRadius:'20px',padding:'1px 8px',fontSize:'10px',fontWeight:700}}>{entry.status}</span>
                  </td>
                  <td style={{...TD,textAlign:'center',verticalAlign:'middle'}} rowSpan={spanCount}>
                    <button
                      onClick={() => onToggleLoaded && onToggleLoaded(entry.id, !entry.loaded)}
                      title={entry.loaded ? 'Click to mark as not loaded' : 'Click to mark as loaded onto truck'}
                      style={{
                        background: entry.loaded ? '#ecfdf5' : '#fef3c7',
                        color: entry.loaded ? '#059669' : '#b45309',
                        border: entry.loaded ? '1px solid #a7f3d0' : '1px solid #fde68a',
                        borderRadius: '20px', padding: '3px 10px', fontSize: '10px', fontWeight: 700,
                        cursor: onToggleLoaded ? 'pointer' : 'default',
                      }}
                    >
                      {entry.loaded ? '✓ Loaded' : 'Not Loaded'}
                    </button>
                  </td>
                  <td style={{...TD,textAlign:'center',verticalAlign:'middle'}} rowSpan={spanCount}>
                    <DeleteBtn onDelete={() => onDelete(entry.id)} canDelete={canDelete} />
                  </td>
                </>
              )}
            </tr>
          );
        });
      })}
      </tbody>
      <tfoot>
        <tr style={{background:'#ecfdf5',fontWeight:800,borderTop:'2px solid #a7f3d0'}}>
          <td style={{...TD,color:'#065f46'}} colSpan={14}>TOTAL ({rows.length} dispatches)</td>
          <td style={{...TD,textAlign:'right',color:'#065f46'}}>{totalPickedQty.toFixed(2)}</td>
          <td colSpan={3} style={TD}></td>
        </tr>
      </tfoot>
    </table>
  );
}

function InventoryTable({ rows, onDelete, canDelete }: { rows: any[]; onDelete: (id: string) => void; canDelete?: boolean }) {
  const totals = rows.reduce((acc, r) => {
    const cf = parseCF(r.customFields);
    return {
      invoiceQtyInPallet:   acc.invoiceQtyInPallet   + (Number(cf.invoiceQtyInPallet)||0),
      receivedQtyInPallets: acc.receivedQtyInPallets + (Number(cf.receivedQtyInPallets)||0),
      invoiceNetWeight:     acc.invoiceNetWeight     + (Number(cf.invoiceNetWeight)||0),
      receivedNetWeight:    acc.receivedNetWeight    + (Number(cf.receivedNetWeight)||0),
    };
  }, { invoiceQtyInPallet: 0, receivedQtyInPallets: 0, invoiceNetWeight: 0, receivedNetWeight: 0 });
  const headers = [
    'Material Code','Description','Category','Type of Material','HU Unit',
    'Invoice No.','SAP Doc No','Gate Serial',
    'Invoice Plt','Rcvd Plt','Invoice Nos','Rcvd Nos','Invoice Wt (kg)','Rcvd Wt (kg)',
    'BIN','Stock Location','Inward Date','Created By',
    'Short Pallet','Short/Excess Qty','Short/Excess Kg','Discrepancy Remarks','TAT Remarks',
    'Status','',
  ];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{headers.map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => {
        const cf = parseCF(r.customFields);
        const matType = cf.materialType || r.material?.materialType || '—';
        const isDisc = !!(cf.discrepancy || r.stockStatus === 'DISCREPANCY' ||
          Number(cf.shortInPallet||0) !== 0 || Number(cf.shortExcessInKg||0) !== 0 ||
          Number(cf.shortExcessInQty||0) !== 0 || cf.discrepancyRemarks);
        const rowBg = isDisc ? '#fff5f5' : (i%2===0 ? '#fff' : '#f8fafc');
        const statusBg = r.stockStatus==='GOOD'?'#ecfdf5':r.stockStatus==='DISCREPANCY'?'#fef2f2':'#fef2f2';
        const statusColor = r.stockStatus==='GOOD'?'#059669':r.stockStatus==='DISCREPANCY'?'#b91c1c':'#dc2626';
        const statusBorder = r.stockStatus==='GOOD'?'#a7f3d0':r.stockStatus==='DISCREPANCY'?'#f87171':'#fecaca';
        return (
          <tr key={r.id} style={{ background: rowBg, borderLeft: isDisc ? '3px solid #dc2626' : '3px solid transparent' }}>
            <td style={{...TD,fontFamily:'monospace',fontWeight:700,color:'#1e40af'}}>{r.material?.code||'—'}</td>
            <td style={{...TD,minWidth:'180px',whiteSpace:'normal',wordBreak:'break-word'}}>{r.material?.description||'—'}</td>
            <td style={TD}><span style={{background:String(cf.category||'').includes('FG')?'#f5f3ff':'#ecfdf5',color:String(cf.category||'').includes('FG')?'#7c3aed':'#059669',border:`1px solid ${String(cf.category||'').includes('FG')?'#ddd6fe':'#a7f3d0'}`,borderRadius:'20px',padding:'1px 8px',fontSize:'10px',fontWeight:700}}>{cf.category||r.material?.category||'—'}</span></td>
            <td style={{...TD,color:'#0891b2',fontWeight:600}}>{matType}</td>
            <td style={TD}>{cf.huUnit||r.material?.huUnit||'—'}</td>
            <td style={{...TD,fontFamily:'monospace',fontSize:'10px'}}>{cf.invoiceNo||r.batchNumber||'—'}</td>
            <td style={{...TD,fontFamily:'monospace',fontSize:'10px'}}>{cf.sapDocNo||'—'}</td>
            <td style={{...TD,fontFamily:'monospace',fontSize:'10px'}}>{cf.gateSerialNo||'—'}</td>
            <td style={{...TD,textAlign:'right'}}>{cf.invoiceQtyInPallet||'—'}</td>
            <td style={{...TD,textAlign:'right'}}>{cf.receivedQtyInPallets||'—'}</td>
            <td style={{...TD,textAlign:'right'}}>{cf.invoiceQtyInNos||'—'}</td>
            <td style={{...TD,textAlign:'right'}}>{cf.receivedQtyInNos||'—'}</td>
            <td style={{...TD,textAlign:'right'}}>{cf.invoiceNetWeight?`${Number(cf.invoiceNetWeight).toFixed(2)}`:'—'}</td>
            <td style={{...TD,textAlign:'right'}}>{cf.receivedNetWeight?`${Number(cf.receivedNetWeight).toFixed(2)}`:'—'}</td>
            <td style={{...TD,fontFamily:'monospace',color:'#7c3aed'}}>{cf.binLocation||'—'}</td>
            <td style={TD}>{cf.stockLocation||'—'}</td>
            <td style={TD}>{cf.inwardDate || fmtDate(r.receiptDate)}</td>
            <td style={TD}>{cf.createdBy||'—'}</td>
            <td style={{...TD,textAlign:'right',color:Number(cf.shortInPallet||0)!==0?'#b91c1c':'#374151',fontWeight:Number(cf.shortInPallet||0)!==0?700:400}}>{cf.shortInPallet||'—'}</td>
            <td style={{...TD,textAlign:'right',color:Number(cf.shortExcessInQty||0)!==0?'#b91c1c':'#374151',fontWeight:Number(cf.shortExcessInQty||0)!==0?700:400}}>{cf.shortExcessInQty||'—'}</td>
            <td style={{...TD,textAlign:'right',color:Number(cf.shortExcessInKg||0)!==0?'#b91c1c':'#374151',fontWeight:Number(cf.shortExcessInKg||0)!==0?700:400}}>{cf.shortExcessInKg||'—'}</td>
            <td style={{...TD,color:'#b91c1c',maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis'}}>{cf.discrepancyRemarks||'—'}</td>
            <td style={{...TD,maxWidth:'120px',overflow:'hidden',textOverflow:'ellipsis'}}>{cf.tatRemarks||'—'}</td>
            <td style={TD}><span style={{background:statusBg,color:statusColor,border:`1px solid ${statusBorder}`,borderRadius:'20px',padding:'1px 8px',fontSize:'10px',fontWeight:700}}>{r.stockStatus}</span></td>
            <td style={{...TD,textAlign:'center'}}><DeleteBtn onDelete={() => onDelete(r.id)} canDelete={canDelete} /></td>
          </tr>
        );
      })}
      </tbody>
      <tfoot>
        <tr style={{background:'#eff6ff',fontWeight:800,borderTop:'2px solid #bfdbfe'}}>
          <td style={{...TD,color:'#1e3a8a'}} colSpan={8}>TOTAL ({rows.length} items)</td>
          <td style={{...TD,textAlign:'right',color:'#1e3a8a'}}>{totals.invoiceQtyInPallet.toFixed(0)}</td>
          <td style={{...TD,textAlign:'right',color:'#1e3a8a'}}>{totals.receivedQtyInPallets.toFixed(0)}</td>
          <td colSpan={2} style={TD}></td>
          <td style={{...TD,textAlign:'right',color:'#1e3a8a'}}>{totals.invoiceNetWeight.toFixed(2)} kg</td>
          <td style={{...TD,textAlign:'right',color:'#1e3a8a'}}>{totals.receivedNetWeight.toFixed(2)} kg</td>
          <td colSpan={11} style={TD}></td>
        </tr>
      </tfoot>
    </table>
  );
}

function CycleCountTable({ rows }: { rows: any[] }) {
  // Totals across all completed weeks
  const totals = rows.reduce((acc, r) => ({
    totalBins:        acc.totalBins        + (Number(r.totalBins)        || 0),
    okCount:          acc.okCount          + (Number(r.okCount)          || 0),
    discrepancyCount: acc.discrepancyCount + (Number(r.discrepancyCount) || 0),
    uncheckedCount:   acc.uncheckedCount   + (Number(r.uncheckedCount)   || 0),
  }), { totalBins: 0, okCount: 0, discrepancyCount: 0, uncheckedCount: 0 });

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        {['Week (Mon–Sat)','Warehouse','Total Locations','Checked OK','Discrepancies','Unchecked','Completed On','Status'].map(h =>
          <th key={h} style={TH}>{h}</th>)}
      </tr></thead>
      <tbody>{rows.map((r, i) => {
        const pct    = r.totalBins > 0 ? Math.round((r.okCount / r.totalBins) * 100) : 0;
        const hasDisc = r.discrepancyCount > 0;
        return (
          <tr key={r.id} style={{ background: i%2===0?'#fff':'#f8fafc', borderLeft: hasDisc ? '3px solid #d97706' : '3px solid #a7f3d0' }}>
            <td style={{...TD, fontFamily:'monospace', fontWeight:700, color:'#d97706'}}>
              {r.weekStart} → {r.weekEnd}
            </td>
            <td style={{...TD, fontWeight:700, color:'#7c3aed'}}>
              {r.warehouseCode}
              <span style={{fontWeight:400,color:'#94a3b8',fontSize:'10px',display:'block'}}>{r.warehouseName}</span>
            </td>
            <td style={{...TD, textAlign:'right', fontWeight:700}}>{r.totalBins}</td>
            <td style={{...TD, textAlign:'right', fontWeight:800, color:'#059669'}}>
              {r.okCount}
              <span style={{fontWeight:400,color:'#94a3b8',fontSize:'10px'}}> ({pct}%)</span>
            </td>
            <td style={{...TD, textAlign:'right', fontWeight:800, color: hasDisc ? '#dc2626' : '#059669'}}>
              {r.discrepancyCount}
            </td>
            <td style={{...TD, textAlign:'right', fontWeight:700, color: r.uncheckedCount > 0 ? '#b45309' : '#059669'}}>
              {r.uncheckedCount}
            </td>
            <td style={{...TD, fontSize:'11px'}}>
              {r.completedAt ? new Date(r.completedAt).toLocaleString('en-IN') : '—'}
            </td>
            <td style={TD}>
              <span style={{
                background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0',
                borderRadius:'20px', padding:'1px 8px', fontSize:'10px', fontWeight:700
              }}>COMPLETED</span>
            </td>
          </tr>
        );
      })}</tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr style={{background:'#fffbeb',fontWeight:800,borderTop:'2px solid #fde68a'}}>
            <td style={{...TD,color:'#92400e'}} colSpan={2}>TOTAL ({rows.length} completed week{rows.length!==1?'s':''})</td>
            <td style={{...TD,textAlign:'right',color:'#92400e'}}>{totals.totalBins}</td>
            <td style={{...TD,textAlign:'right',color:'#059669'}}>{totals.okCount}</td>
            <td style={{...TD,textAlign:'right',color:totals.discrepancyCount>0?'#dc2626':'#059669'}}>{totals.discrepancyCount}</td>
            <td style={{...TD,textAlign:'right',color:totals.uncheckedCount>0?'#b45309':'#059669'}}>{totals.uncheckedCount}</td>
            <td colSpan={2} style={TD}></td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function DiscrepancyTable({ rows, onDelete, canDelete }: { rows: any[]; onDelete: (id: string) => void; canDelete?: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        {['Inward No.','Date','Truck','Source','Invoice No.','Material Code','Type of Material','Description','HU Unit',
          'Inv Qty (Plt)','Inv Qty (Nos)','Inv Wt (kg)','Rcvd (Plt)','Rcvd (Nos)','Rcvd Wt (kg)',
          'Short (Plt)','Short/Excess (Qty)','Short/Excess (kg)','Remarks',''].map(h => <th key={h} style={TH}>{h}</th>)}
      </tr></thead>
      <tbody>{rows.map((r, i) => {
        const isShort = Number(r.shortInPallet || 0) < 0 || Number(r.shortExcessInKg || 0) < 0;
        // Short (missing stock) is the more urgent case than excess — give it a slightly
        // stronger tint so it stands out from ordinary excess/discrepancy rows at a glance.
        const rowBg = isShort ? '#fef2f2' : i % 2 === 0 ? '#fff' : '#fef9f9';
        return (
          <tr key={r.id} style={{ background: rowBg }}>
            <td style={{...TD, fontFamily:'monospace', fontWeight:700, color:'#2563eb'}}>{r.inwardNumber}</td>
            <td style={TD}>{fmtDate(r.date)}</td>
            <td style={TD}>{r.truckNumber || '—'}</td>
            <td style={TD}>{r.source || '—'}</td>
            <td style={{...TD, fontFamily:'monospace', fontSize:'10px'}}>{r.invoiceNumber || '—'}</td>
            <td style={{...TD, fontFamily:'monospace', fontWeight:700, color:'#1e40af'}}>{r.materialCode}</td>
            <td style={{...TD, color:'#0891b2', fontWeight:600}}>{r.materialType || '—'}</td>
            <td style={{...TD, maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis'}}>{r.description || '—'}</td>
            <td style={TD}>{r.huUnit || '—'}</td>
            <td style={{...TD, textAlign:'right'}}>{r.invoiceQtyInPallet ?? '—'}</td>
            <td style={{...TD, textAlign:'right'}}>{r.invoiceQtyInNos ?? '—'}</td>
            <td style={{...TD, textAlign:'right'}}>{r.invoiceNetWeight ?? '—'}</td>
            <td style={{...TD, textAlign:'right'}}>{r.receivedQtyInPallets ?? '—'}</td>
            <td style={{...TD, textAlign:'right'}}>{r.receivedQtyInNos ?? '—'}</td>
            <td style={{...TD, textAlign:'right'}}>{r.receivedNetWeight ?? '—'}</td>
            <td style={{...TD, textAlign:'right', fontWeight:800, color: Number(r.shortInPallet||0) < 0 ? '#dc2626' : Number(r.shortInPallet||0) > 0 ? '#d97706' : '#059669'}}>
              {Number(r.shortInPallet||0) > 0 ? `+${r.shortInPallet}` : r.shortInPallet || '0'}
            </td>
            <td style={{...TD, textAlign:'right', fontWeight:800, color: Number(r.shortExcessInQty||0) < 0 ? '#dc2626' : Number(r.shortExcessInQty||0) > 0 ? '#d97706' : '#059669'}}>
              {Number(r.shortExcessInQty||0) > 0 ? `+${r.shortExcessInQty}` : r.shortExcessInQty || '0'}
            </td>
            <td style={{...TD, textAlign:'right', fontWeight:800, color: Number(r.shortExcessInKg||0) < 0 ? '#dc2626' : Number(r.shortExcessInKg||0) > 0 ? '#d97706' : '#059669'}}>
              {Number(r.shortExcessInKg||0) > 0 ? `+${r.shortExcessInKg}` : r.shortExcessInKg || '0'}
            </td>
            <td style={{...TD, maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', color: r.discrepancyRemarks ? '#dc2626' : '#94a3b8', fontStyle: r.discrepancyRemarks ? 'normal' : 'italic'}}>
              {r.discrepancyRemarks || 'None'}
            </td>
            <td style={{...TD, textAlign:'center'}}><DeleteBtn onDelete={() => onDelete(r.id)} canDelete={canDelete} /></td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function CycleCountDiscrepancyTable({ rows }: { rows: any[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        {['Week Start','Date','Warehouse','Location Type','Zone / Rack','Bin Code',
          'Checked By','Checked At','Completed By','Remarks'].map(h => <th key={h} style={TH}>{h}</th>)}
      </tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.id || i} style={{ background: i%2===0 ? '#fff' : '#fdf2f8', borderLeft: '3px solid #be185d' }}>
          <td style={{...TD, fontFamily:'monospace', fontSize:'11px', color:'#9d174d'}}>{r.weekStart}</td>
          <td style={TD}>{fmtDate(r.scheduledDate)}</td>
          <td style={{...TD, fontWeight:700, color:'#7c3aed'}}>{r.warehouseCode} <span style={{fontWeight:400,color:'#94a3b8',fontSize:'10px'}}>({r.warehouseName})</span></td>
          <td style={TD}>
            <span style={{
              background: r.locationType === 'FLOOR' ? '#f0fdf4' : '#eff6ff',
              color: r.locationType === 'FLOOR' ? '#166534' : '#1e40af',
              border: `1px solid ${r.locationType === 'FLOOR' ? '#86efac' : '#bfdbfe'}`,
              borderRadius: '20px', padding: '1px 8px', fontSize: '10px', fontWeight: 700,
            }}>{r.locationType}</span>
          </td>
          <td style={{...TD, fontFamily:'monospace', color:'#374151'}}>{r.zone || '—'}</td>
          <td style={{...TD, fontFamily:'monospace', fontWeight:700, color:'#be185d'}}>{r.binCode}</td>
          <td style={TD}>{r.checkedBy || '—'}</td>
          <td style={{...TD, fontSize:'11px'}}>{r.checkedAt ? new Date(r.checkedAt).toLocaleString('en-IN') : '—'}</td>
          <td style={TD}>{r.completedBy || '—'}</td>
          <td style={{...TD, color: r.remarks ? '#b91c1c' : '#94a3b8', fontStyle: r.remarks ? 'normal' : 'italic', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis'}}>
            {r.remarks || 'No remarks'}
          </td>
        </tr>
      ))}</tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr style={{background:'#fdf2f8',fontWeight:800,borderTop:'2px solid #f9a8d4'}}>
            <td style={{...TD,color:'#9d174d'}} colSpan={10}>
              TOTAL: {rows.length} discrepanc{rows.length === 1 ? 'y' : 'ies'} flagged
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function DeleteBtn({ onDelete, canDelete = true }: { onDelete: () => void; canDelete?: boolean }) {
  const [hov, setHov] = useState(false);
  if (!canDelete) return null;
  return (
    <button
      onClick={onDelete}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="Delete record"
      style={{ background: hov?'#fef2f2':'none', border: hov?'1px solid #fca5a5':'1px solid transparent', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer', color: hov?'#dc2626':'#fca5a5', display:'flex', alignItems:'center', transition:'all 0.1s' }}
    >
      <Trash2 size={13} />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reports() {
  const user = useAuthStore(s => s.user);
  const selectedWorker = useAuthStore(s => s.selectedWorker);
  const isViewer = user?.role === 'CUSTOMER';
  const [activeTab, setActiveTab]   = useState<ReportType | null>(null);
  const [rows, setRows]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(false);
  const [loaded, setLoaded]         = useState(false);
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQ, setSearchQ]       = useState('');
  // Shared category filter (RM / FG / ALL) — applies to all tabs
  const [catFilter, setCatFilter]               = useState<'ALL' | 'RM' | 'FG'>('ALL');
  // Type-of-material sub-filters (inward + inventory only)
  const [inwardTypeFilter, setInwardTypeFilter]       = useState<string>('');
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState<string>('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'' | 'GOOD' | 'DISCREPANCY'>('');
  // Presentation Report panel
  const [showPptPanel, setShowPptPanel]         = useState(false);
  const [pptMonth, setPptMonth]                 = useState(new Date().getMonth() + 1);
  const [pptYear, setPptYear]                   = useState(new Date().getFullYear());
  const [pptGenerating, setPptGenerating]       = useState(false);
  const [pptStatus, setPptStatus]               = useState('');

  const activeCfg = TABS.find(t => t.id === activeTab);

  // Date presets
  const presets = [
    { label: 'Today', fn: () => { const t = new Date().toISOString().slice(0,10); setDateFrom(t); setDateTo(t); }},
    { label: 'This Week', fn: () => {
      const now = new Date(); const day = now.getDay();
      const mon = new Date(now); mon.setDate(now.getDate()-((day+6)%7));
      const sun = new Date(mon); sun.setDate(mon.getDate()+6);
      setDateFrom(mon.toISOString().slice(0,10)); setDateTo(sun.toISOString().slice(0,10));
    }},
    { label: 'This Month', fn: () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last  = new Date(now.getFullYear(), now.getMonth()+1, 0);
      setDateFrom(first.toISOString().slice(0,10)); setDateTo(last.toISOString().slice(0,10));
    }},
    { label: 'This Year', fn: () => {
      const y = new Date().getFullYear(); setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`);
    }},
  ];

  const loadReport = async (tab: ReportType) => {
    const cfg = TABS.find(t => t.id === tab); if (!cfg) return;
    setLoading(true); setLoaded(false); setRows([]); setDeleteError(null); setSearchQ('');
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo)   params.set('to', dateTo);
      if (selectedWorker?.warehouseCodes?.length) params.set('warehouseCodes', selectedWorker.warehouseCodes.join(','));
      else if (selectedWorker?.warehouseCode) params.set('warehouseCode', selectedWorker.warehouseCode);
      const url = `${API}${cfg.endpoint}${params.toString() ? '?'+params : ''}`;
      const res  = await fetch(url);
      const json = await res.json();
      let data: any[] = Array.isArray(json) ? json : json.inventory ?? json.entries ?? json.data ?? [];
      setRows(data);
      setLoaded(true);
    } catch {
      setDeleteError('Failed to load. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Monthly PPT Generator ────────────────────────────────────────────────────
  const generateMonthlyPPT = async () => {
    setPptGenerating(true); setPptStatus('Loading presentation engine…');
    try {
      // Dynamically load pptxgenjs from CDN
      const PptxGenJS: any = await new Promise((resolve, reject) => {
        if ((window as any).PptxGenJS) { resolve((window as any).PptxGenJS); return; }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
        s.onload  = () => resolve((window as any).PptxGenJS);
        s.onerror = () => reject(new Error('Failed to load pptxgenjs'));
        document.head.appendChild(s);
      });

      const monthStr = String(pptMonth).padStart(2,'0');
      const lastDay  = new Date(pptYear, pptMonth, 0).getDate();
      const mFrom = `${pptYear}-${monthStr}-01`;
      const mTo   = `${pptYear}-${monthStr}-${lastDay}`;
      const monthName = new Date(pptYear, pptMonth-1,1).toLocaleString('en-IN',{month:'long'});

      setPptStatus('Fetching data…');
      const wcSuffix = whQuery(selectedWorker, '&');
      const [j1,j2,j3,j4,j5] = await Promise.all([
        fetch(`${API}/inward?from=${mFrom}&to=${mTo}${wcSuffix}`).then(r=>r.json()),
        fetch(`${API}/outward?from=${mFrom}&to=${mTo}${wcSuffix}`).then(r=>r.json()),
        fetch(`${API}/inventory${whQuery(selectedWorker)}`).then(r=>r.json()),
        fetch(`${API}/cycle-count/records?from=${mFrom}&to=${mTo}${wcSuffix}`).then(r=>r.json()),
        fetch(`${API}/inward/discrepancies?from=${mFrom}&to=${mTo}${wcSuffix}`).then(r=>r.json()),
      ]);
      const inwardRows:any[]    = Array.isArray(j1) ? j1 : [];
      const outwardRows:any[]   = Array.isArray(j2) ? j2 : [];
      const inventoryRows:any[] = Array.isArray(j3) ? j3 : (j3.inventory ?? []);
      const cycleRows:any[]     = Array.isArray(j4) ? j4 : [];
      const discRows:any[]      = Array.isArray(j5) ? j5 : [];

      // Aggregate metrics
      let inPallets=0,inKg=0,rmPallets=0,fgPallets=0;
      inwardRows.forEach((e:any)=>(e.lineItems||[]).forEach((item:any)=>{
        const cf=parseCF(item.customFields);
        inPallets+=Number(cf.receivedQtyInPallets||cf.invoiceQtyInPallet||0);
        inKg+=Number(cf.receivedNetWeight||cf.invoiceNetWeight||0);
        const cat=String(cf.category||item.category||e.category||'').toUpperCase();
        if(cat.includes('RM')) rmPallets+=Number(cf.receivedQtyInPallets||cf.invoiceQtyInPallet||0);
        if(cat.includes('FG')) fgPallets+=Number(cf.receivedQtyInPallets||cf.invoiceQtyInPallet||0);
      }));
      let outPallets=0;
      outwardRows.forEach((e:any)=>(e.lineItems||[]).forEach((item:any)=>{outPallets+=Number(item.pickedQty||0);}));
      let invPallets=0,invKg=0,invRM=0,invFG=0;
      inventoryRows.forEach((b:any)=>{
        const cf=parseCF(b.customFields);
        invPallets+=Number(cf.pallets||0); invKg+=Number(cf.netWeight||0);
        const cat=String(cf.category||b.material?.category||'').toUpperCase();
        if(cat.includes('RM')) invRM+=Number(cf.pallets||0);
        if(cat.includes('FG')) invFG+=Number(cf.pallets||0);
      });

      setPptStatus('Building slides…');
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      const W='ffffff',NAVY='1e3a8a',BLUE='2563eb',AMB='f59e0b',GREEN='059669',PUR='7c3aed',RED='dc2626',DARK='0f172a';

      // ── Slide 1: Cover ─────────────────────────────────────────────────────────
      const sl1=pptx.addSlide();
      sl1.addShape(pptx.ShapeType.rect,{x:0,y:0,w:'100%',h:'100%',fill:{color:NAVY}});
      sl1.addShape(pptx.ShapeType.rect,{x:0,y:3.4,w:'100%',h:0.07,fill:{color:AMB}});
      sl1.addText('JSM LOGISTICS',{x:0.6,y:0.55,w:9,h:0.7,fontSize:28,bold:true,color:W,fontFace:'Calibri'});
      sl1.addText('Monthly Operations Report',{x:0.6,y:1.3,w:9,h:1.1,fontSize:42,bold:true,color:W,fontFace:'Calibri'});
      sl1.addText(`${monthName} ${pptYear}`,{x:0.6,y:2.5,w:9,h:0.65,fontSize:24,color:AMB,bold:true});
      sl1.addText('Warehouse Management System · Control Tower',{x:0.6,y:3.6,w:9,h:0.45,fontSize:13,color:'93c5fd'});
      // KPI preview boxes
      const kpis=[
        {l:'Inward Entries',v:inwardRows.length},{l:'Outbound Dispatches',v:outwardRows.length},
        {l:'Inventory Batches',v:inventoryRows.length},{l:'Cycle Count Records',v:cycleRows.length},
      ];
      kpis.forEach((k,i)=>{
        const x=0.55+i*2.4;
        sl1.addShape(pptx.ShapeType.rect,{x,y:4.25,w:2.15,h:1.4,fill:{color:'1e40af'},line:{color:'3b82f6',width:1}});
        sl1.addText(String(k.v),{x,y:4.3,w:2.15,h:0.8,fontSize:34,bold:true,color:W,align:'center'});
        sl1.addText(k.l,{x,y:5.1,w:2.15,h:0.42,fontSize:9,color:'bfdbfe',align:'center'});
      });
      sl1.addText(`Confidential  |  Generated ${new Date().toLocaleDateString('en-IN')}`,{x:0.6,y:6.85,w:9,h:0.28,fontSize:9,color:'475569'});

      // ── Slide 2: Executive Summary ─────────────────────────────────────────────
      const sl2=pptx.addSlide();
      sl2.addShape(pptx.ShapeType.rect,{x:0,y:0,w:'100%',h:1.0,fill:{color:NAVY}});
      sl2.addText('Executive Summary',{x:0.4,y:0.18,w:9,h:0.65,fontSize:24,bold:true,color:W});
      sl2.addText(`${monthName} ${pptYear} — Key Performance Indicators`,{x:0.4,y:6.9,w:9,h:0.28,fontSize:9,color:'94a3b8'});
      const cards=[
        {l:'Inward Entries',v:inwardRows.length,u:'entries',c:BLUE,bg:'eff6ff'},
        {l:'Pallets Received',v:Math.round(inPallets),u:'pallets',c:GREEN,bg:'ecfdf5'},
        {l:'Weight Received',v:`${inKg.toFixed(0)} kg`,u:'kilograms',c:PUR,bg:'f5f3ff'},
        {l:'Outbound Dispatches',v:outwardRows.length,u:'dispatches',c:'d97706',bg:'fffbeb'},
        {l:'Inventory Batches',v:inventoryRows.length,u:'in stock',c:'0891b2',bg:'ecfeff'},
        {l:'Discrepancies',v:discRows.length,u:'records',c:RED,bg:'fef2f2'},
      ];
      cards.forEach((c,i)=>{
        const row=Math.floor(i/3),col=i%3;
        const x=0.3+col*3.2, y=1.2+row*2.35;
        sl2.addShape(pptx.ShapeType.rect,{x,y,w:3.0,h:2.1,fill:{color:c.bg},line:{color:c.c,width:1.5}});
        sl2.addText(String(c.v),{x,y:y+0.2,w:3.0,h:1.0,fontSize:40,bold:true,color:c.c,align:'center'});
        sl2.addText(c.u,{x,y:y+1.18,w:3.0,h:0.32,fontSize:10,color:'64748b',align:'center'});
        sl2.addText(c.l,{x,y:y+1.56,w:3.0,h:0.38,fontSize:11,bold:true,color:c.c,align:'center'});
      });

      // ── Slide 3: Inward Operations ─────────────────────────────────────────────
      const sl3=pptx.addSlide();
      sl3.addShape(pptx.ShapeType.rect,{x:0,y:0,w:'100%',h:1.0,fill:{color:BLUE}});
      sl3.addText('Inward Operations',{x:0.4,y:0.18,w:7,h:0.65,fontSize:24,bold:true,color:W});
      sl3.addText(`${monthName} ${pptYear}`,{x:7.4,y:0.25,w:2,h:0.5,fontSize:13,color:'bfdbfe',align:'right'});
      const inStats=[
        {l:'Total Entries',v:inwardRows.length},{l:'Pallets In',v:Math.round(inPallets)},
        {l:'Weight (kg)',v:inKg.toFixed(0)},{l:'RM Pallets',v:Math.round(rmPallets)},{l:'FG Pallets',v:Math.round(fgPallets)},
      ];
      inStats.forEach((s,i)=>{
        const x=0.3+i*1.9;
        sl3.addShape(pptx.ShapeType.rect,{x,y:1.1,w:1.75,h:1.0,fill:{color:'eff6ff'},line:{color:'bfdbfe',width:1}});
        sl3.addText(String(s.v),{x,y:1.15,w:1.75,h:0.55,fontSize:22,bold:true,color:BLUE,align:'center'});
        sl3.addText(s.l,{x,y:1.7,w:1.75,h:0.28,fontSize:9,color:'64748b',align:'center'});
      });
      sl3.addText('Inward Entries This Month',{x:0.3,y:2.22,w:9.4,h:0.35,fontSize:12,bold:true,color:DARK});
      const inHdr=['Inward No.','Date','Source','Invoice No.','Materials','Pallets','Status'];
      const inHdrColor='1e3a8a';
      const inRows:any[]=[[ ...inHdr.map(h=>({text:h,options:{bold:true,color:W,fill:{color:inHdrColor},fontSize:9}})) ]];
      inwardRows.slice(0,12).forEach((e:any,i:number)=>{
        const eCF=parseCF(e.customFields);
        let ep=0; (e.lineItems||[]).forEach((li:any)=>{const cf=parseCF(li.customFields);ep+=Number(cf.receivedQtyInPallets||cf.invoiceQtyInPallet||0);});
        const bg=i%2===0?W:'f0f9ff';
        inRows.push([
          {text:e.inwardNumber||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:fmtDate(eCF.date||e.createdAt),options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:e.source||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:e.invoiceNumber||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:String(e.lineItems?.length||0),options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
          {text:ep>0?String(Math.round(ep)):'—',options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
          {text:e.status||'—',options:{fill:{color:bg},color:e.status==='COMPLETED'?GREEN:AMB,fontSize:9,bold:true}},
        ]);
      });
      if(inRows.length>1){sl3.addTable(inRows,{x:0.3,y:2.62,w:9.4,colW:[1.55,1.2,1.5,1.55,0.9,0.9,1.8],border:{type:'solid',color:'e2e8f0',pt:0.5},fontSize:9});}
      else{sl3.addText('No inward entries for this month.',{x:0.3,y:3.2,w:9.4,h:0.5,fontSize:12,color:'94a3b8',align:'center'});}

      // ── Slide 4: Outbound Dispatch ─────────────────────────────────────────────
      const sl4=pptx.addSlide();
      sl4.addShape(pptx.ShapeType.rect,{x:0,y:0,w:'100%',h:1.0,fill:{color:GREEN}});
      sl4.addText('Outbound Dispatch',{x:0.4,y:0.18,w:7,h:0.65,fontSize:24,bold:true,color:W});
      sl4.addText(`${monthName} ${pptYear}`,{x:7.4,y:0.25,w:2,h:0.5,fontSize:13,color:'a7f3d0',align:'right'});
      const outStats=[
        {l:'Total Dispatches',v:outwardRows.length},
        {l:'Pallets Dispatched',v:Math.round(outPallets)},
        {l:'Unique Materials',v:new Set(outwardRows.flatMap((e:any)=>(e.lineItems||[]).map((li:any)=>li.materialCode))).size},
      ];
      outStats.forEach((s,i)=>{
        const x=0.3+i*3.2;
        sl4.addShape(pptx.ShapeType.rect,{x,y:1.1,w:3.0,h:1.0,fill:{color:'ecfdf5'},line:{color:'a7f3d0',width:1}});
        sl4.addText(String(s.v),{x,y:1.15,w:3.0,h:0.55,fontSize:26,bold:true,color:GREEN,align:'center'});
        sl4.addText(s.l,{x,y:1.7,w:3.0,h:0.28,fontSize:9,color:'64748b',align:'center'});
      });
      sl4.addText('Outbound Records This Month',{x:0.3,y:2.22,w:9.4,h:0.35,fontSize:12,bold:true,color:DARK});
      const outHdr=['Outward No.','Date','Truck No.','Destination','LR No.','Materials','Status'];
      const outHdrColor='064e3b';
      const outRows:any[]=[[ ...outHdr.map(h=>({text:h,options:{bold:true,color:W,fill:{color:outHdrColor},fontSize:9}})) ]];
      outwardRows.slice(0,12).forEach((e:any,i:number)=>{
        const bg=i%2===0?W:'f0fdf4';
        const rem:Record<string,string>={};
        (e.remarks||'').split(' | ').forEach((p:string)=>{const idx=p.indexOf(': ');if(idx!==-1)rem[p.slice(0,idx).trim()]=p.slice(idx+2).trim();});
        outRows.push([
          {text:e.outwardNumber||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:fmtDate(e.dispatchDate||e.createdAt),options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:e.truckNumber||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:e.destination||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:rem['LR']||e.lrNumber||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:String(e.lineItems?.length||0),options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
          {text:e.status||'—',options:{fill:{color:bg},color:e.status==='DISPATCHED'?GREEN:AMB,fontSize:9,bold:true}},
        ]);
      });
      if(outRows.length>1){sl4.addTable(outRows,{x:0.3,y:2.62,w:9.4,colW:[1.45,1.2,1.3,1.6,1.4,1.0,1.45],border:{type:'solid',color:'e2e8f0',pt:0.5},fontSize:9});}
      else{sl4.addText('No outbound dispatches for this month.',{x:0.3,y:3.2,w:9.4,h:0.5,fontSize:12,color:'94a3b8',align:'center'});}

      // ── Slide 5: Inventory Status ──────────────────────────────────────────────
      const sl5=pptx.addSlide();
      sl5.addShape(pptx.ShapeType.rect,{x:0,y:0,w:'100%',h:1.0,fill:{color:PUR}});
      sl5.addText('Current Inventory Status',{x:0.4,y:0.18,w:7,h:0.65,fontSize:24,bold:true,color:W});
      sl5.addText('Live Snapshot',{x:7.4,y:0.25,w:2,h:0.5,fontSize:13,color:'ddd6fe',align:'right'});
      const invStats=[
        {l:'Total Batches',v:inventoryRows.length},{l:'Total Pallets',v:Math.round(invPallets)},
        {l:'Total Wt (kg)',v:invKg.toFixed(0)},{l:'RM Pallets',v:Math.round(invRM)},{l:'FG Pallets',v:Math.round(invFG)},
      ];
      invStats.forEach((s,i)=>{
        const x=0.3+i*1.9;
        sl5.addShape(pptx.ShapeType.rect,{x,y:1.1,w:1.75,h:1.0,fill:{color:'f5f3ff'},line:{color:'ddd6fe',width:1}});
        sl5.addText(String(s.v),{x,y:1.15,w:1.75,h:0.55,fontSize:22,bold:true,color:PUR,align:'center'});
        sl5.addText(s.l,{x,y:1.7,w:1.75,h:0.28,fontSize:9,color:'64748b',align:'center'});
      });
      sl5.addText('Stock Batches (Current)',{x:0.3,y:2.22,w:9.4,h:0.35,fontSize:12,bold:true,color:DARK});
      const invHdr=['Material','Description','Category','Type','Pallets','Weight (kg)','Stock Location'];
      const invHdrColor='4c1d95';
      const invRows:any[]=[[ ...invHdr.map(h=>({text:h,options:{bold:true,color:W,fill:{color:invHdrColor},fontSize:9}})) ]];
      inventoryRows.slice(0,12).forEach((b:any,i:number)=>{
        const cf=parseCF(b.customFields);
        const bg=i%2===0?W:'faf5ff';
        invRows.push([
          {text:b.material?.code||b.batchNumber||'—',options:{fill:{color:bg},color:DARK,fontSize:9,bold:true}},
          {text:(b.material?.description||'—').slice(0,28),options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:cf.category||b.material?.category||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:cf.materialType||b.material?.materialType||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:cf.pallets||'—',options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
          {text:cf.netWeight?Number(cf.netWeight).toFixed(0):'—',options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
          {text:cf.stockLocation||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
        ]);
      });
      if(invRows.length>1){sl5.addTable(invRows,{x:0.3,y:2.62,w:9.4,colW:[1.35,2.05,1.0,1.25,0.85,1.15,1.75],border:{type:'solid',color:'e2e8f0',pt:0.5},fontSize:9});}
      else{sl5.addText('No inventory data.',{x:0.3,y:3.2,w:9.4,h:0.5,fontSize:12,color:'94a3b8',align:'center'});}

      // ── Slide 6: Discrepancy Report ────────────────────────────────────────────
      const sl6=pptx.addSlide();
      sl6.addShape(pptx.ShapeType.rect,{x:0,y:0,w:'100%',h:1.0,fill:{color:RED}});
      sl6.addText('Discrepancy Report',{x:0.4,y:0.18,w:7,h:0.65,fontSize:24,bold:true,color:W});
      sl6.addText(`${monthName} ${pptYear}`,{x:7.4,y:0.25,w:2,h:0.5,fontSize:13,color:'fecaca',align:'right'});
      if(discRows.length===0){
        sl6.addShape(pptx.ShapeType.rect,{x:2.0,y:2.0,w:6,h:2.8,fill:{color:'ecfdf5'},line:{color:'6ee7b7',width:2}});
        sl6.addText('✓',{x:2.0,y:2.15,w:6,h:1.0,fontSize:52,color:GREEN,align:'center'});
        sl6.addText('No Discrepancies Recorded',{x:2.0,y:3.1,w:6,h:0.6,fontSize:20,bold:true,color:GREEN,align:'center'});
        sl6.addText(`All inward entries for ${monthName} ${pptYear} were received without discrepancies.`,{x:2.0,y:3.75,w:6,h:0.55,fontSize:11,color:'064e3b',align:'center'});
      } else {
        sl6.addShape(pptx.ShapeType.rect,{x:0.3,y:1.1,w:2.5,h:1.0,fill:{color:'fef2f2'},line:{color:'fca5a5',width:1}});
        sl6.addText(String(discRows.length),{x:0.3,y:1.15,w:2.5,h:0.6,fontSize:30,bold:true,color:RED,align:'center'});
        sl6.addText('Total Discrepancies',{x:0.3,y:1.75,w:2.5,h:0.28,fontSize:10,color:'64748b',align:'center'});
        sl6.addText('Discrepancy Details',{x:0.3,y:2.22,w:9.4,h:0.35,fontSize:12,bold:true,color:DARK});
        const dHdr=['Inward No.','Date','Material','Invoice Pallets','Received Pallets','Short/Excess (kg)','Remarks'];
        const dRows:any[]=[[ ...dHdr.map(h=>({text:h,options:{bold:true,color:W,fill:{color:'991b1b'},fontSize:9}})) ]];
        discRows.slice(0,12).forEach((r:any,i:number)=>{
          const bg=i%2===0?W:'fef2f2';
          dRows.push([
            {text:r.inwardNumber||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
            {text:fmtDate(r.date),options:{fill:{color:bg},color:DARK,fontSize:9}},
            {text:r.materialCode||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
            {text:String(r.invoiceQtyInPallet??'—'),options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
            {text:String(r.receivedQtyInPallets??'—'),options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
            {text:String(r.shortExcessInKg??'—'),options:{fill:{color:bg},color:RED,fontSize:9,bold:true,align:'center'}},
            {text:(r.discrepancyRemarks||'—').slice(0,30),options:{fill:{color:bg},color:DARK,fontSize:9}},
          ]);
        });
        sl6.addTable(dRows,{x:0.3,y:2.62,w:9.4,colW:[1.5,1.15,1.35,1.35,1.5,1.5,1.05],border:{type:'solid',color:'e2e8f0',pt:0.5},fontSize:9});
      }

      // ── Slide 7: Cycle Count ───────────────────────────────────────────────────
      const sl7=pptx.addSlide();
      sl7.addShape(pptx.ShapeType.rect,{x:0,y:0,w:'100%',h:1.0,fill:{color:'d97706'}});
      sl7.addText('Cycle Count Report',{x:0.4,y:0.18,w:7,h:0.65,fontSize:24,bold:true,color:W});
      sl7.addText(`${monthName} ${pptYear}`,{x:7.4,y:0.25,w:2,h:0.5,fontSize:13,color:'fde68a',align:'right'});
      const ccStats=[
        {l:'Records Counted',v:cycleRows.length},
        {l:'Unique Materials',v:new Set(cycleRows.map((r:any)=>r.materialCode)).size},
        {l:'Variance Items',v:cycleRows.filter((r:any)=>Number(r.countedQuantity||0)!==Number(r.systemQuantity||0)).length},
      ];
      ccStats.forEach((s,i)=>{
        const x=0.3+i*3.2;
        sl7.addShape(pptx.ShapeType.rect,{x,y:1.1,w:3.0,h:1.0,fill:{color:'fffbeb'},line:{color:'fde68a',width:1}});
        sl7.addText(String(s.v),{x,y:1.15,w:3.0,h:0.55,fontSize:26,bold:true,color:'d97706',align:'center'});
        sl7.addText(s.l,{x,y:1.7,w:3.0,h:0.28,fontSize:9,color:'64748b',align:'center'});
      });
      sl7.addText('Cycle Count Records',{x:0.3,y:2.22,w:9.4,h:0.35,fontSize:12,bold:true,color:DARK});
      const ccHdr=['Material Code','Description','Category','Type','Counted','System Qty','Variance','Date'];
      const ccHdrColor='92400e';
      const ccRows:any[]=[[ ...ccHdr.map(h=>({text:h,options:{bold:true,color:W,fill:{color:ccHdrColor},fontSize:9}})) ]];
      cycleRows.slice(0,15).forEach((r:any,i:number)=>{
        const bg=i%2===0?W:'fffbeb';
        const vr=Number(r.countedQuantity||0)-Number(r.systemQuantity||0);
        ccRows.push([
          {text:r.materialCode||'—',options:{fill:{color:bg},color:DARK,fontSize:9,bold:true}},
          {text:(r.materialDescription||'—').slice(0,22),options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:r.category||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:r.materialType||'—',options:{fill:{color:bg},color:DARK,fontSize:9}},
          {text:String(r.countedQuantity??'—'),options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
          {text:String(r.systemQuantity??'—'),options:{fill:{color:bg},color:DARK,fontSize:9,align:'center'}},
          {text:vr!==0?(vr>0?'+':'')+vr:'0',options:{fill:{color:bg},color:vr<0?RED:vr>0?GREEN:DARK,fontSize:9,bold:true,align:'center'}},
          {text:fmtDate(r.countedAt||r.createdAt),options:{fill:{color:bg},color:DARK,fontSize:9}},
        ]);
      });
      if(ccRows.length>1){sl7.addTable(ccRows,{x:0.3,y:2.62,w:9.4,colW:[1.3,1.75,0.95,1.2,1.0,1.0,0.9,1.3],border:{type:'solid',color:'e2e8f0',pt:0.5},fontSize:9});}
      else{sl7.addText('No cycle count records for this month.',{x:0.3,y:3.2,w:9.4,h:0.5,fontSize:12,color:'94a3b8',align:'center'});}

      // ── Slide 8: Summary / Closing ─────────────────────────────────────────────
      const sl8=pptx.addSlide();
      sl8.addShape(pptx.ShapeType.rect,{x:0,y:0,w:'100%',h:'100%',fill:{color:NAVY}});
      sl8.addShape(pptx.ShapeType.rect,{x:0,y:2.95,w:'100%',h:0.07,fill:{color:AMB}});
      sl8.addText('Monthly Summary',{x:0.6,y:0.5,w:9,h:0.9,fontSize:34,bold:true,color:W});
      sl8.addText(`${monthName} ${pptYear}`,{x:0.6,y:1.5,w:9,h:0.55,fontSize:20,color:AMB,bold:true});
      const sumItems=[
        {icon:'📥',l:'Inward',v:`${inwardRows.length} entries  |  ${Math.round(inPallets)} pallets  |  ${inKg.toFixed(0)} kg`},
        {icon:'📤',l:'Outbound',v:`${outwardRows.length} dispatches  |  ${Math.round(outPallets)} pallets dispatched`},
        {icon:'🏭',l:'Inventory',v:`${inventoryRows.length} batches  |  ${Math.round(invPallets)} pallets  |  ${invKg.toFixed(0)} kg`},
        {icon:'🔍',l:'Cycle Count',v:`${cycleRows.length} records counted`},
        {icon:discRows.length===0?'✅':'⚠️',l:'Discrepancies',v:discRows.length===0?'None — All clear!':`${discRows.length} discrepancy records`},
      ];
      sumItems.forEach((s,i)=>{
        const y=3.15+i*0.68;
        sl8.addText(`${s.icon}  ${s.l}:`,{x:0.6,y,w:2.6,h:0.58,fontSize:13,bold:true,color:AMB});
        sl8.addText(s.v,{x:3.3,y,w:6.1,h:0.58,fontSize:13,color:W});
      });
      sl8.addText(`Report generated on ${new Date().toLocaleDateString('en-IN')}  ·  JSM Logistics Control Tower  ·  Confidential`,{x:0.6,y:6.88,w:9,h:0.28,fontSize:9,color:'475569'});

      setPptStatus('Saving…');
      await pptx.writeFile({fileName:`JSM_Monthly_Report_${monthName}_${pptYear}.pptx`});
      setPptStatus('✓ Downloaded successfully!');
      setTimeout(()=>setPptStatus(''),4000);
    } catch(err:any) {
      setPptStatus(`Error: ${err.message}`);
      setTimeout(()=>setPptStatus(''),6000);
    } finally {
      setPptGenerating(false);
    }
  };

  // Client-side search filter (must come before inwardDisplayRows)
  const filteredRows = searchQ.trim() === '' ? rows : rows.filter(r => {
    const haystack = JSON.stringify(r).toLowerCase();
    return searchQ.toLowerCase().split(' ').every(w => haystack.includes(w));
  });

  // Helper: does a category string match the active pill?
  const matchCat = (cat: string) =>
    catFilter === 'ALL' || String(cat || '').toUpperCase().includes(catFilter);

  // A batch/line item's materialType is sometimes a comma-joined string (e.g. "Board, CFC,
  // Reel") when its underlying Excel rows had different "Type of material" values for the
  // same material code + invoice — see inward.ts commit route. Always check against the
  // flattened list (customFields.materialTypes if present) so a value like "CFC" is still
  // findable even when it wasn't the sole type for a whole batch.
  const materialTypeList = (cf: any): string[] =>
    Array.isArray(cf.materialTypes) && cf.materialTypes.length
      ? cf.materialTypes
      : String(cf.materialType || '').split(',').map((s: string) => s.trim()).filter(Boolean);

  // ── Inward: filter at line-item level ──────────────────────────────────────
  const inwardMaterialTypes: string[] = (() => {
    const types = new Set<string>();
    rows.forEach((entry: any) =>
      (entry.lineItems || []).forEach((item: any) => {
        materialTypeList(parseCF(item.customFields)).forEach(t => types.add(t));
      })
    );
    return Array.from(types).sort();
  })();
  const inwardDisplayRows: any[] = (catFilter !== 'ALL' || inwardTypeFilter)
    ? filteredRows.map((entry: any) => ({
        ...entry,
        lineItems: (entry.lineItems || []).filter((item: any) => {
          const cf = parseCF(item.customFields);
          const cat = cf.category || item.category || entry.category || '';
          if (!matchCat(cat)) return false;
          if (inwardTypeFilter && !materialTypeList(cf).includes(inwardTypeFilter)) return false;
          return true;
        }),
      })).filter((e: any) => e.lineItems.length > 0)
    : filteredRows;

  // ── Outward: filter at line-item level ─────────────────────────────────────
  const outwardDisplayRows: any[] = catFilter !== 'ALL'
    ? filteredRows.map((entry: any) => ({
        ...entry,
        lineItems: (entry.lineItems || []).filter((item: any) =>
          matchCat(parseCF(item.customFields).category || '')
        ),
      })).filter((e: any) => e.lineItems.length > 0)
    : filteredRows;

  // ── Inventory: filter at batch level ───────────────────────────────────────
  const inventoryMaterialTypes: string[] = (() => {
    const types = new Set<string>();
    rows.forEach((r: any) => {
      const cf = parseCF(r.customFields);
      const list = materialTypeList(cf);
      if (list.length) list.forEach(t => types.add(t));
      else if (r.material?.materialType) types.add(r.material.materialType);
    });
    return Array.from(types).sort();
  })();
  const inventoryDisplayRows: any[] = filteredRows.filter((r: any) => {
    const cf = parseCF(r.customFields);
    const cat = cf.category || r.material?.category || '';
    if (catFilter !== 'ALL' && !matchCat(cat)) return false;
    if (inventoryTypeFilter) {
      const list = materialTypeList(cf);
      const matches = list.length ? list.includes(inventoryTypeFilter) : r.material?.materialType === inventoryTypeFilter;
      if (!matches) return false;
    }
    if (inventoryStatusFilter) {
      const isDisc = !!(cf.discrepancy || r.stockStatus === 'DISCREPANCY' ||
        Number(cf.shortInPallet||0) !== 0 || Number(cf.shortExcessInKg||0) !== 0 || cf.discrepancyRemarks);
      if (inventoryStatusFilter === 'DISCREPANCY' && !isDisc) return false;
      if (inventoryStatusFilter === 'GOOD' && isDisc) return false;
    }
    return true;
  });

  // ── Cycle Count: filter at record level ────────────────────────────────────
  const cycleDisplayRows: any[] = catFilter !== 'ALL'
    ? filteredRows.filter((r: any) => matchCat(r.category || ''))
    : filteredRows;

  // ── Discrepancy: filter at record level ────────────────────────────────────
  const discrepancyDisplayRows: any[] = catFilter !== 'ALL'
    ? filteredRows.filter((r: any) => matchCat(r.category || ''))
    : filteredRows;

  // Active display rows for the current tab
  const displayRows =
    activeTab === 'inward'          ? inwardDisplayRows :
    activeTab === 'outward'         ? outwardDisplayRows :
    activeTab === 'inventory'       ? inventoryDisplayRows :
    activeTab === 'cycle-count'     ? cycleDisplayRows :
    activeTab === 'discrepancy'     ? discrepancyDisplayRows :
    activeTab === 'cc-discrepancy'  ? filteredRows :
    filteredRows;

  const handleDelete = async (id: string) => {
    if (!activeTab) return;
    // Deleting an outward dispatch now restores the stock it depleted (previously it
    // didn't — the goods stayed marked as shipped forever even if the entry was a
    // mistake). Worth telling the operator that at the point of action, not just fixing
    // it silently.
    const confirmMsg = activeTab === 'outward'
      ? 'Delete this dispatch? This cannot be undone — the inventory it depleted will be credited back to stock.'
      : 'Delete this record? This cannot be undone.';
    if (!window.confirm(confirmMsg)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API}${deleteEndpoint(activeTab, id)}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Delete failed');
      setRows(prev => prev.filter(r => r.id !== id));
      if (d.needsManualReview?.length) {
        window.alert(`Stock quantity was restored, but pallets/net weight for batch(es) ${d.needsManualReview.join(', ')} could not be recalculated automatically (the batch was fully depleted) — please check those on the Inventory page.`);
      }
      if (d.notRestored?.length) {
        window.alert(`Note: material(s) ${d.notRestored.join(', ')} on this dispatch predate automatic stock restoration and were NOT credited back — adjust their inventory manually if needed.`);
      }
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleLoaded = async (id: string, loaded: boolean) => {
    // Optimistic update
    setRows(prev => prev.map(r => r.id === id ? { ...r, loaded } : r));
    try {
      const res = await fetch(`${API}/outward/${id}/loaded`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loaded }),
      });
      if (!res.ok) throw new Error('Failed to update loaded status');
    } catch (e: any) {
      // Revert on failure
      setRows(prev => prev.map(r => r.id === id ? { ...r, loaded: !loaded } : r));
      window.alert(e.message || 'Failed to update loaded status');
    }
  };

  const handleDeleteAll = async () => {
    if (!activeTab || filteredRows.length === 0) return;
    if (!window.confirm(`Remove ALL ${filteredRows.length} record(s) in this report? This cannot be undone.`)) return;
    setDeleteError(null);
    const deletedIds: string[] = [];
    const failures: string[] = [];
    await Promise.all(filteredRows.map(async r => {
      try {
        const res = await fetch(`${API}${deleteEndpoint(activeTab, r.id)}`, { method: 'DELETE' });
        if (res.ok) {
          deletedIds.push(r.id);
        } else {
          const d = await res.json().catch(() => ({}));
          failures.push(d.error || `Failed to delete ${r.id}`);
        }
      } catch {
        failures.push(`Network error deleting ${r.id}`);
      }
    }));
    if (deletedIds.length > 0) {
      setRows(prev => prev.filter(r => !deletedIds.includes(r.id)));
    }
    if (failures.length > 0) {
      setDeleteError(`${failures.length} record(s) could not be deleted. Reload to see current state.`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: 0 }}>Reports & Exports</h1>
        <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Select a report, filter by date, load data, export or delete records.</p>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id && !showPptPanel;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setLoaded(false); setRows([]); setDeleteError(null); setSearchQ(''); setCatFilter('ALL'); setInwardTypeFilter(''); setInventoryTypeFilter(''); setShowPptPanel(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px',
                background: active ? tab.bg : '#fff',
                border: `2px solid ${active ? tab.color : '#e2e8f0'}`,
                borderRadius: '10px',
                fontSize: '13px', fontWeight: 700,
                color: active ? tab.color : '#64748b',
                cursor: 'pointer',
                boxShadow: active ? `0 2px 8px ${tab.bg}` : 'none',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
        {/* Presentation Report tab */}
        <button
          onClick={() => { setShowPptPanel(true); setActiveTab(null); setLoaded(false); setRows([]); }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 18px',
            background: showPptPanel ? '#1e3a8a' : '#fff',
            border: `2px solid ${showPptPanel ? '#2563eb' : '#e2e8f0'}`,
            borderRadius: '10px',
            fontSize: '13px', fontWeight: 700,
            color: showPptPanel ? '#fff' : '#64748b',
            cursor: 'pointer',
            boxShadow: showPptPanel ? '0 2px 12px rgba(30,58,138,0.25)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          <MonitorPlay size={16} /> Presentation Report
        </button>
      </div>

      {/* Presentation Report Panel */}
      {showPptPanel && (
        <div style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(30,58,138,0.10)' }}>
          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{ width: '42px', height: '42px', background: 'rgba(255,255,255,0.15)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MonitorPlay size={22} style={{ color: '#fff' }} />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>Monthly Presentation Report</div>
                <div style={{ fontSize: '12px', color: '#93c5fd', marginTop: '2px' }}>Professional PPT for customer presentations — covers all warehouse operations</div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '28px' }}>
            {/* Month/Year selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>Select Month:</div>
              <select
                value={pptMonth}
                onChange={e => setPptMonth(Number(e.target.value))}
                style={{ border: '2px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#1e3a8a', background: '#f8fafc', cursor: 'pointer', outline: 'none' }}
              >
                {['January','February','March','April','May','June','July','August','September','October','November','December']
                  .map((m,i) => <option key={m} value={i+1}>{m}</option>)}
              </select>
              <select
                value={pptYear}
                onChange={e => setPptYear(Number(e.target.value))}
                style={{ border: '2px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#1e3a8a', background: '#f8fafc', cursor: 'pointer', outline: 'none' }}
              >
                {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* What's included */}
            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>Slides included in the report:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
                {[
                  { num: '1', label: 'Cover Page', icon: '🎯', color: '#1e3a8a' },
                  { num: '2', label: 'Executive Summary', icon: '📊', color: '#2563eb' },
                  { num: '3', label: 'Inward Operations', icon: '📥', color: '#2563eb' },
                  { num: '4', label: 'Outbound Dispatch', icon: '📤', color: '#059669' },
                  { num: '5', label: 'Inventory Status', icon: '🏭', color: '#7c3aed' },
                  { num: '6', label: 'Discrepancy Report', icon: '⚠️', color: '#dc2626' },
                  { num: '7', label: 'Cycle Count', icon: '🔍', color: '#d97706' },
                  { num: '8', label: 'Monthly Summary', icon: '✅', color: '#1e3a8a' },
                ].map(slide => (
                  <div key={slide.num} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ width: '22px', height: '22px', background: slide.color, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{slide.num}</span>
                    <span style={{ fontSize: '10px' }}>{slide.icon} {slide.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <button
                onClick={generateMonthlyPPT}
                disabled={pptGenerating}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '14px 32px',
                  background: pptGenerating ? '#94a3b8' : 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                  border: 'none', borderRadius: '12px',
                  color: '#fff', fontSize: '14px', fontWeight: 800,
                  cursor: pptGenerating ? 'not-allowed' : 'pointer',
                  boxShadow: pptGenerating ? 'none' : '0 4px 14px rgba(37,99,235,0.35)',
                  transition: 'all 0.2s',
                }}
              >
                {pptGenerating
                  ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                  : <><MonitorPlay size={16} /> Generate & Download PPT</>
                }
              </button>
              {pptStatus && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 16px',
                  background: pptStatus.startsWith('✓') ? '#ecfdf5' : pptStatus.startsWith('Error') ? '#fef2f2' : '#eff6ff',
                  border: `1px solid ${pptStatus.startsWith('✓') ? '#a7f3d0' : pptStatus.startsWith('Error') ? '#fca5a5' : '#bfdbfe'}`,
                  borderRadius: '10px',
                  fontSize: '13px', fontWeight: 600,
                  color: pptStatus.startsWith('✓') ? '#059669' : pptStatus.startsWith('Error') ? '#dc2626' : '#2563eb',
                }}>
                  {pptStatus.startsWith('✓') ? '✓' : pptStatus.startsWith('Error') ? '✗' : <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                  {' '}{pptStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Date filter + load */}
      {activeTab && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <Calendar size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Date Range</span>
          {presets.map(p => (
            <button key={p.label} onClick={p.fn}
              style={{ padding: '5px 12px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '7px', fontSize: '12px', fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: '#64748b' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#374151', outline: 'none', background: '#f8fafc' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', color: '#64748b' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#374151', outline: 'none', background: '#f8fafc' }} />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ fontSize: '12px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
          )}
          <button
            onClick={() => loadReport(activeTab)}
            disabled={loading}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px', background: activeCfg?.color || '#2563eb', border: 'none', borderRadius: '9px', color: '#fff', fontSize: '13px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading…</> : <><FileBarChart size={13} /> Load Report</>}
          </button>
        </div>
      )}

      {/* Delete-in-progress indicator */}
      {deletingId && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', color: '#64748b', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Deleting record…
        </div>
      )}

      {/* Error banner */}
      {deleteError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '12px 16px', color: '#dc2626', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={15} /> {deleteError}
          <button onClick={() => setDeleteError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><XCircle size={14} /></button>
        </div>
      )}

      {/* Data table */}
      {loaded && activeCfg && (
        <div style={{ background: '#fff', border: `1px solid ${activeCfg.border}`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>

          {/* Table header toolbar */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <activeCfg.icon size={16} style={{ color: activeCfg.color }} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: activeCfg.color }}>{activeCfg.label}</span>
              <span style={{ background: activeCfg.bg, color: activeCfg.color, border: `1px solid ${activeCfg.border}`, borderRadius: '20px', padding: '1px 10px', fontSize: '11px', fontWeight: 700 }}>
                {filteredRows.length} record{filteredRows.length !== 1 ? 's' : ''}
              </span>
            </div>
            {/* Search */}
            <div style={{ position: 'relative', flex: 1, minWidth: '160px', maxWidth: '280px' }}>
              <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search…"
                style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px 6px 27px', fontSize: '12px', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }}
              />
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => exportXLSX(filteredRows, activeTab!, activeCfg.label)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', background: activeCfg.bg, border: `1.5px solid ${activeCfg.border}`, borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: activeCfg.color, cursor: 'pointer' }}>
                <Download size={12} /> XLSX
              </button>
              <button onClick={() => exportCSV(filteredRows, activeTab!, activeCfg.label)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
                <Download size={12} /> CSV
              </button>
              <button onClick={() => exportPDF(filteredRows, activeTab!, activeCfg.label, dateFrom, dateTo)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}>
                <FileText size={12} /> PDF
              </button>
              {!isViewer && (
                <>
                  <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />
                  <button
                    onClick={handleDeleteAll}
                    disabled={filteredRows.length === 0}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: '8px', fontSize: '12px', fontWeight: 800, color: '#dc2626', cursor: filteredRows.length === 0 ? 'not-allowed' : 'pointer', opacity: filteredRows.length === 0 ? 0.5 : 1 }}>
                    <Trash2 size={12} /> Remove All
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Unified category + type filter bar — shown for all tabs */}
          <div style={{ padding: '10px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: '#f8fafc' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>Category:</span>
            {(['ALL','RM','FG'] as const).map(cat => (
              <button key={cat} onClick={() => { setCatFilter(cat); if (cat !== 'RM') setInwardTypeFilter(''); }}
                style={{ padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  background: catFilter === cat ? (cat==='FG'?'#f5f3ff':cat==='RM'?'#ecfdf5':'#eff6ff') : '#fff',
                  color: catFilter === cat ? (cat==='FG'?'#7c3aed':cat==='RM'?'#059669':'#2563eb') : '#64748b',
                  border: `1.5px solid ${catFilter===cat?(cat==='FG'?'#ddd6fe':cat==='RM'?'#a7f3d0':'#bfdbfe'):'#e2e8f0'}`,
                }}>{cat}</button>
            ))}
            {/* Inward: type sub-filter when RM */}
            {activeTab === 'inward' && catFilter === 'RM' && inwardMaterialTypes.length > 0 && (
              <>
                <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>Type:</span>
                <select value={inwardTypeFilter} onChange={e => setInwardTypeFilter(e.target.value)}
                  style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', color: '#374151', background: '#fff', cursor: 'pointer' }}>
                  <option value="">All Types</option>
                  {inwardMaterialTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}
            {/* Inventory: type sub-filter */}
            {activeTab === 'inventory' && inventoryMaterialTypes.length > 0 && (
              <>
                <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>Type:</span>
                <select value={inventoryTypeFilter} onChange={e => setInventoryTypeFilter(e.target.value)}
                  style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', color: '#374151', background: '#fff', cursor: 'pointer' }}>
                  <option value="">All Types</option>
                  {inventoryMaterialTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </>
            )}
            {/* Inventory: status sub-filter */}
            {activeTab === 'inventory' && (
              <>
                <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>Status:</span>
                <select value={inventoryStatusFilter} onChange={e => setInventoryStatusFilter(e.target.value as '' | 'GOOD' | 'DISCREPANCY')}
                  style={{ border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', color: '#374151', background: '#fff', cursor: 'pointer' }}>
                  <option value="">All</option>
                  <option value="GOOD">Approved</option>
                  <option value="DISCREPANCY">Discrepancy</option>
                </select>
              </>
            )}
            {(catFilter !== 'ALL' || inwardTypeFilter || inventoryTypeFilter || inventoryStatusFilter) && (
              <button onClick={() => { setCatFilter('ALL'); setInwardTypeFilter(''); setInventoryTypeFilter(''); setInventoryStatusFilter(''); }}
                style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Clear
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>
              {displayRows.length} record{displayRows.length !== 1 ? 's' : ''} shown
            </span>
          </div>

          {/* Table body */}
          {displayRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
              <FileBarChart size={36} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.2 }} />
              <div style={{ fontSize: '13px', fontWeight: 700 }}>No records found</div>
              <div style={{ fontSize: '11px', marginTop: '4px' }}>Try a different date range or filter</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto' }}>
              {activeTab === 'inward'      && <InwardTable      rows={inwardDisplayRows}      onDelete={handleDelete} canDelete={!isViewer} />}
              {activeTab === 'outward'     && <OutwardTable     rows={outwardDisplayRows}     onDelete={handleDelete} canDelete={!isViewer} onToggleLoaded={handleToggleLoaded} />}
              {activeTab === 'inventory'   && <InventoryTable   rows={inventoryDisplayRows}   onDelete={handleDelete} canDelete={!isViewer} />}
              {activeTab === 'cycle-count'    && <CycleCountTable             rows={cycleDisplayRows} />}
              {activeTab === 'discrepancy'    && <DiscrepancyTable            rows={discrepancyDisplayRows} onDelete={handleDelete} canDelete={!isViewer} />}
              {activeTab === 'cc-discrepancy' && <CycleCountDiscrepancyTable  rows={filteredRows} />}
            </div>
          )}
        </div>
      )}

      {/* Prompt to select a tab */}
      {!activeTab && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <FileBarChart size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.15 }} />
          <div style={{ fontSize: '14px', fontWeight: 700 }}>Select a report above to get started</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Download or view individual reports by selecting a tab.</div>
        </div>
      )}
    </div>
  );
}
