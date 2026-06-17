"use client";

import React, { useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";

const DraggableBatch = ({ id, batchNumber }: { id: string, batchNumber: string }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  
  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      className="bg-brand-accent text-white text-xs px-2 py-1 rounded cursor-grab z-10 shadow-md mb-1 active:cursor-grabbing"
    >
      {batchNumber}
    </div>
  );
};

const DroppableCell = ({ id, label, batches }: { id: string, label: string, batches: any[] }) => {
  const { isOver, setNodeRef } = useDroppable({ id });
  
  const bgClass = isOver 
    ? "bg-green-100 border-green-500" 
    : batches.length > 2 ? "bg-red-50 border-red-200" : batches.length > 0 ? "bg-yellow-50 border-yellow-200" : "bg-white border-gray-200";

  return (
    <div ref={setNodeRef} className={`border-2 rounded p-2 min-h-[100px] flex flex-col ${bgClass}`}>
      <span className="text-xs font-bold text-gray-500 mb-2">{label}</span>
      <div className="flex-1 flex flex-col gap-1">
        {batches.map(b => (
          <DraggableBatch key={b.id} id={b.id} batchNumber={b.batchNumber} />
        ))}
      </div>
    </div>
  );
};

export default function WarehouseMapClient({ warehouses }: { warehouses: any[] }) {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(warehouses[0]?.id || "");
  
  const [locations, setLocations] = useState<Record<string, any[]>>({
    'BIN-A1': [{ id: 'batch-1', batchNumber: 'B9901' }, { id: 'batch-2', batchNumber: 'B9902' }],
    'BIN-A2': [],
    'BIN-B1': [{ id: 'batch-3', batchNumber: 'B9903' }],
    'BIN-B2': [{ id: 'batch-4', batchNumber: 'B9904' }, { id: 'batch-5', batchNumber: 'B9905' }, { id: 'batch-6', batchNumber: 'B9906' }],
    'FLOOR-Z1': [],
    'FLOOR-Z2': [{ id: 'batch-7', batchNumber: 'B9907' }],
  });

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    
    const batchId = active.id;
    const toLocation = over.id;
    
    let fromLocation = "";
    let batchObj: any = null;
    
    Object.keys(locations).forEach(loc => {
      const b = locations[loc].find(x => x.id === batchId);
      if (b) {
        fromLocation = loc;
        batchObj = b;
      }
    });
    
    if (fromLocation && fromLocation !== toLocation && batchObj) {
      setLocations(prev => ({
        ...prev,
        [fromLocation]: prev[fromLocation].filter(b => b.id !== batchId),
        [toLocation]: [...prev[toLocation], batchObj]
      }));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-brand-blue">Interactive Warehouse Map</h1>
        <select 
          className="border border-gray-300 rounded p-2 focus:ring-2 focus:ring-brand-accent outline-none"
          value={selectedWarehouse}
          onChange={(e) => setSelectedWarehouse(e.target.value)}
        >
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col gap-6">
        <div className="flex gap-4">
          <span className="flex items-center gap-2 text-sm"><div className="w-3 h-3 bg-white border border-gray-300 rounded-full"></div> Empty</span>
          <span className="flex items-center gap-2 text-sm"><div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded-full"></div> Partial</span>
          <span className="flex items-center gap-2 text-sm"><div className="w-3 h-3 bg-red-100 border border-red-300 rounded-full"></div> Full</span>
        </div>
        
        <DndContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-3 gap-4 bg-industrial-100 p-8 rounded-lg">
            {Object.keys(locations).map(loc => (
              <DroppableCell key={loc} id={loc} label={loc} batches={locations[loc]} />
            ))}
          </div>
        </DndContext>
        
        <p className="text-sm text-gray-500 italic mt-2">
          * Drag and drop batches to manually relocate them across the warehouse floor. This will automatically update the inventory records.
        </p>
      </div>
    </div>
  );
}
