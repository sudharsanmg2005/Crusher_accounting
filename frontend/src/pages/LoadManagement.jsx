import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { useConfirm } from '../components/ConfirmDialog';
import { useAuth } from '../AuthContext';
import { EditIcon, TrashIcon } from '../components/Icons';
import SearchableSelect from '../components/SearchableSelect';
import { formatVehicleInput, isValidVehicleNumber } from '../utils/vehicleNumber';

const toYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const roundToNearestTen = (amount) => {
  const rounded = Math.round(amount);
  const lastDigit = rounded % 10;
  if (lastDigit < 5) {
    return rounded - lastDigit;
  } else {
    return rounded + (10 - lastDigit);
  }
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
  const [materials, setMaterials] = useState([]);
  
  // New buyer modal states
  const [isCreateBuyerOpen, setIsCreateBuyerOpen] = useState(false);
  const [newBuyerData, setNewBuyerData] = useState({ name: '', phone: '', address: '' });

  // New material modal states
  const [isCreateMaterialOpen, setIsCreateMaterialOpen] = useState(false);
  const [newMaterialData, setNewMaterialData] = useState({ name: '', currentPrice: '', pricePerTon: '' });



  const [formData, setFormData] = useState({
    vehicleMode: 'select',
    vehicleNumber: '',
    date: new Date().toISOString().split('T')[0],
    quarryName: '',
    buyerId: '',
    price: '',
    quantity: '',
    unitType: 'tons'
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
      const day = today.getDay();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - day);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      setDateRange({ startDate: toYMD(sunday), endDate: toYMD(saturday), particularDate: '', month: '', weekStart: toYMD(sunday) });
    } else if (reportType === 'range') {
      setDateRange({ startDate: initialMonthlyRange.startDate, endDate: initialMonthlyRange.endDate, particularDate: '', month: '', weekStart: '' });
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

  const fetchMaterials = async () => {
    try {
      const { data } = await api.get('/materials');
      setMaterials(data);
    } catch (error) {
      console.error('Error fetching materials', error);
    }
  };

  useEffect(() => {
    fetchBuyers();
    fetchMaterials();
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
        const [yearStr, monthStr] = value.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
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
        const d = new Date(value + 'T00:00:00');
        const day = d.getDay();
        const start = new Date(d);
        start.setDate(d.getDate() - day);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        setDateRange(prev => ({
          ...prev,
          weekStart: toYMD(start),
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
    if (name === 'vehicleNumber') {
      setFormData({ ...formData, vehicleNumber: formatVehicleInput(value) });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  // Auto-fill price when material changes
  useEffect(() => {
    if (formData.quarryName && materials.length > 0) {
      const selectedMat = materials.find((m) => m.name === formData.quarryName);
      if (selectedMat) {
        const defaultPrice = formData.unitType === 'tons'
          ? (selectedMat.pricePerTon ?? selectedMat.currentPrice)
          : selectedMat.currentPrice;
        if (!formData._id) {
          setFormData((prev) => ({ ...prev, price: defaultPrice.toString() }));
        }
      }
    }
  }, [formData.quarryName, formData.unitType, materials]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.buyerId) {
      alert('Buyer is required.');
      return;
    }
    const vehicle = formData.vehicleMode === 'none' ? '' : (formData.vehicleNumber || '');
    if (vehicle && !isValidVehicleNumber(vehicle)) {
      alert('Vehicle number must be TN 74 2003, TN 74 AE 2003, or TMR 7177 format');
      return;
    }
    try {
      const payload = {
        vehicleNumber: vehicle,
        date: formData.date,
        quarryName: formData.quarryName,
        buyerId: formData.buyerId,
        price: Number(formData.price),
        quantity: Number(formData.quantity),
        unitType: formData.unitType
      };

      if (formData._id) {
        await api.put(`/loads/${formData._id}`, payload);
      } else {
        await api.post('/loads', payload);
      }
      setIsModalOpen(false);
      setFormData({
        vehicleMode: 'select',
        vehicleNumber: '',
        date: new Date().toISOString().split('T')[0],
        quarryName: '',
        buyerId: '',
        price: '',
        quantity: '',
        unitType: 'tons'
      });
      fetchLoads();
      fetchBuyers(); // Refresh buyer list vehicles
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

  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    if (!newMaterialData.name || !newMaterialData.currentPrice) {
      alert('Material name and unit price are required');
      return;
    }
    try {
      const { data: newMat } = await api.post('/materials', {
        name: newMaterialData.name,
        currentPrice: Number(newMaterialData.currentPrice),
        pricePerTon: Number(newMaterialData.pricePerTon || newMaterialData.currentPrice)
      });
      setFormData({ ...formData, quarryName: newMat.name });
      setIsCreateMaterialOpen(false);
      setNewMaterialData({ name: '', currentPrice: '', pricePerTon: '' });
      await fetchMaterials();
    } catch (error) {
      console.error('Error creating material', error);
      alert(error.response?.data?.message || 'Error creating material');
    }
  };

  const handleEdit = (load) => {
    const buyer = buyers.find((b) => b._id === load.buyer);
    const buyerVehicles = buyer?.vehicles || [];
    const vehicle = load.vehicleNumber || '';
    let vehicleMode = 'none';
    if (vehicle) {
      const exists = buyerVehicles.some((v) => v.number === vehicle);
      vehicleMode = exists ? 'select' : 'new';
    }
    setFormData({
      ...load,
      buyerId: load.buyer || '',
      vehicleMode,
      vehicleNumber: vehicle,
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
        acc.totalPrice += load.totalAmount ?? roundToNearestTen(Number(load.price || 0) * Number(load.quantity || 0));
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

  const downloadPdf = async () => {
    const listToExport = filteredLoads;
    if (listToExport.length === 0) return;

    let buyerSummary = null;
    let buyerPayments = [];
    if (selectedBuyerId) {
      try {
        const params = new URLSearchParams();
        if (dateRange.startDate) params.append('startDate', dateRange.startDate);
        if (dateRange.endDate) params.append('endDate', dateRange.endDate);
        const { data } = await api.get(`/buyers/${selectedBuyerId}?${params.toString()}`);
        buyerSummary = data.summary;
        buyerPayments = data.payments || [];
      } catch (err) {
        console.error('Error fetching buyer details for PDF', err);
      }
    }

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

    const selectedBuyer = buyers.find((b) => b._id === selectedBuyerId);
    const buyerName = selectedBuyer ? selectedBuyer.name : '';

    let titleParts = [];
    if (buyerName) {
      titleParts.push(buyerName.toUpperCase());
    }
    if (selectedQuarryName) {
      titleParts.push(selectedQuarryName.toUpperCase());
    }

    const titleText = titleParts.length > 0
      ? `${titleParts.join(' - ')} LOAD STATEMENT`
      : 'LOAD MANAGEMENT REPORT';

    centerText(titleText, 19, 12, 'bold');

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

    const head = selectedBuyerId 
      ? [['S.NO', 'DATE', 'VEHICLE NUMBER', 'MATERIAL', 'QTY', 'UNIT TYPE', 'PRICE (Rs.)', 'TOTAL (Rs.)']]
      : [['S.NO', 'DATE', 'VEHICLE NUMBER', 'MATERIAL', 'BUYER NAME', 'QTY', 'UNIT TYPE', 'PRICE (Rs.)', 'TOTAL (Rs.)']];

    const body = listToExport.map((l, idx) => {
      const sNo = idx + 1;
      const date = new Date(l.date).toLocaleDateString();
      const vehicle = l.vehicleNumber || '—';
      const material = l.quarryName || '—';
      const buyerName = l.buyerNameSnapshot || '—';
      const qty = Number(l.quantity || 0).toFixed(2);
      const unitType = l.unitType || 'tons';
      const price = l.price.toLocaleString();
      const total = (l.totalAmount ?? roundToNearestTen(l.price * l.quantity)).toLocaleString();

      return selectedBuyerId
        ? [sNo, date, vehicle, material, qty, unitType, price, total]
        : [sNo, date, vehicle, material, buyerName, qty, unitType, price, total];
    });

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

    if (selectedBuyerId && buyerSummary) {
      const selectedBilled = buyerSummary.totalBillsAmount || 0;
      const selectedPaid = buyerSummary.totalPaidAmount || 0;
      const selectedOutstanding = buyerSummary.totalOutstandingAmount || 0;

      const overallBilled = buyerSummary.overallBilled || selectedBilled;
      const overallPaid = buyerSummary.overallPaid || selectedPaid;
      const overallOutstanding = buyerSummary.overallOutstanding || selectedOutstanding;

      const previousBilled = Math.max(0, overallBilled - selectedBilled);
      const previousPaid = Math.max(0, overallPaid - selectedPaid);
      const previousOutstanding = Math.max(0, overallOutstanding - selectedOutstanding);

      if (y > pageHeight - 65) {
        doc.addPage();
        y = 18;
      }

      // Single Statement Summary Table
      const totalsHead = [['STATEMENT SUMMARY', 'AMOUNT']];
      const totalsBody = [
        ['TOTAL LOAD COST', `Rs. ${Number(selectedBilled).toLocaleString()}`],
        ['TOTAL PAID', `Rs. ${Number(selectedPaid).toLocaleString()}`],
        ['OUTSTANDING BALANCE', `Rs. ${Number(selectedOutstanding).toLocaleString()}`],
        ['PREVIOUS BILLED', `Rs. ${Number(previousBilled).toLocaleString()}`],
        ['PREVIOUS PAID', `Rs. ${Number(previousPaid).toLocaleString()}`],
        ['PREVIOUS BALANCE', `Rs. ${Number(previousOutstanding).toLocaleString()}`],
        ['TOTAL BALANCE', `Rs. ${Number(overallOutstanding).toLocaleString()}`]
      ];

      const leftRightMargin = 14;
      const detailsColWidth = 85;
      const amountColWidth = pageWidth - leftRightMargin * 2 - detailsColWidth;
      const tableWidth = detailsColWidth + amountColWidth;

      autoTable(doc, {
        head: totalsHead,
        body: totalsBody,
        startY: y,
        theme: 'grid',
        tableWidth,
        styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'left', cellWidth: detailsColWidth },
          1: { halign: 'right', cellWidth: amountColWidth }
        },
        margin: { left: leftRightMargin, right: leftRightMargin }
      });

      y = doc.lastAutoTable.finalY;
    } else {
      // General loads report summary tables
      let grandBilled = 0;
      let grandPaid = 0;
      let grandOutstanding = 0;

      const buyerAgg = {};

      listToExport.forEach((l) => {
        const billed = l.totalAmount ?? roundToNearestTen(Number(l.price || 0) * Number(l.quantity || 0));
        const paid = Number(l.allocatedAmount || 0);
        const pending = Number(l.pendingAmount || 0);

        grandBilled += billed;
        grandPaid += paid;
        grandOutstanding += pending;

        const bName = l.buyerNameSnapshot || '—';
        if (!buyerAgg[bName]) {
          buyerAgg[bName] = { billed: 0, paid: 0, pending: 0 };
        }
        buyerAgg[bName].billed += billed;
        buyerAgg[bName].paid += paid;
        buyerAgg[bName].pending += pending;
      });

      const grandHead = [['GRAND SUMMARY', 'AMOUNT (Rs.)']];
      const grandBody = [
        ['GRAND TOTAL LOAD COST', grandBilled.toLocaleString()],
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

      const buyerHead = [['BUYER NAME', 'TOTAL COST (Rs.)', 'TOTAL PAID (Rs.)', 'TOTAL OUTSTANDING (Rs.)']];
      const buyerBody = Object.entries(buyerAgg).map(([name, data]) => [
        name,
        data.billed.toLocaleString(),
        data.paid.toLocaleString(),
        data.pending.toLocaleString()
      ]);

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Summary By Buyer:', 14, y - 4);

      autoTable(doc, {
        head: buyerHead,
        body: buyerBody,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }
      });

      y = doc.lastAutoTable.finalY;
    }

    if (selectedBuyerId && buyerPayments.length > 0) {
      y = y + 12;
      if (y > pageHeight - 65) {
        doc.addPage();
        y = 18;
      }

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('PAYMENT HISTORY:', 14, y - 4);

      const payHead = [['S.NO', 'DATE', 'PAYMENT NUMBER', 'AMOUNT PAID (Rs.)', 'PAID BY / METHOD', 'NOTES']];
      const payBody = buyerPayments.map((p, idx) => [
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

    const rangeSlug = rangeLabel
      .replaceAll(' ', '_')
      .replaceAll('/', '-')
      .replaceAll('.', '-');
    
    let nameParts = [];
    if (buyerName) {
      nameParts.push(buyerName.replaceAll(' ', '_').replaceAll('/', '-'));
    }
    if (selectedQuarryName) {
      nameParts.push(selectedQuarryName.replaceAll(' ', '_').replaceAll('/', '-'));
    }

    let fileSlug = '';
    if (nameParts.length > 0) {
      fileSlug = nameParts.join('_') + '_statement';
    } else {
      fileSlug = 'Load_Report';
    }

    doc.save(`${fileSlug}_${rangeSlug}.pdf`);
  };

  const selectedBuyer = useMemo(() => buyers.find((b) => b._id === formData.buyerId), [buyers, formData.buyerId]);
  const buyerVehicles = selectedBuyer?.vehicles || [];

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Load Management</h1>
          <p className="text-slate-500 text-sm mt-1">Track incoming/outgoing material loads, pricing, and units/tons.</p>
        </div>

        <div className="flex flex-col gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 w-full md:w-auto shrink-0">
          <div className="flex flex-wrap items-end gap-3 w-full">
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
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Material</label>
              <select
                value={selectedQuarryName}
                onChange={(e) => setSelectedQuarryName(e.target.value)}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-40"
              >
                <option value="">All Materials</option>
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

            <div className="flex flex-wrap gap-2 w-full sm:w-auto ml-auto">
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
                      vehicleMode: 'select',
                      vehicleNumber: '',
                      date: new Date().toISOString().split('T')[0],
                      quarryName: '',
                      buyerId: '',
                      price: '',
                      quantity: '',
                      unitType: 'tons'
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

          {['daily', 'weekly', 'monthly', 'range'].includes(reportType) && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg animate-in slide-in-from-top-1 duration-200 w-full">
              {reportType === 'daily' && (
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date:</span>
                  <input
                    type="date"
                    value={dateRange.particularDate}
                    onChange={(e) => handleDateFilterChange('particularDate', e.target.value)}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-48"
                  />
                </div>
              )}

              {reportType === 'weekly' && (
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Week Start:</span>
                  <input
                    type="date"
                    value={dateRange.weekStart}
                    onChange={(e) => handleDateFilterChange('weekStart', e.target.value)}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-48"
                  />
                </div>
              )}

              {reportType === 'monthly' && (
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Month:</span>
                  <input
                    type="month"
                    value={dateRange.month}
                    onChange={(e) => handleDateFilterChange('month', e.target.value)}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-48"
                  />
                </div>
              )}

              {reportType === 'range' && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date Range:</span>
                  <input
                    type="date"
                    value={dateRange.startDate}
                    onChange={(e) => handleDateFilterChange('startDate', e.target.value)}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-40"
                  />
                  <span className="text-slate-400 text-sm">to</span>
                  <input
                    type="date"
                    value={dateRange.endDate}
                    onChange={(e) => handleDateFilterChange('endDate', e.target.value)}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-40"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>



      <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col min-h-0 min-w-0">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading loads...</div>
        ) : filteredLoads.length === 0 ? (
          <div className="p-8 text-center text-slate-500 border-t border-slate-100 italic">No loads recorded for the selected filter.</div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0 min-w-0">
            <table className="data-table">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 shadow-sm z-10 w-full min-w-max">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 font-semibold whitespace-nowrap">Date</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Vehicle Number</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Material</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Buyer Name</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">Price (₹)</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">Quantity</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">Total Value (₹)</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="whitespace-nowrap">
                {filteredLoads.map((load) => (
                  <tr key={load._id}>
                    <td className="p-4 text-slate-600 whitespace-nowrap">{new Date(load.date).toLocaleDateString()}</td>
                    <td className="p-4 font-medium text-slate-800 whitespace-nowrap">{load.vehicleNumber || '—'}</td>
                    <td className="p-4 text-slate-600 whitespace-nowrap">{load.quarryName || '—'}</td>
                    <td className="p-4 text-slate-600 whitespace-nowrap">{load.buyerNameSnapshot || '—'}</td>
                    <td className="p-4 text-right text-slate-600 whitespace-nowrap">₹{load.price.toLocaleString()}</td>
                    <td className="p-4 text-right text-slate-600 whitespace-nowrap font-mono">{Number(load.quantity || 0).toFixed(2)} <span className="text-xs text-slate-400 font-sans">{load.unitType || 'tons'}</span></td>
                    <td className="p-4 text-right text-slate-800 font-bold whitespace-nowrap">₹{(load.totalAmount ?? roundToNearestTen(load.price * load.quantity)).toLocaleString()}</td>
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
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-sm bg-white text-slate-850"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buyer *</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      options={buyers.map(b => ({ value: b._id, label: b.name }))}
                      value={formData.buyerId}
                      onChange={(val) => setFormData(prev => ({ ...prev, buyerId: val }))}
                      placeholder="Select Buyer"
                      required
                    />
                  </div>
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

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Vehicle Mode</label>
                  <select
                    value={formData.vehicleMode || 'select'}
                    onChange={(e) => setFormData({ ...formData, vehicleMode: e.target.value, vehicleNumber: '' })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="select">Existing</option>
                    <option value="new">Add New</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Vehicle Number</label>
                  {formData.vehicleMode === 'select' && (
                    <select
                      name="vehicleNumber"
                      value={formData.vehicleNumber || ''}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-800"
                    >
                      <option value="">Select vehicle</option>
                      {buyerVehicles.map((v) => (
                        <option key={v._id || v.number} value={v.number}>{v.number}</option>
                      ))}
                    </select>
                  )}
                  {formData.vehicleMode === 'new' && (
                    <input
                      type="text"
                      name="vehicleNumber"
                      value={formData.vehicleNumber || ''}
                      onChange={handleChange}
                      className="w-full border border-slate-300 rounded-lg p-2 uppercase focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-800"
                      placeholder="TN 74 AE 2003"
                    />
                  )}
                  {formData.vehicleMode === 'none' && (
                    <input
                      type="text"
                      disabled
                      value="No vehicle"
                      className="w-full border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-400 text-sm outline-none cursor-not-allowed"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Material *</label>
                <div className="flex gap-2">
                  <select
                    name="quarryName"
                    required
                    value={formData.quarryName || ''}
                    onChange={handleChange}
                    className="flex-1 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-sm text-slate-800"
                  >
                    <option value="" disabled>Select Material *</option>
                    {materials.map(m => (
                      <option key={m._id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => setIsCreateMaterialOpen(true)}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition shrink-0"
                    >
                      + New
                    </button>
                  )}
                </div>
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
                  <span className="font-extrabold text-slate-800 text-lg">₹{roundToNearestTen(Number(formData.price) * Number(formData.quantity)).toLocaleString()}</span>
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

      {/* Inline Create Material Modal */}
      {isCreateMaterialOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-green-50">
              <h2 className="text-xl font-bold text-green-900">Add New Material</h2>
              <button onClick={() => setIsCreateMaterialOpen(false)} className="text-green-400 hover:text-green-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleCreateMaterial} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Material Name *</label>
                <input 
                  type="text" required value={newMaterialData.name} onChange={(e) => setNewMaterialData({...newMaterialData, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="e.g. 20mm Rough Stone"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Unit Price (₹) *</label>
                <input 
                  type="number" required value={newMaterialData.currentPrice} onChange={(e) => setNewMaterialData({...newMaterialData, currentPrice: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="e.g. 3200"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ton Price (₹)</label>
                <input 
                  type="number" value={newMaterialData.pricePerTon} onChange={(e) => setNewMaterialData({...newMaterialData, pricePerTon: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                  placeholder="e.g. 3500 (optional)"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsCreateMaterialOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition shadow-md">
                  Create Material
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
