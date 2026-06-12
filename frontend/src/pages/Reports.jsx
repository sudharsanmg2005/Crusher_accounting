import React, { useEffect, useState, useMemo } from 'react';
import api from '../api';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatDateTime } from '../utils/dateTime';

const Reports = () => {
  const [filterType, setFilterType] = useState('month'); // today | week | month | custom
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeReportTab, setActiveReportTab] = useState('dashboard'); // dashboard | outstanding | payments | partial | statement

  // Customers list for dropdown
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  
  // Search & Filter state for Outstanding report
  const [outstandingSearch, setOutstandingSearch] = useState('');
  const [outstandingSort, setOutstandingSort] = useState('name-asc'); // name-asc | name-desc | balance-desc | balance-asc
  const [outstandingFilter, setOutstandingFilter] = useState('all'); // all | has-outstanding

  // Data states
  const [dashboardData, setDashboardData] = useState(null);
  const [outstandingData, setOutstandingData] = useState([]);
  const [paymentsData, setPaymentsData] = useState([]);
  const [partialPaymentsData, setPartialPaymentsData] = useState([]);
  const [statementData, setStatementData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedPaymentNo, setExpandedPaymentNo] = useState(null);

  // Initialize dates
  useEffect(() => {
    const today = new Date();
    const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    if (filterType === 'today') {
      setStartDate(toYMD(today));
      setEndDate(toYMD(today));
    } else if (filterType === 'week') {
      const day = today.getDay();
      const start = new Date(today);
      start.setDate(today.getDate() - day);
      setStartDate(toYMD(start));
      setEndDate(toYMD(today));
    } else if (filterType === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(toYMD(firstDay));
      setEndDate(toYMD(lastDay));
    }
  }, [filterType]);

  // Fetch customers list for Statement dropdown
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const { data } = await api.get('/customers');
        setCustomers(data);
        if (data.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(data[0]._id);
        }
      } catch (err) {
        console.error('Error fetching customers', err);
      }
    };
    fetchCustomers();
  }, []);

  // Fetch report data when date filters or active tab change
  const fetchReportData = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filter: filterType,
        startDate,
        endDate
      });

      if (activeReportTab === 'dashboard') {
        const { data } = await api.get(`/reports/dashboard?${params.toString()}`);
        setDashboardData(data);
      } else if (activeReportTab === 'outstanding') {
        const { data } = await api.get(`/reports/outstanding?${params.toString()}`);
        setOutstandingData(data);
      } else if (activeReportTab === 'payments') {
        const { data } = await api.get(`/reports/payments?${params.toString()}`);
        setPaymentsData(data);
      } else if (activeReportTab === 'partial') {
        const { data } = await api.get(`/reports/partial-payments?${params.toString()}`);
        setPartialPaymentsData(data);
      } else if (activeReportTab === 'statement' && selectedCustomerId) {
        const { data } = await api.get(`/reports/customer-statement/${selectedCustomerId}?${params.toString()}`);
        setStatementData(data);
      }
    } catch (err) {
      console.error('Error fetching report', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate, activeReportTab, selectedCustomerId]);

  // Outstanding Report processing (Search, Sort, Filter)
  const processedOutstanding = useMemo(() => {
    let result = [...outstandingData];

    // Search filter
    const search = outstandingSearch.trim().toLowerCase();
    if (search) {
      result = result.filter(r => 
        (r.customerName || '').toLowerCase().includes(search) || 
        (r.phone || '').includes(search)
      );
    }

    // Outstanding filter
    if (outstandingFilter === 'has-outstanding') {
      result = result.filter(r => r.outstandingBalance > 1e-4);
    }

    // Sort
    result.sort((a, b) => {
      if (outstandingSort === 'name-asc') {
        return (a.customerName || '').localeCompare(b.customerName || '');
      } else if (outstandingSort === 'name-desc') {
        return (b.customerName || '').localeCompare(a.customerName || '');
      } else if (outstandingSort === 'balance-desc') {
        return b.outstandingBalance - a.outstandingBalance;
      } else if (outstandingSort === 'balance-asc') {
        return a.outstandingBalance - b.outstandingBalance;
      }
      return 0;
    });

    return result;
  }, [outstandingData, outstandingSearch, outstandingSort, outstandingFilter]);

  const togglePaymentDetails = (payNo) => {
    setExpandedPaymentNo(prev => (prev === payNo ? null : payNo));
  };

  // PDF Export
  const downloadPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const dateRangeStr = `${startDate} to ${endDate}`;

    const centerText = (text, y, fontSize = 10, fontStyle = 'normal') => {
      doc.setFontSize(fontSize);
      doc.setFont(undefined, fontStyle);
      const w = doc.getTextWidth(text);
      doc.text(text, (pageWidth - w) / 2, y);
    };

    if (activeReportTab === 'statement' && statementData) {
      // 1. Customer Statement PDF
      centerText(`${statementData.customer?.name} - Statement of Account`, 18, 12, 'bold');
      centerText(`Period: ${dateRangeStr}`, 24, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 28, pageWidth - 14, 28);

      // Customer Info
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text('Customer Information:', 14, 35);
      doc.setFont(undefined, 'normal');
      doc.text(`Phone: ${statementData.customer?.phone || '—'}`, 14, 40);
      doc.text(`Address: ${statementData.customer?.address || '—'}`, 14, 45);

      // Bills Table
      doc.setFont(undefined, 'bold');
      doc.text('BILLS LIST', 14, 55);
      const billsHead = [['Bill Number', 'Date', 'Total Amount', 'Allocated', 'Pending']];
      const billsBody = statementData.bills.map(b => [
        b.billNumber,
        formatDateTime(b.date).date,
        `₹${b.totalAmount.toLocaleString()}`,
        `₹${b.allocatedAmount.toLocaleString()}`,
        `₹${b.pendingAmount.toLocaleString()}`
      ]);
      autoTable(doc, {
        head: billsHead,
        body: billsBody,
        startY: 58,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] }
      });

      // Payments Table
      let y = doc.lastAutoTable.finalY + 10;
      if (y > pageHeight - 50) { doc.addPage(); y = 15; }
      doc.setFont(undefined, 'bold');
      doc.text('PAYMENTS HISTORY', 14, y);
      const payHead = [['Payment Number', 'Payment Date', 'Amount Paid', 'Notes']];
      const payBody = statementData.payments.map(p => [
        p.paymentNumber,
        formatDateTime(p.paymentDate).date,
        `₹${p.amountPaid.toLocaleString()}`,
        p.notes || '—'
      ]);
      autoTable(doc, {
        head: payHead,
        body: payBody,
        startY: y + 3,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] }
      });

      // Ledger Table
      y = doc.lastAutoTable.finalY + 10;
      if (y > pageHeight - 50) { doc.addPage(); y = 15; }
      doc.setFont(undefined, 'bold');
      doc.text('RUNNING LEDGER', 14, y);
      const ledgerHead = [['Date', 'Reference', 'Debit (Bill)', 'Credit (Pay)', 'Running Balance']];
      const ledgerBody = statementData.ledger.map(l => [
        formatDateTime(l.date).date,
        l.reference,
        l.debit > 0 ? `₹${l.debit.toLocaleString()}` : '—',
        l.credit > 0 ? `₹${l.credit.toLocaleString()}` : '—',
        `₹${l.balance.toLocaleString()}`
      ]);
      autoTable(doc, {
        head: ledgerHead,
        body: ledgerBody,
        startY: y + 3,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [100, 116, 139], textColor: [255, 255, 255] }
      });

      // Statement Summary
      y = doc.lastAutoTable.finalY + 10;
      if (y > pageHeight - 40) { doc.addPage(); y = 15; }
      doc.setFont(undefined, 'bold');
      doc.text('STATEMENT SUMMARY', 14, y);
      const sumHead = [['Total Amount Billed', 'Total Amount Paid', 'Outstanding Balance']];
      const sumBody = [[
        `₹${statementData.summary?.totalBillsAmount.toLocaleString()}`,
        `₹${statementData.summary?.totalPaidAmount.toLocaleString()}`,
        `₹${statementData.summary?.outstandingBalance.toLocaleString()}`
      ]];
      autoTable(doc, {
        head: sumHead,
        body: sumBody,
        startY: y + 3,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], halign: 'center' },
        columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'center' } }
      });

      doc.save(`Customer_Statement_${statementData.customer?.name}_${startDate}.pdf`);

    } else if (activeReportTab === 'outstanding') {
      // 2. Outstanding Report PDF
      centerText('Outstanding Balances Report', 18, 12, 'bold');
      centerText(`Period: ${dateRangeStr}`, 24, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 28, pageWidth - 14, 28);

      const head = [['Customer Name', 'Phone', 'Total Billed', 'Total Paid', 'Outstanding Balance', 'Last Payment']];
      const body = processedOutstanding.map(r => [
        r.customerName,
        r.phone,
        `₹${r.totalBillsAmount.toLocaleString()}`,
        `₹${r.totalPaidAmount.toLocaleString()}`,
        `₹${r.outstandingBalance.toLocaleString()}`,
        r.lastPaymentDate ? formatDateTime(r.lastPaymentDate).date : '—'
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 34,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [225, 29, 72] }
      });

      doc.save(`Outstanding_Report_${startDate}_${endDate}.pdf`);

    } else if (activeReportTab === 'payments') {
      // 3. Payment Report PDF
      centerText('Payments Log Report', 18, 12, 'bold');
      centerText(`Period: ${dateRangeStr}`, 24, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 28, pageWidth - 14, 28);

      const head = [['Payment Number', 'Date', 'Customer Name', 'Amount Paid', 'Received By', 'Notes', 'Remaining Bal']];
      const body = paymentsData.map(r => [
        r.paymentNumber,
        formatDateTime(r.paymentDate).date,
        r.customerName,
        `₹${r.amountPaid.toLocaleString()}`,
        r.receivedBy || '—',
        r.notes || '—',
        `₹${r.outstandingBalanceAfterPayment.toLocaleString()}`
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 34,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129] }
      });

      doc.save(`Payments_Report_${startDate}_${endDate}.pdf`);
    } else if (activeReportTab === 'partial') {
      // 4. Partial Payments Report PDF
      centerText('Partial Payments / Bill Allocations Report', 18, 12, 'bold');
      centerText(`Period: ${dateRangeStr}`, 24, 9);
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 28, pageWidth - 14, 28);

      const head = [['Payment Date', 'Customer', 'Payment Amount', 'Bills Adjusted', 'Allocations', 'Remaining Outstanding']];
      const body = partialPaymentsData.map(r => [
        formatDateTime(r.paymentDate).date,
        r.customerName,
        `₹${r.paymentAmount.toLocaleString()}`,
        r.billsAdjusted || '—',
        r.allocatedAmountPerBill || '—',
        `₹${r.remainingOutstanding.toLocaleString()}`
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 34,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [109, 40, 217] }
      });

      doc.save(`Partial_Payments_Report_${startDate}_${endDate}.pdf`);
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Accounting Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Outstanding balances, payments, partial payment allocations, and customer statements.</p>
        </div>

        {/* Global Date Filters */}
        <div className="flex flex-wrap items-end gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 w-full lg:w-auto">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Date Presets</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setFilterType('custom'); }}
              required
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
            />
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setFilterType('custom'); }}
              required
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
            />
          </div>

          {activeReportTab !== 'dashboard' && (
            <button
              type="button"
              onClick={downloadPdf}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center inline-flex items-center"
            >
              📥 Download PDF
            </button>
          )}
        </div>
      </div>

      {/* Reports Side/Top Tab Nav */}
      <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-sm border shrink-0">
        {[
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'outstanding', label: '🔴 Outstanding Balances' },
          { id: 'payments', label: '🟢 Payments Log' },
          { id: 'partial', label: '🟣 Partial Payments' },
          { id: 'statement', label: '📋 Customer Statements' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveReportTab(tab.id)}
            className={`py-2 px-4 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              activeReportTab === tab.id 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Reports Content View */}
      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-6 pb-6 min-h-0">
          
          {/* 1. REPORT DASHBOARD VIEW */}
          {activeReportTab === 'dashboard' && dashboardData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Amount Billed</div>
                  <div className="text-2xl font-extrabold text-slate-800 mt-2">₹{dashboardData.totalAmountBilled.toLocaleString()}</div>
                  <div className="text-xs text-slate-400 mt-1">For {dashboardData.totalBillsGenerated} bills generated</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Payments Received</div>
                  <div className="text-2xl font-extrabold text-emerald-600 mt-2">₹{dashboardData.totalPaymentsReceived.toLocaleString()}</div>
                  <div className="text-xs text-slate-400 mt-1">In this selected period</div>
                </div>
                <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-bold text-rose-500 uppercase tracking-wider">Total Outstanding Receivable</div>
                  <div className="text-2xl font-extrabold text-rose-600 mt-2">₹{dashboardData.totalOutstandingAmount.toLocaleString()}</div>
                  <div className="text-xs text-rose-500/70 mt-1">Cumulative outstanding balance</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Billed Bills count</div>
                  <div className="text-2xl font-extrabold text-slate-800 mt-2">{dashboardData.totalBillsGenerated}</div>
                  <div className="text-xs text-slate-400 mt-1">Bills within active dates</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Customers</div>
                  <div className="text-2xl font-extrabold text-slate-800 mt-2">{dashboardData.totalCustomers}</div>
                  <div className="text-xs text-slate-400 mt-1">Active customer accounts</div>
                </div>
                <div className="bg-orange-50/50 border border-orange-200 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs font-bold text-orange-500 uppercase tracking-wider">Customers with Outstanding</div>
                  <div className="text-2xl font-extrabold text-orange-600 mt-2">{dashboardData.customersWithOutstandingBalances}</div>
                  <div className="text-xs text-orange-500/70 mt-1">Require collection follow-up</div>
                </div>
              </div>
            </div>
          )}

          {/* 2. OUTSTANDING BALANCES REPORT */}
          {activeReportTab === 'outstanding' && (
            <div className="space-y-4">
              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200">
                <input
                  type="text"
                  placeholder="Search customer name or phone..."
                  value={outstandingSearch}
                  onChange={(e) => setOutstandingSearch(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 flex-1"
                />
                <select
                  value={outstandingFilter}
                  onChange={(e) => setOutstandingFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none bg-white text-slate-700"
                >
                  <option value="all">All Customers</option>
                  <option value="has-outstanding">Only Outstanding Balances</option>
                </select>
                <select
                  value={outstandingSort}
                  onChange={(e) => setOutstandingSort(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none bg-white text-slate-700"
                >
                  <option value="name-asc">Sort Name: A-Z</option>
                  <option value="name-desc">Sort Name: Z-A</option>
                  <option value="balance-desc">Sort Outstanding: High to Low</option>
                  <option value="balance-asc">Sort Outstanding: Low to High</option>
                </select>
              </div>

              {/* Data Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="p-4">Customer Name</th>
                      <th className="p-4">Phone</th>
                      <th className="p-4 text-right">Bills Amount (In range)</th>
                      <th className="p-4 text-right">Paid Amount (In range)</th>
                      <th className="p-4 text-right">Outstanding Balance</th>
                      <th className="p-4 text-center">Last Payment Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {processedOutstanding.map((row, idx) => {
                      const hasBal = row.outstandingBalance > 1e-4;
                      return (
                        <tr key={idx} className={`hover:bg-slate-50 transition ${hasBal ? 'bg-rose-50/10' : ''}`}>
                          <td className="p-4 font-bold text-slate-800">{row.customerName}</td>
                          <td className="p-4 text-slate-500 font-mono text-xs">{row.phone}</td>
                          <td className="p-4 text-right text-slate-700">₹{row.totalBillsAmount.toLocaleString()}</td>
                          <td className="p-4 text-right text-emerald-600 font-medium">₹{row.totalPaidAmount.toLocaleString()}</td>
                          <td className={`p-4 text-right font-extrabold ${hasBal ? 'text-rose-600' : 'text-slate-500'}`}>
                            ₹{row.outstandingBalance.toLocaleString()}
                          </td>
                          <td className="p-4 text-center text-slate-500">
                            {row.lastPaymentDate ? formatDateTime(row.lastPaymentDate).date : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {processedOutstanding.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">No outstanding customer records match your filter criteria</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. PAYMENTS LOG REPORT */}
          {activeReportTab === 'payments' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-4 w-12"></th>
                    <th className="p-4">Payment No</th>
                    <th className="p-4">Payment Date</th>
                    <th className="p-4">Customer Name</th>
                    <th className="p-4 text-right">Amount Paid</th>
                    <th className="p-4">Received By</th>
                    <th className="p-4 text-right">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentsData.map((row, idx) => {
                    const isExpanded = expandedPaymentNo === row.paymentNumber;
                    return (
                      <React.Fragment key={idx}>
                        <tr className="hover:bg-slate-50">
                          <td className="p-4">
                            <button onClick={() => togglePaymentDetails(row.paymentNumber)} className="text-slate-400 hover:text-slate-700">
                              <svg className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </td>
                          <td className="p-4 font-bold text-slate-800">{row.paymentNumber}</td>
                          <td className="p-4 text-slate-500">{formatDateTime(row.paymentDate).date}</td>
                          <td className="p-4 font-semibold text-slate-700">{row.customerName}</td>
                          <td className="p-4 text-right font-bold text-emerald-700">₹{row.amountPaid.toLocaleString()}</td>
                          <td className="p-4 text-slate-600">{row.receivedBy || '—'}</td>
                          <td className="p-4 text-right font-semibold text-slate-800">₹{row.outstandingBalanceAfterPayment.toLocaleString()}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={7} className="p-4 border-l-4 border-emerald-500 bg-emerald-50/5">
                              <div className="pl-6 py-2">
                                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">FIFO Bill Settlements</h4>
                                <div className="flex flex-wrap gap-4">
                                  {row.allocationDetails?.map((alloc, idx) => (
                                    <div key={idx} className="bg-white border border-slate-200 rounded-lg p-2 shadow-sm text-xs font-mono">
                                      <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Bill Number</div>
                                      <div className="font-bold text-slate-700 mb-1.5">{alloc.billNumber}</div>
                                      <div className="text-[9px] uppercase font-bold text-slate-400 mb-0.5">Settled Amount</div>
                                      <div className="font-bold text-emerald-600">₹{alloc.allocatedAmount.toLocaleString()}</div>
                                    </div>
                                  ))}
                                </div>
                                {row.notes && (
                                  <div className="mt-3 text-xs text-slate-500 italic">
                                    <strong>Notes:</strong> {row.notes}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {paymentsData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">No payment logs found for the selected period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. PARTIAL PAYMENTS REPORT */}
          {activeReportTab === 'partial' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="p-4">Payment Date</th>
                    <th className="p-4">Customer Name</th>
                    <th className="p-4 text-right">Payment Amount</th>
                    <th className="p-4">Bills Adjusted</th>
                    <th className="p-4">Allocations</th>
                    <th className="p-4 text-right">Remaining Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {partialPaymentsData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-4 text-slate-500">{formatDateTime(row.paymentDate).date}</td>
                      <td className="p-4 font-bold text-slate-800">{row.customerName}</td>
                      <td className="p-4 text-right font-bold text-emerald-700">₹{row.paymentAmount.toLocaleString()}</td>
                      <td className="p-4 text-slate-600 max-w-xs truncate font-mono text-xs">{row.billsAdjusted || '—'}</td>
                      <td className="p-4 text-slate-600 max-w-sm truncate text-xs">{row.allocatedAmountPerBill || '—'}</td>
                      <td className="p-4 text-right font-semibold text-rose-600">₹{row.remainingOutstanding.toLocaleString()}</td>
                    </tr>
                  ))}
                  {partialPaymentsData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">No bill allocations / partial payments found for the selected period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. CUSTOMER STATEMENT REPORT */}
          {activeReportTab === 'statement' && (
            <div className="space-y-6">
              {/* Customer Selector Dropdown */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Select Customer:</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-800 flex-1 max-w-md w-full"
                >
                  {customers.map(c => (
                    <option key={c._id} value={c._id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              {statementData && (
                <div className="space-y-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  {/* Title & Customer Information */}
                  <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-800">{statementData.customer?.name}</h2>
                      <div className="text-xs font-semibold text-slate-500 mt-1.5 flex flex-wrap gap-4">
                        <span>📞 {statementData.customer?.phone}</span>
                        {statementData.customer?.address && <span>📍 {statementData.customer?.address}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Statement Date Range</div>
                      <div className="text-sm font-semibold text-slate-700 mt-1">{startDate} to {endDate}</div>
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Amount Billed (Period)</div>
                      <div className="text-lg font-extrabold text-slate-800">₹{statementData.summary?.totalBillsAmount.toLocaleString()}</div>
                    </div>
                    <div className="text-center border-y sm:border-y-0 sm:border-x border-slate-200 py-3 sm:py-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Payments (Period)</div>
                      <div className="text-lg font-extrabold text-emerald-700">₹{statementData.summary?.totalPaidAmount.toLocaleString()}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">Remaining Outstanding</div>
                      <div className="text-lg font-extrabold text-rose-600">₹{statementData.summary?.outstandingBalance.toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Bills List */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">1. Bills Section</h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                          <tr>
                            <th className="p-3">Bill Number</th>
                            <th className="p-3">Bill Date</th>
                            <th className="p-3 text-right">Total Amount</th>
                            <th className="p-3 text-right">Allocated Amount</th>
                            <th className="p-3 text-right">Pending Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {statementData.bills.map((b, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-700">{b.billNumber}</td>
                              <td className="p-3 text-slate-500 font-sans">{formatDateTime(b.date).date}</td>
                              <td className="p-3 text-right text-slate-800">₹{b.totalAmount.toLocaleString()}</td>
                              <td className="p-3 text-right text-slate-600">₹{b.allocatedAmount.toLocaleString()}</td>
                              <td className={`p-3 text-right font-extrabold ${b.pendingAmount > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                ₹{b.pendingAmount.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          {statementData.bills.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-slate-400 font-sans italic">No bills found in this period</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payments List */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">2. Payments Section</h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                          <tr>
                            <th className="p-3">Payment Number</th>
                            <th className="p-3">Payment Date</th>
                            <th className="p-3 text-right">Amount Paid</th>
                            <th className="p-3">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {statementData.payments.map((p, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-700">{p.paymentNumber}</td>
                              <td className="p-3 text-slate-500 font-sans">{formatDateTime(p.paymentDate).date}</td>
                              <td className="p-3 text-right font-extrabold text-emerald-700">₹{p.amountPaid.toLocaleString()}</td>
                              <td className="p-3 text-slate-500 font-sans italic">{p.notes || '—'}</td>
                            </tr>
                          ))}
                          {statementData.payments.length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-6 text-center text-slate-400 font-sans italic">No payments found in this period</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Ledger List */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">3. Ledger Section</h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                          <tr>
                            <th className="p-3">Date</th>
                            <th className="p-3">Reference</th>
                            <th className="p-3 text-right">Debit (Bill)</th>
                            <th className="p-3 text-right">Credit (Payment)</th>
                            <th className="p-3 text-right">Running Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {statementData.ledger.map((l, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 text-slate-500 font-sans">{formatDateTime(l.date).date}</td>
                              <td className="p-3 font-bold text-slate-700">{l.reference}</td>
                              <td className="p-3 text-right text-rose-600 font-bold">{l.debit > 0 ? `₹${l.debit.toLocaleString()}` : '—'}</td>
                              <td className="p-3 text-right text-emerald-700 font-bold">{l.credit > 0 ? `₹${l.credit.toLocaleString()}` : '—'}</td>
                              <td className="p-3 text-right font-extrabold text-slate-800">₹{l.balance.toLocaleString()}</td>
                            </tr>
                          ))}
                          {statementData.ledger.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-slate-400 font-sans italic">No ledger entries found in this period</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default Reports;
