"use client";

import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { relocateInventory } from "./actions";
import { AgGridReact } from "ag-grid-react";
import { Package, Weight, Layers, Search, RefreshCw } from "lucide-react";

type ViewMode = "ALL" | "RM" | "FG";

export default function InventoryClient({
  inventory,
  warehouses,
}: {
  inventory: any[];
  warehouses: any[];
}) {
  const [view, setView]                   = useState<ViewMode>("ALL");
  const [searchTerm, setSearchTerm]       = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [relocateModalOpen, setRelocateModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [relocating, setRelocating]       = useState(false);
  const [relocateData, setRelocateData]   = useState({ warehouseId: "", remarks: "" });

  // Parse customFields JSON for each batch
  const enriched = useMemo(() =>
    inventory.map((item) => {
      let cf: any = {};
      try { cf = JSON.parse(item.customFields || "{}"); } catch { cf = {}; }
      return {
        ...item,
        cf,
        // Determine category from material, then customFields
        category: (item.material?.category || cf.category || item.material?.materialType || "").toUpperCase(),
        // Display quantity based on view
        displayQtyKg:     parseFloat(cf.netWeight) || item.quantity,
        displayQtyPallet: parseFloat(cf.pallets)   || 0,
        huUnit: cf.huUnit || item.material?.huUnit || "Nos",
        binLocation: cf.binLocation || "—",
      };
    }),
  [inventory]);

  // Summary stats
  const rmBatches = enriched.filter((i) => i.category.includes("RM"));
  const fgBatches = enriched.filter((i) => i.category.includes("FG"));
  const totalRmKg     = rmBatches.reduce((s, i) => s + (i.displayQtyKg || 0), 0);
  const totalFgPallet = fgBatches.reduce((s, i) => s + (i.displayQtyPallet || 0), 0);

  // Filter
  const filtered = useMemo(() => enriched.filter((item) => {
    const matchSearch =
      !searchTerm ||
      (item.material?.code || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.material?.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.batchNumber || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchWh = !filterWarehouse || item.warehouseId === filterWarehouse;
    const matchView =
      view === "ALL" ? true :
      view === "RM"  ? item.category.includes("RM") :
      /* FG */         item.category.includes("FG");
    return matchSearch && matchWh && matchView;
  }), [enriched, searchTerm, filterWarehouse, view]);

  // Column defs — adapt to view
  const columnDefs = useMemo(() => {
    const base = [
      {
        field: "materialCode",
        headerName: "Material",
        valueGetter: (p: any) =>
          `${p.data.material?.code || "—"} · ${p.data.material?.description || ""}`,
        flex: 2,
        minWidth: 200,
      },
      { field: "batchNumber", headerName: "Invoice / Batch No", flex: 1, minWidth: 140 },
      {
        field: "category",
        headerName: "Category",
        cellRenderer: (p: any) => (
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
            p.value?.includes("FG") ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"
          }`}>{p.value || "—"}</span>
        ),
        flex: 0.6,
        minWidth: 90,
      },
    ];

    if (view === "RM" || view === "ALL") {
      base.push({
        field: "displayQtyKg",
        headerName: "Qty (KGs)",
        valueFormatter: (p: any) => p.value ? `${Number(p.value).toFixed(2)} kg` : "—",
        flex: 0.8,
        minWidth: 100,
      } as any);
    }
    if (view === "FG" || view === "ALL") {
      base.push({
        field: "displayQtyPallet",
        headerName: "Qty (Pallets)",
        valueFormatter: (p: any) => p.value ? `${Number(p.value).toFixed(0)} plt` : "—",
        flex: 0.8,
        minWidth: 110,
      } as any);
    }
    if (view === "ALL") {
      base.push({
        field: "quantity",
        headerName: "Qty (Nos)",
        valueFormatter: (p: any) => `${Number(p.value).toFixed(2)}`,
        flex: 0.7,
        minWidth: 90,
      } as any);
    }

    base.push(
      { field: "warehouse.name", headerName: "Warehouse",    flex: 1,   minWidth: 120 } as any,
      {
        field: "binLocation",
        headerName: "BIN Location",
        valueGetter: (p: any) => p.data.cf?.binLocation || p.data.rack?.code || p.data.floorLocation?.code || "—",
        flex: 0.8,
        minWidth: 100,
      } as any,
      {
        field: "receiptDate",
        headerName: "Receipt Date",
        valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString("en-IN") : "—",
        flex: 0.8,
        minWidth: 110,
      } as any,
      {
        field: "stockStatus",
        headerName: "Status",
        cellRenderer: (p: any) => (
          <Badge variant={p.value === "GOOD" ? "success" : p.value === "DAMAGED" ? "danger" : "warning"}>
            {p.value}
          </Badge>
        ),
        flex: 0.7,
        minWidth: 90,
      } as any,
      {
        headerName: "Actions",
        cellRenderer: (p: any) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedBatch(p.data);
              setRelocateData({ warehouseId: p.data.warehouseId, remarks: "" });
              setRelocateModalOpen(true);
            }}
          >
            Relocate
          </Button>
        ),
        flex: 0.7,
        minWidth: 100,
        sortable: false,
        filter: false,
      } as any
    );

    return base;
  }, [view]);

  const handleRelocate = async () => {
    if (!selectedBatch) return;
    setRelocating(true);
    try {
      await relocateInventory(
        selectedBatch.id,
        { warehouseId: relocateData.warehouseId },
        relocateData.remarks
      );
      window.location.reload();
    } catch {
      alert("Relocation failed. Please try again.");
    } finally {
      setRelocating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package size={24} className="text-blue-600" /> Inventory Lookup
        </h1>
        <p className="text-sm text-gray-500 mt-1">Live stock visibility across all warehouses</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package size={16} className="text-blue-600" />
            <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Total SKUs</span>
          </div>
          <div className="text-3xl font-black text-blue-700">{enriched.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">inventory batches</div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Weight size={16} className="text-green-600" />
            <span className="text-xs font-bold uppercase tracking-wide text-green-700">RM – KGS</span>
          </div>
          <div className="text-3xl font-black text-green-700">{totalRmKg.toFixed(0)}</div>
          <div className="text-xs text-gray-400 mt-0.5">kg raw material · {rmBatches.length} batches</div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={16} className="text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wide text-purple-700">FG – Pallets</span>
          </div>
          <div className="text-3xl font-black text-purple-700">{totalFgPallet.toFixed(0)}</div>
          <div className="text-xs text-gray-400 mt-0.5">pallets finished goods · {fgBatches.length} batches</div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package size={16} className="text-gray-600" />
            <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Warehouses</span>
          </div>
          <div className="text-3xl font-black text-gray-700">{warehouses.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">active locations</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View tabs */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          {([
            { id: "ALL", label: "All Stock",    icon: <Package size={13}/> },
            { id: "RM",  label: "RM – KGS",    icon: <Weight  size={13}/> },
            { id: "FG",  label: "FG – Pallets", icon: <Layers  size={13}/> },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold transition ${
                view === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search material or batch..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Warehouse filter */}
        <select
          value={filterWarehouse}
          onChange={(e) => setFilterWarehouse(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        <span className="text-xs text-gray-400 ml-auto">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* AG Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className={`ag-theme-quartz w-full`} style={{ height: 520 }}>
          <AgGridReact
            rowData={filtered}
            columnDefs={columnDefs}
            pagination={true}
            paginationPageSize={20}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
            }}
            rowClass="hover:bg-blue-50/30"
          />
        </div>
      </div>

      {/* Relocate Modal */}
      <Modal
        isOpen={relocateModalOpen}
        onClose={() => setRelocateModalOpen(false)}
        title="Relocate Stock"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRelocateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleRelocate} disabled={relocating}>
              {relocating ? "Moving..." : "Confirm Relocation"}
            </Button>
          </>
        }
      >
        {selectedBatch && (
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div><strong>Material:</strong> {selectedBatch.material?.code} · {selectedBatch.material?.description}</div>
              <div><strong>Batch:</strong> {selectedBatch.batchNumber} &nbsp;|&nbsp; <strong>Qty:</strong> {selectedBatch.quantity}</div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">New Warehouse</label>
              <select
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={relocateData.warehouseId}
                onChange={(e) => setRelocateData({ ...relocateData, warehouseId: e.target.value })}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <Input
              label="Relocation Remarks"
              value={relocateData.remarks}
              onChange={(e) => setRelocateData({ ...relocateData, remarks: e.target.value })}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
