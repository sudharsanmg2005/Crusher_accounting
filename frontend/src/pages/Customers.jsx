import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { formatVehicleInput, isValidVehicleNumber } from '../utils/vehicleNumber';
import { formatDateTime } from '../utils/dateTime';
import { ChevronDownIcon, EditIcon, TrashIcon, EyeIcon, CargoIcon, PlusIcon } from '../components/Icons';

const Customers = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(term) ||
        (c.phone || '').includes(term)
    );
  }, [customers, searchTerm]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [billsModalOpen, setBillsModalOpen] = useState(false);
  const [selectedCustomerBills, setSelectedCustomerBills] = useState({ customer: null, bills: [] });
  const [selectedCustomerTotals, setSelectedCustomerTotals] = useState({ totalAmount: 0, paidAmount: 0, balance: 0 });
  const [reportType, setReportType] = useState('monthly');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  
  // Payment recording state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [currentBillForPayment, setCurrentBillForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', vehicles: [] });
  const [newVehicle, setNewVehicle] = useState('');
  const [expandedVehicleId, setExpandedVehicleId] = useState(null);
  const [editingVehicleIdx, setEditingVehicleIdx] = useState(null);
  const [editingVehicleVal, setEditingVehicleVal] = useState('');

  const saveVehicleEdit = (index) => {
    const formatted = formatVehicleInput(editingVehicleVal);
    if (!isValidVehicleNumber(formatted)) {
      alert('Vehicle number must be TN 74 AE 2003 or TMR 7177 format');
      return;
    }
    const updatedVehicles = [...formData.vehicles];
    updatedVehicles[index] = { ...updatedVehicles[index], number: formatted };
    setFormData({ ...formData, vehicles: updatedVehicles });
    setEditingVehicleIdx(null);
  };

  const canWrite = user?.role === 'super_admin' || user?.accessLevel === 'full_access';

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    // Set date range when reportType changes
    const today = new Date();
    const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    if (reportType === 'monthly') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDateRange({ startDate: toYMD(firstDay), endDate: toYMD(lastDay) });
    } else if (reportType === 'weekly') {
      const end = new Date(today);
      end.setHours(0, 0, 0, 0);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      setDateRange({ startDate: toYMD(start), endDate: toYMD(end) });
    }
  }, [reportType]);

  useEffect(() => {
    if (billsModalOpen && selectedCustomerBills.customer) {
      fetchCustomerBills(selectedCustomerBills.customer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate, dateRange.endDate, billsModalOpen]);

  const fetchCustomers = async () => {
    try {
      const { data } = await api.get('/customers');
      setCustomers(data);
    } catch (error) {
      console.error('Error fetching customers', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setFormData({ ...formData, phone: value.replace(/\D/g, '').slice(0, 10) });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  const addVehicleToForm = () => {
    const formatted = formatVehicleInput(newVehicle);
    if (!formatted) return;
    if (!isValidVehicleNumber(formatted)) {
      alert('Vehicle number must be TN 74 AE 2003 or TMR 7177 format');
      return;
    }
    if (formData.vehicles.some((v) => v.number === formatted)) return;
    setFormData({ ...formData, vehicles: [...(formData.vehicles || []), { number: formatted }] });
    setNewVehicle('');
  };

  const removeVehicleFromForm = (index) => {
    setFormData({ ...formData, vehicles: formData.vehicles.filter((_, i) => i !== index) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.phone || formData.phone.length !== 10) {
      alert('Phone number is required and must be exactly 10 digits');
      return;
    }
    try {
      const payload = { name: formData.name, phone: formData.phone, address: formData.address, vehicles: formData.vehicles || [] };
      if (formData._id) {
        await api.put(`/customers/${formData._id}`, payload);
      } else {
        await api.post('/customers', payload);
      }
      setIsModalOpen(false);
      setFormData({ name: '', phone: '', address: '', vehicles: [] });
      fetchCustomers();
    } catch (error) {
      console.error('Error saving customer', error);
      alert(error.response?.data?.message || 'Error saving customer');
    }
  };

  const handleEdit = (customer) => {
    setFormData({ ...customer, vehicles: customer.vehicles || [] });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete customer',
      message: 'Are you sure you want to delete this customer?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/customers/${id}`);
        fetchCustomers();
      } catch (error) {
        console.error('Error deleting customer', error);
        alert('Error deleting customer');
      }
    }
  };

  const fetchCustomerBills = async (customer) => {
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange.endDate) params.set('endDate', dateRange.endDate);
      const { data } = await api.get(`/customers/${customer._id}/history?${params.toString()}`);
      setSelectedCustomerBills({ customer, bills: data.bills || [] });
      setSelectedCustomerTotals(data.totals || { totalAmount: 0, paidAmount: 0, balance: 0 });
    } catch (error) {
      console.error('Error fetching customer bills', error);
      alert('Error fetching customer bills');
    }
  };

  const openBillsModal = async (customer) => {
    setSelectedCustomerBills({ customer, bills: [] });
    setSelectedCustomerTotals({ totalAmount: 0, paidAmount: 0, balance: 0 });
    setBillsModalOpen(true);
    await fetchCustomerBills(customer);
  };

  const openPaymentModal = (bill) => {
    setCurrentBillForPayment(bill);
    setPaymentAmount(bill.pendingAmount.toString());
    setPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    
    try {
      await api.post(`/bills/${currentBillForPayment._id}/pay`, { amount: Number(paymentAmount) });
      
      await fetchCustomerBills(selectedCustomerBills.customer);
      setPaymentModalOpen(false);
      setPaymentAmount('');
      setCurrentBillForPayment(null);
    } catch (error) {
      console.error('Error processing payment', error);
      alert('Error processing payment: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const toggleVehicles = (customerId) => {
    setExpandedVehicleId((prev) => (prev === customerId ? null : customerId));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
          <p className="text-slate-500 text-sm mt-1">Manage all your client details here.</p>
        </div>
        {canWrite && (
          <button 
            onClick={() => { setFormData({ name: '', phone: '', address: '', vehicles: [] }); setIsModalOpen(true); }}
            className="btn-primary flex items-center shadow-lg hover:shadow-xl w-full sm:w-auto justify-center"
          >
            <span className="mr-2">+</span> Add Customer
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by name or phone number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm bg-white"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>
      </div>

      <div className="card overflow-hidden p-0 border border-slate-200">
        {loading ? (
           <div className="p-8 text-center text-slate-500">Loading customers...</div>
        ) : filteredCustomers.length === 0 ? (
           <div className="p-8 text-center text-slate-500">
             {searchTerm ? 'No customers match your search.' : 'No customers found. Add your first customer!'}
           </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                  <th className="p-4 font-semibold">Name</th>
                  <th className="p-4 font-semibold">Phone</th>
                  <th className="p-4 font-semibold">Vehicles</th>
                  <th className="p-4 font-semibold">Address</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((c) => {
                  const vehicles = c.vehicles || [];
                  const vehicleCount = vehicles.length;
                  const isExpanded = expandedVehicleId === c._id;

                  return (
                  <React.Fragment key={c._id}>
                    <tr className="hover:bg-slate-50 transition">
                      <td className="p-4 font-medium text-slate-800">{c.name}</td>
                      <td className="p-4 text-slate-600">{c.phone || '-'}</td>
                      <td className="p-4 text-slate-600 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                            {vehicleCount} {vehicleCount === 1 ? 'vehicle' : 'vehicles'}
                          </span>
                          {vehicleCount > 0 && (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => toggleVehicles(c._id)}
                                className="text-blue-600 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 transition-colors inline-flex items-center"
                                title="Click to expand list below, hover to preview"
                              >
                                <CargoIcon className="h-5 w-5" />
                              </button>
                              
                              {/* Hover card showing vehicles */}
                              <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-3 hidden group-hover:block z-30 min-w-[180px] animate-in fade-in slide-in-from-top-1 duration-150 text-left">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-b border-slate-100 pb-1 flex items-center gap-1">
                                  <CargoIcon className="h-3 w-3 text-slate-400" />
                                  Vehicles List
                                </div>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                  {vehicles.map((v, idx) => (
                                    <div key={v._id || idx} className="font-mono text-xs font-semibold text-slate-700 whitespace-nowrap bg-slate-50 border border-slate-100 rounded px-2 py-1 flex items-center gap-1.5">
                                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                                      {v.number}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 truncate max-w-xs">{c.address || '-'}</td>
                      <td className="p-4 text-right space-x-3">
                        <button 
                          onClick={() => openBillsModal(c)} 
                          className="text-green-600 hover:text-green-800 hover:bg-green-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                          title="View Bills"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        {canWrite && (
                          <>
                            <button 
                              onClick={() => handleEdit(c)} 
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                              title="Edit Customer"
                            >
                              <EditIcon className="h-5 w-5" />
                            </button>
                            <button 
                              onClick={() => handleDelete(c._id)} 
                              className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                              title="Delete Customer"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {isExpanded && vehicleCount > 0 && (
                      <tr className="bg-slate-50/50 border-b border-slate-200">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                              <CargoIcon className="h-4 w-4 text-slate-400" />
                              Registered Vehicles ({vehicleCount})
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {vehicles.map((v, idx) => (
                                <span
                                  key={v._id || `${v.number}-${idx}`}
                                  className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-semibold text-slate-800 shadow-sm transition-all duration-150 cursor-default"
                                >
                                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                                  {v.number}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">{formData._id ? 'Edit Customer' : 'Add New Customer'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
                <input 
                  type="text" name="name" required value={formData.name} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="e.g. John Doe Construction"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number * (10 digits, unique ID)</label>
                <input
                  type="text" name="phone" required value={formData.phone} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="9876543210"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Numbers</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newVehicle}
                    onChange={(e) => setNewVehicle(formatVehicleInput(e.target.value))}
                    className="flex-1 border border-slate-300 rounded-lg p-2.5 uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="TN 74 AE 2003 or TMR 7177"
                  />
                  <button type="button" onClick={addVehicleToForm} className="px-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(formData.vehicles || []).map((v, idx) => {
                    const isEditing = editingVehicleIdx === idx;
                    if (isEditing) {
                      return (
                        <input
                          key={idx}
                          type="text"
                          value={editingVehicleVal}
                          onChange={(e) => setEditingVehicleVal(formatVehicleInput(e.target.value))}
                          onBlur={() => saveVehicleEdit(idx)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveVehicleEdit(idx);
                            } else if (e.key === 'Escape') {
                              setEditingVehicleIdx(null);
                            }
                          }}
                          autoFocus
                          className="w-36 border border-blue-400 bg-white rounded-full px-3 py-1 text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      );
                    }
                    return (
                      <span key={idx} className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full px-3 py-1.5 text-xs font-mono text-slate-800 transition">
                        <CargoIcon className="h-3.5 w-3.5 text-slate-400" />
                        <span>{v.number}</span>
                        <button 
                          type="button" 
                          onClick={() => {
                            setEditingVehicleIdx(idx);
                            setEditingVehicleVal(v.number);
                          }} 
                          className="text-slate-400 hover:text-blue-600 p-0.5 rounded transition-colors cursor-pointer"
                          title="Edit Vehicle"
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => removeVehicleFromForm(idx)} 
                          className="text-slate-400 hover:text-red-600 p-0.5 rounded transition-colors font-bold cursor-pointer"
                          title="Remove Vehicle"
                        >
                          &times;
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <textarea 
                  name="address" rows="3" value={formData.address} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Full office address"
                ></textarea>
              </div>
              
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md">
                  {formData._id ? 'Update Customer' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Bills Modal */}
      {billsModalOpen && selectedCustomerBills.customer && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Bills for {selectedCustomerBills.customer.name}</h2>
                <div className="flex items-center gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Report Type</label>
                    <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="range">Selected Days</option>
                    </select>
                  </div>
                  {reportType === 'range' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Start Date</label>
                        <input type="date" value={dateRange.startDate} onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">End Date</label>
                        <input type="date" value={dateRange.endDate} onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Total Amount</div>
                    <div className="font-bold text-slate-800">₹{Number(selectedCustomerTotals.totalAmount || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Payments Done</div>
                    <div className="font-bold text-emerald-700">₹{Number(selectedCustomerTotals.paidAmount || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase">Balance</div>
                    <div className="font-bold text-red-600">₹{Number(selectedCustomerTotals.balance || 0).toLocaleString()}</div>
                  </div>
                </div>
              </div>
              <button onClick={() => setBillsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-auto min-h-0">
              {selectedCustomerBills.bills.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No bills found for this period.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="p-4 font-semibold">Date</th>
                      <th className="p-4 font-semibold">Time</th>
                      <th className="p-4 font-semibold">Vehicle</th>
                      <th className="p-4 font-semibold">Material</th>
                      <th className="p-4 font-semibold text-right">Total</th>
                      <th className="p-4 font-semibold text-right">Paid</th>
                      <th className="p-4 font-semibold text-right">Pending</th>
                      <th className="p-4 font-semibold">Status</th>
                      <th className="p-4 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedCustomerBills.bills.map((bill) => {
                      const { date, time } = formatDateTime(bill.date);
                      return (
                      <tr key={bill._id} className="hover:bg-slate-50">
                        <td className="p-4 text-slate-600 whitespace-nowrap">{date}</td>
                        <td className="p-4 text-slate-600 whitespace-nowrap">{time}</td>
                        <td className="p-4 text-slate-600"><span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 text-xs font-mono whitespace-nowrap">{bill.vehicleNumber || '—'}</span></td>
                        <td className="p-4 text-slate-600">{bill.materialNameSnapshot}</td>
                        <td className="p-4 text-right text-slate-800 font-semibold">₹{(Number(bill.totalAmount) + Number(bill.passAmount || 0)).toLocaleString()}</td>
                        <td className="p-4 text-right text-emerald-700 font-semibold">₹{Number(bill.paidAmount || 0).toLocaleString()}</td>
                        <td className="p-4 text-right text-red-600 font-semibold">₹{bill.pendingAmount.toLocaleString()}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                            bill.paymentStatus === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' :
                            bill.paymentStatus === 'Partially Paid' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {bill.paymentStatus}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          {canWrite && bill.paymentStatus !== 'Paid' && (
                            <button 
                              onClick={() => openPaymentModal(bill)} 
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer"
                              title="Record Payment"
                            >
                              <PlusIcon className="h-5 w-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setBillsModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModalOpen && currentBillForPayment && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <h2 className="text-xl font-bold text-blue-900">Record Payment</h2>
              <button onClick={() => { setPaymentModalOpen(false); setPaymentAmount(''); setCurrentBillForPayment(null); }} className="text-blue-400 hover:text-blue-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="text-sm text-slate-600 mb-1">Bill Date & Time</div>
                <div className="font-semibold text-slate-800 mb-3">
                  {`${formatDateTime(currentBillForPayment.date).date} at ${formatDateTime(currentBillForPayment.date).time}`}
                </div>
                
                <div className="text-sm text-slate-600 mb-1">Vehicle Number</div>
                <div className="font-semibold text-slate-800 mb-3">{currentBillForPayment.vehicleNumber}</div>
                
                <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                  <span className="text-sm text-slate-600">Bill Total:</span>
                  <span className="font-bold text-slate-800">₹{(Number(currentBillForPayment.totalAmount) + Number(currentBillForPayment.passAmount || 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-red-600 font-semibold">Pending Amount:</span>
                  <span className="font-bold text-red-600">₹{currentBillForPayment.pendingAmount.toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount to Receive (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                  <input 
                    type="number" required value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} min="1" step="0.1"
                    className="w-full text-lg font-bold border border-slate-300 rounded-lg p-3 pl-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => { setPaymentModalOpen(false); setPaymentAmount(''); setCurrentBillForPayment(null); }} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition shadow-md">
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
