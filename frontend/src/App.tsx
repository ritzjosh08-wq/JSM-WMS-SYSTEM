import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Inward from './pages/Inward';
import CycleCount from './pages/CycleCount';
import Dashboard from './pages/Dashboard';
import Outward from './pages/Outward';
import SmartIngestion from './pages/SmartIngestion';
import Inventory from './pages/Inventory';
import Login from './pages/Login';
import Reports from './pages/Reports';
import MaterialMaster from './pages/MaterialMaster';
import WarehouseMap from './pages/WarehouseMap';
import Settings from './pages/Settings';
import { useAuthStore } from './store/authStore';

// Admin-only route — redirects non-admins to dashboard
function AdminRoute({ element }: { element: React.ReactElement }) {
  const role = useAuthStore(s => s.user?.role);
  return role === 'ADMIN' ? element : <Navigate to="/" replace />;
}

function StaffRoute({ element }: { element: React.ReactElement }) {
  const role = useAuthStore(s => s.user?.role);
  return role === 'CUSTOMER' ? <Navigate to="/" replace /> : element;
}

export default function App() {
  const user = useAuthStore(s => s.user);

  if (!user) return <Login />;

  return (
    <Router>
      <div style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: '#f1f5f9',
        color: '#1e293b',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}>
        <Sidebar />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <Header />
          <main style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px',
            background: '#f1f5f9',
          }}>
            <Routes>
              <Route path="/"               element={<Dashboard />} />
              <Route path="/inward"         element={<StaffRoute element={<Inward />} />} />
              <Route path="/outward"        element={<StaffRoute element={<Outward />} />} />
              <Route path="/smart-ingestion" element={<AdminRoute element={<SmartIngestion />} />} />
              <Route path="/cycle-count"    element={<CycleCount />} />
              <Route path="/inventory"      element={<Inventory />} />
              <Route path="/reports"         element={<Reports />} />
              <Route path="/material-master" element={<MaterialMaster />} />
              <Route path="/warehouse-map"   element={<WarehouseMap />} />
              <Route path="/settings"        element={<AdminRoute element={<Settings />} />} />
              <Route path="*"               element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}
