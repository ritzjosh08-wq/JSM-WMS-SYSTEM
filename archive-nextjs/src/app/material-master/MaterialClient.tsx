"use client";

import React, { useState } from "react";
import { Table } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { createMaterial, toggleMaterialStatus } from "./actions";

export default function MaterialClient({ initialMaterials }: { initialMaterials: any[] }) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    materialType: "CFC Sheet",
    huUnit: "Nos",
  });

  const filteredMaterials = materials.filter(m => 
    m.code.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async () => {
    await createMaterial(formData);
    window.location.reload();
  };

  const columns = [
    { key: "code", header: "Material Code" },
    { key: "description", header: "Description" },
    { key: "materialType", header: "Material Type" },
    { key: "huUnit", header: "Unit" },
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
            await toggleMaterialStatus(item.id, !item.isActive);
            window.location.reload();
          }}
        >
          {item.isActive ? "Deactivate" : "Activate"}
        </Button>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-brand-blue">Material Master</h1>
        <Button onClick={() => setIsModalOpen(true)}>+ Add Material</Button>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <div className="mb-4 max-w-sm">
          <Input 
            placeholder="Search material..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Table data={filteredMaterials} keyExtractor={(m) => m.id} columns={columns} />
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Add New Material"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Material</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input 
            label="Material Code" 
            value={formData.code} 
            onChange={e => setFormData({...formData, code: e.target.value})} 
          />
          <Input 
            label="Description" 
            value={formData.description} 
            onChange={e => setFormData({...formData, description: e.target.value})} 
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Material Type</label>
            <select 
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-brand-accent outline-none"
              value={formData.materialType}
              onChange={e => setFormData({...formData, materialType: e.target.value})}
            >
              <option>CFC Sheet</option>
              <option>Granules</option>
              <option>Kraft Reel</option>
              <option>Paper Board</option>
              <option>Poly Reel</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HU Unit</label>
            <select 
              className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-brand-accent outline-none"
              value={formData.huUnit}
              onChange={e => setFormData({...formData, huUnit: e.target.value})}
            >
              <option>Nos</option>
              <option>Kg</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
