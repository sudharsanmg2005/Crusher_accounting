import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const toYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Reports = () => {
  const today = useMemo(() => new Date(), []);

  const initialMonthlyRange = useMemo(() => {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startDate: toYMD(firstDay), endDate: toYMD(lastDay) };
  }, [today]);

  const [reportType, setReportType] = useState('monthly'); // monthly | weekly | range
  const [dateRange, setDateRange] = useState(initialMonthlyRange);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(''); // '' = all customers
  const [customersLoading, setCustomersLoading] = useState(true);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const { data } = await api.get('/customers');
        setCustomers(data);
      } catch (error) {
        console.error('Error fetching customers', error);
      } finally {
        setCustomersLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  useEffect(() => {
    if (reportType === 'monthly') {
      setDateRange(initialMonthlyRange);
      return;
    }

    if (reportType === 'weekly') {
      const end = new Date(today);
      end.setHours(0, 0, 0, 0);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      setDateRange({
        startDate: toYMD(start),
        endDate: toYMD(end)
      });
    }
  }, [reportType, initialMonthlyRange, today]);

  useEffect(() => {
    const fetchStatement = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        });
        if (selectedCustomerId) {
          params.set('customerId', selectedCustomerId);
        }

        const { data } = await api.get(`/reports/summary?${params.toString()}`);
        setStatement(data);
      } catch (error) {
        console.error('Error fetching statement', error);
        setStatement(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStatement();
  }, [dateRange, selectedCustomerId]);

  const onChange = (e) => {
    setDateRange((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const downloadPdf = () => {
    if (!statement) return;

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


    const headerName = statement.customer?.name 
      ? `${statement.customer.name} Bill Statement` 
      : statement.title || 'GENERAL STATEMENT';
    centerText(headerName, 19, 11, 'bold');
    centerText(statement.rangeLabel || '', 26, 9);

    // Add a horizontal dividing line for premium look
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 29, pageWidth - 14, 29);

    // Table first
    const yStartTable = 36;

    const isAllCustomers = !statement.customer;

    const head = isAllCustomers
      ? [['S.NO', 'BILL NO', 'DATE', 'CUSTOMER', 'VEHICLE', 'MATERIAL', 'WEIGHT', 'PRICE', 'AMOUNT', 'PASS', 'TOTAL', 'ALLOCATED', 'PENDING']]
      : [['S.NO', 'BILL NO', 'DATE', 'VEHICLE', 'MATERIAL', 'WEIGHT', 'PRICE', 'AMOUNT', 'PASS', 'TOTAL', 'ALLOCATED', 'PENDING']];

    const body = (statement.rows || []).map((r) => [
      r.sno,
      r.billNumber || '',
      r.date,
      ...(isAllCustomers ? [r.customerName || ''] : []),
      r.vehicle,
      r.material,
      r.weight,
      r.price,
      r.amount,
      r.pass,
      r.total,
      r.allocatedAmount || '0',
      r.pendingAmount || '0'
    ]);

    autoTable(doc, {
      head,
      body,
      startY: yStartTable,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    // Totals at the bottom (after the table) - separate table
    let y = (doc.lastAutoTable?.finalY || yStartTable) + 12;
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 18;
    }

    const totals = statement.totals || {};
    const totalsHead = [['DETAILS', 'AMOUNT']];
    const cleanAmt = (v) => String(v ?? '').replace(/₹/g, '').replace(/\s+/g, '').trim();
    const totalsBody = [
      ['TOTAL AMOUNT', cleanAmt(totals.currentWeekBalance)],
      ['RECEIVED AMOUNT', cleanAmt(totals.receivedAmount)],
      ['TOTAL BALANCE', cleanAmt(totals.totalBalance)]
    ];

    const leftRightMargin = 14;
    const detailsColWidth = 75; // enough for labels
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

    const rangeSlug = (statement.rangeLabel || 'report')
      .replaceAll(' ', '_')
      .replaceAll('/', '-')
      .replaceAll(':', '');

    const customerSlug = statement.customer?.name
      ? statement.customer.name.replaceAll(' ', '_').replaceAll('/', '-')
      : 'all_customers';

    const pdfTitle = statement.title
      ? statement.title.replaceAll(' ', '_').replaceAll('/', '-')
      : customerSlug;
    doc.save(`${pdfTitle}_${rangeSlug}.pdf`);
  };

  return (
    <div className="space-y-6 flex flex-col h-full min-h-0">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Customer Report</h1>
          <p className="text-slate-500 text-sm mt-1">Monthly / Weekly / Selected Days report for all customers or one customer.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 w-full lg:w-auto">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="range">Selected Days</option>
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Start Date</label>
            <input
              type="date"
              name="startDate"
              value={dateRange.startDate}
              onChange={onChange}
              disabled={reportType !== 'range'}
              required
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 w-full"
            />
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">End Date</label>
            <input
              type="date"
              name="endDate"
              value={dateRange.endDate}
              onChange={onChange}
              disabled={reportType !== 'range'}
              required
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 w-full"
            />
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Customer</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              disabled={customersLoading}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-slate-50 w-full"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={downloadPdf}
            disabled={!statement || loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center inline-flex items-center"
          >
            Download PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-6 pb-6 min-h-0">
          {!statement ? (
            <div className="card p-6 border border-slate-200 bg-white">
              <div className="text-center text-slate-700 font-medium">Generating report...</div>
            </div>
          ) : (
            <>
              <div className="card p-4 border border-slate-200 bg-white">
                <div className="text-center font-extrabold tracking-wider text-lg">{statement.title}</div>
                <div className="text-center text-sm text-slate-600 mt-1">{statement.rangeLabel}</div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="text-center bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">TOTAL AMOUNT</div>
                    <div className="text-base font-bold text-slate-800">{statement?.totals?.currentWeekBalance}</div>
                  </div>
                  <div className="text-center bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">RECEIVED AMOUNT</div>
                    <div className="text-base font-bold text-slate-800">{statement?.totals?.receivedAmount}</div>
                  </div>
                  <div className="text-center bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">TOTAL BALANCE</div>
                    <div className="text-base font-bold text-slate-800">{statement?.totals?.totalBalance}</div>
                  </div>
                </div>
              </div>

              <div className="card overflow-hidden p-0 border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="p-4 font-semibold whitespace-nowrap">S.NO</th>
                        <th className="p-4 font-semibold whitespace-nowrap">BILL NO</th>
                        <th className="p-4 font-semibold whitespace-nowrap">DATE</th>
                        {!statement.customer && (
                          <th className="p-4 font-semibold whitespace-nowrap">CUSTOMER</th>
                        )}
                        <th className="p-4 font-semibold whitespace-nowrap">VEHICLE</th>
                        <th className="p-4 font-semibold whitespace-nowrap">MATERIAL</th>
                        <th className="p-4 font-semibold whitespace-nowrap text-right">WEIGHT</th>
                        <th className="p-4 font-semibold whitespace-nowrap text-right">PRICE</th>
                        <th className="p-4 font-semibold whitespace-nowrap text-right">AMOUNT</th>
                        <th className="p-4 font-semibold whitespace-nowrap text-right">PASS</th>
                        <th className="p-4 font-semibold whitespace-nowrap text-right">TOTAL</th>
                        <th className="p-4 font-semibold whitespace-nowrap text-right">ALLOCATED</th>
                        <th className="p-4 font-semibold whitespace-nowrap text-right">PENDING</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {statement.rows.length === 0 ? (
                        <tr>
                          <td colSpan={!statement.customer ? "13" : "12"} className="p-8 text-center text-slate-500">
                            No records found for this date range.
                          </td>
                        </tr>
                      ) : (
                        statement.rows.map((r) => (
                          <tr key={`${r.sno}-${r.date}-${r.vehicle}`} className="hover:bg-slate-50 transition">
                            <td className="p-4 text-slate-700 font-medium whitespace-nowrap">{r.sno}</td>
                            <td className="p-4 text-slate-700 font-semibold whitespace-nowrap">{r.billNumber}</td>
                            <td className="p-4 text-slate-700 whitespace-nowrap">{r.date}</td>
                            {!statement.customer && (
                              <td className="p-4 text-slate-800 font-semibold whitespace-nowrap">{r.customerName || ''}</td>
                            )}
                            <td className="p-4 text-slate-800 font-semibold whitespace-nowrap">{r.vehicle}</td>
                            <td className="p-4 text-slate-800 whitespace-nowrap">{r.material}</td>
                            <td className="p-4 text-right text-slate-700 font-medium whitespace-nowrap">{r.weight}</td>
                            <td className="p-4 text-right text-slate-700 font-medium whitespace-nowrap">{r.price}</td>
                            <td className="p-4 text-right text-slate-700 font-medium whitespace-nowrap">{r.amount}</td>
                            <td className="p-4 text-right text-slate-700 font-medium whitespace-nowrap">{r.pass}</td>
                            <td className="p-4 text-right text-slate-900 font-bold whitespace-nowrap">{r.total}</td>
                            <td className="p-4 text-right text-emerald-700 font-bold whitespace-nowrap">₹{Number(r.allocatedAmount).toLocaleString()}</td>
                            <td className={`p-4 text-right font-bold whitespace-nowrap ${Number(r.pendingAmount) > 0 ? 'text-rose-600' : 'text-slate-500'}`}>₹{Number(r.pendingAmount).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;
