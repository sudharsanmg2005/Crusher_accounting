import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';
import Admins from './Admins';
import BusinessRecords from '../components/BusinessRecords';
import RestoreManagement from '../components/RestoreManagement';
import RecordFilters from '../components/RecordFilters';
import { defaultRecordFilters, filterRecords } from '../utils/recordFilters';
import { formatDateTime } from '../utils/dateTime';
import { useConfirm } from '../components/ConfirmDialog';
import { EyeIcon, TrashIcon } from '../components/Icons';

const baseTabs = [
  { id: 'control', label: 'Super Admin Control' },
  { id: 'restore', label: 'Restore Management' },
  { id: 'live', label: 'Live Records' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'business', label: 'Business Records' }
];

const money = (value) => `₹${Number(value || 0).toLocaleString()}`;

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState('control');
  const [liveBills, setLiveBills] = useState([]);
  const [liveExpenses, setLiveExpenses] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [showOnlyEdits, setShowOnlyEdits] = useState(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState(null);
  const [selectedLogs, setSelectedLogs] = useState([]);
  const [selectedLiveBills, setSelectedLiveBills] = useState([]);
  const [selectedLiveExpenses, setSelectedLiveExpenses] = useState([]);
  const [businessRecords, setBusinessRecords] = useState({
    customers: [],
    employees: [],
    bills: [],
    expenses: [],
    materials: []
  });
  const [liveFilters, setLiveFilters] = useState({ ...defaultRecordFilters });
  const [auditFilters, setAuditFilters] = useState({ ...defaultRecordFilters });
  const [businessFilters, setBusinessFilters] = useState({ ...defaultRecordFilters });
  const [restoreConflictCount, setRestoreConflictCount] = useState(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const handleRestoreLog = async (log) => {
    const ok = await confirm({
      title: 'Restore Original State',
      message: `Are you sure you want to revert this ${log.metadata?.resource} to its original state?`,
      confirmText: 'Restore',
      tone: 'primary'
    });
    if (!ok) return;

    try {
      const { data } = await api.post(`/auth/audit-logs/${log._id}/restore`);
      alert(data.message || 'Restored successfully.');
      setSelectedAuditLog(null);
      await fetchAuditLogs();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to restore original state.');
    }
  };

  const handleDeleteLog = async (log) => {
    const ok = await confirm({
      title: 'Delete History Permanently',
      message: 'Are you sure you want to permanently delete this audit log entry? This history will be lost forever.',
      confirmText: 'Delete Permanently',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      const { data } = await api.delete(`/auth/audit-logs/${log._id}`);
      alert(data.message || 'Log deleted permanently.');
      setSelectedAuditLog(null);
      await fetchAuditLogs();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete audit log.');
    }
  };

  const fetchRestoreConflictCount = useCallback(async () => {
    try {
      const { data } = await api.get('/restore-management/preview');
      const count =
        (data.customers || []).filter((item) => item.restoreStatus === 'Existing').length +
        (data.employees || []).filter((item) => item.restoreStatus === 'Existing').length;
      setRestoreConflictCount(count);
    } catch {
      setRestoreConflictCount(0);
    }
  }, []);

  const tabs = baseTabs;

  const fetchLiveData = async () => {
    const [billsRes, expensesRes, customersRes] = await Promise.all([
      api.get('/bills'),
      api.get('/expenses'),
      api.get('/customers')
    ]);
    setLiveBills(billsRes.data);
    setLiveExpenses(expensesRes.data);
    setBusinessRecords((prev) => ({ ...prev, customers: customersRes.data }));
  };

  const fetchAuditLogs = async () => {
    const { data } = await api.get('/auth/audit-logs?limit=500');
    setAuditLogs(data);
  };

  const fetchAdmins = async () => {
    const { data } = await api.get('/auth/admins');
    setAdmins(data);
  };

  const fetchBusinessRecords = async () => {
    const [customersRes, billsRes, expensesRes, employeesRes, materialsRes] = await Promise.all([
      api.get('/customers'),
      api.get('/bills'),
      api.get('/expenses'),
      api.get('/employees'),
      api.get('/materials')
    ]);
    setBusinessRecords({
      customers: customersRes.data,
      employees: employeesRes.data,
      bills: billsRes.data,
      expenses: expensesRes.data,
      materials: materialsRes.data
    });
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchRestoreConflictCount();
  }, [isSuperAdmin, fetchRestoreConflictCount]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    if (activeTab === 'live') {
      fetchLiveData();
      const id = setInterval(fetchLiveData, 15000);
      return () => clearInterval(id);
    }
    if (activeTab === 'audit') {
      fetchAuditLogs();
      fetchAdmins();
    }
    if (activeTab === 'business') fetchBusinessRecords();
  }, [activeTab, isSuperAdmin]);

  useEffect(() => {
    setSelectedLogs([]);
  }, [auditFilters, showOnlyEdits, activeTab]);

  useEffect(() => {
    setSelectedLiveBills([]);
    setSelectedLiveExpenses([]);
  }, [liveFilters, activeTab]);

  const handleDeleteLiveBill = async (bill) => {
    const ok = await confirm({
      title: 'Delete Live Bill',
      message: `Are you sure you want to delete live bill for "${bill.customerNameSnapshot}" on ${new Date(bill.date).toLocaleDateString()}? This will archive the bill.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await api.delete(`/bills/${bill._id}`);
      await fetchLiveData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete bill.');
    }
  };

  const handleDeleteLiveExpense = async (expense) => {
    const ok = await confirm({
      title: 'Delete Live Expense',
      message: `Are you sure you want to delete live expense "${expense.type}" for Rs. ${Number(expense.amount).toLocaleString()}? This will archive the expense.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await api.delete(`/expenses/${expense._id}`);
      await fetchLiveData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete expense.');
    }
  };

  const handleBulkDeleteLiveBills = async () => {
    if (selectedLiveBills.length === 0) return;
    const ok = await confirm({
      title: 'Delete Selected Live Bills',
      message: `Are you sure you want to delete the ${selectedLiveBills.length} selected live bills? This will archive them.`,
      confirmText: 'Delete Selected',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      let successCount = 0;
      await Promise.all(
        selectedLiveBills.map(async (bill) => {
          try {
            await api.delete(`/bills/${bill._id}`);
            successCount++;
          } catch (err) {
            console.error('Failed to delete live bill', err);
          }
        })
      );
      alert(`Successfully deleted ${successCount} live bills.`);
      setSelectedLiveBills([]);
      await fetchLiveData();
    } catch (err) {
      alert('An error occurred during bulk deletion.');
    }
  };

  const handleBulkDeleteLiveExpenses = async () => {
    if (selectedLiveExpenses.length === 0) return;
    const ok = await confirm({
      title: 'Delete Selected Live Expenses',
      message: `Are you sure you want to delete the ${selectedLiveExpenses.length} selected live expenses? This will archive them.`,
      confirmText: 'Delete Selected',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      let successCount = 0;
      await Promise.all(
        selectedLiveExpenses.map(async (expense) => {
          try {
            await api.delete(`/expenses/${expense._id}`);
            successCount++;
          } catch (err) {
            console.error('Failed to delete live expense', err);
          }
        })
      );
      alert(`Successfully deleted ${successCount} live expenses.`);
      setSelectedLiveExpenses([]);
      await fetchLiveData();
    } catch (err) {
      alert('An error occurred during bulk deletion.');
    }
  };

  const handleSelectLiveBill = (bill) => {
    setSelectedLiveBills((prev) => {
      const exists = prev.some((b) => b._id === bill._id);
      if (exists) {
        return prev.filter((b) => b._id !== bill._id);
      } else {
        return [...prev, bill];
      }
    });
  };

  const handleSelectAllLiveBills = () => {
    if (selectedLiveBills.length === filteredLiveBills.length) {
      setSelectedLiveBills([]);
    } else {
      setSelectedLiveBills(filteredLiveBills);
    }
  };

  const handleSelectLiveExpense = (expense) => {
    setSelectedLiveExpenses((prev) => {
      const exists = prev.some((e) => e._id === expense._id);
      if (exists) {
        return prev.filter((e) => e._id !== expense._id);
      } else {
        return [...prev, expense];
      }
    });
  };

  const handleSelectAllLiveExpenses = () => {
    if (selectedLiveExpenses.length === filteredLiveExpenses.length) {
      setSelectedLiveExpenses([]);
    } else {
      setSelectedLiveExpenses(filteredLiveExpenses);
    }
  };

  const handleSelectLog = (log) => {
    setSelectedLogs((prev) => {
      const exists = prev.some((l) => l._id === log._id);
      if (exists) {
        return prev.filter((l) => l._id !== log._id);
      } else {
        return [...prev, log];
      }
    });
  };

  const handleSelectAllLogs = () => {
    if (selectedLogs.length === filteredAuditLogs.length) {
      setSelectedLogs([]);
    } else {
      setSelectedLogs(filteredAuditLogs);
    }
  };

  const handleBulkDeleteLogs = async () => {
    if (selectedLogs.length === 0) return;

    const ok = await confirm({
      title: 'Permanently Delete Selected Audit Logs',
      message: `Are you sure you want to permanently delete the ${selectedLogs.length} selected audit log entries? This action cannot be undone.`,
      confirmText: 'Delete Selected Permanently',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      let successCount = 0;
      let failCount = 0;

      await Promise.all(
        selectedLogs.map(async (log) => {
          try {
            await api.delete(`/auth/audit-logs/${log._id}`);
            successCount++;
          } catch (err) {
            console.error(`Failed to delete audit log ID ${log._id}`, err);
            failCount++;
          }
        })
      );

      alert(`Successfully deleted ${successCount} audit log entries.`);
      setSelectedLogs([]);
      await fetchAuditLogs();
    } catch (err) {
      alert('An error occurred during bulk deletion.');
    }
  };

  const filteredLiveBills = useMemo(
    () =>
      filterRecords(liveBills, liveFilters, {
        getDate: (bill) => bill.date,
        getSearchText: (bill) =>
          [bill.customerNameSnapshot, bill.vehicleNumber, bill.materialNameSnapshot]
            .filter(Boolean)
            .join(' '),
        getCustomerId: (bill) => bill.customer,
        getStatus: (bill) => bill.paymentStatus,
        getName: (bill) => bill.customerNameSnapshot
      }),
    [liveBills, liveFilters]
  );

  const filteredLiveExpenses = useMemo(
    () =>
      filterRecords(liveExpenses, liveFilters, {
        getDate: (expense) => expense.date,
        getSearchText: (expense) => [expense.type, expense.description].filter(Boolean).join(' '),
        getName: (expense) => expense.type
      }),
    [liveExpenses, liveFilters]
  );

  const liveTotals = useMemo(
    () => ({
      bills: filteredLiveBills.length,
      billTotal: filteredLiveBills.reduce(
        (sum, bill) => sum + Number(bill.totalAmount || 0) + Number(bill.passAmount || 0),
        0
      ),
      paid: filteredLiveBills.reduce((sum, bill) => sum + Number(bill.paidAmount || 0), 0),
      pending: filteredLiveBills.reduce((sum, bill) => sum + Number(bill.pendingAmount || 0), 0),
      expenses: filteredLiveExpenses.length,
      expenseTotal: filteredLiveExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    }),
    [filteredLiveBills, filteredLiveExpenses]
  );

  const filteredAuditLogs = useMemo(() => {
    let filtered = auditLogs;
    if (showOnlyEdits) {
      filtered = filtered.filter(log => log.metadata?.oldDocument);
    }
    return filterRecords(filtered, auditFilters, {
      getDate: (log) => log.createdAt,
      getSearchText: (log) =>
        [
          log.metadata?.details,
          log.action,
          log.actorName,
          log.actorUsername,
          log.actor?.name,
          log.actor?.username,
          log.metadata?.resource
        ]
          .filter(Boolean)
          .join(' '),
      getAdminId: (log) => log.actor?._id || log.actor,
      getName: (log) => log.actorName || log.actor?.name || log.action
    });
  }, [auditLogs, auditFilters, showOnlyEdits]);

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-lg text-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
        <p className="text-slate-300 text-sm mt-1">Control center, live records, audit trail, and business data.</p>
      </div>

      <div className="flex border-b border-slate-200 pb-1 overflow-x-auto whitespace-nowrap scrollbar-none gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition flex-shrink-0 ${
              activeTab === tab.id
                ? 'bg-white border border-b-white border-slate-200 text-blue-700 -mb-px'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'control' && <Admins embedded />}

      {activeTab === 'restore' && (
        <RestoreManagement onConflictCountChange={setRestoreConflictCount} />
      )}

      {activeTab === 'live' && (
        <section className="card overflow-hidden p-0 border border-slate-200">
          <RecordFilters
            filters={liveFilters}
            onChange={setLiveFilters}
            customers={businessRecords.customers}
            searchPlaceholder="Customer, vehicle, material"
            statusOptions={[
              { value: 'Pending', label: 'Pending' },
              { value: 'Partially Paid', label: 'Partially Paid' },
              { value: 'Paid', label: 'Paid' }
            ]}
            summary={[
              { label: 'Bills', value: liveTotals.bills },
              { label: 'Bill Total', value: money(liveTotals.billTotal) },
              { label: 'Paid', value: money(liveTotals.paid), tone: 'green' },
              { label: 'Pending', value: money(liveTotals.pending), tone: 'red' },
              { label: 'Expenses', value: liveTotals.expenses },
              { label: 'Expense Total', value: money(liveTotals.expenseTotal), tone: 'orange' }
            ]}
          />

          <div className="p-4 space-y-6">
            <div>
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Live Bills</h3>
                {selectedLiveBills.length > 0 && (
                  <div className="flex gap-2 items-center bg-red-50 px-3 py-1.5 border border-red-200 rounded-lg text-xs animate-in slide-in-from-top-1 duration-150">
                    <span className="font-semibold text-red-800">{selectedLiveBills.length} selected</span>
                    <button type="button" onClick={() => setSelectedLiveBills([])} className="px-2 py-0.5 bg-white hover:bg-slate-50 border border-slate-200 rounded font-semibold text-slate-700 transition cursor-pointer">Clear</button>
                    <button type="button" onClick={handleBulkDeleteLiveBills} className="px-2 py-0.5 bg-red-600 hover:bg-red-700 rounded font-bold text-white transition cursor-pointer">Delete</button>
                  </div>
                )}
              </div>
              <div className="overflow-auto">
                <table className="data-table">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedLiveBills.length === filteredLiveBills.length && filteredLiveBills.length > 0}
                          onChange={handleSelectAllLiveBills}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Vehicle</th>
                      <th className="p-3">Material</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-right">Pending</th>
                      <th className="p-3 text-right w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLiveBills.length === 0 ? (
                      <tr><td colSpan={10} className="p-6 text-center text-slate-500">No bills match filters.</td></tr>
                    ) : (
                      filteredLiveBills.map((bill) => {
                        const dt = formatDateTime(bill.date);
                        const isSelected = selectedLiveBills.some((b) => b._id === bill._id);
                        return (
                          <tr key={bill._id} className={isSelected ? 'bg-blue-50/10' : ''}>
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectLiveBill(bill)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 text-slate-600">{dt.date}</td>
                            <td className="p-3 text-slate-600">{dt.time}</td>
                            <td className="p-3 font-semibold text-slate-900">{bill.customerNameSnapshot}</td>
                            <td className="p-3 text-slate-600">{bill.vehicleNumber || '—'}</td>
                            <td className="p-3 text-slate-600">{bill.materialNameSnapshot}</td>
                            <td className="p-3 text-slate-600">{bill.paymentStatus}</td>
                            <td className="p-3 text-right font-semibold">{money(Number(bill.totalAmount || 0) + Number(bill.passAmount || 0))}</td>
                            <td className="p-3 text-right text-red-600 font-semibold">{money(bill.pendingAmount)}</td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteLiveBill(bill)}
                                className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition cursor-pointer inline-flex items-center"
                                title="Delete Bill"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Live Expenses</h3>
                {selectedLiveExpenses.length > 0 && (
                  <div className="flex gap-2 items-center bg-red-50 px-3 py-1.5 border border-red-200 rounded-lg text-xs animate-in slide-in-from-top-1 duration-150">
                    <span className="font-semibold text-red-800">{selectedLiveExpenses.length} selected</span>
                    <button type="button" onClick={() => setSelectedLiveExpenses([])} className="px-2 py-0.5 bg-white hover:bg-slate-50 border border-slate-200 rounded font-semibold text-slate-700 transition cursor-pointer">Clear</button>
                    <button type="button" onClick={handleBulkDeleteLiveExpenses} className="px-2 py-0.5 bg-red-600 hover:bg-red-700 rounded font-bold text-white transition cursor-pointer">Delete</button>
                  </div>
                )}
              </div>
              <div className="overflow-auto">
                <table className="data-table">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedLiveExpenses.length === filteredLiveExpenses.length && filteredLiveExpenses.length > 0}
                          onChange={handleSelectAllLiveExpenses}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-right w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLiveExpenses.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-slate-500">No expenses match filters.</td></tr>
                    ) : (
                      filteredLiveExpenses.map((expense) => {
                        const dt = formatDateTime(expense.date);
                        const isSelected = selectedLiveExpenses.some((e) => e._id === expense._id);
                        return (
                          <tr key={expense._id} className={isSelected ? 'bg-blue-50/10' : ''}>
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectLiveExpense(expense)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 text-slate-600">{dt.date}</td>
                            <td className="p-3 text-slate-600">{dt.time}</td>
                            <td className="p-3 font-semibold text-slate-900">{expense.type}</td>
                            <td className="p-3 text-slate-600">{expense.description || '—'}</td>
                            <td className="p-3 text-right font-semibold">{money(expense.amount)}</td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteLiveExpense(expense)}
                                className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition cursor-pointer inline-flex items-center"
                                title="Delete Expense"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'audit' && (
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <RecordFilters
            filters={auditFilters}
            onChange={setAuditFilters}
            admins={admins.filter((a) => !a.isDeleted)}
            searchPlaceholder="Action, admin, path, details"
            summary={[{ label: 'Log entries', value: filteredAuditLogs.length }]}
          />
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/80 flex justify-between items-center flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">System Audit Log & Edit History</h2>
              <p className="text-sm text-slate-500 mt-1">Filtered activity across all admins.</p>
            </div>
            <div className="flex items-center gap-3">
              {filteredAuditLogs.length > 0 && (
                <label className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer select-none hover:bg-slate-200 transition">
                  <input
                    type="checkbox"
                    checked={selectedLogs.length === filteredAuditLogs.length && filteredAuditLogs.length > 0}
                    onChange={handleSelectAllLogs}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  Select All Filtered ({filteredAuditLogs.length})
                </label>
              )}
              <label className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer select-none hover:bg-blue-100 transition">
                <input
                  type="checkbox"
                  checked={showOnlyEdits}
                  onChange={(e) => setShowOnlyEdits(e.target.checked)}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                Show Edits/Updates Only
              </label>
            </div>
          </div>
          {selectedLogs.length > 0 && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex justify-between items-center animate-in slide-in-from-top-1 duration-150">
              <span className="text-sm font-bold text-red-800">
                {selectedLogs.length} log entry/entries selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLogs([])}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={handleBulkDeleteLogs}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Delete Selected Permanently
                </button>
              </div>
            </div>
          )}
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            {filteredAuditLogs.length === 0 ? (
              <div className="text-sm text-slate-500 p-4 text-center">No audit logs match filters.</div>
            ) : (
              filteredAuditLogs.map((log) => {
                const dt = formatDateTime(log.createdAt);
                const actorName = log.actorName || log.actor?.name || 'Unknown admin';
                const actorUsername = log.actorUsername || log.actor?.username || '';
                const recordType = log.metadata?.recordType || log.metadata?.resource || 'Record';
                const actionTaken = log.metadata?.actionTaken || log.action;
                const isSelected = selectedLogs.some((l) => l._id === log._id);
                return (
                  <div key={log._id} className={`flex gap-3 items-start border rounded-lg p-3 bg-white transition hover:border-slate-300 ${isSelected ? 'border-blue-300 bg-blue-50/10' : 'border-slate-200'}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectLog(log)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-1.5 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-3">
                        <div className="font-semibold text-slate-900 text-sm break-words">{log.metadata?.details || log.action}</div>
                        <div className="text-xs text-slate-500 whitespace-nowrap">{dt.date} {dt.time}</div>
                      </div>
                      <div className="text-xs text-slate-600 mt-2">
                        Done by {actorName}{actorUsername ? ` (${actorUsername})` : ''}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold">
                            Record: {recordType}
                          </span>
                          <span className="inline-flex px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold">
                            Action: {actionTaken}
                          </span>
                          {log.metadata?.phoneNumber && (
                            <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                              Phone: {log.metadata.phoneNumber}
                            </span>
                          )}
                        </div>
                        {log.metadata?.oldDocument && (
                          <button
                            type="button"
                            onClick={() => setSelectedAuditLog(log)}
                            className="text-slate-700 hover:text-slate-900 hover:bg-slate-100 p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer"
                            title="View Edit Details"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {activeTab === 'business' && (
        <BusinessRecords
          records={businessRecords}
          filters={businessFilters}
          onFiltersChange={setBusinessFilters}
          onRefresh={fetchBusinessRecords}
        />
      )}

      {selectedAuditLog && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Edit Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reverting {selectedAuditLog.metadata?.resource} (ID: {selectedAuditLog.targetId})
                </p>
              </div>
              <button 
                onClick={() => setSelectedAuditLog(null)} 
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span className="font-semibold">Action:</span>
                  <span className="text-slate-800">{selectedAuditLog.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Modified By:</span>
                  <span className="text-slate-800">
                    {selectedAuditLog.actorName} ({selectedAuditLog.actorUsername})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold">Timestamp:</span>
                  <span className="text-slate-800">
                    {new Date(selectedAuditLog.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">
                  Original State vs. Modified State
                </h3>
                <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-4 max-h-96 overflow-y-auto">
                  <RenderDiff 
                    oldDoc={selectedAuditLog.metadata?.oldDocument} 
                    newDoc={selectedAuditLog.metadata?.newDocument} 
                  />
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => handleDeleteLog(selectedAuditLog)}
                className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg font-semibold text-sm transition cursor-pointer"
              >
                Delete Log Permanently
              </button>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAuditLog(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold text-sm transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleRestoreLog(selectedAuditLog)}
                  className="px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg font-semibold text-sm transition shadow-md cursor-pointer"
                >
                  Restore to Original
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const RenderDiff = ({ oldDoc, newDoc }) => {
  if (!oldDoc) return <p className="text-slate-500 italic">No original state available</p>;

  const ignoreKeys = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'isDeleted', 'passwordHash', 'password'];
  const keys = Array.from(new Set([
    ...Object.keys(oldDoc),
    ...Object.keys(newDoc || {})
  ])).filter(key => !ignoreKeys.includes(key));

  const formatVal = (val) => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') return JSON.stringify(val);
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  const changes = keys.map(key => {
    const oldVal = oldDoc[key];
    const newVal = newDoc ? newDoc[key] : undefined;
    const isDifferent = JSON.stringify(oldVal) !== JSON.stringify(newVal);
    return { key, oldVal, newVal, isDifferent };
  }).filter(item => item.isDifferent);

  if (changes.length === 0) {
    return <p className="text-slate-500 italic">No visible differences found</p>;
  }

  return (
    <div className="space-y-3">
      {changes.map(({ key, oldVal, newVal }) => (
        <div key={key} className="border-b border-slate-100 pb-2 text-sm">
          <span className="font-bold text-slate-700 block uppercase tracking-wider text-xs mb-1">{key}</span>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-red-50 text-red-700 border border-red-100 rounded p-2 text-xs font-mono break-words line-through">
              {formatVal(oldVal)}
            </div>
            <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded p-2 text-xs font-mono break-words">
              {formatVal(newVal)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SuperAdminDashboard;
