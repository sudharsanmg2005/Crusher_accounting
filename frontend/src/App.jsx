import React, { useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Materials from './pages/Materials';
import Bills from './pages/Bills';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Admins from './pages/Admins';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import Employees from './pages/Employees';
import ProtectedRoute from './components/ProtectedRoute';

const App = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isPublicPage = location.pathname === '/login' || location.pathname === '/';

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {!isPublicPage && <Navbar onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />}
      <div className="flex flex-1 min-h-0 relative">
        {!isPublicPage && <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
        <main className={`flex-1 overflow-y-auto min-h-0 min-w-0 ${isPublicPage ? '' : 'p-4 lg:p-6'}`}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute>
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/materials"
              element={
                <ProtectedRoute>
                  <Materials />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bills"
              element={
                <ProtectedRoute>
                  <Bills />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <Expenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/super-admin"
              element={
                <ProtectedRoute>
                  <SuperAdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admins"
              element={
                <ProtectedRoute>
                  <Admins />
                </ProtectedRoute>
              }
            />
            <Route
              path="/employees"
              element={
                <ProtectedRoute>
                  <Employees />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default App;

