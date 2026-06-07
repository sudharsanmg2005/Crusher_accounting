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
  const [activeTab, setActiveTab] = useState('control');
  const [liveBills, setLiveBills] = useState([]);
  const [liveExpenses, setLiveExpenses] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [admins, setAdmins] = useState([]);
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

  const tabs = useMemo(
    () => baseTabs.filter((tab) => tab.id !== 'restore' || (restoreConflictCount ?? 0) > 0),
    [restoreConflictCount]
  );

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
    if (activeTab === 'restore' && (restoreConflictCount ?? 0) === 0) {
      setActiveTab('control');
    }
  }, [activeTab, isSuperAdmin, restoreConflictCount]);

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

  const filteredLiveBills = useMemo(
    () =>
      filterRecords(liveBills, liveFilters, {
        getDate: (bill) => bill.date,
        getSearchText: (bill) =>
          [bill.customerNameSnapshot, bill.vehicleNumber, bill.materialNameSnapshot, bill.billNumber]
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

  const filteredAuditLogs = useMemo(
    () =>
      filterRecords(auditLogs, auditFilters, {
        getDate: (log) => log.createdAt,
        getSearchText: (log) =>
          [
            log.metadata?.details,
            log.action,
            log.path,
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
      }),
    [auditLogs, auditFilters]
  );

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-lg text-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">Super Admin Dashboard</h1>
        <p className="text-slate-300 text-sm mt-1">Control center, live records, audit trail, and business data.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold transition ${
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
            searchPlaceholder="Customer, vehicle, material, bill no."
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
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">Live Bills</h3>
              <div className="overflow-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Vehicle</th>
                      <th className="p-3">Material</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLiveBills.length === 0 ? (
                      <tr><td colSpan={8} className="p-6 text-center text-slate-500">No bills match filters.</td></tr>
                    ) : (
                      filteredLiveBills.map((bill) => {
                        const dt = formatDateTime(bill.date);
                        return (
                          <tr key={bill._id} className="hover:bg-slate-50">
                            <td className="p-3 text-slate-600">{dt.date}</td>
                            <td className="p-3 text-slate-600">{dt.time}</td>
                            <td className="p-3 font-semibold text-slate-900">{bill.customerNameSnapshot}</td>
                            <td className="p-3 text-slate-600">{bill.vehicleNumber || '—'}</td>
                            <td className="p-3 text-slate-600">{bill.materialNameSnapshot}</td>
                            <td className="p-3 text-slate-600">{bill.paymentStatus}</td>
                            <td className="p-3 text-right font-semibold">{money(Number(bill.totalAmount || 0) + Number(bill.passAmount || 0))}</td>
                            <td className="p-3 text-right text-red-600 font-semibold">{money(bill.pendingAmount)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">Live Expenses</h3>
              <div className="overflow-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Time</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLiveExpenses.length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-slate-500">No expenses match filters.</td></tr>
                    ) : (
                      filteredLiveExpenses.map((expense) => {
                        const dt = formatDateTime(expense.date);
                        return (
                          <tr key={expense._id} className="hover:bg-slate-50">
                            <td className="p-3 text-slate-600">{dt.date}</td>
                            <td className="p-3 text-slate-600">{dt.time}</td>
                            <td className="p-3 font-semibold text-slate-900">{expense.type}</td>
                            <td className="p-3 text-slate-600">{expense.description || '—'}</td>
                            <td className="p-3 text-right font-semibold">{money(expense.amount)}</td>
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
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/80">
            <h2 className="text-lg font-bold text-slate-900">System Audit Log</h2>
            <p className="text-sm text-slate-500 mt-1">Filtered activity across all admins.</p>
          </div>
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            {filteredAuditLogs.length === 0 ? (
              <div className="text-sm text-slate-500 p-4 text-center">No audit logs match filters.</div>
            ) : (
              filteredAuditLogs.map((log) => {
                const dt = formatDateTime(log.createdAt);
                return (
                  <div key={log._id} className="border border-slate-200 rounded-lg p-3 bg-white">
                    <div className="flex justify-between gap-3">
                      <div className="font-semibold text-slate-900 text-sm">{log.metadata?.details || log.action}</div>
                      <div className="text-xs text-slate-500 whitespace-nowrap">{dt.date} {dt.time}</div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      {log.actorName || log.actor?.name} ({log.actorUsername || log.actor?.username}) — {log.method} {log.path}
                    </div>
                    {log.metadata?.recordType && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        {log.metadata.recordType}
                        {log.metadata.phoneNumber ? ` • Phone ${log.metadata.phoneNumber}` : ''}
                        {log.metadata.actionTaken ? ` • ${log.metadata.actionTaken}` : ''}
                      </div>
                    )}
                    {log.metadata?.resource && !log.metadata?.recordType && (
                      <div className="text-[11px] text-slate-500 mt-1">Resource: {log.metadata.resource}</div>
                    )}
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
    </div>
  );
};

export default SuperAdminDashboard;
