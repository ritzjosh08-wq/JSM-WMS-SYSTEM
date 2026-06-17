"use client";

import React, { useState } from "react";
import { fetchFIFORecommendation, createOutwardEntry } from "./actions";
import SmartDocumentUploader from "@/components/SmartDocumentUploader";
import { AgGridReact } from 'ag-grid-react';

export default function OutwardClient({ materials }: { materials: any[] }) {
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  
  const [dispatchData, setDispatchData] = useState({
    materialCode: "",
    requiredQty: 0,
    truckNumber: "",
    transporter: "",
    destination: "",
    sapDocumentNo: "",
  });

  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [uploadedData, setUploadedData] = useState<any[] | null>(null);

  const handleGetRecommendation = async () => {
    if (!dispatchData.materialCode || dispatchData.requiredQty <= 0) {
      alert("Please select material and enter valid quantity.");
      return;
    }
    const recs = await fetchFIFORecommendation(dispatchData.materialCode, dispatchData.requiredQty);
    setRecommendations(recs);
    setIsFetched(true);
  };

  const handleDispatch = async () => {
    if (!dispatchData.truckNumber) {
      alert("Truck number is mandatory.");
      return;
    }
    
    const totalRecommended = recommendations.reduce((acc, curr) => acc + curr.recommendedPick, 0);
    if (totalRecommended < dispatchData.requiredQty) {
      const confirm = window.confirm(`Only ${totalRecommended} available. Dispatch partial quantity?`);
      if (!confirm) return;
    }

    try {
      await createOutwardEntry({
        ...dispatchData,
        picks: recommendations.filter(r => r.recommendedPick > 0).map(r => ({
          batchId: r.batchId,
          batchNumber: r.batchNumber,
          pickQty: r.recommendedPick,
          warehouseId: "dummy"
        }))
      });
      alert("Dispatch successful!");
      window.location.href = "/inventory";
    } catch (e) {
      alert("Dispatch failed.");
    }
  };

  const handleUploadComplete = (data: any[]) => {
    setUploadedData(data);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-blue">Outbound Dispatch</h1>

      <div className="flex gap-4 border-b border-gray-200">
        <button 
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'manual' ? 'border-brand-accent text-brand-accent' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          onClick={() => setActiveTab('manual')}
        >
          Manual Dispatch
        </button>
        <button 
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${activeTab === 'upload' ? 'border-brand-accent text-brand-accent' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          onClick={() => setActiveTab('upload')}
        >
          Bulk Upload Dispatch
        </button>
      </div>

      {activeTab === 'manual' ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-lg mb-4">Material Selection</h3>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Material *</label>
                  <select 
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-brand-accent outline-none"
                    value={dispatchData.materialCode}
                    onChange={e => setDispatchData({...dispatchData, materialCode: e.target.value})}
                  >
                    <option value="">Select Material</option>
                    {materials.map(m => (
                      <option key={m.id} value={m.code}>{m.code} - {m.description}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Required Quantity *</label>
                  <input 
                    type="number"
                    className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-brand-accent outline-none"
                    value={dispatchData.requiredQty || ''} 
                    onChange={e => setDispatchData({...dispatchData, requiredQty: Number(e.target.value)})} 
                  />
                </div>
                <button 
                  onClick={handleGetRecommendation}
                  className="self-start bg-brand-lightBlue text-white px-4 py-2 rounded font-medium hover:bg-brand-blue transition"
                >
                  Get FIFO Recommendation
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-lg mb-4">Truck Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Truck Number *</label>
                  <input className="w-full border border-gray-300 rounded-md p-2" value={dispatchData.truckNumber} onChange={e => setDispatchData({...dispatchData, truckNumber: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Transporter</label>
                  <input className="w-full border border-gray-300 rounded-md p-2" value={dispatchData.transporter} onChange={e => setDispatchData({...dispatchData, transporter: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
                  <input className="w-full border border-gray-300 rounded-md p-2" value={dispatchData.destination} onChange={e => setDispatchData({...dispatchData, destination: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SAP Document No</label>
                  <input className="w-full border border-gray-300 rounded-md p-2" value={dispatchData.sapDocumentNo} onChange={e => setDispatchData({...dispatchData, sapDocumentNo: e.target.value})} />
                </div>
              </div>
            </div>
          </div>

          {isFetched && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-lg">FIFO Recommendation</h3>
              <div className="ag-theme-alpine w-full h-64">
                <AgGridReact 
                  rowData={recommendations}
                  columnDefs={[
                    { field: 'batchNumber', headerName: 'Batch No' },
                    { field: 'warehouse', headerName: 'Warehouse' },
                    { field: 'location', headerName: 'Location' },
                    { field: 'available', headerName: 'Available Qty' },
                    { 
                      field: 'receiptDate', 
                      headerName: 'Receipt Date',
                      valueFormatter: (params) => new Date(params.value).toLocaleDateString()
                    },
                    { 
                      field: 'recommendedPick', 
                      headerName: 'Recommended Pick',
                      editable: true,
                      onCellValueChanged: (event) => {
                        const newRecs = [...recommendations];
                        const idx = newRecs.findIndex(r => r.batchId === event.data.batchId);
                        newRecs[idx].recommendedPick = Number(event.newValue);
                        setRecommendations(newRecs);
                      }
                    }
                  ]}
                />
              </div>
              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button onClick={handleDispatch} className="bg-status-green text-white px-6 py-2 rounded-md font-medium">Confirm Dispatch</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {!uploadedData ? (
            <SmartDocumentUploader 
              onProcessComplete={handleUploadComplete} 
              expectedFields={[
                { key: "materialCode", label: "Material Code" },
                { key: "quantity", label: "Required Quantity" },
                { key: "truckNumber", label: "Truck Number" },
                { key: "sapDocumentNo", label: "SAP Document No" }
              ]}
            />
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Bulk Upload Data Ready</h3>
                <button onClick={() => setUploadedData(null)} className="text-sm text-gray-500 hover:underline">Start Over</button>
              </div>
              <div className="bg-industrial-100 rounded-md p-4 max-h-64 overflow-auto text-sm">
                <pre>{JSON.stringify(uploadedData.slice(0, 5), null, 2)}</pre>
              </div>
              <div className="flex justify-end">
                <button className="bg-brand-accent text-white px-6 py-2 rounded-md font-medium">Run Bulk Dispatch</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
