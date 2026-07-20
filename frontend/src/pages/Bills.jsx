import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { HistoryIcon, ChevronDownIcon, DocumentIcon, EditIcon, TrashIcon } from '../components/Icons';
import SearchableSelect from '../components/SearchableSelect';
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
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkRows, setBulkRows] = useState([]);
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
    const search = filters.search.trim().toLowerCase();    if (search) {
      result = result.filter((bill) => {
        const customer = customers.find(c => c._id === (bill.customer?._id || bill.customer));
        const customerName = customer ? customer.name : (bill.customerNameSnapshot || '');
        const vehicle = bill.vehicleNumber || '';
        const material = bill.materialNameSnapshot || '';
        const billNum = bill.billNumber || '';
        return customerName.toLowerCase().includes(search) ||
               vehicle.toLowerCase().includes(search) ||
               material.toLowerCase().includes(search) ||
               billNum.toLowerCase().includes(search);
      });

      result.sort((a, b) => {
        const customerA = customers.find(c => c._id === (a.customer?._id || a.customer));
        const nameA = customerA ? customerA.name : (a.customerNameSnapshot || '');
        const customerB = customers.find(c => c._id === (b.customer?._id || b.customer));
        const nameB = customerB ? customerB.name : (b.customerNameSnapshot || '');
        const aStarts = nameA.toLowerCase().startsWith(search);
        const bStarts = nameB.toLowerCase().startsWith(search);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
    }

    if (filters.customerId) {
      result = result.filter((bill) => {
        const billCustId = bill.customer?._id || bill.customer || '';
        return String(billCustId) === filters.customerId;
      });
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
      const d = new Date(filters.weekStart + 'T00:00:00');
      const day = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - day);
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
  }, [bills, filters, customers]);

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
      const d = new Date(filters.weekStart + 'T00:00:00');
      const day = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - day);
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

  const downloadSummaryPdf = async () => {
    const listToExport = filteredBills;
    if (listToExport.length === 0 && !filters.customerId) return;

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

    if (filters.mode === 'particular_date' && filters.particularDate) {
      rangeLabel = `Date: ${formatDateTime(filters.particularDate).date}`;
      queryParams = { startDate: filters.particularDate, endDate: filters.particularDate };
      startDateVal = new Date(filters.particularDate + 'T00:00:00');
      endDateVal = new Date(filters.particularDate + 'T23:59:59');
    } else if (filters.mode === 'selected_dates' && filters.startDate && filters.endDate) {
      rangeLabel = `${formatDateTime(filters.startDate).date} to ${formatDateTime(filters.endDate).date}`;
      queryParams = { startDate: filters.startDate, endDate: filters.endDate };
      startDateVal = new Date(filters.startDate + 'T00:00:00');
      endDateVal = new Date(filters.endDate + 'T23:59:59');
    } else if (filters.mode === 'month' && filters.month) {
      rangeLabel = `Month: ${filters.month}`;
      const [year, month] = filters.month.split('-');
      const startStr = `${year}-${month}-01`;
      const endStr = toYMD(new Date(year, month, 0));
      queryParams = { startDate: startStr, endDate: endStr };
      startDateVal = new Date(startStr + 'T00:00:00');
      endDateVal = new Date(endStr + 'T23:59:59');
    } else if (filters.mode === 'week' && filters.weekStart) {
      const d = new Date(filters.weekStart + 'T00:00:00');
      const day = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      rangeLabel = `Week: ${formatDateTime(start).date} to ${formatDateTime(end).date}`;
      queryParams = { startDate: toYMD(start), endDate: toYMD(end) };
      startDateVal = new Date(start.setHours(0, 0, 0, 0));
      endDateVal = new Date(end.setHours(23, 59, 59, 999));
    }

    const selectedCustomer = customers.find((c) => c._id === filters.customerId);
    const customerName = selectedCustomer ? selectedCustomer.name : '';

    if (!filters.customerId) {
      // 1. ALL CUSTOMERS SUMMARY REPORT
      centerText('CUSTOMER BILL SUMMARY REPORT', 19, 12, 'bold');
      centerText(rangeLabel, 26, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 29, pageWidth - 14, 29);

      let outstandingData = [];
      try {
        const params = new URLSearchParams(queryParams);
        const { data } = await api.get(`/reports/outstanding?${params.toString()}`);
        outstandingData = data || [];
      } catch (err) {
        console.error('Error fetching outstanding report for PDF', err);
      }

      // Aggregate counts from listToExport
      const billCountMap = {};
      listToExport.forEach(b => {
        const cid = (b.customer?._id || b.customer || '').toString();
        if (cid) {
          billCountMap[cid] = (billCountMap[cid] || 0) + 1;
        }
      });

      // Filter active customers (include if they have bills OR pending dues in the period)
      const activeCustomers = outstandingData.filter(item => 
        (billCountMap[item.customerId] || 0) > 0 || (item.outstandingBalance || 0) > 0
      );

      const head = [['S.NO', 'CUSTOMER NAME', 'NO. OF BILLS', 'TOTAL BILLED AMOUNT (Rs.)', 'PENDING AMOUNT (Rs.)']];
      const body = activeCustomers.map((item, idx) => {
        const billed = item.totalBillsAmount || 0;
        const pending = Math.max(0, item.outstandingBalance || 0);
        const pendingStr = pending > 0 ? `Rs. ${Number(pending).toLocaleString()}` : 'Nil';
        return [
          idx + 1,
          item.customerName || '—',
          billCountMap[item.customerId] || 0,
          `Rs. ${Number(billed).toLocaleString()}`,
          pendingStr
        ];
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
      activeCustomers.forEach(c => {
        grandBilled += c.totalBillsAmount || 0;
        grandPending += Math.max(0, c.outstandingBalance || 0);
      });

      const grandHead = [['GRAND SUMMARY', 'AMOUNT (Rs.)']];
      const grandBody = [
        ['GRAND TOTAL BILLED', grandBilled.toLocaleString()],
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

      doc.save('customer_bills_summary.pdf');
    } else {
      // 2. EACH CUSTOMER STATEMENT REPORT
      const titleText = `${customerName.toUpperCase()} BILL STATEMENT`;
      centerText(titleText, 19, 12, 'bold');
      centerText(rangeLabel, 26, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 29, pageWidth - 14, 29);

      // Fetch full history to calculate old balance correctly
      let fullLedger = [];
      let fullPayments = [];
      try {
        const { data } = await api.get(`/customers/${filters.customerId}/history`);
        fullLedger = data.ledger || [];
        fullPayments = data.payments || [];
      } catch (err) {
        console.error('Error fetching customer history for PDF', err);
      }

      // Calculate balance values
      const sortedLedger = fullLedger;
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
          if (entry.transactionType === 'Bill Created') {
            grandTotal += entry.debit;
          } else if (entry.transactionType === 'Payment Received') {
            amountReceived += entry.credit;
          }
        }
      });

      const totalAmount = grandTotal + oldBalance;
      const totalBalance = totalAmount - amountReceived;

      // Table 1: Individual bills list
      const head = [['S.NO', 'DATE', 'VEHICLE NUMBER', 'MATERIAL', 'QTY', 'UNIT', 'RATE (Rs.)', 'PASS (Rs.)', 'TOTAL (Rs.)']];
      const sortedList = [...listToExport].sort((a, b) => new Date(a.date) - new Date(b.date));
      const body = sortedList.map((b, idx) => [
        idx + 1,
        new Date(b.date).toLocaleDateString(),
        b.vehicleNumber || '—',
        b.materialNameSnapshot || '—',
        Number(b.quantity || 0).toFixed(2),
        b.quantityUnit || 'ton',
        Number(b.pricePerUnit || 0).toLocaleString(),
        Number(b.passAmount || 0).toLocaleString(),
        (Number(b.totalAmount || 0) + Number(b.passAmount || 0)).toLocaleString()
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
        ['GRAND TOTAL BILLED', `Rs. ${Number(grandTotal).toLocaleString()}`]
      ];

      if (oldBalance > 0) {
        totalsBody.push(['PREVIOUS BALANCE', `Rs. ${Number(oldBalance).toLocaleString()}`]);
        totalsBody.push(['GRAND TOTAL', `Rs. ${Number(grandTotalSum).toLocaleString()}`]);
      }

      totalsBody.push(['AMOUNT RECEIVED', `Rs. ${Number(amountReceived).toLocaleString()}`]);

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
        doc.text('PAYMENTS RECEIVED IN TIMELINE:', 14, y - 4);

        const payHead = [['S.NO', 'DATE', 'PAYMENT NUMBER', 'AMOUNT PAID (Rs.)', 'RECEIVED BY', 'NOTES']];
        const payBody = paymentsInTimeline.map((p, idx) => [
          idx + 1,
          formatDateTime(p.paymentDate || p.date).date,
          p.paymentNumber || '—',
          Number(p.amount || 0).toLocaleString(),
          p.method || p.receivedBy || '—',
          p.note || p.notes || '—'
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

      const filePrefix = customerName ? customerName.replaceAll(' ', '_') : 'customer';
      doc.save(`${filePrefix}_statement.pdf`);
    }
  };

  const downloadPaymentsPdf = async () => {
    // 1. Calculate dates for range label and query params
    let rangeLabel = 'All Time';
    let queryParams = {};
    let startDateVal = null;
    let endDateVal = null;

    if (filters.mode === 'particular_date' && filters.particularDate) {
      rangeLabel = `Date: ${formatDateTime(filters.particularDate).date}`;
      queryParams = { startDate: filters.particularDate, endDate: filters.particularDate };
      startDateVal = new Date(filters.particularDate + 'T00:00:00');
      endDateVal = new Date(filters.particularDate + 'T23:59:59');
    } else if (filters.mode === 'selected_dates' && filters.startDate && filters.endDate) {
      rangeLabel = `${formatDateTime(filters.startDate).date} to ${formatDateTime(filters.endDate).date}`;
      queryParams = { startDate: filters.startDate, endDate: filters.endDate };
      startDateVal = new Date(filters.startDate + 'T00:00:00');
      endDateVal = new Date(filters.endDate + 'T23:59:59');
    } else if (filters.mode === 'month' && filters.month) {
      rangeLabel = `Month: ${filters.month}`;
      const [year, month] = filters.month.split('-');
      const startStr = `${year}-${month}-01`;
      const endStr = toYMD(new Date(year, month, 0));
      queryParams = { startDate: startStr, endDate: endStr };
      startDateVal = new Date(startStr + 'T00:00:00');
      endDateVal = new Date(endStr + 'T23:59:59');
    } else if (filters.mode === 'week' && filters.weekStart) {
      const d = new Date(filters.weekStart + 'T00:00:00');
      const day = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      rangeLabel = `Week: ${formatDateTime(start).date} to ${formatDateTime(end).date}`;
      queryParams = { startDate: toYMD(start), endDate: toYMD(end) };
      startDateVal = new Date(start.setHours(0, 0, 0, 0));
      endDateVal = new Date(end.setHours(23, 59, 59, 999));
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

    const selectedCustomer = customers.find((c) => c._id === filters.customerId);
    const customerName = selectedCustomer ? selectedCustomer.name : '';

    let payments = [];

    if (!filters.customerId) {
      // MODE A: ALL CUSTOMERS PAYMENTS REPORT
      try {
        const params = new URLSearchParams(queryParams);
        const { data } = await api.get(`/reports/payments?${params.toString()}`);
        payments = data || [];
      } catch (err) {
        console.error('Error fetching payments report for PDF', err);
        alert('Error fetching payments report');
        return;
      }

      if (payments.length === 0) {
        alert('No payments found for the selected timeline.');
        return;
      }

      centerText('CUSTOMER PAYMENTS SUMMARY REPORT', 19, 12, 'bold');
      centerText(rangeLabel, 26, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 29, pageWidth - 14, 29);

      const sortedPayments = [...payments].sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));

      const head = [['S.NO', 'DATE', 'RECEIPT NO', 'CUSTOMER NAME', 'RECEIVED BY', 'NOTES', 'AMOUNT (Rs.)']];
      const body = sortedPayments.map((p, idx) => [
        idx + 1,
        new Date(p.paymentDate).toLocaleDateString(),
        p.paymentNumber || '—',
        p.customerName || '—',
        p.receivedBy || '—',
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

      // Group by customer and sum amounts
      const customerTotals = {};
      sortedPayments.forEach(p => {
        const name = p.customerName || 'Unknown';
        customerTotals[name] = (customerTotals[name] || 0) + (p.amountPaid || 0);
      });

      const summaryTableHead = [['CUSTOMER NAME', 'TOTAL PAYMENTS RECEIVED (Rs.)']];
      const summaryTableBody = Object.entries(customerTotals).map(([name, total]) => [
        name,
        Number(total).toLocaleString()
      ]);

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Customer-wise Payment Summary:', 14, y - 4);

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
        ['GRAND TOTAL PAYMENTS RECEIVED', totalPaid.toLocaleString()]
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

      doc.save('customer_payments_summary.pdf');
    } else {
      // MODE B: PARTICULAR CUSTOMER PAYMENTS REPORT
      try {
        const params = new URLSearchParams(queryParams);
        const { data } = await api.get(`/customers/${filters.customerId}/history?${params.toString()}`);
        payments = data.payments || [];
      } catch (err) {
        console.error('Error fetching customer history for payments PDF', err);
        alert('Error fetching customer history');
        return;
      }

      if (payments.length === 0) {
        alert(`No payments found for ${customerName} in the selected timeline.`);
        return;
      }

      centerText(`${customerName.toUpperCase()} PAYMENT STATEMENT`, 19, 12, 'bold');
      centerText(rangeLabel, 26, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 29, pageWidth - 14, 29);

      const sortedPayments = [...payments].sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));

      const head = [['S.NO', 'DATE', 'RECEIPT NO', 'RECEIVED BY', 'NOTES', 'AMOUNT (Rs.)']];
      const body = sortedPayments.map((p, idx) => [
        idx + 1,
        new Date(p.paymentDate).toLocaleDateString(),
        p.paymentNumber || '—',
        p.receivedBy || '—',
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
        ['TOTAL PAYMENTS RECEIVED', totalPaid.toLocaleString()]
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

      doc.save(`${customerName.replaceAll(' ', '_')}_payments_statement.pdf`);
    }
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

  const emptyBulkRow = () => ({
    id: Math.random().toString(36).substring(2, 9),
    customer: '',
    vehicleNumber: '',
    vehicleMode: 'select',
    material: '',
    quantity: '',
    quantityUnit: 'ton',
    useManualPrice: false,
    manualPrice: '',
    passAmount: ''
  });

  const initBulkEntry = () => {
    setBulkDate(new Date().toISOString().split('T')[0]);
    setBulkRows([emptyBulkRow()]);
    setIsBulkModalOpen(true);
  };

  const handleBulkRowChange = (index, field, value) => {
    const updatedRows = [...bulkRows];
    updatedRows[index] = { ...updatedRows[index], [field]: value };

    if (field === 'vehicleMode') {
      updatedRows[index].vehicleNumber = '';
    }

    if (field === 'vehicleNumber') {
      updatedRows[index].vehicleNumber = formatVehicleInput(value);
    }

    if (field === 'material' || field === 'quantityUnit') {
      const selectedMat = materials.find(m => m._id === updatedRows[index].material);
      if (selectedMat) {
        const unit = updatedRows[index].quantityUnit === 'ton' ? 'ton' : 'unit';
        const defaultPrice = unit === 'ton'
          ? (selectedMat.pricePerTon ?? selectedMat.currentPrice)
          : selectedMat.currentPrice;
        
        updatedRows[index].manualPrice = defaultPrice;
        updatedRows[index].useManualPrice = true;
      }
    }

    setBulkRows(updatedRows);
  };

  const addBulkRow = () => {
    setBulkRows([...bulkRows, emptyBulkRow()]);
  };

  const removeBulkRow = (index) => {
    if (bulkRows.length > 1) {
      setBulkRows(bulkRows.filter((_, i) => i !== index));
    } else {
      setBulkRows([emptyBulkRow()]);
    }
  };

  const duplicateBulkRow = (index) => {
    const rowToClone = bulkRows[index];
    const newRow = {
      ...rowToClone,
      id: Math.random().toString(36).substring(2, 9),
      vehicleNumber: ''
    };
    const updatedRows = [...bulkRows];
    updatedRows.splice(index + 1, 0, newRow);
    setBulkRows(updatedRows);
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    
    const validRows = [];
    for (let i = 0; i < bulkRows.length; i++) {
      const row = bulkRows[i];
      if (!row.customer) {
        alert(`Please select a customer for row ${i + 1}`);
        return;
      }
      if (!row.material) {
        alert(`Please select a material for row ${i + 1}`);
        return;
      }
      if (!row.quantity || Number(row.quantity) <= 0) {
        alert(`Please enter a valid quantity for row ${i + 1}`);
        return;
      }

      const vehicle = row.vehicleMode === 'none' ? '' : (row.vehicleNumber || '');
      if (vehicle && !isValidVehicleNumber(vehicle)) {
        alert(`Invalid vehicle number at row ${i + 1}. Must be TN 74 2003, TN 74 AE 2003, or TMR 7177 format`);
        return;
      }

      const selectedMat = materials.find(m => m._id === row.material);
      const unit = row.quantityUnit === 'ton' ? 'ton' : 'unit';
      const defaultPrice = unit === 'ton'
        ? (selectedMat?.pricePerTon ?? selectedMat?.currentPrice)
        : selectedMat?.currentPrice;
      const effectivePrice = row.useManualPrice && row.manualPrice !== '' ? Number(row.manualPrice) : defaultPrice;

      validRows.push({
        customerId: row.customer,
        vehicleNumber: vehicle,
        materialId: row.material,
        quantity: Number(row.quantity),
        quantityUnit: unit,
        pricePerUnit: effectivePrice,
        passAmount: row.passAmount ? Number(row.passAmount) : 0
      });
    }

    try {
      const payload = {
        date: new Date(`${bulkDate}T12:00`).toISOString(),
        bills: validRows
      };

      await api.post('/bills/bulk', payload);
      setIsBulkModalOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving bulk bills', error);
      alert('Error saving bills: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const buildBillDate = () => {
    if (!canWrite || !formData.customDate) return undefined;
    return new Date(`${formData.customDate}T12:00`).toISOString();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const vehicle = formData.vehicleMode === 'none' ? '' : (formData.vehicleNumber || '');
    if (vehicle && !isValidVehicleNumber(vehicle)) {
      alert('Vehicle number must be TN 74 2003, TN 74 AE 2003, or TMR 7177 format');
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
      alert('Vehicle number must be TN 74 2003, TN 74 AE 2003, or TMR 7177 format');
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

        <div className="flex flex-col gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 w-full lg:w-auto shrink-0">
          <div className="flex flex-wrap items-end gap-3 w-full">
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
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Filter Mode</label>
              <select
                value={filters.mode}
                onChange={(e) => {
                  const newMode = e.target.value;
                  setFilters((prev) => {
                    const next = { ...prev, mode: newMode };
                    const todayStr = toYMD(new Date());
                    if (newMode === 'particular_date' && !next.particularDate) {
                      next.particularDate = todayStr;
                    } else if (newMode === 'month' && !next.month) {
                      next.month = todayStr.substring(0, 7);
                    } else if (newMode === 'week' && !next.weekStart) {
                      const d = new Date();
                      const day = d.getDay();
                      const sunday = new Date(d);
                      sunday.setDate(d.getDate() - day);
                      next.weekStart = toYMD(sunday);
                    } else if (newMode === 'selected_dates') {
                      if (!next.startDate) {
                        const d = new Date();
                        const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
                        next.startDate = toYMD(firstDay);
                      }
                      if (!next.endDate) {
                        next.endDate = todayStr;
                      }
                    }
                    return next;
                  });
                }}
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

            <div className="flex flex-wrap gap-2 w-full sm:w-auto ml-auto">
              <button
                type="button"
                onClick={downloadSummaryPdf}
                disabled={filteredBills.length === 0 || loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center inline-flex items-center cursor-pointer animate-none"
              >
                Download Summary PDF
              </button>
              <button
                type="button"
                onClick={downloadPaymentsPdf}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md w-full sm:w-auto justify-center inline-flex items-center cursor-pointer"
              >
                Payments PDF
              </button>
              {canCreateBills && (
                <>
                  <button 
                    onClick={() => { setFormData(emptyForm()); setIsModalOpen(true); }}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-md inline-flex items-center justify-center w-full sm:w-auto cursor-pointer"
                  >
                    + Generate Bill
                  </button>
                  <button 
                    onClick={initBulkEntry}
                    className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition shadow-md inline-flex items-center justify-center w-full sm:w-auto cursor-pointer"
                  >
                    + Bulk Entry
                  </button>
                </>
              )}
            </div>
          </div>

          {['particular_date', 'month', 'week', 'selected_dates'].includes(filters.mode) && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg animate-in slide-in-from-top-1 duration-200 w-full">
              {filters.mode === 'particular_date' && (
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date:</span>
                  <input
                    type="date"
                    value={filters.particularDate}
                    onChange={(e) => setFilters((prev) => ({ ...prev, particularDate: e.target.value }))}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-48"
                  />
                </div>
              )}

              {filters.mode === 'month' && (
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Month:</span>
                  <input
                    type="month"
                    value={filters.month}
                    onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-48"
                  />
                </div>
              )}

              {filters.mode === 'week' && (
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Week Start:</span>
                  <input
                    type="date"
                    value={filters.weekStart}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        const d = new Date(val + 'T00:00:00');
                        const day = d.getDay();
                        const sunday = new Date(d);
                        sunday.setDate(d.getDate() - day);
                        setFilters((prev) => ({ ...prev, weekStart: toYMD(sunday) }));
                      } else {
                        setFilters((prev) => ({ ...prev, weekStart: '' }));
                      }
                    }}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-48"
                  />
                </div>
              )}

              {filters.mode === 'selected_dates' && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date Range:</span>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full sm:w-40"
                  />
                  <span className="text-slate-400 text-sm">to</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
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
           <div className="p-8 text-center text-slate-500">Loading bills...</div>
        ) : filteredBills.length === 0 ? (
           <div className="p-8 text-center text-slate-500 border-t border-slate-100 italic">No bills generated yet.</div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0 min-w-0">
            <table className="data-table">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 shadow-sm z-10 w-full min-w-max">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 font-semibold whitespace-nowrap">Date</th>
                  <th className="p-4 font-semibold">Customer</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Vehicle No.</th>
                  <th className="p-4 font-semibold whitespace-nowrap">Material (Qty)</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">Subtotal (₹)</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">PASS (₹)</th>
                  <th className="p-4 font-semibold whitespace-nowrap text-right">Grand Total (₹)</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="whitespace-nowrap">
                {filteredBills.map((bill) => {
                  const billDateTime = formatDateTime(bill.date);
                  return (
                    <tr key={bill._id}>
                      <td className="p-4 text-slate-600 font-medium whitespace-nowrap">{billDateTime.date}</td>
                      <td className="p-4 text-slate-800 font-semibold">
                        {customers.find(c => c._id === (bill.customer?._id || bill.customer))?.name || bill.customerNameSnapshot}
                      </td>
                      <td className="p-4 text-slate-600"><span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 text-xs font-mono whitespace-nowrap">{bill.vehicleNumber || '—'}</span></td>
                      <td className="p-4 text-slate-600 text-sm">
                        <div className="font-medium text-slate-800">{bill.materialNameSnapshot}</div>
                        <div className="text-xs text-slate-500">{Number(bill.quantity).toFixed(2)} {bill.quantityUnit || 'ton'}s @ ₹{bill.pricePerUnit}</div>
                        {bill.isBackdated && <div className="text-xs text-amber-600 font-medium">Backdated</div>}
                      </td>
                      <td className="p-4 text-right text-slate-600">
                        ₹{Number(bill.totalAmount || 0).toLocaleString()}
                      </td>
                      <td className="p-4 text-right text-slate-600">
                        ₹{Number(bill.passAmount || 0).toLocaleString()}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-800">
                        ₹{(Number(bill.totalAmount || 0) + Number(bill.passAmount || 0)).toLocaleString()}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Generate Bills Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] xl:max-w-[92vw] overflow-hidden flex flex-col max-h-[96vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Daily Log Sheet (Bulk Entry)</h2>
                <p className="text-sm text-slate-500 mt-1">Quickly enter all loads of a day in one spreadsheet view</p>
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
                      <th className="py-4 px-3 min-w-[280px]">Customer *</th>
                      <th className="py-4 px-3 w-[140px]">Vehicle Mode</th>
                      <th className="py-4 px-3 min-w-[180px]">Vehicle Number</th>
                      <th className="py-4 px-3 min-w-[220px]">Material *</th>
                      <th className="py-4 px-3 w-[110px]">Unit</th>
                      <th className="py-4 px-3 w-[110px]">Qty *</th>
                      <th className="py-4 px-3 w-[130px]">Price/Unit *</th>
                      <th className="py-4 px-3 w-[120px]">Pass Fee</th>
                      <th className="py-4 px-3 w-[140px] text-right">Row Total</th>
                      <th className="py-4 px-3 w-24 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkRows.map((row, index) => {
                      const rowCustomer = customers.find(c => c._id === row.customer);
                      const rowVehicles = rowCustomer?.vehicles || [];
                      const selectedMat = materials.find(m => m._id === row.material);
                      
                      // Calculate row total
                      const unit = row.quantityUnit === 'ton' ? 'ton' : 'unit';
                      const defaultPrice = selectedMat 
                        ? (unit === 'ton' ? (selectedMat.pricePerTon ?? selectedMat.currentPrice) : selectedMat.currentPrice)
                        : 0;
                      const price = row.useManualPrice && row.manualPrice !== '' ? Number(row.manualPrice) : defaultPrice;
                      const qty = Number(row.quantity) || 0;
                      const pass = Number(row.passAmount) || 0;
                      const rowTotal = roundToNearestTen(qty * price) + pass;

                      return (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition duration-150">
                          <td className="py-3.5 px-3 text-center text-slate-400 font-bold text-base">{index + 1}</td>
                          
                          {/* Customer searchable select */}
                          <td className="py-3.5 px-3">
                            <SearchableSelect
                              options={customers.map(c => ({ value: c._id, label: c.name }))}
                              value={row.customer}
                              onChange={(val) => handleBulkRowChange(index, 'customer', val)}
                              placeholder="Customer"
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

                          {/* Material */}
                          <td className="py-3.5 px-3">
                            <select
                              required
                              value={row.material}
                              onChange={(e) => handleBulkRowChange(index, 'material', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                            >
                              <option value="" disabled>Select</option>
                              {materials.map(m => (
                                <option key={m._id} value={m._id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Unit */}
                          <td className="py-3.5 px-3">
                            <select
                              value={row.quantityUnit}
                              onChange={(e) => handleBulkRowChange(index, 'quantityUnit', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                            >
                              <option value="ton">ton</option>
                              <option value="unit">unit</option>
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
                              value={row.manualPrice}
                              onChange={(e) => handleBulkRowChange(index, 'manualPrice', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold text-slate-800"
                              placeholder="Price"
                            />
                          </td>

                          {/* Pass Fee */}
                          <td className="py-3.5 px-3">
                            <input
                              type="number"
                              step="any"
                              value={row.passAmount}
                              onChange={(e) => handleBulkRowChange(index, 'passAmount', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (index === bulkRows.length - 1) {
                                    addBulkRow();
                                  }
                                }
                              }}
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold text-slate-800"
                              placeholder="Pass"
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
                        const selectedMat = materials.find(m => m._id === r.material);
                        const unit = r.quantityUnit === 'ton' ? 'ton' : 'unit';
                        const defaultPrice = selectedMat 
                          ? (unit === 'ton' ? (selectedMat.pricePerTon ?? selectedMat.currentPrice) : selectedMat.currentPrice)
                          : 0;
                        const price = r.useManualPrice && r.manualPrice !== '' ? Number(r.manualPrice) : defaultPrice;
                        const qty = Number(r.quantity) || 0;
                        const pass = Number(r.passAmount) || 0;
                        return sum + roundToNearestTen(qty * price) + pass;
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
                    Save Batch Bills
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
                    <div className="flex-1">
                      <SearchableSelect
                        options={customers.map(c => ({ value: c._id, label: c.name }))}
                        value={formData.customer}
                        onChange={(val) => setFormData(prev => ({ ...prev, customer: val }))}
                        placeholder="Select Customer"
                        required
                      />
                    </div>
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
                        {m.name} (₹{m.currentPrice}/unit | ₹{m.pricePerTon ?? m.currentPrice}/ton)
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
                  <span className="ml-1 font-semibold text-slate-700">₹{selectedMaterialPrice.toLocaleString()} / {formData.quantityUnit}</span>
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
