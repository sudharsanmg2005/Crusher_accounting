import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { HistoryIcon, ChevronDownIcon, DocumentIcon, EditIcon, TrashIcon } from '../components/Icons';
import { formatVehicleInput, isValidVehicleNumber } from '../utils/vehicleNumber';
import { downloadBillPdf } from '../utils/billPdf';
import { formatDateTime } from '../utils/dateTime';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const emptyForm = () => ({
  customer: '',
  vehicleNumber: '',
  vehicleMode: 'select',
  material: '',
  quantity: '',
  quantityUnit: 'ton',
  passAmount: '',
  useManualPrice: false,
  manualPrice: '',
  customDate: new Date().toISOString().split('T')[0]
});

const roundToNearestTen = (amount) => {
  const rounded = Math.round(amount);
  const lastDigit = rounded % 10;
  if (lastDigit < 5) {
    return rounded - lastDigit;
  } else {
    return rounded + (10 - lastDigit);
  }
};

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
  const [formData, setFormData] = useState(emptyForm());
  const [editFormData, setEditFormData] = useState({ vehicleNumber: '', quantity: '', quantityUnit: 'ton', pricePerUnit: '', date: '' });
  
  // State for payment editing/deleting
  const [editPaymentModalOpen, setEditPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editPaymentNote, setEditPaymentNote] = useState('');
  const [editPaymentReceivedBy, setEditPaymentReceivedBy] = useState('');

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
    status: '', // '' = all, 'Outstanding' = pending > 0, 'Settled' = pending === 0
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
      if (filters.status === 'Outstanding') {
        result = result.filter((bill) => bill.pendingAmount > 0);
      } else if (filters.status === 'Settled') {
        result = result.filter((bill) => bill.pendingAmount === 0);
      }
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
        acc.paid += Number(bill.allocatedAmount || 0);
        acc.pending += Number(bill.pendingAmount || 0);
        return acc;
      },
      { total: 0, paid: 0, pending: 0 }
    );
  }, [filteredBills]);

  const billStatementInfo = useMemo(() => {
    let rangeLabel = 'All Time';
    if (filters.mode === 'particular_date' && filters.particularDate) {
      rangeLabel = formatDateTime(filters.particularDate).date;
    } else if (filters.mode === 'selected_dates' && filters.startDate && filters.endDate) {
      rangeLabel = `${formatDateTime(filters.startDate).date} - ${formatDateTime(filters.endDate).date}`;
    } else if (filters.mode === 'month' && filters.month) {
      const [year, month] = filters.month.split('-');
      if (year && month) {
        const date = new Date(Number(year), Number(month) - 1, 1);
        rangeLabel = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      } else {
        rangeLabel = filters.month;
      }
    } else if (filters.mode === 'week' && filters.weekStart) {
      const start = new Date(filters.weekStart);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      rangeLabel = `${formatDateTime(start).date} - ${formatDateTime(end).date}`;
    } else if (filteredBills.length > 0) {
      const dates = filteredBills.map(b => new Date(b.date).getTime());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      rangeLabel = `${formatDateTime(minDate).date} - ${formatDateTime(maxDate).date}`;
    }

    const selectedCustomer = customers.find((c) => c._id === filters.customerId);
    const title = selectedCustomer ? `${selectedCustomer.name.toUpperCase()} STATEMENT` : 'GENERAL STATEMENT';

    return { title, rangeLabel };
  }, [filters, filteredBills, customers]);

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
        setCalculatedTotal(roundToNearestTen(price * Number(formData.quantity)));
      }
    } else {
      setCalculatedTotal(0);
      setSelectedMaterialPrice(0);
    }
  }, [formData.material, formData.quantity, formData.quantityUnit, formData.useManualPrice, formData.manualPrice, materials]);

  const downloadSummaryPdf = () => {
    const listToExport = filteredBills;
    if (listToExport.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const centerText = (text, xY, fontSize = 10, fontStyle) => {
      const str = String(text ?? '');
      doc.setFontSize(fontSize);
      if (fontStyle) doc.setFont(undefined, fontStyle);
      const w = doc.getTextWidth(str);
      doc.text(str, (pageWidth - w) / 2, xY);
    };

    const selectedCustomer = customers.find((c) => c._id === filters.customerId);
    const customerName = selectedCustomer ? selectedCustomer.name : '';

    let titleParts = [];
    if (customerName) {
      titleParts.push(customerName.toUpperCase());
    }

    const titleText = titleParts.length > 0
      ? `${titleParts.join(' - ')} BILL SUMMARY`
      : 'CUSTOMER BILL SUMMARY REPORT';

    centerText(titleText, 19, 12, 'bold');

    let rangeLabel = 'All Time';
    if (filters.mode === 'particular_date' && filters.particularDate) {
      rangeLabel = `Date: ${formatDateTime(filters.particularDate).date}`;
    } else if (filters.mode === 'selected_dates' && filters.startDate && filters.endDate) {
      rangeLabel = `${formatDateTime(filters.startDate).date} to ${formatDateTime(filters.endDate).date}`;
    } else if (filters.mode === 'month' && filters.month) {
      rangeLabel = `Month: ${filters.month}`;
    } else if (filters.mode === 'week' && filters.weekStart) {
      rangeLabel = `Week starting: ${formatDateTime(filters.weekStart).date}`;
    }
    centerText(rangeLabel, 26, 9);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 29, pageWidth - 14, 29);

    const head = [['S.NO', 'DATE', 'CUSTOMER NAME', 'VEHICLE NUMBER', 'MATERIAL', 'QTY', 'UNIT', 'TOTAL (Rs.)', 'ALLOCATED (Rs.)', 'PENDING (Rs.)']];
    const body = listToExport.map((b, idx) => [
      idx + 1,
      new Date(b.date).toLocaleDateString(),
      b.customerNameSnapshot || '—',
      b.vehicleNumber || '—',
      b.materialNameSnapshot || '—',
      Number(b.quantity || 0).toFixed(2),
      b.quantityUnit || 'ton',
      (Number(b.totalAmount || 0) + Number(b.passAmount || 0)).toLocaleString(),
      (b.allocatedAmount || 0).toLocaleString(),
      (b.pendingAmount || 0).toLocaleString()
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 36,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    let y = (doc.lastAutoTable?.finalY || 36) + 12;
    if (y > pageHeight - 65) {
      doc.addPage();
      y = 18;
    }

    // Grand Totals
    let grandBilled = 0;
    let grandPaid = 0;
    let grandOutstanding = 0;
    
    // Aggregates by Customer
    const customerAgg = {}; // customerName -> { billed, paid, pending }

    listToExport.forEach((b) => {
      const billed = Number(b.totalAmount || 0) + Number(b.passAmount || 0);
      const paid = Number(b.allocatedAmount || 0);
      const pending = Number(b.pendingAmount || 0);

      grandBilled += billed;
      grandPaid += paid;
      grandOutstanding += pending;

      const cName = b.customerNameSnapshot || '—';
      if (!customerAgg[cName]) {
        customerAgg[cName] = { billed: 0, paid: 0, pending: 0 };
      }
      customerAgg[cName].billed += billed;
      customerAgg[cName].paid += paid;
      customerAgg[cName].pending += pending;
    });

    const grandHead = [['SUMMARY', 'AMOUNT (Rs.)']];
    const grandBody = [
      ['GRAND TOTAL BILLED', grandBilled.toLocaleString()],
      ['GRAND TOTAL PAID', grandPaid.toLocaleString()],
      ['GRAND TOTAL OUTSTANDING', grandOutstanding.toLocaleString()]
    ];

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Grand Summary:', 14, y - 4);

    autoTable(doc, {
      head: grandHead,
      body: grandBody,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    y = (doc.lastAutoTable?.finalY || y) + 12;
    if (y > pageHeight - 65) {
      doc.addPage();
      y = 18;
    }

    const customerHead = [['CUSTOMER NAME', 'TOTAL BILLED (Rs.)', 'TOTAL PAID (Rs.)', 'TOTAL OUTSTANDING (Rs.)']];
    const customerBody = Object.entries(customerAgg).map(([name, data]) => [
      name,
      data.billed.toLocaleString(),
      data.paid.toLocaleString(),
      data.pending.toLocaleString()
    ]);

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Summary By Customer:', 14, y - 4);

    autoTable(doc, {
      head: customerHead,
      body: customerBody,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    const filePrefix = customerName ? customerName.replaceAll(' ', '_') : 'customer_bills';
    doc.save(`${filePrefix}_summary.pdf`);
  };

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
    return new Date(`${formData.customDate}T12:00`).toISOString();
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
      quantityUnit: bill.quantityUnit || 'ton',
      pricePerUnit: bill.pricePerUnit,
      date: bill.date ? new Date(bill.date).toISOString().split('T')[0] : ''
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
        date: editFormData.date,
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

  const refreshPaymentHistory = async (billId) => {
    try {
      const response = await api.get(`/bills/${billId}`);
      const bill = response.data;
      setPaymentHistory(prev => ({...prev, [billId]: bill.payments || []}));
    } catch (error) {
      console.error('Error refreshing payment history', error);
    }
  };

  const openEditPaymentModal = (pay) => {
    setEditingPayment(pay);
    // Use fullAmount if available, fallback to amount (which is the allocated portion)
    setEditPaymentAmount((pay.fullAmount ?? pay.amount).toString());
    const dateStr = pay.date || pay.paymentDate ? new Date(pay.date || pay.paymentDate).toISOString().split('T')[0] : '';
    setEditPaymentDate(dateStr);
    setEditPaymentNote(pay.note || pay.notes || '');
    setEditPaymentReceivedBy(pay.method || pay.receivedBy || '');
    setEditPaymentModalOpen(true);
  };

  const handleEditPaymentSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(editPaymentAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    try {
      await api.put(`/payments/${editingPayment._id}`, {
        amount,
        date: editPaymentDate,
        notes: editPaymentNote,
        receivedBy: editPaymentReceivedBy
      });
      setEditPaymentModalOpen(false);
      setEditingPayment(null);
      await fetchData();
      if (expandedBillId) {
        await refreshPaymentHistory(expandedBillId);
      }
    } catch (error) {
      console.error('Error updating payment', error);
      alert('Error updating payment: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const handleDeletePayment = async (pay) => {
    const ok = await confirm({
      title: 'Delete Payment',
      message: `Are you sure you want to delete payment ${pay.paymentNumber || ''} of ₹${pay.amount.toLocaleString()}? This will recalculate customer balances.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/payments/${pay._id}`);
        await fetchData();
        if (expandedBillId) {
          await refreshPaymentHistory(expandedBillId);
        }
      } catch (error) {
        console.error('Error deleting payment', error);
        alert('Error deleting payment: ' + (error.response?.data?.message || 'Unknown error'));
      }
    }
  };

  const getStatusColor = (pendingAmount) => {
    if (pendingAmount > 0) {
      return 'bg-rose-100 text-rose-800 border-rose-200';
    }
    return 'bg-green-100 text-green-800 border-green-200';
  };

  return (
    <div className="space-y-6 flex flex-col h-full min-h-0">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bills</h1>
          <p className="text-slate-500 text-sm mt-1">Generate and print invoice bills for customers.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 w-full lg:w-auto">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Name, vehicle, material"
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-44"
            />
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Customer</label>
            <select
              value={filters.customerId}
              onChange={(e) => setFilters((prev) => ({ ...prev, customerId: e.target.value }))}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
            >
              <option value="">All Statuses</option>
              <option value="Outstanding">Outstanding</option>
              <option value="Settled">Settled</option>
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Filter Mode</label>
            <select
              value={filters.mode}
              onChange={(e) => setFilters((prev) => ({ ...prev, mode: e.target.value }))}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
            >
              <option value="date_newest">Date: newest first</option>
              <option value="date_oldest">Date: oldest first</option>
              <option value="alpha_az">Customer A to Z</option>
              <option value="alpha_za">Customer Z to A</option>
              <option value="particular_date">Particular date</option>
              <option value="selected_dates">Selected dates</option>
              <option value="month">Month</option>
              <option value="week">Week</option>
            </select>
          </div>

          {filters.mode === 'particular_date' && (
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Date</label>
              <input
                type="date"
                value={filters.particularDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, particularDate: e.target.value }))}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
              />
            </div>
          )}

          {filters.mode === 'month' && (
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Month</label>
              <input
                type="month"
                value={filters.month}
                onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
              />
            </div>
          )}

          {filters.mode === 'week' && (
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Week Start</label>
              <input
                type="date"
                value={filters.weekStart}
                onChange={(e) => setFilters((prev) => ({ ...prev, weekStart: e.target.value }))}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
              />
            </div>
          )}

          {filters.mode === 'selected_dates' && (
            <>
              <div className="w-full sm:w-auto">
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
                />
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={downloadSummaryPdf}
              disabled={filteredBills.length === 0 || loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center inline-flex items-center cursor-pointer"
            >
              Download Summary PDF
            </button>
            {canCreateBills && (
              <button 
                onClick={() => { setFormData(emptyForm()); setIsModalOpen(true); }}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-md inline-flex items-center justify-center w-full sm:w-auto cursor-pointer"
              >
                + Generate Bill
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card p-4 border border-slate-200 bg-white shrink-0">
        <div className="text-center font-extrabold tracking-wider text-lg">{billStatementInfo.title}</div>
        <div className="text-center text-sm text-slate-600 mt-1">{billStatementInfo.rangeLabel}</div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="text-center bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">TOTAL AMOUNT</div>
            <div className="text-base font-bold text-slate-800">₹{filteredTotals.total.toLocaleString()}</div>
          </div>
          <div className="text-center bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">RECEIVED AMOUNT</div>
            <div className="text-base font-bold text-slate-800">₹{filteredTotals.paid.toLocaleString()}</div>
          </div>
          <div className="text-center bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">TOTAL BALANCE</div>
            <div className="text-base font-bold text-slate-800">₹{filteredTotals.pending.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col min-h-0 min-w-0">
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
                  <th className="p-4 font-semibold">Customer</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Vehicle No.</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Material (Qty)</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Total (₹)</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Allocated (₹)</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Outstanding (₹)</th>
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
                      <td className="p-4 text-slate-800 font-semibold">{bill.customerNameSnapshot}</td>
                      <td className="p-4 text-slate-600"><span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 text-xs font-mono whitespace-nowrap">{bill.vehicleNumber || '—'}</span></td>
                      <td className="p-4 text-slate-600 text-sm">
                        <div className="font-medium text-slate-800">{bill.materialNameSnapshot}</div>
                        <div className="text-xs text-slate-500">{Number(bill.quantity).toFixed(2)} {bill.quantityUnit || 'ton'}s @ ₹{bill.pricePerUnit}</div>
                        {bill.isBackdated && <div className="text-xs text-amber-600 font-medium">Backdated</div>}
                      </td>
                      <td className="p-4 font-bold text-slate-800">
                        ₹{(Number(bill.totalAmount) + Number(bill.passAmount || 0)).toLocaleString()}
                      </td>
                      <td className="p-4 text-slate-600">₹{(bill.allocatedAmount || 0).toLocaleString()}</td>
                      <td className="p-4 font-semibold text-red-600">₹{bill.pendingAmount.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(bill.pendingAmount)}`}>
                          {bill.pendingAmount > 0 ? 'Outstanding' : 'Settled'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2 whitespace-nowrap">
                        <button 
                          onClick={() => downloadBillPdf(bill)} 
                          className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 p-2 rounded-lg transition-colors inline-flex items-center" 
                          title="Download PDF"
                        >
                          <DocumentIcon className="h-5 w-5" />
                        </button>
                        {canWrite && (
                          <button 
                            onClick={() => openEditModal(bill)} 
                            className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 p-2 rounded-lg transition-colors inline-flex items-center"
                            title="Edit Bill"
                          >
                            <EditIcon className="h-5 w-5" />
                          </button>
                        )}
                        {canWrite && (
                          <button 
                            onClick={() => handleDelete(bill._id)} 
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center"
                            title="Delete Bill"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedBillId === bill._id && (
                      <tr className="bg-slate-50 border-b-2 border-slate-200">
                        <td colSpan="10" className="p-6">
                          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                              <h3 className="font-semibold text-slate-800">Payments Applied to this Bill</h3>
                            </div>
                            {paymentHistory[bill._id] && paymentHistory[bill._id].length > 0 ? (
                              <div className="overflow-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
                                      <th className="p-3 text-left font-semibold">Payment Number</th>
                                      <th className="p-3 text-left font-semibold">Date</th>
                                      <th className="p-3 text-right font-semibold">Amount Applied (₹)</th>
                                      <th className="p-3 text-left font-semibold">Notes</th>
                                      {canWrite && <th className="p-3 text-right font-semibold">Actions</th>}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {paymentHistory[bill._id].map((payment, idx) => {
                                      const { date } = formatDateTime(payment.date || payment.paymentDate);
                                      return (
                                        <tr key={idx} className="hover:bg-slate-50">
                                          <td className="p-3 font-semibold text-slate-700">{payment.paymentNumber || '—'}</td>
                                          <td className="p-3 text-slate-600">{date}</td>
                                          <td className="p-3 text-right font-semibold text-green-600">₹{Number(payment.amount).toLocaleString()}</td>
                                          <td className="p-3 text-slate-500 italic">{payment.note || payment.notes || '—'}</td>
                                          {canWrite && (
                                            <td className="p-3 text-right space-x-2 whitespace-nowrap">
                                              <button 
                                                onClick={() => openEditPaymentModal(payment)} 
                                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1.5 rounded-lg transition-colors inline-flex items-center" 
                                                title="Edit Payment"
                                              >
                                                <EditIcon className="h-4 w-4" />
                                              </button>
                                              <button 
                                                onClick={() => handleDeletePayment(payment)} 
                                                className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1.5 rounded-lg transition-colors inline-flex items-center" 
                                                title="Delete Payment"
                                              >
                                                <TrashIcon className="h-4 w-4" />
                                              </button>
                                            </td>
                                          )}
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
            
            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3.5">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Customer *</label>
                  <div className="flex gap-2 mt-1">
                    <select 
                      name="customer" required value={formData.customer} onChange={handleChange}
                      className="flex-1 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                    >
                      <option value="" disabled>Select Customer</option>
                      {customers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                    {canWrite && (
                      <button type="button" onClick={() => setIsCreateCustomerOpen(true)} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition shrink-0">+ New</button>
                    )}
                  </div>
                </div>
                
                <div className="col-span-2 grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Vehicle Type</label>
                    <select
                      value={formData.vehicleMode}
                      onChange={(e) => setFormData({ ...formData, vehicleMode: e.target.value, vehicleNumber: '' })}
                      className="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="select">Existing</option>
                      <option value="new">Add New</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase">Vehicle Number</label>
                    {formData.vehicleMode === 'select' && (
                      <select
                        name="vehicleNumber"
                        value={formData.vehicleNumber}
                        onChange={handleChange}
                        className="w-full mt-1 border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
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
                        className="w-full mt-1 border border-slate-300 rounded-lg p-2 uppercase focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        placeholder="TN 74 AE 2003"
                      />
                    )}
                    {formData.vehicleMode === 'none' && (
                      <input
                        type="text"
                        disabled
                        value="No vehicle"
                        className="w-full mt-1 border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-400 text-sm outline-none cursor-not-allowed"
                      />
                    )}
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Material *</label>
                  <select 
                    name="material" required value={formData.material} onChange={handleChange}
                    className="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                  >
                    <option value="" disabled>Select Material</option>
                    {materials.map(m => (
                      <option key={m._id} value={m._id}>
                        {m.name} (₹{m.currentPrice}/unit)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase">Quantity *</label>
                  <div className="flex gap-1.5 mt-1">
                    <input 
                      type="number" name="quantity" required value={formData.quantity} onChange={handleChange} min="0.1" step="0.01"
                      className="w-2/3 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none transition text-sm"
                      placeholder="e.g. 15.5"
                    />
                    <select
                      name="quantityUnit"
                      value={formData.quantityUnit}
                      onChange={handleChange}
                      className="w-1/3 border border-slate-300 rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="unit">Unit</option>
                      <option value="ton">Ton</option>
                    </select>
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase cursor-pointer">
                    <input 
                      type="checkbox" name="useManualPrice" id="useManualPrice" checked={formData.useManualPrice} onChange={handleChange}
                      className="rounded border-slate-300 h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Custom Price</span>
                  </label>
                  <input
                    type="number"
                    name="manualPrice"
                    disabled={!formData.useManualPrice}
                    value={formData.manualPrice}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    className="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                    placeholder={formData.useManualPrice ? "Price per unit/ton" : "Disabled"}
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase">PASS (Govt Fee)</label>
                  <input
                    type="number"
                    name="passAmount"
                    value={formData.passAmount}
                    onChange={handleChange}
                    min="0"
                    step="1"
                    className="w-full mt-1 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="e.g. 1200"
                  />
                </div>

                {canWrite && (
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Date *</label>
                    <input
                      type="date"
                      name="customDate"
                      required
                      value={formData.customDate}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white text-slate-800"
                    />
                  </div>
                )}
              </div>

              <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-x-4 gap-y-1 text-sm shrink-0">
                <div>
                  <span className="text-xs text-slate-500 font-semibold uppercase">Rate:</span>
                  <span className="ml-1 font-semibold text-slate-700">₹{selectedMaterialPrice.toLocaleString()}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 font-semibold uppercase">Subtotal:</span>
                  <span className="ml-1 font-semibold text-slate-700">₹{calculatedTotal.toLocaleString()}</span>
                </div>
                <div className="col-span-2 border-t border-slate-200 my-0.5"></div>
                <div>
                  <span className="text-xs text-slate-500 font-semibold uppercase">PASS (Govt):</span>
                  <span className="ml-1 font-semibold text-slate-700">₹{(Number(formData.passAmount) || 0).toLocaleString()}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-900 uppercase">Grand Total:</span>
                  <span className="ml-1 font-extrabold text-blue-600 text-base">₹{(calculatedTotal + (Number(formData.passAmount) || 0)).toLocaleString()}</span>
                </div>
              </div>
              
              <div className="pt-3 flex justify-end space-x-3 border-t border-slate-100 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition cursor-pointer text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={!formData.customer || !formData.material || !formData.quantity} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm">
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={editFormData.date}
                  onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white text-slate-800"
                />
              </div>
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
                  <input type="number" min="0.1" step="0.01" required value={editFormData.quantity} onChange={(e) => setEditFormData({ ...editFormData, quantity: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5" />
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
                <input type="number" min="0" step="0.01" required value={editFormData.pricePerUnit} onChange={(e) => setEditFormData({ ...editFormData, pricePerUnit: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditModalOpen(false)} className="px-4 py-2 bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">Save Changes</button>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number * (10 digits)</label>
                <input 
                  type="tel" required value={newCustomerData.phone} onChange={(e) => setNewCustomerData({...newCustomerData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
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
      {/* Edit Payment Modal */}
      {editPaymentModalOpen && editingPayment && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <h2 className="text-xl font-bold text-blue-900">Edit Payment Details</h2>
              <button onClick={() => setEditPaymentModalOpen(false)} className="text-blue-400 hover:text-blue-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleEditPaymentSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Number</label>
                <input type="text" disabled value={editingPayment.paymentNumber || '—'} className="w-full border border-slate-200 rounded-lg p-2.5 bg-slate-50 text-slate-400 outline-none cursor-not-allowed text-sm" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date *</label>
                <input type="date" required value={editPaymentDate} onChange={(e) => setEditPaymentDate(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Payment Amount (₹) *</label>
                <input type="number" required min="1" step="0.01" value={editPaymentAmount} onChange={(e) => setEditPaymentAmount(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-semibold text-slate-900" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Received By</label>
                <input type="text" value={editPaymentReceivedBy} onChange={(e) => setEditPaymentReceivedBy(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" placeholder="e.g. cashier name" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea rows="3" value={editPaymentNote} onChange={(e) => setEditPaymentNote(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm" placeholder="Add details or references..."></textarea>
              </div>
              
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setEditPaymentModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition text-sm">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition shadow-md text-sm">
                  Save Changes
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
