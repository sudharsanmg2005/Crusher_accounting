import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { HistoryIcon, ChevronDownIcon, DocumentIcon } from '../components/Icons';
import { formatVehicleInput, isValidVehicleNumber } from '../utils/vehicleNumber';
import { downloadBillPdf } from '../utils/billPdf';
import { formatDateTime } from '../utils/dateTime';

const emptyForm = () => ({
  customer: '',
  vehicleNumber: '',
  vehicleMode: 'select',
  material: '',
  quantity: '',
  quantityUnit: 'unit',
  passAmount: '',
  useManualPrice: false,
  manualPrice: '',
  customDate: '',
  customTime: ''
});

const Bills = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [bills, setBills] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  
  // State for recording a payment
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [currentBillId, setCurrentBillId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const [formData, setFormData] = useState(emptyForm());
  const [editFormData, setEditFormData] = useState({ vehicleNumber: '', quantity: '', quantityUnit: 'unit', pricePerUnit: '' });

  // State for creating new customer
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', address: '' });

  // State for payment history
  const [expandedBillId, setExpandedBillId] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState({});
  const [filters, setFilters] = useState({
    mode: 'date_newest',
    search: '',
    customerId: '',
    status: '',
    particularDate: '',
    startDate: '',
    endDate: '',
    month: '',
    weekStart: ''
  });

  // Calculate total automatically based on selected material and quantity
  const [calculatedTotal, setCalculatedTotal] = useState(0);
  const [selectedMaterialPrice, setSelectedMaterialPrice] = useState(0);
  const canWrite = user?.role === 'super_admin' || user?.accessLevel === 'full_access';
  const canCreateBills = canWrite || user?.accessLevel === 'create_bills';

  const selectedCustomer = useMemo(
    () => customers.find((c) => c._id === formData.customer),
    [customers, formData.customer]
  );
  const customerVehicles = selectedCustomer?.vehicles || [];

  const toYMD = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const filteredBills = useMemo(() => {
    let result = [...bills];
    const search = filters.search.trim().toLowerCase();

    if (search) {
      result = result.filter((bill) =>
        [bill.customerNameSnapshot, bill.vehicleNumber, bill.materialNameSnapshot]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(search))
      );
    }

    if (filters.customerId) {
      result = result.filter((bill) => String(bill.customer || '') === filters.customerId);
    }

    if (filters.status) {
      result = result.filter((bill) => bill.paymentStatus === filters.status);
    }

    if (filters.mode === 'particular_date' && filters.particularDate) {
      result = result.filter((bill) => toYMD(bill.date) === filters.particularDate);
    }

    if (filters.mode === 'selected_dates' && filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate + 'T00:00:00');
      const end = new Date(filters.endDate + 'T23:59:59');
      result = result.filter((bill) => {
        const billDate = new Date(bill.date);
        return billDate >= start && billDate <= end;
      });
    }

    if (filters.mode === 'month' && filters.month) {
      result = result.filter((bill) => toYMD(bill.date).startsWith(filters.month));
    }

    if (filters.mode === 'week' && filters.weekStart) {
      const start = new Date(filters.weekStart + 'T00:00:00');
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      result = result.filter((bill) => {
        const billDate = new Date(bill.date);
        return billDate >= start && billDate <= end;
      });
    }

    if (filters.mode === 'alpha_az') {
      result.sort((a, b) => a.customerNameSnapshot.localeCompare(b.customerNameSnapshot));
    } else if (filters.mode === 'alpha_za') {
      result.sort((a, b) => b.customerNameSnapshot.localeCompare(a.customerNameSnapshot));
    } else if (filters.mode === 'date_oldest') {
      result.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else {
      result.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return result;
  }, [bills, filters]);

  const filteredTotals = useMemo(() => {
    return filteredBills.reduce(
      (acc, bill) => {
        acc.total += Number(bill.totalAmount || 0) + Number(bill.passAmount || 0);
        acc.paid += Number(bill.paidAmount || 0);
        acc.pending += Number(bill.pendingAmount || 0);
        return acc;
      },
      { total: 0, paid: 0, pending: 0 }
    );
  }, [filteredBills]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [billsRes, custRes, matRes] = await Promise.all([
        api.get('/bills'),
        api.get('/customers'),
        api.get('/materials')
      ]);
      setBills(Object.values(billsRes.data).sort((a,b) => new Date(b.date) - new Date(a.date)));
      setCustomers(custRes.data);
      setMaterials(matRes.data);
    } catch (error) {
      console.error('Error fetching data for bills page', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (formData.material && formData.quantity) {
      const material = materials.find(m => m._id === formData.material);
      if (material) {
        const defaultPrice = formData.quantityUnit === 'ton'
          ? (material.pricePerTon ?? material.currentPrice)
          : material.currentPrice;
        const price = formData.useManualPrice ? Number(formData.manualPrice) || 0 : defaultPrice;
        setSelectedMaterialPrice(price);
        setCalculatedTotal(price * Number(formData.quantity));
      }
    } else {
      setCalculatedTotal(0);
      setSelectedMaterialPrice(0);
    }
  }, [formData.material, formData.quantity, formData.quantityUnit, formData.useManualPrice, formData.manualPrice, materials]);

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    if (name === 'vehicleNumber') {
      setFormData({ ...formData, vehicleNumber: formatVehicleInput(value) });
      return;
    }
    setFormData({ 
      ...formData, 
      [name]: type === 'checkbox' ? checked : value 
    });
  };

  const buildBillDate = () => {
    if (!canWrite || !formData.customDate) return undefined;
    const time = formData.customTime || '12:00';
    return new Date(`${formData.customDate}T${time}`).toISOString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const vehicle = formData.vehicleMode === 'none' ? '' : (formData.vehicleNumber || '');
    if (vehicle && !isValidVehicleNumber(vehicle)) {
      alert('Vehicle number must be TN 74 AE 2003 or TMR 7177 format');
      return;
    }
    try {
      const billData = {
        customerId: formData.customer,
        vehicleNumber: vehicle,
        materialId: formData.material,
        quantity: Number(formData.quantity),
        quantityUnit: formData.quantityUnit,
        passAmount: formData.passAmount ? Number(formData.passAmount) : 0
      };

      const customDate = buildBillDate();
      if (customDate) billData.date = customDate;

      if (formData.useManualPrice && formData.manualPrice) {
        billData.pricePerUnit = Number(formData.manualPrice);
      }

      await api.post('/bills', billData);
      
      setIsModalOpen(false);
      setFormData(emptyForm());
      fetchData();
    } catch (error) {
      console.error('Error saving bill', error);
      alert('Error saving bill: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const openEditModal = (bill) => {
    setEditingBill(bill);
    setEditFormData({
      vehicleNumber: bill.vehicleNumber || '',
      quantity: bill.quantity,
      quantityUnit: bill.quantityUnit || 'unit',
      pricePerUnit: bill.pricePerUnit
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (editFormData.vehicleNumber && !isValidVehicleNumber(editFormData.vehicleNumber)) {
      alert('Vehicle number must be TN 74 AE 2003 or TMR 7177 format');
      return;
    }
    try {
      await api.put(`/bills/${editingBill._id}`, {
        vehicleNumber: editFormData.vehicleNumber || '',
        quantity: Number(editFormData.quantity),
        quantityUnit: editFormData.quantityUnit,
        pricePerUnit: Number(editFormData.pricePerUnit)
      });
      setEditModalOpen(false);
      setEditingBill(null);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.message || 'Error updating bill');
    }
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/bills/${currentBillId}/pay`, { amount: Number(paymentAmount) });
      setPaymentModalOpen(false);
      setPaymentAmount('');
      setCurrentBillId(null);
      fetchData();
    } catch (error) {
      console.error('Error processing payment', error);
      alert('Error processing payment: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    try {
      const { data: newCustomer } = await api.post('/customers', newCustomerData);
      setFormData({ ...formData, customer: newCustomer._id });
      setIsCreateCustomerOpen(false);
      setNewCustomerData({ name: '', phone: '', address: '' });
      await fetchData();
    } catch (error) {
      console.error('Error creating customer', error);
      alert('Error creating customer: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const openPaymentModal = (bill) => {
    setCurrentBillId(bill._id);
    setPaymentAmount(bill.pendingAmount.toString());
    setPaymentModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete bill',
      message: 'Are you sure you want to delete this bill?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/bills/${id}`);
        fetchData();
      } catch (error) {
        console.error('Error deleting bill', error);
        alert('Error deleting bill');
      }
    }
  };

  const togglePaymentHistory = async (billId) => {
    if (expandedBillId === billId) {
      setExpandedBillId(null);
    } else {
      if (!paymentHistory[billId]) {
        try {
          const response = await api.get(`/bills/${billId}`);
          const bill = response.data;
          setPaymentHistory({...paymentHistory, [billId]: bill.payments || []});
        } catch (error) {
          console.error('Error fetching payment history', error);
        }
      }
      setExpandedBillId(billId);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Paid': return 'bg-green-100 text-green-800 border-green-200';
      case 'Partially Paid': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bills & Invoices</h1>
          <p className="text-slate-500 text-sm mt-1">Generate new bills and track payments.</p>
        </div>
        {canCreateBills && (
          <button 
            onClick={() => { setFormData(emptyForm()); setIsModalOpen(true); }}
            className="btn-primary flex items-center shadow-lg hover:shadow-xl"
          >
            <span className="mr-2">+</span> Generate Bill
          </button>
        )}
      </div>

      <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col min-h-0 min-w-0">
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Name, vehicle, material"
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <select value={filters.customerId} onChange={(e) => setFilters((prev) => ({ ...prev, customerId: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">All customers</option>
              {customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.name}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">All payment status</option>
              <option value="Pending">Pending</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
            </select>
            <select value={filters.mode} onChange={(e) => setFilters((prev) => ({ ...prev, mode: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="date_newest">Date: newest first</option>
              <option value="date_oldest">Date: oldest first</option>
              <option value="alpha_az">Customer A to Z</option>
              <option value="alpha_za">Customer Z to A</option>
              <option value="particular_date">Particular date</option>
              <option value="selected_dates">Selected dates</option>
              <option value="month">Month</option>
              <option value="week">Week</option>
            </select>
            {filters.mode === 'particular_date' && (
              <input type="date" value={filters.particularDate} onChange={(e) => setFilters((prev) => ({ ...prev, particularDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            )}
            {filters.mode === 'month' && (
              <input type="month" value={filters.month} onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            )}
            {filters.mode === 'week' && (
              <input type="date" value={filters.weekStart} onChange={(e) => setFilters((prev) => ({ ...prev, weekStart: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            )}
            {filters.mode === 'selected_dates' && (
              <>
                <input type="date" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                <input type="date" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700">Bills: {filteredBills.length}</span>
            <span className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-semibold text-slate-700">Total: ₹{filteredTotals.total.toLocaleString()}</span>
            <span className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-semibold text-emerald-700">Paid: ₹{filteredTotals.paid.toLocaleString()}</span>
            <span className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-semibold text-red-700">Pending: ₹{filteredTotals.pending.toLocaleString()}</span>
          </div>
        </div>
        {loading ? (
           <div className="p-8 text-center text-slate-500">Loading bills...</div>
        ) : filteredBills.length === 0 ? (
           <div className="p-8 text-center text-slate-500 border-t border-slate-100 italic">No bills generated yet.</div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0 min-w-0">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 shadow-sm z-10 w-full min-w-max">
                <tr className="border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                  <th className="p-4 font-semibold whitespace-nowrap w-8"></th>
                  <th className="p-4 font-semibold whitespace-nowrap">Date</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Time</th>
                  <th className="p-4 font-semibold">Customer</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Vehicle No.</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Material (Qty)</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Total (₹)</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Pending (₹)</th>
                  <th className="p-4 font-semibold text-center whitespace-nowrap">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                {filteredBills.map((bill) => {
                  const billDateTime = formatDateTime(bill.date);
                  return (
                  <React.Fragment key={bill._id}>
                    <tr className="hover:bg-slate-50 transition">
                      <td className="p-2 text-center">
                        <button 
                          onClick={() => togglePaymentHistory(bill._id)} 
                          className="text-slate-500 hover:text-blue-600 p-1 rounded transition-colors"
                          title="View payment history"
                        >
                          {expandedBillId === bill._id ? (
                            <ChevronDownIcon className="h-5 w-5" />
                          ) : (
                            <HistoryIcon className="h-5 w-5" />
                          )}
                        </button>
                      </td>
                      <td className="p-4 text-slate-600 font-medium whitespace-nowrap">{billDateTime.date}</td>
                      <td className="p-4 text-slate-600 whitespace-nowrap">{billDateTime.time}</td>
                      <td className="p-4 text-slate-800 font-semibold">{bill.customerNameSnapshot}</td>
                      <td className="p-4 text-slate-600"><span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 text-xs font-mono">{bill.vehicleNumber || '—'}</span></td>
                      <td className="p-4 text-slate-600 text-sm">
                        <div className="font-medium text-slate-800">{bill.materialNameSnapshot}</div>
                        <div className="text-xs text-slate-500">{bill.quantity} {bill.quantityUnit || 'unit'}s @ ₹{bill.pricePerUnit}</div>
                        {bill.isBackdated && <div className="text-xs text-amber-600 font-medium">Backdated</div>}
                      </td>
                      <td className="p-4 font-bold text-slate-800">
                        ₹{(Number(bill.totalAmount) + Number(bill.passAmount || 0)).toLocaleString()}
                      </td>
                      <td className="p-4 font-semibold text-red-600">₹{bill.pendingAmount.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(bill.paymentStatus)}`}>
                          {bill.paymentStatus}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-3">
                        <button onClick={() => downloadBillPdf(bill)} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors" title="Download PDF">
                          <DocumentIcon className="h-4 w-4" /> PDF
                        </button>
                        {canWrite && (
                          <button onClick={() => openEditModal(bill)} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors">Edit</button>
                        )}
                        {canWrite && bill.paymentStatus !== 'Paid' && (
                          <button onClick={() => openPaymentModal(bill)} className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors">Record Payment</button>
                        )}
                        {canWrite && (
                          <button onClick={() => handleDelete(bill._id)} className="text-red-600 hover:text-red-800 font-medium text-sm transition-colors">Delete</button>
                        )}
                      </td>
                    </tr>
                    {expandedBillId === bill._id && (
                      <tr className="bg-slate-50 border-b-2 border-slate-200">
                        <td colSpan="10" className="p-6">
                          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                              <h3 className="font-semibold text-slate-800">Payment History</h3>
                            </div>
                            {paymentHistory[bill._id] && paymentHistory[bill._id].length > 0 ? (
                              <div className="overflow-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
                                      <th className="p-3 text-left font-semibold">Date</th>
                                      <th className="p-3 text-left font-semibold">Time</th>
                                      <th className="p-3 text-right font-semibold">Amount (₹)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {paymentHistory[bill._id].map((payment, idx) => {
                                      const { date, time } = formatDateTime(payment.paymentDate || payment.date);
                                      return (
                                      <tr key={idx} className="hover:bg-slate-50">
                                        <td className="p-3 text-slate-600">{date}</td>
                                        <td className="p-3 text-slate-600">{time}</td>
                                        <td className="p-3 text-right font-semibold text-green-600">₹{Number(payment.amount).toLocaleString()}</td>
                                      </tr>
                                    );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="p-4 text-center text-slate-500 text-sm">No payments recorded yet</div>
                            )}
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

      {/* Generate Bill Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">Generate New Bill</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Customer *</label>
                  <div className="flex gap-2">
                    <select 
                      name="customer" required value={formData.customer} onChange={handleChange}
                      className="flex-1 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                    >
                      <option value="" disabled>Select Customer</option>
                      {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                    {canWrite && (
                      <button type="button" onClick={() => setIsCreateCustomerOpen(true)} className="px-3 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">+ New</button>
                    )}
                  </div>
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Number (optional)</label>
                  <div className="flex gap-2 mb-2">
                    <select
                      value={formData.vehicleMode}
                      onChange={(e) => setFormData({ ...formData, vehicleMode: e.target.value, vehicleNumber: '' })}
                      className="border border-slate-300 rounded-lg p-2 text-sm bg-white"
                    >
                      <option value="select">Select existing</option>
                      <option value="new">Add new</option>
                      <option value="none">No vehicle</option>
                    </select>
                  </div>
                  {formData.vehicleMode === 'select' && (
                    <select
                      name="vehicleNumber"
                      value={formData.vehicleNumber}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Select vehicle</option>
                      {customerVehicles.map((v) => (
                        <option key={v._id || v.number} value={v.number}>{v.number}</option>
                      ))}
                    </select>
                  )}
                  {formData.vehicleMode === 'new' && (
                    <input
                      type="text"
                      name="vehicleNumber"
                      value={formData.vehicleNumber}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-lg p-2.5 uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="TN 74 AE 2003 or TMR 7177"
                    />
                  )}
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Material *</label>
                  <select 
                    name="material" required value={formData.material} onChange={handleChange}
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                  >
                    <option value="" disabled>Select Material</option>
                    {materials.map(m => (
                      <option key={m._id} value={m._id}>
                        {m.name} (₹{m.currentPrice}/unit, ₹{m.pricePerTon ?? m.currentPrice}/ton)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
                  <div className="flex gap-2">
                    <input 
                      type="number" name="quantity" required value={formData.quantity} onChange={handleChange} min="0.1" step="0.1"
                      className="flex-1 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition"
                      placeholder="e.g. 15.5"
                    />
                    <select
                      name="quantityUnit"
                      value={formData.quantityUnit}
                      onChange={handleChange}
                      className="border border-slate-300 rounded-lg p-2 text-sm bg-white"
                    >
                      <option value="unit">Unit</option>
                      <option value="ton">Ton</option>
                    </select>
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox" name="useManualPrice" id="useManualPrice" checked={formData.useManualPrice} onChange={handleChange}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="useManualPrice" className="text-sm font-medium text-slate-700">Use Custom Price</label>
                  </div>
                </div>

                {formData.useManualPrice && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Custom Price per {formData.quantityUnit} (₹) *</label>
                    <input
                      type="number"
                      name="manualPrice"
                      value={formData.manualPrice}
                      onChange={handleChange}
                      min="0"
                      step="0.1"
                      className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      placeholder="e.g. 5000"
                    />
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    PASS Amount (Govt Permission Cost)
                  </label>
                  <input
                    type="number"
                    name="passAmount"
                    value={formData.passAmount}
                    onChange={handleChange}
                    min="0"
                    step="1"
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="e.g. 1200"
                  />
                </div>

                {canWrite && (
                  <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <label className="block text-sm font-semibold text-amber-900 mb-2">Custom Date & Time (for missed bills)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" name="customDate" value={formData.customDate} onChange={handleChange} className="border border-slate-300 rounded-lg p-2 text-sm" />
                      <input type="time" name="customTime" value={formData.customTime} onChange={handleChange} className="border border-slate-300 rounded-lg p-2 text-sm" />
                    </div>
                    <p className="text-xs text-amber-700 mt-2">Backdated bills are logged separately in the audit trail.</p>
                  </div>
                )}
              </div>

              <div className="mt-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between text-sm text-slate-600 mb-1">
                  <span>Price per {formData.quantityUnit}:</span>
                  <span>₹{selectedMaterialPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-slate-800 mt-2 pt-2 border-t border-slate-200">
                  <span>Total Amount:</span>
                  <span>₹{calculatedTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600 mt-2">
                  <span>PASS (Govt):</span>
                  <span>₹{(Number(formData.passAmount) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-lg font-extrabold text-slate-900 mt-1 pt-1 border-t border-slate-200">
                  <span>Total (Amount + PASS):</span>
                  <span>₹{(calculatedTotal + (Number(formData.passAmount) || 0)).toLocaleString()}</span>
                </div>
              </div>
              
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={!formData.customer || !formData.material || !formData.quantity} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  Generate Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModalOpen && editingBill && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Edit Bill</h2>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Number</label>
                <input
                  type="text"
                  value={editFormData.vehicleNumber}
                  onChange={(e) => setEditFormData({ ...editFormData, vehicleNumber: formatVehicleInput(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="TN 74 AE 2003 or TMR 7177"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input type="number" min="0.1" step="0.1" required value={editFormData.quantity} onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                  <select value={editFormData.quantityUnit} onChange={(e) => setEditFormData({ ...editFormData, quantityUnit: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 bg-white">
                    <option value="unit">Unit</option>
                    <option value="ton">Ton</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Price per {editFormData.quantityUnit}</label>
                <input type="number" min="0" step="0.1" required value={editFormData.pricePerUnit} onChange={(e) => setEditFormData({ ...editFormData, pricePerUnit: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <h2 className="text-xl font-bold text-blue-900">Record Payment</h2>
              <button onClick={() => setPaymentModalOpen(false)} className="text-blue-400 hover:text-blue-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount Receiving (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                  <input 
                    type="number" required value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} min="1" step="1"
                    className="w-full text-lg font-bold border border-slate-300 rounded-lg p-3 pl-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>
              </div>
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setPaymentModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition">
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

      {/* Create Customer Modal */}
      {isCreateCustomerOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-green-50">
              <h2 className="text-xl font-bold text-green-900">Add New Customer</h2>
              <button onClick={() => setIsCreateCustomerOpen(false)} className="text-green-400 hover:text-green-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
                <input 
                  type="text" required value={newCustomerData.name} onChange={(e) => setNewCustomerData({...newCustomerData, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number (optional, 10 digits)</label>
                <input 
                  type="tel" value={newCustomerData.phone} onChange={(e) => setNewCustomerData({...newCustomerData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="9876543210"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input 
                  type="text" value={newCustomerData.address} onChange={(e) => setNewCustomerData({...newCustomerData, address: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="e.g. 123 Main Street"
                />
              </div>
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsCreateCustomerOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition shadow-md">
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Bills;
