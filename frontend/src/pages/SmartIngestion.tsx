"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SmartDocumentUploader from "@/components/SmartDocumentUploader";

export default function SmartIngestionClient() {
  const [processedData, setProcessedData] = useState<any[] | null>(null);
  const navigate = useNavigate();

  const handleProcessComplete = (data: any[]) => {
    setProcessedData(data);
  };

  const handleCreateInward = () => {
    if (processedData) {
      sessionStorage.setItem('smartIngestionData', JSON.stringify(processedData));
      navigate('/inward');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-brand-blue">Smart Document Ingestion</h1>
      </div>

      {!processedData ? (
        <SmartDocumentUploader 
          onProcessComplete={handleProcessComplete} 
          expectedFields={[
            { key: "materialCode", label: "Material Code" },
            { key: "quantity", label: "Quantity" },
            { key: "batchNumber", label: "Batch Number" },
            { key: "warehouseId", label: "Warehouse" },
            { key: "rackId", label: "Rack" }
          ]}
        />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">Review & Send to Inward Entry</h3>
            <button 
              onClick={() => setProcessedData(null)}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Start Over
            </button>
          </div>
          <div className="bg-industrial-100 rounded p-4 text-sm text-gray-700">
            <p className="font-medium mb-2">Mapped Data Ready for Inward Entry:</p>
            <pre className="overflow-auto max-h-64 bg-white p-2 border border-gray-200 rounded">
              {JSON.stringify(processedData.slice(0, 5), null, 2)}
              {processedData.length > 5 && "\n... (more records)"}
            </pre>
          </div>
          <div className="flex justify-end">
             <button 
               onClick={handleCreateInward}
               className="bg-status-success text-white px-6 py-2 rounded-md font-medium hover:opacity-90 transition-colors"
             >
               Create Inward Entry
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
