import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuth } from '../AuthContext';
import { EditIcon, TrashIcon } from '../components/Icons';

const toYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const LoadManagement = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const today = useMemo(() => new Date(), []);

  const initialMonthlyRange = useMemo(() => {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startDate: toYMD(firstDay), endDate: toYMD(lastDay) };
  }, [today]);

  const [loads, setLoads] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reportType, setReportType] = useState('all'); // all | daily | weekly | monthly | range
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '', particularDate: '', month: '', weekStart: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [selectedQuarryName, setSelectedQuarryName] = useState('');
  
  // New buyer modal states
  const [isCreateBuyerOpen, setIsCreateBuyerOpen] = useState(false);
  const [newBuyerData, setNewBuyerData] = useState({ name: '', phone: '', address: '' });

  const [formData, setFormData] = useState({
    vehicleType: '',
    date: new Date().toISOString().split('T')[0],
    quarryName: '',
    buyerId: '',
    price: '',
    quantity: '',
    unitType: 'units'
  });

  const canWrite = user?.role === 'super_admin' || user?.accessLevel === 'full_access';

  // Sync date ranges when reportType changes
  useEffect(() => {
    if (reportType === 'all') {
      setDateRange({ startDate: '', endDate: '', particularDate: '', month: '', weekStart: '' });
    } else if (reportType === 'daily') {
      const formattedToday = toYMD(today);
      setDateRange({ startDate: formattedToday, endDate: formattedToday, particularDate: formattedToday, month: '', weekStart: '' });
    } else if (reportType === 'monthly') {
      const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      setDateRange({ startDate: initialMonthlyRange.startDate, endDate: initialMonthlyRange.endDate, particularDate: '', month: monthStr, weekStart: '' });
    } else if (reportType === 'weekly') {
      const end = new Date(today);
      end.setHours(0, 0, 0, 0);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      setDateRange({ startDate: toYMD(start), endDate: toYMD(end), particularDate: '', month: '', weekStart: toYMD(start) });
    }
  }, [reportType, initialMonthlyRange, today]);

  // Fetch loads
  const fetchLoads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportType !== 'all') {
        if (dateRange.startDate) params.append('startDate', dateRange.startDate);
        if (dateRange.endDate) params.append('endDate', dateRange.endDate);
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      if (selectedBuyerId) {
        params.append('buyerId', selectedBuyerId);
      }
      const { data } = await api.get(`/loads?${params.toString()}`);
      setLoads(data);
    } catch (error) {
      console.error('Error fetching loads', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBuyers = async () => {
    try {
      const { data } = await api.get('/buyers');
      setBuyers(data);
    } catch (error) {
      console.error('Error fetching buyers', error);
    }
  };

  useEffect(() => {
    fetchLoads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, reportType, searchQuery, selectedBuyerId]);

  useEffect(() => {
    fetchBuyers();
  }, []);

  useEffect(() => {
    setSelectedQuarryName('');
  }, [selectedBuyerId]);

  const uniqueQuarryNames = useMemo(() => {
    const quarries = new Set();
    loads.forEach((l) => {
      if (l.quarryName?.trim()) {
        quarries.add(l.quarryName.trim());
      }
    });
    return Array.from(quarries).sort();
  }, [loads]);

  const filteredLoads = useMemo(() => {
    let list = loads;
    if (selectedQuarryName) {
      list = list.filter((l) => l.quarryName?.trim() === selectedQuarryName);
    }
    return list;
  }, [loads, selectedQuarryName]);

  const handleDateFilterChange = (name, value) => {
    if (name === 'particularDate') {
      setDateRange(prev => ({
        ...prev,
        particularDate: value,
        startDate: value,
        endDate: value
      }));
    } else if (name === 'month') {
      if (value) {
        const [year, month] = value.split('-');
        const firstDay = new Date(year, parseInt(month) - 1, 1);
        const lastDay = new Date(year, parseInt(month), 0);
        setDateRange(prev => ({
          ...prev,
          month: value,
          startDate: toYMD(firstDay),
          endDate: toYMD(lastDay)
        }));
      } else {
        setDateRange(prev => ({ ...prev, month: value }));
      }
    } else if (name === 'weekStart') {
      if (value) {
        const start = new Date(value + 'T00:00:00');
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        setDateRange(prev => ({
          ...prev,
          weekStart: value,
          startDate: toYMD(start),
          endDate: toYMD(end)
        }));
      } else {
        setDateRange(prev => ({ ...prev, weekStart: value }));
      }
    } else {
      setDateRange(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.buyerId) {
      alert('Buyer is required.');
      return;
    }
    try {
      const payload = {
        ...formData,
        price: Number(formData.price),
        quantity: Number(formData.quantity)
      };

      if (formData._id) {
        await api.put(`/loads/${formData._id}`, payload);
      } else {
        await api.post('/loads', payload);
      }
      setIsModalOpen(false);
      setFormData({
        vehicleType: '',
        date: new Date().toISOString().split('T')[0],
        quarryName: '',
        buyerId: '',
        price: '',
        quantity: '',
        unitType: 'units'
      });
      fetchLoads();
    } catch (error) {
      console.error('Error saving load', error);
      alert(error.response?.data?.message || 'Error saving load');
    }
  };

  const handleCreateBuyer = async (e) => {
    e.preventDefault();
    if (!newBuyerData.name || !newBuyerData.phone) {
      alert('Name and phone number are required');
      return;
    }
    try {
      const { data: newBuyer } = await api.post('/buyers', newBuyerData);
      setFormData({ ...formData, buyerId: newBuyer._id });
      setIsCreateBuyerOpen(false);
      setNewBuyerData({ name: '', phone: '', address: '' });
      await fetchBuyers();
    } catch (error) {
      console.error('Error creating buyer', error);
      alert(error.response?.data?.message || 'Error creating buyer');
    }
  };

  const handleEdit = (load) => {
    setFormData({
      ...load,
      buyerId: load.buyer || '',
      date: load.date ? new Date(load.date).toISOString().split('T')[0] : ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete Load',
      message: 'Are you sure you want to delete this load record?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/loads/${id}`);
        fetchLoads();
      } catch (error) {
        console.error('Error deleting load', error);
        alert('Error deleting load');
      }
    }
  };

  const totals = useMemo(() => {
    return filteredLoads.reduce(
      (acc, load) => {
        acc.totalPrice += Number(load.price || 0) * Number(load.quantity || 0);
        if (load.unitType === 'tons') {
          acc.totalTons += Number(load.quantity || 0);
        } else {
          acc.totalUnits += Number(load.quantity || 0);
        }
        return acc;
      },
      { totalPrice: 0, totalTons: 0, totalUnits: 0 }
    );
  }, [filteredLoads]);

  const downloadPdf = () => {
    const listToExport = filteredLoads;
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

    centerText('LOAD MANAGEMENT REPORT', 19, 12, 'bold');

    let rangeLabel = 'All Time';
    if (reportType !== 'all' && dateRange.startDate && dateRange.endDate) {
      const formatDateDots = (d) => {
        if (!d) return '';
        const [yy, mm, dd] = d.split('-');
        return `${dd}.${mm}.${yy}`;
      };
      rangeLabel = `${formatDateDots(dateRange.startDate)} - ${formatDateDots(dateRange.endDate)}`;
    }
    centerText(rangeLabel, 26, 9);

    doc.setDrawColor(200, 200, 200);
    doc.line(14, 29, pageWidth - 14, 29);

    const head = [['S.NO', 'DATE', 'VEHICLE TYPE', 'QUARRY NAME', 'BUYER NAME', 'QTY', 'UNIT TYPE', 'PRICE (Rs.)', 'TOTAL (Rs.)']];
    const body = listToExport.map((l, idx) => [
      idx + 1,
      new Date(l.date).toLocaleDateString(),
      l.vehicleType,
      l.quarryName || '—',
      l.buyerNameSnapshot || '—',
      l.quantity,
      l.unitType,
      l.price.toLocaleString(),
      (l.price * l.quantity).toLocaleString()
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 36,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    let y = (doc.lastAutoTable?.finalY || 36) + 12;
    if (y > pageHeight - 65) {
      doc.addPage();
      y = 18;
    }

    // Aggregates summary by Buyer Name / Quarry Name
    const byBuyer = {};
    listToExport.forEach((l) => {
      const key = `${l.buyerNameSnapshot || '—'} (${l.quarryName || '—'})`;
      byBuyer[key] = (byBuyer[key] || 0) + (l.price * l.quantity);
    });

    const summaryHead = [['BUYER & QUARRY NAME', 'TOTAL AMOUNT (Rs.)']];
    const summaryBody = Object.entries(byBuyer).map(([buyer, amt]) => [
      buyer,
      amt.toLocaleString()
    ]);
    summaryBody.push(['GRAND TOTAL AMOUNT', totals.totalPrice.toLocaleString()]);

    const leftRightMargin = 14;
    const detailsColWidth = 100;
    const amountColWidth = pageWidth - leftRightMargin * 2 - detailsColWidth;
    const tableWidth = detailsColWidth + amountColWidth;

    autoTable(doc, {
      head: summaryHead,
      body: summaryBody,
      startY: y,
      theme: 'grid',
      tableWidth,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: detailsColWidth },
        1: { halign: 'right', cellWidth: amountColWidth }
      },
      margin: { left: leftRightMargin, right: leftRightMargin },
      didParseCell: function (data) {
        if (data.row.index === summaryBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    const rangeSlug = rangeLabel
      .replaceAll(' ', '_')
      .replaceAll('/', '-')
      .replaceAll('.', '-');
    doc.save(`Load_Report_${rangeSlug}.pdf`);
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Load Management</h1>
          <p className="text-slate-500 text-sm mt-1">Track incoming/outgoing material loads, pricing, and units/tons.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 w-full md:w-auto">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Search</label>
            <input
              type="text"
              placeholder="Search buyer, quarry, vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-48 bg-white"
            />
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Buyer Name</label>
            <select
              value={selectedBuyerId}
              onChange={(e) => setSelectedBuyerId(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-40"
            >
              <option value="">All Buyers</option>
              {buyers.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Quarry Name</label>
            <select
              value={selectedQuarryName}
              onChange={(e) => setSelectedQuarryName(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-40"
            >
              <option value="">All Quarries</option>
              {uniqueQuarryNames.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Time Filter</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
            >
              <option value="all">All Time</option>
              <option value="daily">Particular Date</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="range">Date Range</option>
            </select>
          </div>

          {reportType === 'daily' && (
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Date</label>
              <input
                type="date"
                value={dateRange.particularDate}
                onChange={(e) => handleDateFilterChange('particularDate', e.target.value)}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
              />
            </div>
          )}

          {reportType === 'weekly' && (
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Week Start Date</label>
              <input
                type="date"
                value={dateRange.weekStart}
                onChange={(e) => handleDateFilterChange('weekStart', e.target.value)}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
              />
            </div>
          )}

          {reportType === 'monthly' && (
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Month</label>
              <input
                type="month"
                value={dateRange.month}
                onChange={(e) => handleDateFilterChange('month', e.target.value)}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
              />
            </div>
          )}

          {reportType === 'range' && (
            <>
              <div className="w-full sm:w-auto">
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => handleDateFilterChange('startDate', e.target.value)}
                  className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => handleDateFilterChange('endDate', e.target.value)}
                  className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={downloadPdf}
            disabled={loads.length === 0 || loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto justify-center inline-flex items-center"
          >
            Download PDF
          </button>

          {canWrite && (
            <button
              type="button"
              onClick={() => {
                setFormData({
                  vehicleType: '',
                  date: new Date().toISOString().split('T')[0],
                  quarryName: '',
                  buyerId: '',
                  price: '',
                  quantity: '',
                  unitType: 'units'
                });
                setIsModalOpen(true);
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition shadow-md whitespace-nowrap cursor-pointer w-full sm:w-auto justify-center inline-flex items-center"
            >
              + Add Load
            </button>
          )}
        </div>
      </div>

      {/* Summary totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Load Value</span>
          <span className="text-xl font-bold text-slate-800 mt-1">₹{totals.totalPrice.toLocaleString()}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Qty (Tons)</span>
          <span className="text-xl font-bold text-slate-800 mt-1">{totals.totalTons.toLocaleString()} tons</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-center">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Qty (Units)</span>
          <span className="text-xl font-bold text-slate-800 mt-1">{totals.totalUnits.toLocaleString()} units</span>
        </div>
      </div>

      <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col min-h-0 min-w-0">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading loads...</div>
        ) : filteredLoads.length === 0 ? (
          <div className="p-8 text-center text-slate-500 border-t border-slate-100 italic">No loads recorded for the selected filter.</div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0 min-w-0">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 shadow-sm z-10 w-full min-w-max">
                <tr className="border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                  <th className="p-4 font-semibold whitespace-nowrap">Date</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Vehicle Type</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Quarry Name</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Buyer Name</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">Price (₹)</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">Quantity</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">Total Value (₹)</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                {filteredLoads.map((load) => (
                  <tr key={load._id} className="hover:bg-slate-50 transition">
                    <td className="p-4 text-slate-600 whitespace-nowrap">{new Date(load.date).toLocaleDateString()}</td>
                    <td className="p-4 font-medium text-slate-800 whitespace-nowrap">{load.vehicleType}</td>
                    <td className="p-4 text-slate-600 whitespace-nowrap">{load.quarryName || '—'}</td>
                    <td className="p-4 text-slate-600 whitespace-nowrap">{load.buyerNameSnapshot || '—'}</td>
                    <td className="p-4 text-right text-slate-600 whitespace-nowrap">₹{load.price.toLocaleString()}</td>
                    <td className="p-4 text-right text-slate-600 whitespace-nowrap font-mono">{load.quantity} <span className="text-xs text-slate-400 font-sans">{load.unitType}</span></td>
                    <td className="p-4 text-right text-slate-800 font-bold whitespace-nowrap">₹{(load.price * load.quantity).toLocaleString()}</td>
                    <td className="p-4 text-right space-x-3 whitespace-nowrap">
                      {canWrite && (
                        <>
                          <button 
                            onClick={() => handleEdit(load)} 
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                            title="Edit Load"
                          >
                            <EditIcon className="h-5 w-5" />
                          </button>
                          <button 
                            onClick={() => handleDelete(load._id)} 
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                            title="Delete Load"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add/Edit Load */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{formData._id ? 'Edit Load' : 'Add New Load'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  name="date"
                  required
                  value={formData.date}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vehicle Type *</label>
                <input
                  type="text"
                  name="vehicleType"
                  required
                  value={formData.vehicleType}
                  onChange={handleChange}
                  placeholder="e.g. Tipper, Lorry, Tractor"
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer *</label>
                <div className="flex gap-2">
                  <select
                    name="buyerId"
                    required
                    value={formData.buyerId || ''}
                    onChange={handleChange}
                    className="flex-1 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-sm"
                  >
                    <option value="" disabled>Select Buyer *</option>
                    {buyers.map(b => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => setIsCreateBuyerOpen(true)}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition shrink-0"
                    >
                      + New
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quarry Name</label>
                <input
                  type="text"
                  name="quarryName"
                  value={formData.quarryName || ''}
                  onChange={handleChange}
                  placeholder="Quarry source location (optional)"
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Price per Unit/Ton (₹) *</label>
                  <input
                    type="number"
                    name="price"
                    required
                    value={formData.price}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    placeholder="e.g. 3200"
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      name="quantity"
                      required
                      value={formData.quantity}
                      onChange={handleChange}
                      min="0.01"
                      step="0.01"
                      placeholder="e.g. 15"
                      className="flex-1 min-w-0 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition"
                    />
                    <select
                      name="unitType"
                      value={formData.unitType}
                      onChange={handleChange}
                      className="border border-slate-300 rounded-lg p-2 text-sm bg-white shrink-0"
                    >
                      <option value="units">Units</option>
                      <option value="tons">Tons</option>
                    </select>
                  </div>
                </div>
              </div>

              {formData.price && formData.quantity && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm flex justify-between items-center">
                  <span className="font-medium text-slate-600">Calculated Value:</span>
                  <span className="font-extrabold text-slate-800 text-lg">₹{(Number(formData.price) * Number(formData.quantity)).toLocaleString()}</span>
                </div>
              )}

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 mt-6 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer">
                  {formData._id ? 'Update Load' : 'Save Load'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline Create Buyer Modal */}
      {isCreateBuyerOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-green-50">
              <h2 className="text-xl font-bold text-green-900">Add New Buyer</h2>
              <button onClick={() => setIsCreateBuyerOpen(false)} className="text-green-400 hover:text-green-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleCreateBuyer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer Name *</label>
                <input 
                  type="text" required value={newBuyerData.name} onChange={(e) => setNewBuyerData({...newBuyerData, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="e.g. Acme Minerals"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number * (10 digits)</label>
                <input 
                  type="tel" required value={newBuyerData.phone} onChange={(e) => setNewBuyerData({...newBuyerData, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="9876543210"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <input 
                  type="text" value={newBuyerData.address} onChange={(e) => setNewBuyerData({...newBuyerData, address: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="e.g. 123 Industrial Area"
                />
              </div>
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsCreateBuyerOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition shadow-md">
                  Create Buyer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoadManagement;
