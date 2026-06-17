"use client";

import React, { useState } from "react";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { updateWarehouse, createWarehouse } from "./actions";

export default function SettingsClient({ initialWarehouses }: { initialWarehouses: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    storageType: "BOTH",
    totalCapacity: 1000,
  });

  const columns = [
    { key: "code", header: "Warehouse Code" },
    { key: "name", header: "Warehouse Name" },
    { key: "storageType", header: "Storage Type" },
    { key: "totalCapacity", header: "Capacity" },
    { 
      key: "isActive", 
      header: "Status",
      render: (item: any) => (
        <Badge variant={item.isActive ? "success" : "neutral"}>
          {item.isActive ? "Active" : "Inactive"}
        </Badge>
      )
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: any) => (
        <Button 
          variant={item.isActive ? "danger" : "primary"} 
          size="sm"
          onClick={async () => {
            await updateWarehouse(item.id, { name: item.name, isActive: !item.isActive });
            window.location.reload();
          }}
        >
          {item.isActive ? "Deactivate" : "Activate"}
        </Button>
      )
    }
  ];

  const handleSave = async () => {
    await createWarehouse({
      ...formData,
      totalCapacity: Number(formData.totalCapacity)
    });
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-brand-blue">System Settings</h1>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Warehouses</h2>
          <Button onClick={() => setIsModalOpen(true)}>+ Add Warehouse</Button>
        </div>
        <Table data={initialWarehouses} keyExtractor={(w) => w.id} columns={columns} />
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Add New Warehouse"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Code (e.g. CM37)" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
          <Input label="Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <Input type="number" label="Total Capacity" value={formData.totalCapacity} onChange={e => setFormData({...formData, totalCapacity: Number(e.target.value)})} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Storage Type</label>
            <select 
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-brand-accent outline-none"
              value={formData.storageType}
              onChange={e => setFormData({...formData, storageType: e.target.value})}
            >
              <option>BOTH</option>
              <option>RACK</option>
              <option>FLOOR</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
