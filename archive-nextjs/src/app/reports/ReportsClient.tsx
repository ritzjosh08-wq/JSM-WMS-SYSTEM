"use client";

import React from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function ReportsClient({ inventory, inward, outward }: { inventory: any[], inward: any[], outward: any[] }) {
  const exportInventory = () => {
    const data = inventory.map(item => ({
      "Material Code": item.material.code,
      "Description": item.material.description,
      "Batch Number": item.batchNumber,
      "Quantity": item.quantity,
      "Warehouse": item.warehouse.name,
      "Location": item.rack?.code || item.floorLocation?.code || "Unassigned",
      "Status": item.stockStatus,
      "Receipt Date": new Date(item.receiptDate).toLocaleDateString()
    }));
    downloadExcel(data, "Inventory_Report");
  };

  const exportInward = () => {
    const data = inward.map(item => ({
      "Entry No": item.inwardNumber,
      "Truck": item.truckNumber,
      "Transporter": item.transporter || "",
      "Status": item.status,
      "Date": new Date(item.createdAt).toLocaleDateString()
    }));
    downloadExcel(data, "Inward_Report");
  };

  const exportOutward = () => {
    const data = outward.map(item => ({
      "Dispatch No": item.outwardNumber,
      "Truck": item.truckNumber,
      "Destination": item.destination || "",
      "Status": item.status,
      "Date": new Date(item.dispatchDate).toLocaleDateString()
    }));
    downloadExcel(data, "Outward_Report");
  };

  const downloadExcel = (data: any[], fileName: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-blue">Reports & Exports</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card title="Inventory Report">
          <p className="text-gray-500 mb-4 text-sm leading-relaxed">
            Export the current active inventory across all warehouses including stock status and locations.
          </p>
          <Button onClick={exportInventory}>Download Inventory (.xlsx)</Button>
        </Card>

        <Card title="Inward Operations">
          <p className="text-gray-500 mb-4 text-sm leading-relaxed">
            Export all inward documents and truck receipts.
          </p>
          <Button onClick={exportInward}>Download Inward (.xlsx)</Button>
        </Card>

        <Card title="Outward Operations">
          <p className="text-gray-500 mb-4 text-sm leading-relaxed">
            Export all outbound dispatch records.
          </p>
          <Button onClick={exportOutward}>Download Outward (.xlsx)</Button>
        </Card>
      </div>
    </div>
  );
}
