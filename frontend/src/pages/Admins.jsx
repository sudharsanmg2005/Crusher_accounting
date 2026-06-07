import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import RecordFilters from '../components/RecordFilters';
import { defaultRecordFilters, filterRecords } from '../utils/recordFilters';

const accessLabels = {
  full_access: 'Full Access',
  read_only: 'Read Only',
  create_bills: 'Create Bills Only'
};

const money = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

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

const EmptyRow = ({ colSpan, label }) => (
  <tr>
    <td colSpan={colSpan} className="p-6 text-center text-sm text-slate-500">
      {label}
    </td>
  </tr>
);

const Admins = ({ embedded = false }) => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [admins, setAdmins] = useState([]);
  const [archivedRecords, setArchivedRecords] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    accessLevel: 'full_access'
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [backupFilters, setBackupFilters] = useState({ ...defaultRecordFilters });
  const [customers, setCustomers] = useState([]);

  const isSuperAdmin = user?.role === 'super_admin';
  const activeAdmins = useMemo(() => admins.filter((admin) => !admin.isDeleted), [admins]);
  const deletedAdmins = useMemo(() => admins.filter((admin) => admin.isDeleted), [admins]);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/admins');
      setAdmins(data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load admins');
    } finally {
      setLoading(false);
    }
  };

  const fetchArchivedRecords = async () => {
    try {
      const endpoints = [
        { type: 'Bill', url: '/bills/archived', restoreBase: '/bills', permanentBase: '/bills' },
        { type: 'Expense', url: '/expenses/archived', restoreBase: '/expenses', permanentBase: '/expenses' },
        { type: 'Material', url: '/materials/archived', restoreBase: '/materials', permanentBase: '/materials' },
        { type: 'Customer', url: '/customers/archived', restoreBase: '/customers', permanentBase: '/customers' },
        { type: 'Employee', url: '/employees/archived', restoreBase: '/employees', permanentBase: '/employees' }
      ];
      const [results, customersRes] = await Promise.all([
        Promise.all(endpoints.map(async (entry) => {
          const { data } = await api.get(entry.url);
          return data.map((record) => ({
            ...record,
            backupType: entry.type,
            restoreBase: entry.restoreBase,
            permanentBase: entry.permanentBase
          }));
        })),
        api.get('/customers')
      ]);
      setCustomers(customersRes.data);
      setArchivedRecords(results.flat().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load deleted backups');
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchAdmins(), fetchArchivedRecords()]);
  };

  useEffect(() => {
    if (isSuperAdmin) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    setError('');

    try {
      const res = await api.post('/auth/admins', form);
      setMessage(`Admin created: ${res.data.username}`);
      setForm({ name: '', username: '', password: '', accessLevel: 'full_access' });
      await fetchAdmins();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create admin');
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (admin) => {
    const ok = await confirm({
      title: 'Archive admin',
      message: `Archive "${admin.username}" and disable their login? Their activity logs will remain visible.`,
      confirmText: 'Archive',
      tone: 'danger'
    });
    if (!ok) return;
    setMessage('');
    setError('');

    try {
      await api.delete(`/auth/admins/${admin.id}`);
      setMessage(`Admin archived: ${admin.username}`);
      await fetchAdmins();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to archive admin');
    }
  };

  const onUpdateAdmin = async (admin, patch) => {
    setMessage('');
    setError('');
    try {
      await api.put(`/auth/admins/${admin.id}`, patch);
      setMessage(`Updated admin: ${admin.username}`);
      await fetchAdmins();
      if (selectedAdmin?.id === admin.id) await openLogs(admin);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update admin');
    }
  };

  const getBackupName = (record) => {
    if (record.backupType === 'Bill') return `${record.customerNameSnapshot} - ${record.vehicleNumber || 'No vehicle'}`;
    if (record.backupType === 'Expense') return `${record.type} - ${record.description || 'No description'}`;
    if (record.backupType === 'Customer') return `${record.name}${record.phone ? ` (${record.phone})` : ''}`;
    if (record.backupType === 'Employee') return `${record.name}${record.designation ? ` - ${record.designation}` : ''}`;
    return record.name || record.username || record._id;
  };

  const filteredArchivedRecords = useMemo(
    () =>
      filterRecords(archivedRecords, backupFilters, {
        getDate: (record) => record.updatedAt || record.createdAt || record.date,
        getSearchText: (record) =>
          [
            record.backupType,
            getBackupName(record),
            record.customerNameSnapshot,
            record.vehicleNumber,
            record.materialNameSnapshot,
            record.name,
            record.type,
            record.description,
            record.designation,
            record.phone
          ]
            .filter(Boolean)
            .join(' '),
        getCustomerId: (record) => (record.backupType === 'Bill' ? record.customer : ''),
        getStatus: (record) => (record.backupType === 'Bill' ? record.paymentStatus : ''),
        getType: (record) => record.backupType,
        getName: (record) => getBackupName(record)
      }),
    [archivedRecords, backupFilters]
  );

  const onRestoreRecord = async (record) => {
    const ok = await confirm({
      title: `Restore ${record.backupType}`,
      message: `Restore ${record.backupType.toLowerCase()} "${getBackupName(record)}"?`,
      confirmText: 'Restore',
      tone: 'primary'
    });
    if (!ok) return;
    setMessage('');
    setError('');
    try {
      const { data } = await api.patch(`${record.restoreBase}/${record._id}/restore`);
      if (data.status === 'Existing' || data.conflict) {
        setError(data.message || 'Phone conflict detected. Open the Restore Management tab to resolve.');
        return;
      }
      setMessage(`Restored ${record.backupType}: ${getBackupName(record)}`);
      await fetchArchivedRecords();
    } catch (err) {
      if (err?.response?.status === 409) {
        setError(err?.response?.data?.message || 'Phone conflict detected. Open the Restore Management tab to resolve.');
        return;
      }
      setError(err?.response?.data?.message || 'Failed to restore backup');
    }
  };

  const onPermanentDelete = async (record) => {
    const ok = await confirm({
      title: `Permanently delete ${record.backupType}`,
      message: `This will remove "${getBackupName(record)}" from the database forever. This action cannot be undone.`,
      confirmText: 'Delete Permanently',
      tone: 'danger'
    });
    if (!ok) return;
    setMessage('');
    setError('');
    try {
      await api.delete(`${record.permanentBase}/${record._id}/permanent`);
      setMessage(`Permanently deleted ${record.backupType}: ${getBackupName(record)}`);
      await fetchArchivedRecords();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to permanently delete backup');
    }
  };

  const openLogs = async (admin) => {
    setSelectedAdmin(admin);
    setLogs([]);
    setError('');

    try {
      const { data } = await api.get(`/auth/admins/${admin.id}/logs`);
      setSelectedAdmin(data.admin);
      setLogs(data.logs || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load logs');
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold text-slate-900">Admins</h1>
        <p className="text-slate-600 mt-2">Only a super admin can manage admin accounts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
      <div className="bg-slate-900 rounded-lg text-white p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Super Admin Control Center</h1>
            <p className="text-slate-300 text-sm mt-1">Manage admins, audit logs, live records, and deleted backups from one place.</p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            className="self-start lg:self-auto bg-white text-slate-900 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-100 transition"
          >
            Refresh All
          </button>
        </div>
      </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          ['Active Admins', activeAdmins.length],
          ['Archived Admins', deletedAdmins.length],
          ['Deleted Backups', archivedRecords.length],
          ['Activity Logs', logs.length],
          ['Selected Admin', selectedAdmin ? 1 : 0]
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{value}</div>
          </div>
        ))}
      </div>

      {(message || error) && (
        <div className={`text-sm border p-3 rounded-lg ${message ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
          {message || error}
        </div>
      )}

      <Panel title="Create Admin" subtitle="New admins can be created with a limited permission level.">
        <form onSubmit={onSubmit} className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input type="text" name="name" required value={form.name} onChange={onChange} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input type="text" name="username" required value={form.username} onChange={onChange} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input type="password" name="password" required value={form.password} onChange={onChange} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Access</label>
              <select name="accessLevel" value={form.accessLevel} onChange={onChange} className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white">
                <option value="full_access">Full Access</option>
                <option value="read_only">Read Only</option>
                <option value="create_bills">Create Bills Only</option>
              </select>
            </div>
          </div>
          <div className="pt-4 flex justify-end">
            <button type="submit" disabled={submitting} className="bg-blue-600 text-white rounded-lg font-semibold py-2.5 px-5 hover:bg-blue-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        </form>
      </Panel>

      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        <div className="2xl:col-span-2 space-y-6">
          <Panel title="Active Admins" subtitle="Change permissions instantly or archive login access.">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-semibold">Admin</th>
                    <th className="p-4 font-semibold">Role</th>
                    <th className="p-4 font-semibold">Access</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? <EmptyRow colSpan={5} label="Loading admins..." /> : activeAdmins.length === 0 ? <EmptyRow colSpan={5} label="No active admins found." /> : activeAdmins.map((admin) => (
                    <tr key={admin.id} className="hover:bg-slate-50 transition">
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">{admin.name}</div>
                        <div className="text-sm text-slate-500">{admin.username}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${admin.role === 'super_admin' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                          {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                        </span>
                      </td>
                      <td className="p-4">
                        <select
                          value={admin.accessLevel}
                          onChange={(e) => onUpdateAdmin(admin, { accessLevel: e.target.value })}
                          disabled={admin.role === 'super_admin'}
                          className="border border-slate-300 rounded-lg p-2 text-sm bg-white disabled:bg-slate-50 min-w-40"
                        >
                          <option value="full_access">Full Access</option>
                          <option value="read_only">Read Only</option>
                          <option value="create_bills">Create Bills Only</option>
                        </select>
                      </td>
                      <td className="p-4">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={admin.isActive !== false}
                            disabled={admin.id === user?.id}
                            onChange={(e) => onUpdateAdmin(admin, { isActive: e.target.checked })}
                            className="rounded border-slate-300"
                          />
                          {admin.isActive !== false ? 'Enabled' : 'Disabled'}
                        </label>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap space-x-3">
                        <button onClick={() => openLogs(admin)} className="text-blue-600 hover:text-blue-800 font-semibold text-sm">Logs</button>
                        {admin.id !== user?.id && (
                          <button onClick={() => onDelete(admin)} className="text-red-600 hover:text-red-800 font-semibold text-sm">Archive</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Archived Admins" subtitle="Archived admins cannot log in, but their logs remain visible.">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-semibold">Admin</th>
                    <th className="p-4 font-semibold">Previous Access</th>
                    <th className="p-4 font-semibold">Archived At</th>
                    <th className="p-4 font-semibold text-right">Logs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deletedAdmins.length === 0 ? <EmptyRow colSpan={4} label="No archived admins found." /> : deletedAdmins.map((admin) => (
                    <tr key={admin.id} className="hover:bg-slate-50 transition">
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">{admin.name}</div>
                        <div className="text-sm text-slate-500">{admin.username}</div>
                      </td>
                      <td className="p-4 text-slate-600">{accessLabels[admin.accessLevel] || admin.accessLevel}</td>
                      <td className="p-4 text-slate-600">{admin.deletedAt ? new Date(admin.deletedAt).toLocaleString() : '-'}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => openLogs(admin)} className="text-blue-600 hover:text-blue-800 font-semibold text-sm">View Logs</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <Panel title="Activity Logs" subtitle={selectedAdmin ? `${selectedAdmin.name} (${selectedAdmin.username})` : 'Select an admin to view logs.'}>
          <div className="p-4 space-y-3 max-h-[720px] overflow-y-auto">
            {selectedAdmin && logs.length === 0 ? (
              <div className="text-sm text-slate-500 border border-slate-200 rounded-lg p-3">No logs found.</div>
            ) : (
              logs.map((log) => (
                <div key={log._id} className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="flex justify-between gap-3">
                    <div className="font-semibold text-slate-900 text-sm">{log.metadata?.details || log.action}</div>
                    <div className="text-xs text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-2">{log.method} {log.path}</div>
                  {log.metadata?.resource && (
                    <div className="text-[11px] text-slate-500 mt-2">Resource: {log.metadata.resource}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Deleted Records Backup" subtitle="All soft-deleted records appear here. Restore or permanently delete them. Phone conflicts for customers/employees are resolved in Restore Management.">
        <RecordFilters
          filters={backupFilters}
          onChange={setBackupFilters}
          customers={customers}
          searchPlaceholder="Type, name, customer, material, phone"
          typeOptions={[
            { value: 'Bill', label: 'Bills' },
            { value: 'Expense', label: 'Expenses' },
            { value: 'Material', label: 'Materials' },
            { value: 'Customer', label: 'Customers' },
            { value: 'Employee', label: 'Employees' }
          ]}
          statusOptions={[
            { value: 'Pending', label: 'Pending' },
            { value: 'Partially Paid', label: 'Partially Paid' },
            { value: 'Paid', label: 'Paid' }
          ]}
          summary={[{ label: 'Deleted records', value: filteredArchivedRecords.length }]}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-4 font-semibold">Type</th>
                <th className="p-4 font-semibold">Name / Details</th>
                <th className="p-4 font-semibold">Deleted At</th>
                <th className="p-4 font-semibold text-right">Value</th>
                <th className="p-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredArchivedRecords.length === 0 ? <EmptyRow colSpan={5} label="No deleted records match filters." /> : filteredArchivedRecords.map((record) => (
                <tr key={`${record.backupType}-${record._id}`} className="hover:bg-slate-50 transition">
                  <td className="p-4 text-slate-600">{record.backupType}</td>
                  <td className="p-4">
                    <div className="font-semibold text-slate-900">{getBackupName(record)}</div>
                    <div className="text-xs text-slate-500">
                      {record.backupType === 'Bill' && `${record.materialNameSnapshot} on ${new Date(record.date).toLocaleDateString()}`}
                      {record.backupType === 'Expense' && new Date(record.date).toLocaleDateString()}
                      {record.backupType === 'Material' && `Price ${record.currentPrice}`}
                      {record.backupType === 'Customer' && (record.address || 'No address')}
                      {record.backupType === 'Employee' && (record.phone || 'No phone')}
                    </div>
                  </td>
                  <td className="p-4 text-slate-600">{new Date(record.updatedAt || record.createdAt).toLocaleString()}</td>
                  <td className="p-4 text-right font-semibold text-slate-900">
                    {record.backupType === 'Bill' && money(Number(record.totalAmount) + Number(record.passAmount || 0))}
                    {record.backupType === 'Expense' && money(record.amount)}
                    {record.backupType === 'Material' && money(record.currentPrice)}
                    {record.backupType === 'Customer' && '—'}
                    {record.backupType === 'Employee' && money(record.dailyWages)}
                  </td>
                  <td className="p-4 text-right whitespace-nowrap space-x-3">
                    <button type="button" onClick={() => onRestoreRecord(record)} className="text-blue-600 hover:text-blue-800 font-semibold text-sm">Restore</button>
                    <button type="button" onClick={() => onPermanentDelete(record)} className="text-red-600 hover:text-red-800 font-semibold text-sm">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

export default Admins;
