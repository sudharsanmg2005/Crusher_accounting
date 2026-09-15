import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { useConfirm } from '../components/ConfirmDialog';
import { EditIcon, TrashIcon } from '../components/Icons';
import { useAuth } from '../AuthContext';
import { formatDateDDMMYYYY } from '../utils/dateTime';

const toYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Expenses = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const canWrite = user?.role === 'super_admin' || user?.accessLevel === 'full_access';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

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

  // Bulk Entry Modal States
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkRows, setBulkRows] = useState([]);

  const emptyBulkRow = () => ({
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    type: 'Fuel',
    customType: '',
    description: '',
    amount: ''
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
      id: Date.now() + Math.random().toString(36).substr(2, 9)
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
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (isBulkSubmitting) return;

    const validRows = [];
    for (let i = 0; i < bulkRows.length; i++) {
      const row = bulkRows[i];
      const rowNum = i + 1;

      const finalType = row.type === 'Other' ? row.customType.trim() : row.type;
      if (!finalType) {
        alert(`Row #${rowNum}: Please select or specify an expense type/category.`);
        return;
      }

      if (finalType === 'Load') {
        alert(`Row #${rowNum}: Expense type "Load" is reserved for buyer payments.`);
        return;
      }

      if (!row.amount || Number(row.amount) <= 0) {
        alert(`Row #${rowNum}: Please enter a valid positive amount.`);
        return;
      }

      validRows.push({
        type: finalType,
        description: row.description ? row.description.trim() : '',
        amount: Number(row.amount)
      });
    }

    if (validRows.length === 0) {
      alert('Please fill out at least one row with expense details.');
      return;
    }

    try {
      setIsBulkSubmitting(true);
      await api.post('/expenses/bulk', {
        date: new Date(`${bulkDate}T12:00`).toISOString(),
        expenses: validRows
      });
      setIsBulkModalOpen(false);
      fetchExpenses();
    } catch (error) {
      console.error('Error saving bulk expenses', error);
      alert('Error saving expenses: ' + (error.response?.data?.message || 'Unknown error'));
    } finally {
      setIsBulkSubmitting(false);
    }
  };

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
        return `${dd}-${mm}-${yy}`;
      };
      rangeLabel = `${formatDateDots(dateRange.startDate)} - ${formatDateDots(dateRange.endDate)}`;
    }
    centerText(rangeLabel, 26, 9);

    // Aesthetic line
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 29, pageWidth - 14, 29);

    // Table start
    const head = [['S.NO', 'DATE', 'EXPENSE TYPE', 'DESCRIPTION', 'AMOUNT']];
    const body = filteredExpenses.map((e, idx) => [
      idx + 1,
      formatDateDDMMYYYY(e.date),
      e.type === 'Labour' ? 'Labour / Salary' : (e.type || '—'),
      e.description || '—',
      `Rs. ${Number(e.amount || 0).toLocaleString()}`
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 36,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [245, 246, 250], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    let y = (doc.lastAutoTable?.finalY || 36) + 12;
    if (y > pageHeight - 45) {
      doc.addPage();
      y = 18;
    }

    const grandTotal = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const summaryHead = [['SUMMARY', 'AMOUNT (Rs.)']];
    const summaryBody = [
      ['TOTAL EXPENSE', `Rs. ${grandTotal.toLocaleString()}`]
    ];

    autoTable(doc, {
      head: summaryHead,
      body: summaryBody,
      startY: y,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    const timelineSlug = rangeLabel.replaceAll('/', '-').replaceAll(' ', '_').replaceAll(':', '').replaceAll(',', '');
    doc.save(`expense_report_${selectedType.toLowerCase()}_${timelineSlug}.pdf`);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const finalType = formData.type === 'Other' ? customType.trim() : formData.type;
    if (!finalType) {
      alert('Please select or specify an expense type');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        date: formData.date ? new Date(`${formData.date}T12:00`).toISOString() : undefined,
        type: finalType,
        description: formData.description,
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
      alert(error.response?.data?.message || 'Error saving expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (expense) => {
    const isStandardType = dynamicTypes.includes(expense.type) && expense.type !== 'Other';
    setFormData({
      ...expense,
      date: expense.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      type: isStandardType ? expense.type : 'Other',
      description: expense.description || '',
      amount: expense.amount
    });
    if (!isStandardType) {
      setCustomType(expense.type);
    } else {
      setCustomType('');
    }
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

  const totalExpense = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [filteredExpenses]);

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Expenses</h1>
          <p className="text-slate-500 text-sm mt-1">Track operational expenses, fuel, maintenance, and labour costs.</p>
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

          {canWrite && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button 
                type="button"
                onClick={() => { 
                  setFormData({ date: new Date().toISOString().split('T')[0], type: '', description: '', amount: '' }); 
                  setCustomType('');
                  setIsModalOpen(true); 
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition shadow-md whitespace-nowrap cursor-pointer flex-1 sm:flex-initial justify-center inline-flex items-center"
              >
                + Add Expense
              </button>
              <button 
                type="button"
                onClick={openBulkModal}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition shadow-md whitespace-nowrap cursor-pointer flex-1 sm:flex-initial justify-center inline-flex items-center"
              >
                + Bulk Entry
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col min-h-0 min-w-0">
        {loading ? (
           <div className="p-8 text-center text-slate-500">Loading expenses...</div>
        ) : filteredExpenses.length === 0 ? (
           <div className="p-8 text-center text-slate-500 border-t border-slate-100 italic">No expenses recorded yet.</div>
        ) : (
          <div className="overflow-auto flex-1 min-h-0 min-w-0">
            <table className="data-table">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 shadow-sm z-10 w-full min-w-max">
                <tr className="border-b border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4 font-semibold w-1/5 whitespace-nowrap">Date</th>
                  <th className="p-4 font-semibold w-1/5 whitespace-nowrap">Type</th>
                  <th className="p-4 font-semibold w-2/5">Description</th>
                  <th className="p-4 font-semibold w-1/5 whitespace-nowrap text-right">Amount (₹)</th>
                  {canWrite && <th className="p-4 font-semibold text-right w-1/5">Actions</th>}
                </tr>
              </thead>
              <tbody className="whitespace-nowrap">
                {filteredExpenses.map((exp) => (
                  <tr key={exp._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 text-slate-600">{formatDateDDMMYYYY(exp.date)}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {exp.type === 'Labour' ? 'Labour / Salary' : exp.type}
                      </span>
                      {exp.isSynced && (
                        <span className="ml-2 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                          Synced ({exp.syncSource})
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-800 font-medium">{exp.description || '—'}</td>
                    <td className="p-4 text-right font-bold text-red-600">₹{Number(exp.amount || 0).toLocaleString()}</td>
                    {canWrite && (
                      <td className="p-4 text-right space-x-2 whitespace-nowrap">
                        <button 
                          onClick={() => handleEdit(exp)} 
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer" 
                          title="Edit Expense"
                        >
                          <EditIcon className="h-5 w-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(exp._id)} 
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer" 
                          title="Delete Expense"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-between items-center shrink-0">
          <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">Total Expenses ({selectedType})</span>
          <span className="text-xl font-extrabold text-red-600">₹{totalExpense.toLocaleString()}</span>
        </div>
      </div>

      {/* --- ADD / EDIT SINGLE EXPENSE MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{formData._id ? 'Update Expense' : 'Add New Expense'}</h2>
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
                  {dynamicTypes.filter(t => t !== 'Other' && t !== 'Load').map((t) => (
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
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none">
                  {isSubmitting ? 'Saving...' : (formData._id ? 'Update Expense' : 'Save Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- BULK EXPENSE ENTRY MODAL --- */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[92vw] xl:max-w-[85vw] overflow-hidden flex flex-col max-h-[94vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Daily Expense Log Sheet (Bulk Entry)</h2>
                <p className="text-sm text-slate-500 mt-1">Quickly enter all daily operational expenses in a single spreadsheet view</p>
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
                <table className="w-full border-collapse text-left text-base mb-32">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600 uppercase text-xs font-extrabold tracking-wider bg-slate-100/80">
                      <th className="py-4 px-3 w-12 text-center">#</th>
                      <th className="py-4 px-3 min-w-[220px]">Expense Category / Type *</th>
                      <th className="py-4 px-3 min-w-[300px]">Description</th>
                      <th className="py-4 px-3 w-[180px]">Amount (₹) *</th>
                      <th className="py-4 px-3 w-24 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkRows.map((row, index) => {
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition duration-150">
                          <td className="py-3.5 px-3 text-center text-slate-400 font-bold text-base">{index + 1}</td>
                          
                          {/* Type Select */}
                          <td className="py-3.5 px-3">
                            <div className="space-y-1.5">
                              <select
                                required
                                value={row.type}
                                onChange={(e) => handleBulkRowChange(index, 'type', e.target.value)}
                                className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] bg-white focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                              >
                                {dynamicTypes.filter(t => t !== 'Other' && t !== 'Load').map((t) => (
                                  <option key={t} value={t}>
                                    {t === 'Labour' ? 'Labour / Salary' : t}
                                  </option>
                                ))}
                                <option value="Other">Other / Custom</option>
                              </select>
                              {row.type === 'Other' && (
                                <input
                                  type="text"
                                  required
                                  value={row.customType}
                                  onChange={(e) => handleBulkRowChange(index, 'customType', e.target.value)}
                                  placeholder="Specify custom type"
                                  className="w-full border border-slate-300 rounded-xl p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-slate-800"
                                />
                              )}
                            </div>
                          </td>

                          {/* Description */}
                          <td className="py-3.5 px-3">
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) => handleBulkRowChange(index, 'description', e.target.value)}
                              placeholder="Expense details (optional)"
                              className="w-full border border-slate-300 rounded-xl p-2.5 text-[15px] focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium text-slate-800"
                            />
                          </td>

                          {/* Amount */}
                          <td className="py-3.5 px-3">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">₹</span>
                              <input
                                type="number"
                                required
                                min="1"
                                step="any"
                                value={row.amount}
                                onChange={(e) => handleBulkRowChange(index, 'amount', e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (index === bulkRows.length - 1) {
                                      addBulkRow();
                                    }
                                  }
                                }}
                                className="w-full border border-slate-300 rounded-xl p-2.5 pl-7 text-[15px] focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold text-slate-800"
                                placeholder="0.00"
                              />
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => duplicateBulkRow(index)}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition title='Duplicate row'"
                              >
                                📋
                              </button>
                              <button
                                type="button"
                                onClick={() => removeBulkRow(index)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition title='Remove row'"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <button
                  type="button"
                  onClick={addBulkRow}
                  className="mt-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-sm transition inline-flex items-center gap-2 cursor-pointer border border-slate-200"
                >
                  <span>+ Add Another Row</span>
                </button>
              </div>

              {/* Modal Footer */}
              <div className="p-5 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-between items-center shrink-0">
                <div className="text-base font-bold text-slate-700">
                  Total Logged Expense: <span className="text-red-600 font-extrabold text-xl ml-2">₹{bulkRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="px-5 py-2.5 text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl font-bold transition text-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isBulkSubmitting}
                    className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition shadow-lg text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBulkSubmitting ? 'Saving All...' : `Save All Expenses (${bulkRows.length})`}
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

export default Expenses;
