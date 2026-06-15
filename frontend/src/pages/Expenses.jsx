import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { useConfirm } from '../components/ConfirmDialog';
import { EditIcon, TrashIcon } from '../components/Icons';

const toYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Expenses = () => {
  const confirm = useConfirm();
  const today = useMemo(() => new Date(), []);

  const initialMonthlyRange = useMemo(() => {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startDate: toYMD(firstDay), endDate: toYMD(lastDay) };
  }, [today]);

  const [reportType, setReportType] = useState('monthly'); // monthly | weekly | range | all
  const [dateRange, setDateRange] = useState(initialMonthlyRange);
  const [expenses, setExpenses] = useState([]);
  const [selectedType, setSelectedType] = useState('All');
  const [loading, setLoading] = useState(true);

  const filteredExpenses = useMemo(() => {
    if (selectedType === 'All') return expenses;
    return expenses.filter((e) => e.type === selectedType);
  }, [expenses, selectedType]);

  const dynamicTypes = useMemo(() => {
    const types = new Set(['Fuel', 'Maintenance', 'Labour', 'Electricity', 'Rent']);
    expenses.forEach((e) => {
      if (e.type) types.add(e.type);
    });
    return Array.from(types);
  }, [expenses]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], type: '', description: '', amount: '' });
  const [customType, setCustomType] = useState('');

  // Sync dateRange when reportType changes
  useEffect(() => {
    if (reportType === 'all') {
      setDateRange({ startDate: '', endDate: '' });
      return;
    }

    if (reportType === 'monthly') {
      setDateRange(initialMonthlyRange);
      return;
    }

    if (reportType === 'range') {
      setDateRange(initialMonthlyRange);
      return;
    }

    if (reportType === 'weekly') {
      const day = today.getDay();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - day);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      setDateRange({
        startDate: toYMD(sunday),
        endDate: toYMD(saturday)
      });
    }
  }, [reportType, initialMonthlyRange, today]);

  // Fetch expenses when dateRange or reportType changes
  useEffect(() => {
    fetchExpenses();
  }, [dateRange, reportType]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportType !== 'all') {
        if (dateRange.startDate) params.append('startDate', dateRange.startDate);
        if (dateRange.endDate) params.append('endDate', dateRange.endDate);
      }
      const { data } = await api.get(`/expenses?${params.toString()}`);
      setExpenses(Object.values(data).sort((a,b) => new Date(b.date) - new Date(a.date)));
    } catch (error) {
      console.error('Error fetching expenses', error);
    } finally {
      setLoading(false);
    }
  };

  const onChange = (e) => {
    setDateRange((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const downloadPdf = () => {
    if (filteredExpenses.length === 0) return;

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

    // Header - Company Name
    const titleText = selectedType === 'All' ? 'EXPENSE REPORT' : `EXPENSE REPORT - ${selectedType.toUpperCase()}`;
    centerText(titleText, 19, 11, 'bold');

    // Date Range Label
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

    // Aesthetic line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 29, pageWidth - 14, 29);

    // Table start
    const yStartTable = 36;

    const head = [['S.NO', 'DATE', 'EXPENSE TYPE', 'DESCRIPTION', 'AMOUNT']];
    const body = filteredExpenses.map((e, idx) => [
      idx + 1,
      new Date(e.date).toLocaleDateString(),
      e.type,
      e.description || '-',
      e.amount.toFixed(2)
    ]);

    autoTable(doc, {
      head,
      body,
      startY: yStartTable,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    // Totals/Summary Table (after the main table)
    let y = (doc.lastAutoTable?.finalY || yStartTable) + 12;
    if (y > pageHeight - 65) {
      doc.addPage();
      y = 18;
    }

    // Group expenses by type to show a nice summary
    const byType = {};
    filteredExpenses.forEach((e) => {
      byType[e.type] = (byType[e.type] || 0) + e.amount;
    });

    const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    const totalsHead = [['EXPENSE SUMMARY', 'AMOUNT']];
    const totalsBody = Object.entries(byType).map(([type, amount]) => [
      type.toUpperCase(),
      amount.toFixed(2)
    ]);
    totalsBody.push(['TOTAL EXPENSES', totalAmount.toFixed(2)]);

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
      styles: { fontSize: 9, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'left', cellWidth: detailsColWidth },
        1: { halign: 'right', cellWidth: amountColWidth }
      },
      margin: { left: leftRightMargin, right: leftRightMargin },
      didParseCell: function (data) {
        // Bold the last row (TOTAL EXPENSES)
        if (data.row.index === totalsBody.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    const rangeSlug = rangeLabel
      .replaceAll(' ', '_')
      .replaceAll('/', '-')
      .replaceAll('.', '-');
    doc.save(`Expense_Report_${rangeSlug}.pdf`);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const expenseType = formData.type === 'Other' ? customType.trim() : formData.type;
      if (!expenseType) {
        alert('Please specify an expense type');
        return;
      }
      const payload = {
        ...formData,
        type: expenseType,
        amount: Number(formData.amount)
      };

      if (formData._id) {
        await api.put(`/expenses/${formData._id}`, payload);
      } else {
        await api.post('/expenses', payload);
      }
      setIsModalOpen(false);
      setFormData({ date: new Date().toISOString().split('T')[0], type: '', description: '', amount: '' });
      setCustomType('');
      fetchExpenses();
    } catch (error) {
      console.error('Error saving expense', error);
      alert('Error saving expense');
    }
  };

  const handleEdit = (expense) => {
    const isPredefined = ['Fuel', 'Maintenance', 'Labour', 'Electricity', 'Rent'].includes(expense.type);
    setFormData({ 
      ...expense, 
      date: expense.date ? new Date(expense.date).toISOString().split('T')[0] : '',
      type: isPredefined ? expense.type : 'Other',
      amount: expense.amount 
    });
    setCustomType(isPredefined ? '' : expense.type);
    setIsModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: 'Delete expense',
      message: 'Are you sure you want to delete this expense?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/expenses/${id}`);
        fetchExpenses();
      } catch (error) {
        console.error('Error deleting expense', error);
        alert('Error deleting expense');
      }
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
          <p className="text-slate-500 text-sm mt-1">Track operational costs and overheads.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-white p-3 rounded-xl shadow-sm border border-slate-200 w-full md:w-auto">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Filter Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
            >
              <option value="all">All Expenses</option>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="range">Selected Days</option>
            </select>
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Expense Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white w-full"
            >
              <option value="All">All Types</option>
              {dynamicTypes.map((t) => (
                <option key={t} value={t}>
                  {t === 'Labour' ? 'Labour / Salary' : t}
                </option>
              ))}
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

          <button
            type="button"
            onClick={downloadPdf}
            disabled={filteredExpenses.length === 0 || loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto justify-center inline-flex items-center"
          >
            Download PDF
          </button>

          <button 
            type="button"
            onClick={() => { 
              setFormData({ date: new Date().toISOString().split('T')[0], type: '', description: '', amount: '' }); 
              setCustomType('');
              setIsModalOpen(true); 
            }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition shadow-md whitespace-nowrap cursor-pointer w-full sm:w-auto justify-center inline-flex items-center"
          >
            + Add Expense
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col min-h-0 min-w-0">
        {loading ? (
           <div className="p-8 text-center text-slate-500">Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
           <div className="p-8 text-center text-slate-500 border-t border-slate-100 italic">No expenses recorded yet.</div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0 min-w-0">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 shadow-sm z-10 w-full min-w-max">
                <tr className="border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                  <th className="p-4 font-semibold w-1/5 whitespace-nowrap">Date</th>
                  <th className="p-4 font-semibold w-1/5 whitespace-nowrap">Type</th>
                  <th className="p-4 font-semibold w-2/5">Description</th>
                  <th className="p-4 font-semibold w-1/5 whitespace-nowrap">Amount (₹)</th>
                  <th className="p-4 font-semibold text-right w-1/5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 whitespace-nowrap md:whitespace-normal">
                {filteredExpenses.map((exp) => (
                  <tr key={exp._id} className="hover:bg-slate-50 transition">
                    <td className="p-4 text-slate-600 whitespace-nowrap">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="p-4 font-medium text-slate-800 whitespace-nowrap"><span className="bg-slate-100 px-2 py-1 rounded text-sm border border-slate-200">{exp.type}</span></td>
                    <td className="p-4 text-slate-600 min-w-[200px] break-words">{exp.description || '-'}</td>
                    <td className="p-4 text-slate-800 font-bold whitespace-nowrap">₹{exp.amount.toLocaleString()}</td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button 
                        onClick={() => handleEdit(exp)} 
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                        title="Edit Expense"
                      >
                        <EditIcon className="h-5 w-5" />
                      </button>
                      <button 
                        onClick={() => handleDelete(exp._id)} 
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center" 
                        title="Delete Expense"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{formData._id ? 'Edit Expense' : 'Add New Expense'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input 
                  type="date" name="date" required value={formData.date} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expense Type *</label>
                <select 
                  name="type" required value={formData.type} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                >
                  <option value="" disabled>Select a type</option>
                  {dynamicTypes.filter(t => t !== 'Other').map((t) => (
                    <option key={t} value={t}>
                      {t === 'Labour' ? 'Labour / Salary' : t}
                    </option>
                  ))}
                  <option value="Other">Other</option>
                </select>
              </div>

              {formData.type === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Custom Type Name *</label>
                  <input 
                    type="text" required value={customType} onChange={(e) => setCustomType(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="e.g. Office Supplies"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea 
                  name="description" rows="2" value={formData.description} onChange={handleChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Details of the expense"
                ></textarea>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                  <input 
                    type="number" name="amount" required value={formData.amount} onChange={handleChange} min="0" step="1"
                    className="w-full border border-slate-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="e.g. 5000"
                  />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 mt-6 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer">
                  {formData._id ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
