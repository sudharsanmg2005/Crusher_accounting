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

  // Bulk load modal states
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkRows, setBulkRows] = useState([]);



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

  const emptyBulkRow = () => ({
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    buyerId: '',
    vehicleMode: 'select',
    vehicleNumber: '',
    quarryName: '',
    quantity: '',
    unitType: 'tons',
    price: ''
  });

  const openBulkModal = () => {
    setBulkDate(new Date().toISOString().split('T')[0]);
    setBulkRows([emptyBulkRow()]);
    setIsBulkModalOpen(true);
  };

  const addBulkRow = () => {
    setBulkRows((prev) => [...prev, emptyBulkRow()]);
  };

  const removeBulkRow = (index) => {
    setBulkRows((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.length === 0 ? [emptyBulkRow()] : updated;
    });
  };

  const duplicateBulkRow = (index) => {
    const target = bulkRows[index];
    const newRow = {
      ...target,
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      vehicleNumber: ''
    };
    setBulkRows((prev) => {
      const updated = [...prev];
      updated.splice(index + 1, 0, newRow);
      return updated;
    });
  };

  const handleBulkRowChange = (index, field, value) => {
    setBulkRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      if (field === 'buyerId' || field === 'quarryName' || field === 'unitType') {
        const buyerId = field === 'buyerId' ? value : row.buyerId;
        const quarryName = field === 'quarryName' ? value : row.quarryName;
        const unitType = field === 'unitType' ? value : row.unitType;

        if (buyerId && quarryName) {
          const selectedMat = materials.find((m) => m.name === quarryName);
          if (selectedMat) {
            const defaultPrice = unitType === 'tons'
              ? (selectedMat.pricePerTon ?? selectedMat.currentPrice)
              : selectedMat.currentPrice;
            row.price = defaultPrice.toString();
          }
        }
      }

      if (field === 'vehicleNumber' && row.vehicleMode === 'new') {
        row.vehicleNumber = formatVehicleInput(value);
      }

      if (field === 'buyerId') {
        row.vehicleNumber = '';
      }

      updated[index] = row;
      return updated;
    });
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();

    const validRows = bulkRows.filter(
      (r) => r.buyerId || r.vehicleNumber || r.quarryName || r.quantity || r.price
    );

    if (validRows.length === 0) {
      alert('Please fill out at least one row with load details.');
      return;
    }

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const rowNum = i + 1;

      if (!row.buyerId) {
        alert(`Row #${rowNum}: Buyer is required.`);
        return;
      }
      if (!row.quarryName) {
        alert(`Row #${rowNum}: Material/Quarry is required.`);
        return;
      }
      if (!row.quantity || Number(row.quantity) <= 0) {
        alert(`Row #${rowNum}: Quantity must be greater than zero.`);
        return;
      }
      if (!row.price || Number(row.price) < 0) {
        alert(`Row #${rowNum}: Price is required and cannot be negative.`);
        return;
      }

      const vehicle = row.vehicleMode === 'none' ? '' : (row.vehicleNumber || '');
      if (vehicle && !isValidVehicleNumber(vehicle)) {
        alert(`Row #${rowNum}: Vehicle number must be TN 74 2003, TN 74 AE 2003, or TMR 7177 format.`);
        return;
      }
    }

    try {
      const payload = {
        date: new Date(`${bulkDate}T12:00`).toISOString(),
        loads: validRows.map((r) => ({
          buyerId: r.buyerId,
          vehicleNumber: r.vehicleMode === 'none' ? '' : r.vehicleNumber,
          quarryName: r.quarryName,
          quantity: Number(r.quantity),
          unitType: r.unitType,
          price: Number(r.price)
        }))
      };

      await api.post('/loads/bulk', payload);
      setIsBulkModalOpen(false);
      fetchLoads();
      fetchBuyers();
    } catch (error) {
      console.error('Error saving bulk loads', error);
      alert('Error saving loads: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

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
    if (listToExport.length === 0 && !selectedBuyerId) return;

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

    // Calculate dates for range label and query params
    let rangeLabel = 'All Time';
    let queryParams = {};
    let startDateVal = null;
    let endDateVal = null;

    if (reportType !== 'all' && dateRange.startDate && dateRange.endDate) {
      const formatDateDots = (d) => {
        if (!d) return '';
        const [yy, mm, dd] = d.split('-');
        return `${dd}.${mm}.${yy}`;
      };
      rangeLabel = `${formatDateDots(dateRange.startDate)} - ${formatDateDots(dateRange.endDate)}`;
      queryParams = { startDate: dateRange.startDate, endDate: dateRange.endDate };
      startDateVal = new Date(dateRange.startDate + 'T00:00:00');
      endDateVal = new Date(dateRange.endDate + 'T23:59:59');
    }

    const selectedBuyer = buyers.find((b) => b._id === selectedBuyerId);
    const buyerName = selectedBuyer ? selectedBuyer.name : '';

    if (!selectedBuyerId) {
      // 1. ALL BUYERS SUMMARY REPORT
      centerText('BUYER LOAD SUMMARY REPORT', 19, 12, 'bold');
      centerText(rangeLabel, 26, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 29, pageWidth - 14, 29);

      let outstandingData = [];
      try {
        const params = new URLSearchParams(queryParams);
        const { data } = await api.get(`/reports/outstanding-buyers?${params.toString()}`);
        outstandingData = data || [];
      } catch (err) {
        console.error('Error fetching buyer outstanding report for PDF', err);
      }

      // Aggregate counts from listToExport
      const loadCountMap = {};
      listToExport.forEach(l => {
        const bid = (l.buyer?._id || l.buyer || '').toString();
        if (bid) {
          loadCountMap[bid] = (loadCountMap[bid] || 0) + 1;
        }
      });

      // Filter active buyers (include if they have loads OR pending dues in the period)
      const activeBuyers = outstandingData.filter(item => 
        (loadCountMap[item.buyerId] || 0) > 0 || (item.outstandingBalance || 0) > 0
      );

      // Check if any active buyer has a pending amount greater than total load cost
      const hasPreviousBalance = activeBuyers.some(item => {
        const billed = item.totalLoadsAmount || 0;
        const pending = Math.max(0, item.outstandingBalance || 0);
        return pending > billed;
      });

      const head = hasPreviousBalance
        ? [['S.NO', 'SUPPLIER NAME', 'NO. OF LOADS', 'TOTAL LOAD COST (Rs.)', 'PREVIOUS BALANCE (Rs.)', 'PENDING AMOUNT (Rs.)']]
        : [['S.NO', 'SUPPLIER NAME', 'NO. OF LOADS', 'TOTAL LOAD COST (Rs.)', 'PENDING AMOUNT (Rs.)']];

      const body = activeBuyers.map((item, idx) => {
        const billed = item.totalLoadsAmount || 0;
        const pending = Math.max(0, item.outstandingBalance || 0);
        const prevPending = Math.max(0, (item.outstandingBalance || 0) - (item.totalLoadsAmount || 0) + (item.totalPaidAmount || 0));

        const billedStr = `Rs. ${Number(billed).toLocaleString()}`;
        const pendingStr = `Rs. ${Number(pending).toLocaleString()}`;
        const prevPendingStr = `Rs. ${Number(prevPending).toLocaleString()}`;

        if (hasPreviousBalance) {
          return [
            idx + 1,
            item.buyerName || '—',
            loadCountMap[item.buyerId] || 0,
            billedStr,
            prevPendingStr,
            pendingStr
          ];
        } else {
          return [
            idx + 1,
            item.buyerName || '—',
            loadCountMap[item.buyerId] || 0,
            billedStr,
            pendingStr
          ];
        }
      });

      autoTable(doc, {
        head,
        body,
        startY: 36,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
      });

      let y = (doc.lastAutoTable?.finalY || 36) + 12;
      if (y > pageHeight - 45) {
        doc.addPage();
        y = 18;
      }

      let grandBilled = 0;
      let grandPending = 0;
      activeBuyers.forEach(b => {
        grandBilled += b.totalLoadsAmount || 0;
        grandPending += Math.max(0, b.outstandingBalance || 0);
      });

      const grandHead = [['GRAND SUMMARY', 'AMOUNT (Rs.)']];
      const grandBody = [
        ['GRAND TOTAL LOAD COST', grandBilled.toLocaleString()],
        ['GRAND TOTAL PENDING', grandPending.toLocaleString()]
      ];

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Grand Summary:', 14, y - 4);

      autoTable(doc, {
        head: grandHead,
        body: grandBody,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' }
      });

      doc.save('buyer_loads_summary.pdf');
    } else {
      // 2. EACH BUYER STATEMENT REPORT
      let titleParts = [];
      if (buyerName) titleParts.push(buyerName.toUpperCase());
      if (selectedQuarryName) titleParts.push(selectedQuarryName.toUpperCase());
      const titleText = `${titleParts.join(' - ')} STATEMENT`;

      centerText(titleText, 19, 12, 'bold');
      centerText(rangeLabel, 26, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 29, pageWidth - 14, 29);

      // Fetch full history to calculate old balance correctly
      let fullLedger = [];
      let fullPayments = [];
      try {
        const { data } = await api.get(`/buyers/${selectedBuyerId}`);
        fullLedger = data.ledger || [];
        fullPayments = data.payments || [];
      } catch (err) {
        console.error('Error fetching buyer details for PDF', err);
      }

      // Calculate balance values
      const sortedLedger = [...fullLedger].sort((a, b) => new Date(a.date) - new Date(b.date));
      let oldBalance = 0;
      if (startDateVal) {
        const beforeEntries = sortedLedger.filter(e => new Date(e.date) < startDateVal);
        if (beforeEntries.length > 0) {
          oldBalance = beforeEntries[beforeEntries.length - 1].runningBalance;
        }
      }

      let grandTotal = 0;
      let amountReceived = 0;

      sortedLedger.forEach(entry => {
        const entryDate = new Date(entry.date);
        const inRange = (!startDateVal || entryDate >= startDateVal) && (!endDateVal || entryDate <= endDateVal);
        if (inRange) {
          if (entry.transactionType === 'Load Created') {
            grandTotal += entry.debit;
          } else if (entry.transactionType === 'Payment Made') {
            amountReceived += entry.credit;
          }
        }
      });

      const totalAmount = grandTotal + oldBalance;
      const totalBalance = totalAmount - amountReceived;

      // Table 1: Individual loads list
      const head = [['S.NO', 'DATE', 'VEHICLE NO', 'MATERIAL', 'PRICE (Rs.)', 'QUANTITY', 'TOTAL (Rs.)']];
      const sortedList = [...listToExport].sort((a, b) => new Date(a.date) - new Date(b.date));
      const body = sortedList.map((l, idx) => [
        idx + 1,
        new Date(l.date).toLocaleDateString(),
        l.vehicleNumber || '—',
        l.quarryName || '—',
        Number(l.price || 0).toLocaleString(),
        `${Number(l.quantity || 0).toFixed(2)} ${l.unitType || 'tons'}`,
        (l.totalAmount ?? roundToNearestTen(l.price * l.quantity)).toLocaleString()
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 36,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
      });

      let y = (doc.lastAutoTable?.finalY || 36) + 12;
      if (y > pageHeight - 65) {
        doc.addPage();
        y = 18;
      }

      // Table 2: Financial Summary
      const totalsHead = [['STATEMENT SUMMARY', 'AMOUNT']];
      const grandTotalSum = grandTotal + oldBalance;
      const totalBalanceCalculated = grandTotalSum - amountReceived;
      const totalsBody = [
        ['GRAND TOTAL LOAD COST', `Rs. ${Number(grandTotal).toLocaleString()}`]
      ];

      if (oldBalance > 0) {
        totalsBody.push(['PREVIOUS BALANCE', `Rs. ${Number(oldBalance).toLocaleString()}`]);
        totalsBody.push(['GRAND TOTAL', `Rs. ${Number(grandTotalSum).toLocaleString()}`]);
      }

      totalsBody.push(['AMOUNT PAID', `Rs. ${Number(amountReceived).toLocaleString()}`]);

      if (totalBalanceCalculated < 0) {
        totalsBody.push(['ADVANCE CREDIT', `Rs. ${Number(Math.abs(totalBalanceCalculated)).toLocaleString()}`]);
      } else {
        totalsBody.push(['TOTAL BALANCE DUE', `Rs. ${Number(totalBalanceCalculated).toLocaleString()}`]);
      }

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

      y = doc.lastAutoTable.finalY + 12;

      // Render payment history in timeline if there are payments
      const paymentsInTimeline = fullPayments.filter(p => {
        const pdate = new Date(p.paymentDate || p.date);
        return (!startDateVal || pdate >= startDateVal) && (!endDateVal || pdate <= endDateVal);
      });

      if (paymentsInTimeline.length > 0) {
        if (y > pageHeight - 55) {
          doc.addPage();
          y = 18;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('PAYMENTS MADE IN TIMELINE:', 14, y - 4);

        const payHead = [['S.NO', 'DATE', 'PAYMENT NUMBER', 'AMOUNT PAID (Rs.)', 'PAID BY / METHOD', 'NOTES']];
        const payBody = paymentsInTimeline.map((p, idx) => [
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
          styles: { fontSize: 8, cellPadding: 2.5 },
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }
        });
      }

      const fileSlug = buyerName ? buyerName.replaceAll(' ', '_') : 'buyer';
      doc.save(`${fileSlug}_statement.pdf`);
    }
  };

  const downloadPaymentsPdf = async () => {
    // 1. Calculate dates for range label and query params
    let rangeLabel = 'All Time';
    let queryParams = {};
    let startDateVal = null;
    let endDateVal = null;

    if (reportType !== 'all' && dateRange.startDate && dateRange.endDate) {
      const formatDateDots = (d) => {
        if (!d) return '';
        const [yy, mm, dd] = d.split('-');
        return `${dd}.${mm}.${yy}`;
      };
      rangeLabel = `${formatDateDots(dateRange.startDate)} - ${formatDateDots(dateRange.endDate)}`;
      queryParams = { startDate: dateRange.startDate, endDate: dateRange.endDate };
      startDateVal = new Date(dateRange.startDate + 'T00:00:00');
      endDateVal = new Date(dateRange.endDate + 'T23:59:59');
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

    let payments = [];

    if (!selectedBuyerId) {
      // MODE A: ALL BUYERS PAYMENTS REPORT
      try {
        const params = new URLSearchParams(queryParams);
        const { data } = await api.get(`/reports/buyer-payments?${params.toString()}`);
        payments = data || [];
      } catch (err) {
        console.error('Error fetching buyer payments report for PDF', err);
        alert('Error fetching buyer payments report');
        return;
      }

      if (payments.length === 0) {
        alert('No payments found for the selected timeline.');
        return;
      }

      centerText('BUYER PAYMENTS SUMMARY REPORT', 19, 12, 'bold');
      centerText(rangeLabel, 26, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 29, pageWidth - 14, 29);

      const sortedPayments = [...payments].sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));

      const head = [['S.NO', 'DATE', 'VOUCHER NO', 'BUYER NAME', 'PAID BY', 'NOTES', 'AMOUNT (Rs.)']];
      const body = sortedPayments.map((p, idx) => [
        idx + 1,
        new Date(p.paymentDate).toLocaleDateString(),
        p.paymentNumber || '—',
        p.buyerName || '—',
        p.paidBy || '—',
        p.notes || '—',
        Number(p.amountPaid || 0).toLocaleString()
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
      if (y > pageHeight - 55) {
        doc.addPage();
        y = 18;
      }

      // Group by buyer and sum amounts
      const buyerTotals = {};
      sortedPayments.forEach(p => {
        const name = p.buyerName || 'Unknown';
        buyerTotals[name] = (buyerTotals[name] || 0) + (p.amountPaid || 0);
      });

      const summaryTableHead = [['BUYER NAME', 'TOTAL PAYMENTS PAID (Rs.)']];
      const summaryTableBody = Object.entries(buyerTotals).map(([name, total]) => [
        name,
        Number(total).toLocaleString()
      ]);

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Buyer-wise Payment Summary:', 14, y - 4);

      autoTable(doc, {
        head: summaryTableHead,
        body: summaryTableBody,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
      });

      y = (doc.lastAutoTable?.finalY || y) + 12;
      if (y > pageHeight - 35) {
        doc.addPage();
        y = 18;
      }

      const totalPaid = sortedPayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);

      const grandHead = [['SUMMARY', 'AMOUNT (Rs.)']];
      const grandBody = [
        ['GRAND TOTAL PAYMENTS PAID', totalPaid.toLocaleString()]
      ];

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Grand Summary:', 14, y - 4);

      autoTable(doc, {
        head: grandHead,
        body: grandBody,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' }
      });

      doc.save('buyer_payments_summary.pdf');
    } else {
      // MODE B: PARTICULAR BUYER PAYMENTS REPORT
      try {
        const params = new URLSearchParams(queryParams);
        const { data } = await api.get(`/buyers/${selectedBuyerId}?${params.toString()}`);
        payments = data.payments || [];
      } catch (err) {
        console.error('Error fetching buyer details for payments PDF', err);
        alert('Error fetching buyer details');
        return;
      }

      if (payments.length === 0) {
        alert(`No payments found for ${buyerName} in the selected timeline.`);
        return;
      }

      centerText(`${buyerName.toUpperCase()} PAYMENT STATEMENT`, 19, 12, 'bold');
      centerText(rangeLabel, 26, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 29, pageWidth - 14, 29);

      const sortedPayments = [...payments].sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));

      const head = [['S.NO', 'DATE', 'VOUCHER NO', 'PAID BY', 'NOTES', 'AMOUNT (Rs.)']];
      const body = sortedPayments.map((p, idx) => [
        idx + 1,
        new Date(p.paymentDate).toLocaleDateString(),
        p.paymentNumber || '—',
        p.paidBy || '—',
        p.notes || '—',
        Number(p.amount || 0).toLocaleString()
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
      if (y > pageHeight - 45) {
        doc.addPage();
        y = 18;
      }

      const totalPaid = sortedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      const summaryHead = [['SUMMARY', 'AMOUNT (Rs.)']];
      const summaryBody = [
        ['TOTAL PAYMENTS PAID', totalPaid.toLocaleString()]
      ];

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Summary:', 14, y - 4);

      autoTable(doc, {
        head: summaryHead,
        body: summaryBody,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' }
      });

      doc.save(`${buyerName.replaceAll(' ', '_')}_payments_statement.pdf`);
    }
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
              <button
                type="button"
                onClick={downloadPaymentsPdf}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md cursor-pointer w-full sm:w-auto justify-center inline-flex items-center"
              >
                Payments PDF
              </button>
              {canWrite && (
                <>
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
                  <button
                    type="button"
                    onClick={openBulkModal}
                    className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition shadow-md whitespace-nowrap cursor-pointer w-full sm:w-auto justify-center inline-flex items-center"
                  >
                    + Bulk Entry
                  </button>
                </>
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
      {/* Bulk Generate Loads Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] xl:max-w-[92vw] overflow-hidden flex flex-col max-h-[96vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Daily Log Sheet (Bulk Load Entry)</h2>
                <p className="text-sm text-slate-500 mt-1">Quickly enter all purchase loads of a day in one spreadsheet view</p>
              </div>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-3xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleBulkSubmit} className="flex flex-col flex-1 overflow-hidden">
              {/* Batch Settings */}
              <div className="p-5 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-4 items-center shrink-0">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Log Date:</label>
                  <input
                    type="date"
                    required
                    value={bulkDate}
                    onChange={(e) => setBulkDate(e.target.value)}
                    className="border border-slate-300 rounded-xl p-2.5 text-base focus:ring-2 focus:ring-blue-500 outline-none bg-white w-48 font-semibold text-slate-800"
                  />
                </div>
              </div>

              {/* Grid Table Container */}
              <div className="flex-1 overflow-auto p-6">
                <table className="w-full border-collapse text-left text-base mb-64">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600 uppercase text-xs font-extrabold tracking-wider bg-slate-100/80">
                      <th className="py-4 px-3 w-12 text-center">#</th>
                      <th className="py-4 px-3 min-w-[280px]">Buyer *</th>
                      <th className="py-4 px-3 w-[140px]">Vehicle Mode</th>
                      <th className="py-4 px-3 min-w-[180px]">Vehicle Number</th>
                      <th className="py-4 px-3 min-w-[220px]">Quarry/Material *</th>
                      <th className="py-4 px-3 w-[110px]">Unit</th>
                      <th className="py-4 px-3 w-[110px]">Qty *</th>
                      <th className="py-4 px-3 w-[130px]">Price/Unit *</th>
                      <th className="py-4 px-3 w-[140px] text-right">Row Total</th>
                      <th className="py-4 px-3 w-24 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkRows.map((row, index) => {
                      const rowBuyer = buyers.find(b => b._id === row.buyerId);
                      const rowVehicles = rowBuyer?.vehicles || [];
                      
                      // Calculate row total
                      const price = Number(row.price) || 0;
                      const qty = Number(row.quantity) || 0;
                      const rowTotal = roundToNearestTen(qty * price);

                      return (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition duration-150">
                          <td className="py-3.5 px-3 text-center text-slate-400 font-bold text-base">{index + 1}</td>
                          
                          {/* Buyer searchable select */}
                          <td className="py-3.5 px-3">
                            <SearchableSelect
                              options={buyers.map(b => ({ value: b._id, label: b.name }))}
                              value={row.buyerId}
                              onChange={(val) => handleBulkRowChange(index, 'buyerId', val)}
                              placeholder="Buyer"
                              required
                              className="!p-2.5 !text-[15px] font-semibold text-slate-800"
                            />
                          </td>

                          {/* Vehicle Mode */}
                          <td className="py-3.5 px-3">
                            <select
                              value={row.vehicleMode}
                              onChange={(e) => handleBulkRowChange(index, 'vehicleMode', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                            >
                              <option value="select">Existing</option>
                              <option value="new">New</option>
                              <option value="none">None</option>
                            </select>
                          </td>

                          {/* Vehicle Number */}
                          <td className="py-3.5 px-3">
                            {row.vehicleMode === 'select' && (
                              <select
                                value={row.vehicleNumber}
                                onChange={(e) => handleBulkRowChange(index, 'vehicleNumber', e.target.value)}
                                className="w-full border border-slate-300 rounded-xl p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-[15px] font-semibold text-slate-800"
                              >
                                <option value="">Select</option>
                                {rowVehicles.map((v) => (
                                  <option key={v._id || v.number} value={v.number}>{v.number}</option>
                                ))}
                              </select>
                            )}
                            {row.vehicleMode === 'new' && (
                              <input
                                type="text"
                                value={row.vehicleNumber}
                                onChange={(e) => handleBulkRowChange(index, 'vehicleNumber', e.target.value)}
                                className="w-full border border-slate-300 rounded-xl p-2.5 uppercase focus:ring-2 focus:ring-blue-500 outline-none text-[15px] bg-white font-semibold text-slate-800"
                                placeholder="TN 74 AE 2003"
                              />
                            )}
                            {row.vehicleMode === 'none' && (
                              <input
                                type="text"
                                disabled
                                value="None"
                                className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 text-slate-400 text-[15px] cursor-not-allowed text-center outline-none font-semibold"
                              />
                            )}
                          </td>

                          {/* Quarry/Material */}
                          <td className="py-3.5 px-3">
                            <select
                              required
                              value={row.quarryName}
                              onChange={(e) => handleBulkRowChange(index, 'quarryName', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                            >
                              <option value="" disabled>Select</option>
                              {materials.map(m => (
                                <option key={m._id} value={m.name}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Unit */}
                          <td className="py-3.5 px-3">
                            <select
                              value={row.unitType}
                              onChange={(e) => handleBulkRowChange(index, 'unitType', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                            >
                              <option value="tons">tons</option>
                              <option value="units">units</option>
                            </select>
                          </td>

                          {/* Quantity */}
                          <td className="py-3.5 px-3">
                            <input
                              type="number"
                              required
                              step="any"
                              value={row.quantity}
                              onChange={(e) => handleBulkRowChange(index, 'quantity', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold text-slate-800"
                              placeholder="Qty"
                            />
                          </td>

                          {/* Price per unit */}
                          <td className="py-3.5 px-3">
                            <input
                              type="number"
                              required
                              step="any"
                              value={row.price}
                              onChange={(e) => handleBulkRowChange(index, 'price', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (index === bulkRows.length - 1) {
                                    addBulkRow();
                                  }
                                }
                              }}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold text-slate-800"
                              placeholder="Price"
                            />
                          </td>

                          {/* Total */}
                          <td className="py-3.5 px-3 text-right font-extrabold text-slate-800 text-[15px]">
                            ₹{rowTotal.toLocaleString()}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => duplicateBulkRow(index)}
                                title="Duplicate Row"
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              >
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => removeBulkRow(index)}
                                title="Delete Row"
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                              >
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Grid Actions & Sticky Summary Footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-inner">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addBulkRow}
                    className="px-6 py-2.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-xl text-base font-bold transition cursor-pointer shadow-sm"
                  >
                    + Add Row
                  </button>
                </div>

                {/* Summary calculation */}
                <div className="flex flex-wrap items-center gap-8 text-base text-slate-600 bg-white px-6 py-3 border border-slate-200 rounded-xl shadow-sm">
                  <div>
                    Total Rows: <span className="font-extrabold text-slate-800">{bulkRows.length}</span>
                  </div>
                  <div>
                    Total Qty: <span className="font-extrabold text-slate-800">
                      {bulkRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    Total Amount: <span className="font-extrabold text-emerald-600">
                      ₹{bulkRows.reduce((sum, r) => {
                        const price = Number(r.price) || 0;
                        const qty = Number(r.quantity) || 0;
                        return sum + roundToNearestTen(qty * price);
                      }, 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="px-6 py-2.5 text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-base font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-base font-bold transition shadow-md hover:shadow-lg cursor-pointer"
                  >
                    Save Batch Loads
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
};

export default LoadManagement;
