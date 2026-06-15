import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { formatDateTime } from '../utils/dateTime';
import { EditIcon, TrashIcon, EyeIcon, PlusIcon, ChevronDownIcon, CargoIcon } from '../components/Icons';
import { formatVehicleInput, isValidVehicleNumber } from '../utils/vehicleNumber';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const Buyers = () => {
  const { user } = useAuth();
  const confirm = useConfirm();

  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [buyerDetails, setBuyerDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview | bills | payments | ledger
  const [expandedPaymentId, setExpandedPaymentId] = useState(null);

  // Date filters
  const [reportType, setReportType] = useState('monthly');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

  // Record payment state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentPaidBy, setPaymentPaidBy] = useState('');
  const [paymentDate, setPaymentDate] = useState('');

  // Edit payment state
  const [editPaymentModalOpen, setEditPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editPaymentNote, setEditPaymentNote] = useState('');
  const [editPaymentPaidBy, setEditPaymentPaidBy] = useState('');

  // Add/Edit Buyer form state
  const [formData, setFormData] = useState({ name: '', phone: '', address: '', vehicles: [] });
  const [newVehicle, setNewVehicle] = useState('');
  const [editingVehicleIdx, setEditingVehicleIdx] = useState(null);
  const [editingVehicleVal, setEditingVehicleVal] = useState('');
  const [expandedVehicleId, setExpandedVehicleId] = useState(null);

  const toggleVehicles = (buyerId) => {
    setExpandedVehicleId((prev) => (prev === buyerId ? null : buyerId));
  };

  const canWrite = user?.role === 'super_admin' || user?.accessLevel === 'full_access';

  useEffect(() => {
    fetchBuyers();
  }, []);

  useEffect(() => {
    const today = new Date();
    const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (reportType === 'monthly') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDateRange({ startDate: toYMD(firstDay), endDate: toYMD(lastDay) });
    } else if (reportType === 'weekly') {
      const day = today.getDay();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - day);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      setDateRange({ startDate: toYMD(sunday), endDate: toYMD(saturday) });
    } else if (reportType === 'range') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDateRange({ startDate: toYMD(firstDay), endDate: toYMD(lastDay) });
    }
  }, [reportType]);

  useEffect(() => {
    if (detailModalOpen && buyerDetails?.buyer) {
      fetchBuyerHistory(buyerDetails.buyer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate, dateRange.endDate, detailModalOpen]);

  const fetchBuyers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/buyers');
      setBuyers(data);
    } catch (error) {
      console.error('Error fetching buyers', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuyerHistory = async (buyer) => {
    try {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange.endDate) params.set('endDate', dateRange.endDate);
      const { data } = await api.get(`/buyers/${buyer._id}?${params.toString()}`);
      setBuyerDetails(data);
    } catch (error) {
      console.error('Error fetching buyer history', error);
      alert('Error fetching buyer history');
    }
  };

  const openBuyerDetailModal = async (buyer) => {
    setBuyerDetails({ buyer, summary: {}, bills: [], payments: [], ledger: [] });
    setActiveTab('overview');
    setDetailModalOpen(true);
    await fetchBuyerHistory(buyer);
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
    if (formData.vehicles?.some((v) => v.number === formatted)) return;
    setFormData({ ...formData, vehicles: [...(formData.vehicles || []), { number: formatted }] });
    setNewVehicle('');
  };

  const removeVehicleFromForm = (index) => {
    setFormData({ ...formData, vehicles: (formData.vehicles || []).filter((_, i) => i !== index) });
  };

  const saveVehicleEdit = (index) => {
    const formatted = formatVehicleInput(editingVehicleVal);
    if (!isValidVehicleNumber(formatted)) {
      alert('Vehicle number must be TN 74 AE 2003 or TMR 7177 format');
      return;
    }
    const updatedVehicles = [...(formData.vehicles || [])];
    updatedVehicles[index] = { ...updatedVehicles[index], number: formatted };
    setFormData({ ...formData, vehicles: updatedVehicles });
    setEditingVehicleIdx(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || formData.phone.length !== 10) {
      alert('Name and a valid 10-digit phone number are required');
      return;
    }
    try {
      const payload = {
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        vehicles: formData.vehicles || []
      };
      if (formData._id) {
        await api.put(`/buyers/${formData._id}`, payload);
      } else {
        await api.post('/buyers', payload);
      }
      setIsModalOpen(false);
      setFormData({ name: '', phone: '', address: '', vehicles: [] });
      fetchBuyers();
    } catch (error) {
      console.error('Error saving buyer', error);
      alert(error.response?.data?.message || 'Error saving buyer');
    }
  };

  const handleEdit = (buyer) => {
    setFormData({
      ...buyer,
      vehicles: buyer.vehicles || []
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete Buyer',
      message: 'Are you sure you want to delete this buyer?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/buyers/${id}`);
        fetchBuyers();
      } catch (error) {
        console.error('Error deleting buyer', error);
        alert('Error deleting buyer');
      }
    }
  };

  const openPaymentModal = () => {
    if (!buyerDetails) return;
    setPaymentAmount(buyerDetails.summary?.totalOutstandingAmount?.toString() || '');
    setPaymentNote('');
    setPaymentPaidBy(user?.name || '');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    const outstanding = buyerDetails?.summary?.totalOutstandingAmount || 0;
    if (amount - outstanding > 1e-4) {
      alert(`Payment amount (₹${amount.toLocaleString()}) cannot exceed outstanding balance (₹${outstanding.toLocaleString()})`);
      return;
    }

    try {
      await api.post('/buyer-payments', {
        buyerId: buyerDetails.buyer._id,
        amount,
        date: paymentDate,
        notes: paymentNote,
        paidBy: paymentPaidBy
      });
      setPaymentModalOpen(false);
      fetchBuyerHistory(buyerDetails.buyer);
    } catch (error) {
      console.error('Error recording buyer payment', error);
      alert(error.response?.data?.message || 'Error recording payment');
    }
  };

  const openEditPaymentModal = (pay) => {
    setEditingPayment(pay);
    setEditPaymentAmount(pay.amount.toString());
    setEditPaymentDate(pay.paymentDate.split('T')[0]);
    setEditPaymentNote(pay.notes || '');
    setEditPaymentPaidBy(pay.paidBy || '');
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
      await api.put(`/buyer-payments/${editingPayment._id}`, {
        amount,
        date: editPaymentDate,
        notes: editPaymentNote,
        paidBy: editPaymentPaidBy
      });
      setEditPaymentModalOpen(false);
      fetchBuyerHistory(buyerDetails.buyer);
    } catch (error) {
      console.error('Error updating payment', error);
      alert(error.response?.data?.message || 'Error updating payment');
    }
  };

  const handleDeletePayment = async (pay) => {
    const ok = await confirm({
      title: 'Delete Payment',
      message: `Are you sure you want to delete payment ${pay.paymentNumber} of ₹${pay.amount.toLocaleString()}? This will recalculate allocations.`,
      confirmText: 'Delete',
      tone: 'danger'
    });

    if (ok) {
      try {
        await api.delete(`/buyer-payments/${pay._id}`);
        fetchBuyerHistory(buyerDetails.buyer);
      } catch (error) {
        console.error('Error deleting payment', error);
        alert('Error deleting payment');
      }
    }
  };

  const togglePaymentExpansion = (id) => {
    setExpandedPaymentId((prev) => (prev === id ? null : id));
  };

  const downloadPdf = () => {
    if (!buyerDetails) return;

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

    const headerName = `${buyerDetails.buyer.name} Buyer Statement`;
    centerText(headerName, 19, 11, 'bold');

    const rangeLabel = dateRange.startDate && dateRange.endDate
      ? `${formatDateTime(dateRange.startDate).date} to ${formatDateTime(dateRange.endDate).date}`
      : 'All Time';
    centerText(rangeLabel, 26, 9);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 29, pageWidth - 14, 29);

    const yStartTable = 36;
    const head = [['S.NO', 'DATE', 'VEHICLE NUMBER', 'MATERIAL', 'PRICE (Rs.)', 'QUANTITY', 'TOTAL VALUE (Rs.)', 'ALLOCATED (Rs.)', 'PENDING (Rs.)']];
    const body = (buyerDetails.bills || []).map((r, idx) => [
      idx + 1,
      formatDateTime(r.date).date,
      r.vehicleNumber || '—',
      r.quarryName || '—',
      r.price.toLocaleString(),
      Number(r.quantity || 0).toFixed(2),
      (r.price * r.quantity).toLocaleString(),
      (r.allocatedAmount || 0).toLocaleString(),
      (r.price * r.quantity - (r.allocatedAmount || 0)).toLocaleString()
    ]);

    autoTable(doc, {
      head,
      body,
      startY: yStartTable,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    let y = (doc.lastAutoTable?.finalY || yStartTable) + 12;
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 18;
    }

    const totalsHead = [['DETAILS', 'AMOUNT']];
    const totalsBody = [
      ['TOTAL LOAD COST', `Rs. ${Number(buyerDetails.summary?.totalBillsAmount || 0).toLocaleString()}`],
      ['TOTAL PAID', `Rs. ${Number(buyerDetails.summary?.totalPaidAmount || 0).toLocaleString()}`],
      ['OUTSTANDING BALANCE', `Rs. ${Number(buyerDetails.summary?.totalOutstandingAmount || 0).toLocaleString()}`]
    ];

    const leftRightMargin = 14;
    const detailsColWidth = 75;
    const amountColWidth = pageWidth - leftRightMargin * 2 - detailsColWidth;
    const tableWidth = detailsColWidth + amountColWidth;

    autoTable(doc, {
      head: totalsHead,
      body: totalsBody,
      startY: y,
      theme: 'grid',
      tableWidth,
      styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: detailsColWidth },
        1: { halign: 'right', cellWidth: amountColWidth }
      },
      margin: { left: leftRightMargin, right: leftRightMargin }
    });

    // Render payment history table
    if (buyerDetails.payments && buyerDetails.payments.length > 0) {
      y = (doc.lastAutoTable?.finalY || y) + 12;
      if (y > pageHeight - 65) {
        doc.addPage();
        y = 18;
      }

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('PAYMENT HISTORY:', 14, y - 4);

      const payHead = [['S.NO', 'DATE', 'PAYMENT NUMBER', 'AMOUNT PAID (Rs.)', 'PAID BY / METHOD', 'NOTES']];
      const payBody = buyerDetails.payments.map((p, idx) => [
        idx + 1,
        new Date(p.paymentDate || p.date).toLocaleDateString(),
        p.paymentNumber || '—',
        Number(p.amount || 0).toLocaleString(),
        p.paidBy || p.method || '—',
        p.notes || p.note || '—'
      ]);

      autoTable(doc, {
        head: payHead,
        body: payBody,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }
      });
    }

    const buyerSlug = buyerDetails.buyer.name.replaceAll(' ', '_').replaceAll('/', '-');
    doc.save(`${buyerSlug}_statement.pdf`);
  };

  const filteredBuyers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return buyers;
    return buyers.filter(
      (b) =>
        (b.name || '').toLowerCase().includes(term) ||
        (b.phone || '').includes(term)
    );
  }, [buyers, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Buyers</h1>
          <p className="text-slate-500 text-sm mt-1">Manage buyer profiles, addresses, and purchase statement histories.</p>
        </div>
        {canWrite && (
          <button
            onClick={() => { setFormData({ name: '', phone: '', address: '' }); setIsModalOpen(true); }}
            className="btn-primary flex items-center shadow-lg hover:shadow-xl w-full sm:w-auto justify-center"
          >
            <span className="mr-2">+</span> Add Buyer
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
          <div className="p-8 text-center text-slate-500">Loading buyers...</div>
        ) : filteredBuyers.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            {searchTerm ? 'No buyers match your search.' : 'No buyers found. Add your first buyer!'}
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
                {filteredBuyers.map((b) => {
                  const vehicles = b.vehicles || [];
                  const vehicleCount = vehicles.length;
                  const isExpanded = expandedVehicleId === b._id;

                  return (
                    <React.Fragment key={b._id}>
                      <tr className="hover:bg-slate-50 transition">
                        <td className="p-4 font-medium text-slate-800">{b.name}</td>
                        <td className="p-4 text-slate-600">{b.phone || '-'}</td>
                        <td className="p-4 text-slate-600 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                              {vehicleCount} {vehicleCount === 1 ? 'vehicle' : 'vehicles'}
                            </span>
                            {vehicleCount > 0 && (
                              <div className="relative group">
                                <button
                                  type="button"
                                  onClick={() => toggleVehicles(b._id)}
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
                        <td className="p-4 text-slate-600 truncate max-w-xs">{b.address || '-'}</td>
                        <td className="p-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => openBuyerDetailModal(b)}
                            className="text-green-600 hover:text-green-800 hover:bg-green-50 p-2 rounded-lg transition-colors inline-flex items-center"
                            title="View Details & Payments"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
                          {canWrite && (
                            <>
                              <button
                                onClick={() => handleEdit(b)}
                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center"
                                title="Edit Buyer"
                              >
                                <EditIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDelete(b._id)}
                                className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center"
                                title="Delete Buyer"
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

      {/* Add/Edit Buyer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">{formData._id ? 'Edit Buyer' : 'Add New Buyer'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Name *</label>
                <input
                  type="text" name="name" required value={formData.name} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="e.g. Acme Minerals Ltd"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number * (10 digits)</label>
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
                  {formData._id ? 'Update Buyer' : 'Save Buyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Buyer Details Tabbed Modal */}
      {detailModalOpen && buyerDetails && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[90vh] max-h-[850px]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-start shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">{buyerDetails.buyer?.name}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">📞 {buyerDetails.buyer?.phone}</span>
                  {buyerDetails.buyer?.address && <span>📍 {buyerDetails.buyer?.address}</span>}
                </div>
                {buyerDetails.buyer?.vehicles && buyerDetails.buyer.vehicles.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <CargoIcon className="h-4 w-4 text-slate-400" />
                    {buyerDetails.buyer.vehicles.map((v, idx) => (
                      <span key={v._id || idx} className="inline-flex items-center bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-semibold text-slate-700 shadow-sm">
                        {v.number}
                      </span>
                    ))}
                  </div>
                )}

                {/* Date Filter selector in Modal */}
                <div className="flex flex-col gap-2 mt-4 items-start">
                  <div>
                    <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-700">
                      <option value="monthly">This Month</option>
                      <option value="weekly">This Week</option>
                      <option value="range">Custom Date Range</option>
                    </select>
                  </div>
                  {reportType === 'range' && (
                    <div className="flex items-center gap-2 animate-in slide-in-from-top-1 duration-150">
                      <input type="date" value={dateRange.startDate} onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-0.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                      <span className="text-slate-400 text-xs">to</span>
                      <input type="date" value={dateRange.endDate} onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))} className="border border-slate-300 rounded-lg px-2 py-0.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={downloadPdf}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition shadow-md flex items-center"
                >
                  <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </button>
                {canWrite && (
                  <button
                    onClick={openPaymentModal}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition shadow-md flex items-center"
                  >
                    <span className="mr-1.5 font-bold">+</span> Record Payment
                  </button>
                )}
                <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-3xl leading-none font-bold">&times;</button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="px-6 py-4 bg-white border-b border-slate-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 shrink-0">
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Load Cost</div>
                <div className="text-base font-bold text-slate-800">₹{Number(buyerDetails.summary?.totalBillsAmount || 0).toLocaleString()}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Paid</div>
                <div className="text-base font-bold text-emerald-700">₹{Number(buyerDetails.summary?.totalPaidAmount || 0).toLocaleString()}</div>
              </div>
              <div className="bg-rose-50 border border-rose-200/60 rounded-xl p-3 text-center">
                <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">Outstanding</div>
                <div className="text-base font-bold text-rose-700">₹{Number(buyerDetails.summary?.totalOutstandingAmount || 0).toLocaleString()}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Loads Count</div>
                <div className="text-base font-bold text-slate-800">{buyerDetails.summary?.totalBillsCount || 0}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Last Load</div>
                <div className="text-xs font-semibold text-slate-700 mt-1">
                  {buyerDetails.summary?.lastBillDate ? formatDateTime(buyerDetails.summary.lastBillDate).date : '—'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Last Payment</div>
                <div className="text-xs font-semibold text-slate-700 mt-1">
                  {buyerDetails.summary?.lastPaymentDate ? formatDateTime(buyerDetails.summary.lastPaymentDate).date : '—'}
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 shrink-0">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'loads', label: 'Loads' },
                { id: 'payments', label: 'Payments Made' },
                { id: 'ledger', label: 'Ledger' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-5 text-sm font-semibold border-b-2 transition-all capitalize -mb-px ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white">
              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Recent Loads */}
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-slate-800 flex items-center justify-between">
                      <span>Recent Loads</span>
                      <span className="text-xs text-slate-500 font-normal">Last 5 loads</span>
                    </h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                          <tr>
                            <th className="p-3">Date</th>
                            <th className="p-3">Vehicle</th>
                            <th className="p-3 text-right">Total (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {buyerDetails.bills?.slice(0, 5).map((load) => (
                            <tr key={load._id} className="hover:bg-slate-50">
                              <td className="p-3 text-slate-500">{formatDateTime(load.date).date}</td>
                              <td className="p-3 font-semibold text-slate-700">{load.vehicleNumber || '—'}</td>
                              <td className="p-3 text-right font-medium text-slate-800">₹{load.price.toLocaleString()}</td>
                            </tr>
                          ))}
                          {(!buyerDetails.bills || buyerDetails.bills.length === 0) && (
                            <tr>
                              <td colSpan={3} className="p-8 text-center text-slate-400">No loads found</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Recent Payments */}
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-slate-800 flex items-center justify-between">
                      <span>Recent Payments</span>
                      <span className="text-xs text-slate-500 font-normal">Last 5 payments</span>
                    </h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                          <tr>
                            <th className="p-3">Payment No</th>
                            <th className="p-3">Date</th>
                            <th className="p-3 text-right">Amount</th>
                            {canWrite && <th className="p-3 text-right">Actions</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {buyerDetails.payments?.slice(0, 5).map((pay) => (
                            <tr key={pay._id} className="hover:bg-slate-50">
                              <td className="p-3 font-semibold text-slate-700">{pay.paymentNumber}</td>
                              <td className="p-3 text-slate-500">{formatDateTime(pay.paymentDate).date}</td>
                              <td className="p-3 text-right font-bold text-emerald-700">₹{pay.amount.toLocaleString()}</td>
                              {canWrite && (
                                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                                  <button
                                    onClick={() => openEditPaymentModal(pay)}
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1.5 rounded-lg transition-colors inline-flex items-center"
                                    title="Edit Payment"
                                  >
                                    <EditIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePayment(pay)}
                                    className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1.5 rounded-lg transition-colors inline-flex items-center"
                                    title="Delete Payment"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                          {(!buyerDetails.payments || buyerDetails.payments.length === 0) && (
                            <tr>
                              <td colSpan={canWrite ? 4 : 3} className="p-8 text-center text-slate-400">No payments found</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* LOADS TAB */}
              {activeTab === 'loads' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Vehicle Number</th>
                        <th className="p-4">Material</th>
                        <th className="p-4 text-right">Price</th>
                        <th className="p-4 text-right">Quantity</th>
                        <th className="p-4 text-right">Total Cost</th>
                        <th className="p-4 text-right">Allocated</th>
                        <th className="p-4 text-right">Pending</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {buyerDetails.bills?.map((load) => {
                        const hasPending = (load.price * load.quantity) - (load.allocatedAmount || 0) > 0;
                        const pendingAmount = (load.price * load.quantity) - (load.allocatedAmount || 0);
                        return (
                          <tr key={load._id} className={`hover:bg-slate-50/80 transition ${hasPending ? 'bg-rose-50/10' : ''}`}>
                            <td className="p-4 text-slate-500">{formatDateTime(load.date).date}</td>
                            <td className="p-4 text-slate-800 font-semibold">{load.vehicleNumber || '—'}</td>
                            <td className="p-4 text-slate-600">{load.quarryName || '—'}</td>
                            <td className="p-4 text-right text-slate-600">₹{load.price.toLocaleString()}</td>
                            <td className="p-4 text-right text-slate-600">{Number(load.quantity || 0).toFixed(2)} {load.unitType || 'tons'}</td>
                            <td className="p-4 text-right font-bold text-slate-800">₹{(load.price * load.quantity).toLocaleString()}</td>
                            <td className="p-4 text-right text-emerald-600">₹{(load.allocatedAmount || 0).toLocaleString()}</td>
                            <td className={`p-4 text-right font-bold ${hasPending ? 'text-rose-600' : 'text-slate-500'}`}>
                              ₹{pendingAmount.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                      {(!buyerDetails.bills || buyerDetails.bills.length === 0) && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">No loads found for the selected period</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAYMENTS TAB */}
              {activeTab === 'payments' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="p-4 w-12"></th>
                        <th className="p-4">Payment Number</th>
                        <th className="p-4">Payment Date</th>
                        <th className="p-4 text-right">Amount Paid</th>
                        <th className="p-4">Paid By</th>
                        <th className="p-4">Notes</th>
                        <th className="p-4 text-right">Outstanding After</th>
                        {canWrite && <th className="p-4 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {buyerDetails.payments?.map((pay) => {
                        const isExpanded = expandedPaymentId === pay._id;
                        return (
                          <React.Fragment key={pay._id}>
                            <tr className="hover:bg-slate-50">
                              <td className="p-4">
                                <button
                                  onClick={() => togglePaymentExpansion(pay._id)}
                                  className="text-slate-400 hover:text-slate-700 focus:outline-none"
                                >
                                  <svg className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </td>
                              <td className="p-4 font-semibold text-slate-800">{pay.paymentNumber}</td>
                              <td className="p-4 text-slate-500">{formatDateTime(pay.paymentDate).date}</td>
                              <td className="p-4 text-right font-bold text-emerald-700">₹{pay.amount.toLocaleString()}</td>
                              <td className="p-4 text-slate-600">{pay.paidBy || '—'}</td>
                              <td className="p-4 text-slate-500 italic truncate max-w-xs">{pay.notes || '—'}</td>
                              <td className="p-4 text-right font-semibold text-slate-800">₹{Number(pay.outstandingBalanceAfterPayment || 0).toLocaleString()}</td>
                              {canWrite && (
                                <td className="p-4 text-right space-x-2.5 whitespace-nowrap">
                                  <button
                                    onClick={() => openEditPaymentModal(pay)}
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1.5 rounded-lg transition-colors inline-flex items-center"
                                    title="Edit Payment"
                                  >
                                    <EditIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePayment(pay)}
                                    className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1.5 rounded-lg transition-colors inline-flex items-center"
                                    title="Delete Payment"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-50/50">
                                <td colSpan={canWrite ? 8 : 7} className="p-4 border-l-4 border-emerald-500 bg-emerald-50/10">
                                  <div className="pl-6 py-2">
                                    <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">FIFO Allocation Details</h4>
                                    <div className="flex flex-wrap gap-4">
                                      {pay.allocationDetails?.map((alloc, idx) => {
                                        const loadDetail = buyerDetails.bills?.find((b) => b._id === alloc.loadId);
                                        const loadInfo = loadDetail
                                          ? `${formatDateTime(loadDetail.date).date} (${loadDetail.vehicleNumber || '—'})`
                                          : 'Load';
                                        return (
                                          <div key={idx} className="bg-white border border-slate-200/80 rounded-lg p-2.5 shadow-sm text-xs font-mono">
                                            <div className="text-slate-400 text-[10px] uppercase font-bold mb-1">Allocated to {loadInfo}</div>
                                            <div className="font-bold text-emerald-600">₹{alloc.allocatedAmount.toLocaleString()}</div>
                                          </div>
                                        );
                                      })}
                                      {(!pay.allocationDetails || pay.allocationDetails.length === 0) && (
                                        <div className="text-xs text-slate-500 italic">No load allocations recorded.</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {(!buyerDetails.payments || buyerDetails.payments.length === 0) && (
                        <tr>
                          <td colSpan={canWrite ? 8 : 7} className="p-8 text-center text-slate-400">No payments found for the selected period</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* LEDGER TAB */}
              {activeTab === 'ledger' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Transaction Type</th>
                        <th className="p-4">Reference Number</th>
                        <th className="p-4 text-right">Debit (Load Cost)</th>
                        <th className="p-4 text-right">Credit (Payment Made)</th>
                        <th className="p-4 text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {buyerDetails.ledger?.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 font-mono text-xs">
                          <td className="p-4 text-slate-500 font-sans">{formatDateTime(row.date).date}</td>
                          <td className="p-4 font-sans font-medium text-slate-700">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              row.transactionType === 'Load Created'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {row.transactionType}
                            </span>
                          </td>
                          <td className="p-4 font-semibold text-slate-800">{row.referenceNumber}</td>
                          <td className="p-4 text-right text-rose-600 font-semibold">
                            {row.debit > 0 ? `₹${row.debit.toLocaleString()}` : '—'}
                          </td>
                          <td className="p-4 text-right text-emerald-700 font-semibold">
                            {row.credit > 0 ? `₹${row.credit.toLocaleString()}` : '—'}
                          </td>
                          <td className="p-4 text-right font-bold text-slate-800">
                            ₹{row.runningBalance.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {(!buyerDetails.ledger || buyerDetails.ledger.length === 0) && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">No ledger entries found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50 shrink-0">
              <button onClick={() => setDetailModalOpen(false)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold transition text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Buyer Payment Modal */}
      {paymentModalOpen && buyerDetails && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <h2 className="text-xl font-bold text-blue-900">Record Payment to Buyer</h2>
              <button onClick={() => setPaymentModalOpen(false)} className="text-blue-400 hover:text-blue-600 text-2xl leading-none font-bold">&times;</button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-medium">Buyer:</span>
                  <span className="font-bold text-slate-800">{buyerDetails.buyer?.name}</span>
                </div>
                <div className="flex justify-between items-center py-1 mt-1 border-t border-slate-100">
                  <span className="text-rose-500 font-semibold">Total Outstanding Balance:</span>
                  <span className="font-extrabold text-rose-600 text-base">₹{Number(buyerDetails.summary?.totalOutstandingAmount || 0).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Amount Paid (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    min="1"
                    step="0.01"
                    className="w-full text-xl font-extrabold border border-slate-300 rounded-lg p-3 pl-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-slate-800"
                    placeholder="Enter amount"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Paid By</label>
                <input
                  type="text"
                  value={paymentPaidBy}
                  onChange={(e) => setPaymentPaidBy(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white text-slate-800"
                  placeholder="Manager / Cashier name"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Notes / Remarks</label>
                <textarea
                  rows="2"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white text-slate-800"
                  placeholder="E.g. Bank Transfer, Cheque no., etc."
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setPaymentModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-sm transition">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Number(paymentAmount) <= 0 || Number(paymentAmount) - (buyerDetails?.summary?.totalOutstandingAmount || 0) > 1e-4}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-md"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Buyer Payment Modal */}
      {editPaymentModalOpen && editingPayment && buyerDetails && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <h2 className="text-xl font-bold text-blue-900">Edit Payment to Buyer</h2>
              <button onClick={() => setEditPaymentModalOpen(false)} className="text-blue-400 hover:text-blue-600 text-2xl leading-none font-bold">&times;</button>
            </div>

            <form onSubmit={handleEditPaymentSubmit} className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500 font-medium">Buyer:</span>
                  <span className="font-bold text-slate-800">{buyerDetails.buyer?.name}</span>
                </div>
                <div className="flex justify-between items-center py-1 mt-1 border-t border-slate-100">
                  <span className="text-blue-600 font-semibold">Payment Number:</span>
                  <span className="font-bold text-blue-700">{editingPayment.paymentNumber}</span>
                </div>
                <div className="flex justify-between items-center py-1 mt-1 border-t border-slate-100">
                  <span className="text-rose-500 font-semibold">Maximum Allowed Amount:</span>
                  <span className="font-extrabold text-rose-600">
                    ₹{Number((buyerDetails.summary?.totalOutstandingAmount || 0) + editingPayment.amount).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={editPaymentDate}
                  onChange={(e) => setEditPaymentDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Amount Paid (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    required
                    value={editPaymentAmount}
                    onChange={(e) => setEditPaymentAmount(e.target.value)}
                    min="1"
                    step="0.01"
                    className="w-full text-xl font-extrabold border border-slate-300 rounded-lg p-3 pl-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Paid By</label>
                <input
                  type="text"
                  value={editPaymentPaidBy}
                  onChange={(e) => setEditPaymentPaidBy(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Notes / Remarks</label>
                <textarea
                  rows="2"
                  value={editPaymentNote}
                  onChange={(e) => setEditPaymentNote(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white text-slate-800"
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setEditPaymentModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold text-sm transition">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Number(editPaymentAmount) <= 0 || Number(editPaymentAmount) - ((buyerDetails?.summary?.totalOutstandingAmount || 0) + editingPayment.amount) > 1e-4}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-md"
                >
                  Update Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Buyers;
