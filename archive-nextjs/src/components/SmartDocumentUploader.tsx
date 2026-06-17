"use client";

import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { UploadCloud, CheckCircle, FileText, AlertCircle } from 'lucide-react';

interface SmartDocumentUploaderProps {
  onProcessComplete: (data: any[]) => void;
  expectedFields?: { key: string, label: string }[];
}

export default function SmartDocumentUploader({ onProcessComplete, expectedFields = [] }: SmartDocumentUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultExpected = expectedFields.length > 0 ? expectedFields : [
    { key: "materialCode", label: "Material Code" },
    { key: "quantity", label: "Quantity" },
    { key: "batchNumber", label: "Batch Number" },
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const buffer = event.target?.result;
        let data: any[] = [];

        if (uploadedFile.name.endsWith('.pdf')) {
          // Mock PDF parsing (Extract text to simulate table)
          alert("Basic PDF Extraction triggered. For complex tables, OCR may be required.");
          data = [{ 'Extracted Text': "PDF Data 1" }, { 'Extracted Text': "PDF Data 2" }];
        } else {
          const workbook = XLSX.read(buffer, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          data = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
        }

        if (data.length > 0) {
          const cols = Object.keys(data[0]);
          setColumns(cols);
          
          // Auto fuzzy match mapping
          const initialMapping: Record<string, string> = {};
          cols.forEach(col => {
            const lowerCol = col.toLowerCase().replace(/[^a-z0-9]/g, '');
            const match = defaultExpected.find(f => 
              f.label.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerCol ||
              f.key.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerCol
            );
            if (match) {
              initialMapping[col] = match.key;
            } else {
              initialMapping[col] = "custom"; // unmapped -> custom
            }
          });
          setMapping(initialMapping);
        }
        setRawRows(data.map((row, i) => ({ ...row, _id: i })));
      } catch (err) {
        console.error(err);
        alert("Failed to parse file.");
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  const columnDefs = useMemo(() => {
    return columns.map(col => ({
      field: col,
      headerName: col,
      sortable: true,
      filter: true,
      resizable: true,
    }));
  }, [columns]);

  const handleConfirm = () => {
    const processedData = rawRows.map(row => {
      const mappedRecord: any = { customFields: {} };
      columns.forEach(col => {
        const mappedKey = mapping[col];
        if (mappedKey === 'custom') {
          mappedRecord.customFields[col] = row[col];
        } else {
          mappedRecord[mappedKey] = row[col];
        }
      });
      mappedRecord.customFields = JSON.stringify(mappedRecord.customFields);
      return mappedRecord;
    });
    onProcessComplete(processedData);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col gap-6">
      
      {!file ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer hover:bg-industrial-100 transition-colors"
        >
          <UploadCloud size={48} className="text-brand-blue mb-4" />
          <h3 className="text-lg font-semibold text-gray-800">Upload Document</h3>
          <p className="text-sm text-gray-500 mt-2">Drag and drop or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">Supports XLSX, XLS, CSV, PDF</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".pdf,.xlsx,.xls,.csv" 
            onChange={handleFileUpload} 
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between bg-industrial-100 p-4 rounded-md">
            <div className="flex items-center gap-3">
              <FileText className="text-brand-blue" size={24} />
              <div>
                <p className="font-semibold">{file.name}</p>
                <p className="text-xs text-gray-500">{rawRows.length} records extracted</p>
              </div>
            </div>
            <button 
              onClick={() => { setFile(null); setRawRows([]); setColumns([]); }}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Upload Different File
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 border border-gray-200 rounded-md p-4 bg-gray-50">
              <h4 className="font-semibold mb-4 text-sm flex items-center gap-2">
                <AlertCircle size={16} className="text-status-yellow" />
                Column Mapping
              </h4>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2 scrollbar-thin">
                {columns.map(col => (
                  <div key={col} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700 truncate" title={col}>{col}</label>
                    <select 
                      className="text-sm border border-gray-300 rounded p-1.5 focus:ring-1 focus:ring-brand-blue"
                      value={mapping[col]}
                      onChange={(e) => setMapping(prev => ({ ...prev, [col]: e.target.value }))}
                    >
                      <option value="custom">-- Custom Field (Save as Extra) --</option>
                      {defaultExpected.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="md:col-span-2 flex flex-col gap-2">
              <h4 className="font-semibold text-sm">Full Data Preview</h4>
              <div className="ag-theme-alpine w-full h-[400px]">
                <AgGridReact 
                  rowData={rawRows}
                  columnDefs={columnDefs}
                  defaultColDef={{ sortable: true, filter: true, resizable: true }}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button 
              onClick={handleConfirm}
              className="bg-brand-blue text-white px-6 py-2 rounded-md font-medium flex items-center gap-2 hover:bg-brand-lightBlue transition-colors"
            >
              <CheckCircle size={18} />
              Confirm & Continue
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
