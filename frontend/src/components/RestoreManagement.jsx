import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useConfirm } from '../components/ConfirmDialog';

const statusStyles = {
  Available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Existing: 'bg-amber-50 text-amber-700 border-amber-200',
  Restored: 'bg-blue-50 text-blue-700 border-blue-200',
  Failed: 'bg-red-50 text-red-700 border-red-200'
};

const Panel = ({ title, subtitle, children, action }) => (
  <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const CompareModal = ({ item, onClose, onAction, submitting }) => {
  if (!item) return null;
  const backup = item.backup;
  const current = item.existingRecord;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Resolve Phone Conflict</h3>
            <p className="text-sm text-slate-500 mt-1">Phone {backup.phone} already exists in an active record.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5 grid md:grid-cols-2 gap-4 overflow-y-auto">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Deleted Backup</div>
            <div className="font-semibold text-slate-900">{backup.name}</div>
            <div className="text-sm text-slate-600 mt-2">Phone: {backup.phone || '—'}</div>
            {item.type === 'Customer' && (
              <>
                <div className="text-sm text-slate-600">Address: {backup.address || '—'}</div>
                <div className="text-sm text-slate-600">Vehicles: {backup.vehicles?.length || 0}</div>
              </>
            )}
            {item.type === 'Employee' && (
              <>
                <div className="text-sm text-slate-600">Designation: {backup.designation || '—'}</div>
                <div className="text-sm text-slate-600">Daily Wages: ₹{Number(backup.dailyWages || 0).toLocaleString()}</div>
              </>
            )}
          </div>

          <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-amber-700 font-semibold mb-2">Current Active Record</div>
            <div className="font-semibold text-slate-900">{current?.name || '—'}</div>
            <div className="text-sm text-slate-600 mt-2">Phone: {current?.phone || '—'}</div>
            {item.type === 'Customer' && (
              <>
                <div className="text-sm text-slate-600">Address: {current?.address || '—'}</div>
                <div className="text-sm text-slate-600">Vehicles: {current?.vehicles?.length || 0}</div>
              </>
            )}
            {item.type === 'Employee' && (
              <>
                <div className="text-sm text-slate-600">Designation: {current?.designation || '—'}</div>
                <div className="text-sm text-slate-600">Daily Wages: ₹{Number(current?.dailyWages || 0).toLocaleString()}</div>
              </>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-slate-200 flex flex-wrap gap-2 justify-end bg-slate-50">
          <button type="button" disabled={submitting} onClick={() => onAction('keep')} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-white disabled:opacity-50">
            Keep Current
          </button>
          <button type="button" disabled={submitting} onClick={() => onAction('merge')} className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50">
            Merge Records
          </button>
          <button type="button" disabled={submitting} onClick={() => onAction('replace')} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            Replace With Backup
          </button>
        </div>
      </div>
    </div>
  );
};

const ConflictTable = ({
  title,
  subtitle,
  rows,
  onResolveConflict,
  onPermanentDelete,
  loading
}) => (
  <Panel title={title} subtitle={subtitle}>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-white border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
          <tr>
            <th className="p-4 font-semibold">Name</th>
            <th className="p-4 font-semibold">Phone</th>
            <th className="p-4 font-semibold">Deleted At</th>
            <th className="p-4 font-semibold">Existing Record</th>
            <th className="p-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-6 text-center text-sm text-slate-500">No phone conflicts to resolve.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="hover:bg-slate-50 transition">
                <td className="p-4 font-semibold text-slate-900">{row.backup.name}</td>
                <td className="p-4 text-slate-600">{row.backup.phone || '—'}</td>
                <td className="p-4 text-slate-600">{new Date(row.backup.updatedAt || row.backup.createdAt).toLocaleString()}</td>
                <td className="p-4 text-slate-600">
                  <span className="font-medium text-amber-700">{row.existingRecord?.name || '—'}</span>
                </td>
                <td className="p-4 text-right whitespace-nowrap space-x-3">
                  <button
                    type="button"
                    onClick={() => onResolveConflict(row)}
                    className="text-amber-700 hover:text-amber-900 font-semibold text-sm"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onPermanentDelete(row)}
                    className="text-red-600 hover:text-red-800 font-semibold text-sm disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </Panel>
);

const RestoreManagement = ({ onConflictCountChange }) => {
  const confirm = useConfirm();
  const [preview, setPreview] = useState({ customers: [], employees: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('customers');
  const [conflictItem, setConflictItem] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [search, setSearch] = useState('');

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/restore-management/preview');
      setPreview(data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load restore preview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const conflictCustomers = useMemo(
    () =>
      (preview.customers || [])
        .filter((item) => item.restoreStatus === 'Existing')
        .map((item) => ({
          ...item,
          key: `Customer-${item.backup._id}`
        })),
    [preview.customers]
  );

  const conflictEmployees = useMemo(
    () =>
      (preview.employees || [])
        .filter((item) => item.restoreStatus === 'Existing')
        .map((item) => ({
          ...item,
          key: `Employee-${item.backup._id}`
        })),
    [preview.employees]
  );

    const filteredCustomers = useMemo(() => {
    if (!search.trim()) return conflictCustomers;
    const q = search.toLowerCase();
    return conflictCustomers.filter((item) =>
      (item.backup?.name || '').toLowerCase().includes(q) ||
      (item.backup?.phone || '').toLowerCase().includes(q) ||
      (item.existingRecord?.name || '').toLowerCase().includes(q)
    );
  }, [conflictCustomers, search]);

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return conflictEmployees;
    const q = search.toLowerCase();
    return conflictEmployees.filter((item) =>
      (item.backup?.name || '').toLowerCase().includes(q) ||
      (item.backup?.phone || '').toLowerCase().includes(q) ||
      (item.existingRecord?.name || '').toLowerCase().includes(q) ||
      (item.backup?.designation || '').toLowerCase().includes(q)
    );
  }, [conflictEmployees, search]);

  const activeRows = activeSection === 'customers' ? filteredCustomers : filteredEmployees;
  const conflictCount = conflictCustomers.length + conflictEmployees.length;

  useEffect(() => {
    onConflictCountChange?.(conflictCount);
  }, [conflictCount, onConflictCountChange]);

  const restoreRecord = async (row, action = 'restore') => {
    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      const base = row.type === 'Customer' ? '/restore-management/customers' : '/restore-management/employees';
      const { data } = await api.patch(`${base}/${row.backup._id}/restore`, { action });

      setRecentResults((prev) => [{ ...data, type: row.type, id: row.backup._id }, ...prev].slice(0, 20));
      setMessage(data.message || 'Action completed');
      await fetchPreview();
      return data;
    } catch (err) {
      if (err?.response?.status === 409 && err?.response?.data?.existingRecord) {
        setConflictItem({ ...row, existingRecord: err.response.data.existingRecord });
      }
      setError(err?.response?.data?.message || 'Action failed');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const onResolveAction = async (action) => {
    if (!conflictItem) return;
    await restoreRecord(conflictItem, action);
    setConflictItem(null);
  };

  const onPermanentDelete = async (row) => {
    const ok = await confirm({
      title: `Permanently delete ${row.type}`,
      message: `Remove backup "${row.backup.name}" from the database forever? This cannot be undone.`,
      confirmText: 'Delete Permanently',
      tone: 'danger'
    });
    if (!ok) return;

    setSubmitting(true);
    setMessage('');
    setError('');
    try {
      const base = row.type === 'Customer' ? '/restore-management/customers' : '/restore-management/employees';
      const { data } = await api.delete(`${base}/${row.backup._id}/permanent`);
      setMessage(data.message || 'Record permanently deleted');
      await fetchPreview();
    } catch (err) {
      setError(err?.response?.data?.message || 'Permanent delete failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (conflictCount === 0 && !loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
        <h2 className="text-lg font-bold text-slate-900">No restore conflicts</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-xl mx-auto">
          All deleted customer and employee records without phone conflicts are listed in Deleted Records Backup.
          This tab appears only when a deleted backup shares a phone number with an active record.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-amber-200 rounded-lg p-4">
          <div className="text-sm text-amber-700">Phone Conflicts</div>
          <div className="text-2xl font-bold text-amber-800 mt-1">{conflictCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm text-slate-500">Other Deleted Records</div>
          <div className="text-sm text-slate-700 mt-2">Restore or permanently delete them from Deleted Records Backup in Super Admin Control.</div>
        </div>
      </div>

      {(message || error) && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

            <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveSection('customers');
              setSearch('');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeSection === 'customers' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}
          >
            Customer Conflicts ({conflictCustomers.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSection('employees');
              setSearch('');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${activeSection === 'employees' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}
          >
            Employee Conflicts ({conflictEmployees.length})
          </button>
        </div>

        <div className="flex gap-2 flex-1 sm:flex-initial">
          <input
            type="text"
            placeholder="Search by name, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none flex-1 sm:w-64 bg-white"
          />
          <button
            type="button"
            onClick={fetchPreview}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-white disabled:opacity-50 whitespace-nowrap"
          >
            Refresh
          </button>
        </div>
      </div>

      <ConflictTable
        title={activeSection === 'customers' ? 'Customer Phone Conflicts' : 'Employee Phone Conflicts'}
        subtitle="Resolve the conflict, or permanently delete the backup if it is no longer needed."
        rows={activeRows}
        onResolveConflict={setConflictItem}
        onPermanentDelete={onPermanentDelete}
        loading={loading || submitting}
      />

      {recentResults.length > 0 && (
        <Panel title="Recent Restore Activity" subtitle="Latest conflict resolutions in this session.">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-white border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold">Type</th>
                  <th className="p-4 font-semibold">Phone</th>
                  <th className="p-4 font-semibold">Action</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentResults.map((result, index) => (
                  <tr key={`${result.id || index}-${result.status}`}>
                    <td className="p-4 text-slate-600">{result.type}</td>
                    <td className="p-4 text-slate-600">{result.restoreAudit?.phoneNumber || result.backup?.phone || result.restored?.phone || '—'}</td>
                    <td className="p-4 text-slate-600">{result.restoreAudit?.actionTaken || result.status}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${statusStyles[result.status] || statusStyles.Available}`}>
                        {result.status}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600">{result.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <CompareModal
        item={conflictItem}
        onClose={() => setConflictItem(null)}
        onAction={onResolveAction}
        submitting={submitting}
      />
    </div>
  );
};

export default RestoreManagement;
