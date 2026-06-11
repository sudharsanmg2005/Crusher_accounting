import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { CalendarIcon, FolderIcon, MoneyIcon, SaveIcon, TrashIcon, EditIcon, HistoryIcon, PlusIcon } from '../components/Icons';
import { useConfirm } from '../components/ConfirmDialog';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

const getYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 3; y <= currentYear + 1; y++) {
    years.push(y);
  }
  return years;
};

const getLocalDateString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMondayDate = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dayStr = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
};

const getWeekDates = (mondayStr) => {
  const dates = [];
  const monday = new Date(mondayStr + 'T00:00:00.000Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
};

const getDateRangeDates = (startStr, endStr) => {
  if (!startStr || !endStr) return [];
  const dates = [];
  const start = new Date(startStr + 'T00:00:00.000Z');
  const end = new Date(endStr + 'T00:00:00.000Z');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  return dates;
};

const getMonthRange = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

const Employees = () => {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState('directory'); // directory | attendance | salaries

  // --- TAB 1: DIRECTORY STATE ---
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', designation: '', dailyWages: '', salaryType: 'Daily', customSalary: '', status: 'Active' });

  // --- TAB 2: ATTENDANCE STATE ---
  const [attendanceDate, setAttendanceDate] = useState(getLocalDateString());
  const [attendanceMode, setAttendanceMode] = useState('week');
  const [attendanceMonth, setAttendanceMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [attendanceRange, setAttendanceRange] = useState({ startDate: getLocalDateString(), endDate: getLocalDateString() });
  const [attendanceList, setAttendanceList] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);

  // --- TAB 3: SALARIES STATE ---
  const [salaryMonth, setSalaryMonth] = useState(new Date().getMonth() + 1);
  const [salaryYear, setSalaryYear] = useState(new Date().getFullYear());
  const [salaryMode, setSalaryMode] = useState('month');
  const [salaryWeekDate, setSalaryWeekDate] = useState(getLocalDateString());
  const [salaryRange, setSalaryRange] = useState({ startDate: getLocalDateString(), endDate: getLocalDateString() });
  const [salaries, setSalaries] = useState([]);
  const [salariesLoading, setSalariesLoading] = useState(false);
  
  // Payment / Bonus Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentData, setPaymentData] = useState({
    employeeId: '',
    employeeName: '',
    amount: '',
    type: 'Salary', // Salary | Bonus
    pendingAmount: 0,
    baseSalary: 0,
    bonus: 0,
    paidAmount: 0,
    totalSalary: 0
  });

  // History Popover State
  const [historyEmpId, setHistoryEmpId] = useState(null);

  // Base Salary Override Modal State
  const [isBaseSalaryModalOpen, setIsBaseSalaryModalOpen] = useState(false);
  const [baseSalaryData, setBaseSalaryData] = useState({
    employeeId: '',
    employeeName: '',
    baseSalary: ''
  });

  // --- INDIVIDUAL ATTENDANCE HISTORY STATE ---
  const [attendanceHistoryEmp, setAttendanceHistoryEmp] = useState(null);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [attendanceLogsLoading, setAttendanceLogsLoading] = useState(false);

  const fetchEmployeeAttendance = async (empId) => {
    setAttendanceLogsLoading(true);
    try {
      const { data } = await api.get(`/employees/${empId}/attendance`);
      setAttendanceLogs(data);
    } catch (error) {
      console.error('Error fetching employee attendance history', error);
      alert('Error loading attendance history');
    } finally {
      setAttendanceLogsLoading(false);
    }
  };

  useEffect(() => {
    if (attendanceHistoryEmp) {
      fetchEmployeeAttendance(attendanceHistoryEmp._id);
    } else {
      setAttendanceLogs([]);
    }
  }, [attendanceHistoryEmp]);

  const attendanceHistoryStats = useMemo(() => {
    let present = 0;
    let halfDay = 0;
    let absent = 0;
    attendanceLogs.forEach(log => {
      if (log.status === 'Present') present++;
      else if (log.status === 'Half-Day') halfDay++;
      else if (log.status === 'Absent') absent++;
    });
    const totalWorkingDays = present + 0.5 * halfDay;
    return { present, halfDay, absent, totalWorkingDays };
  }, [attendanceLogs]);

  const openBaseSalaryModal = (record) => {
    setBaseSalaryData({
      employeeId: record.employee._id,
      employeeName: record.employee.name,
      baseSalary: String(record.baseSalary)
    });
    setIsBaseSalaryModalOpen(true);
  };

  const handleBaseSalarySubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put('/employees/salaries/base-salary', {
        employeeId: baseSalaryData.employeeId,
        month: salaryMonth,
        year: salaryYear,
        baseSalary: Number(baseSalaryData.baseSalary)
      });
      setIsBaseSalaryModalOpen(false);
      alert('Base salary overridden successfully!');
      fetchSalaries();
    } catch (error) {
      console.error('Error overriding base salary', error);
      alert('Error: ' + (error.response?.data?.message || 'Update failed'));
    }
  };

  // --- LOAD DIRECTORY ---
  useEffect(() => {
    if (activeTab === 'directory') {
      fetchEmployees();
    }
  }, [activeTab]);

  // --- LOAD ATTENDANCE ---
  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchAttendance();
    }
  }, [activeTab, attendanceDate, attendanceMode, attendanceMonth, attendanceRange.startDate, attendanceRange.endDate]);

  // --- LOAD SALARIES ---
  useEffect(() => {
    if (activeTab === 'salaries') {
      fetchSalaries();
    }
  }, [activeTab, salaryMonth, salaryYear, salaryMode, salaryWeekDate, salaryRange.startDate, salaryRange.endDate]);

  // --- DIRECTORY FUNCTIONS ---
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/employees');
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTextChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setFormData({ ...formData, phone: value.replace(/\D/g, '').slice(0, 10) });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.phone || formData.phone.length !== 10) {
      alert('Phone number is required and must be exactly 10 digits');
      return;
    }
    try {
      const payload = { 
        ...formData, 
        dailyWages: Number(formData.dailyWages || 0), 
        customSalary: Number(formData.customSalary || 0) 
      };
      if (formData._id) {
        await api.put(`/employees/${formData._id}`, payload);
      } else {
        await api.post('/employees', payload);
      }
      setIsModalOpen(false);
      setFormData({ name: '', phone: '', designation: '', dailyWages: '', salaryType: 'Daily', customSalary: '', status: 'Active' });
      fetchEmployees();
    } catch (error) {
      console.error('Error saving employee', error);
      alert('Error saving employee: ' + (error.response?.data?.message || 'Unknown error'));
    }
  };

  const handleEditEmployee = (emp) => {
    setFormData(emp);
    setIsModalOpen(true);
  };

  const handleDeleteEmployee = async (id) => {
    const ok = await confirm({
      title: 'Delete employee',
      message: 'Are you sure you want to delete this employee?',
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/employees/${id}`);
        fetchEmployees();
      } catch (error) {
        console.error('Error deleting employee', error);
        alert('Error deleting employee');
      }
    }
  };

  // --- ATTENDANCE FUNCTIONS ---
  const weekStart = useMemo(() => {
    return getMondayDate(attendanceDate);
  }, [attendanceDate]);

  const attendancePeriod = useMemo(() => {
    if (attendanceMode === 'month') {
      const [year, month] = attendanceMonth.split('-').map(Number);
      return getMonthRange(year, month);
    }
    if (attendanceMode === 'range') {
      return { start: attendanceRange.startDate, end: attendanceRange.endDate };
    }
    const start = weekStart;
    const days = getWeekDates(start);
    return { start, end: days[6] };
  }, [attendanceMode, attendanceMonth, attendanceRange, weekStart]);

  const weekDates = useMemo(() => {
    return getDateRangeDates(attendancePeriod.start, attendancePeriod.end);
  }, [attendancePeriod]);

  const getDayLabel = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00.000Z');
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
    const dayNum = String(d.getUTCDate()).padStart(2, '0');
    const monthNum = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dayName} (${dayNum}/${monthNum})`;
  };

  const fetchAttendance = async () => {
    if (weekDates.length < 1) return;
    setAttendanceLoading(true);
    try {
      const { data } = await api.get(`/employees/attendance?startDate=${weekDates[0]}&endDate=${weekDates[weekDates.length - 1]}`);
      setAttendanceList(data);
      setSelectedEmpIds(data.map(item => item.employeeId));
    } catch (error) {
      console.error('Error fetching attendance logs', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleStatusChange = (employeeId, dateStr, newStatus) => {
    setAttendanceList(prev => prev.map(item => {
      if (item.employeeId === employeeId) {
        return {
          ...item,
          statuses: {
            ...item.statuses,
            [dateStr]: newStatus
          }
        };
      }
      return item;
    }));
  };

  const handleSaveAttendance = async () => {
    if (selectedEmpIds.length === 0) {
      alert('Please select at least one employee to save attendance');
      return;
    }
    setSaveLoading(true);
    try {
      const attendance = [];
      attendanceList.forEach(item => {
        if (selectedEmpIds.includes(item.employeeId)) {
          weekDates.forEach(dateStr => {
            const status = item.statuses[dateStr] || 'Unmarked';
            attendance.push({
              employeeId: item.employeeId,
              date: dateStr,
              status: status
            });
          });
        }
      });
      await api.post('/employees/attendance', { attendance });
      alert('Attendance saved successfully!');
      fetchAttendance();
      
      // Auto-align Salaries month/year and switch to Salaries tab
      if (weekDates.length > 0) {
        const parts = weekDates[0].split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          setSalaryMonth(m);
          setSalaryYear(y);
          setSalaryMode('month');
        }
      }
      setActiveTab('salaries');
    } catch (error) {
      console.error('Error saving attendance', error);
      alert('Error saving attendance');
    } finally {
      setSaveLoading(false);
    }
  };



  // --- SALARIES FUNCTIONS ---
  const fetchSalaries = async () => {
    setSalariesLoading(true);
    try {
      let url = `/employees/salaries?month=${salaryMonth}&year=${salaryYear}`;
      if (salaryMode !== 'month') {
        let range = salaryRange;
        if (salaryMode === 'week') {
          const start = getMondayDate(salaryWeekDate);
          const dates = getWeekDates(start);
          range = { startDate: start, endDate: dates[6] };
        }
        url = `/employees/salaries/summary?startDate=${range.startDate}&endDate=${range.endDate}`;
      }
      const { data } = await api.get(url);
      setSalaries(data);
    } catch (error) {
      console.error('Error fetching salaries', error);
    } finally {
      setSalariesLoading(false);
    }
  };


  const openPaymentModal = (record) => {
    setPaymentData({
      employeeId: record.employee._id,
      employeeName: record.employee.name,
      amount: record.pendingAmount > 0 ? String(record.pendingAmount) : '1000',
      type: 'Salary',
      pendingAmount: record.pendingAmount,
      baseSalary: record.baseSalary,
      bonus: record.bonus,
      paidAmount: record.paidAmount,
      totalSalary: record.totalSalary
    });
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      const amt = Number(paymentData.amount);
      if (paymentData.type === 'Salary' && amt > paymentData.pendingAmount + 1e-4) {
        alert(`Cannot credit ₹${amt} as it exceeds the pending amount of ₹${paymentData.pendingAmount}`);
        return;
      }

      await api.post('/employees/salaries/pay', {
        employeeId: paymentData.employeeId,
        month: salaryMonth,
        year: salaryYear,
        amount: amt,
        type: paymentData.type
      });

      setIsPaymentModalOpen(false);
      alert('Payment processed and recorded under Expenses!');
      fetchSalaries();
    } catch (error) {
      console.error('Error recording payment', error);
      alert('Error: ' + (error.response?.data?.message || 'Transaction failed'));
    }
  };

  const handleDeleteTransaction = async (paymentId, transactionId, type) => {
    const ok = await confirm({
      title: 'Delete transaction',
      message: `Delete this ${type.toLowerCase()} transaction? This will also remove it from the Expenses registry.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (ok) {
      try {
        await api.delete(`/employees/salaries/payment/${paymentId}/history/${transactionId}`);
        alert('Transaction deleted successfully!');
        fetchSalaries();
      } catch (error) {
        console.error('Error deleting transaction', error);
        alert('Error: ' + (error.response?.data?.message || 'Deletion failed'));
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Paid': return 'bg-green-100 text-green-800 border-green-200';
      case 'Partially Paid': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employee Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage profiles, track daily attendance, and process wages.</p>
        </div>
        {activeTab === 'directory' && (
          <button 
            onClick={() => { setFormData({ name: '', phone: '', designation: '', dailyWages: '', salaryType: 'Daily', customSalary: '', status: 'Active' }); setIsModalOpen(true); }}
            className="btn-primary flex items-center shadow-lg hover:shadow-xl cursor-pointer w-full sm:w-auto justify-center"
          >
            <span className="mr-2">+</span> Add Employee
          </button>
        )}
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-slate-200 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none">
        <button
          onClick={() => setActiveTab('directory')}
          className={`py-2 px-4 font-semibold text-sm border-b-2 transition cursor-pointer flex-shrink-0 ${
            activeTab === 'directory'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="inline-flex items-center gap-2"><FolderIcon className="h-4 w-4" /> Employees Directory</span>
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`py-2 px-4 font-semibold text-sm border-b-2 transition cursor-pointer flex-shrink-0 ${
            activeTab === 'attendance'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="inline-flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Mark Attendance</span>
        </button>
        <button
          onClick={() => setActiveTab('salaries')}
          className={`py-2 px-4 font-semibold text-sm border-b-2 transition cursor-pointer flex-shrink-0 ${
            activeTab === 'salaries'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="inline-flex items-center gap-2"><MoneyIcon className="h-4 w-4" /> Salaries & Payroll</span>
        </button>
      </div>

      {/* Dynamic Tab Body */}
      <div className="flex-1 min-h-0 min-w-0">
        
        {/* --- TAB 1: DIRECTORY --- */}
        {activeTab === 'directory' && (
          <div className="card overflow-hidden p-0 border border-slate-200 h-full flex flex-col">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading directory...</div>
            ) : employees.length === 0 ? (
              <div className="p-8 text-center text-slate-500 italic">No employees found. Add your first employee!</div>
            ) : (
              <div className="overflow-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
                    <tr className="border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                      <th className="p-4 font-semibold">Name</th>
                      <th className="p-4 font-semibold">Phone</th>
                      <th className="p-4 font-semibold">Designation</th>
                      <th className="p-4 font-semibold">Daily Wage (₹)</th>
                      <th className="p-4 font-semibold">Status</th>
                      <th className="p-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 whitespace-nowrap">
                    {employees.map((emp) => (
                      <tr key={emp._id} className="hover:bg-slate-50 transition">
                        <td className="p-4 font-semibold text-slate-800">{emp.name}</td>
                        <td className="p-4 text-slate-600 font-medium">{emp.phone || '-'}</td>
                        <td className="p-4 text-slate-600">
                          <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-xs font-semibold">{emp.designation || 'Labour'}</span>
                        </td>
                        <td className="p-4 font-bold text-slate-800">₹{emp.dailyWages.toLocaleString()}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${emp.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-3">
                          <button 
                            onClick={() => setAttendanceHistoryEmp(emp)} 
                            className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer"
                            title="View Attendance Track"
                          >
                            <CalendarIcon className="h-5 w-5" />
                          </button>
                          <button 
                            onClick={() => handleEditEmployee(emp)} 
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer"
                            title="Edit Employee"
                          >
                            <EditIcon className="h-5 w-5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteEmployee(emp._id)} 
                            className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer"
                            title="Delete Employee"
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
        )}

        {/* --- TAB 2: ATTENDANCE --- */}
        {activeTab === 'attendance' && (
          <div className="space-y-4 h-full flex flex-col">
            {/* Filter Date Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Attendance Period:</span>
                <select value={attendanceMode} onChange={(e) => setAttendanceMode(e.target.value)} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="range">Selected Dates</option>
                </select>
                {attendanceMode === 'week' && (
                  <input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-auto"
                  />
                )}
                {attendanceMode === 'month' && (
                  <input
                    type="month"
                    value={attendanceMonth}
                    onChange={(e) => setAttendanceMonth(e.target.value)}
                    className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-auto"
                  />
                )}
                {attendanceMode === 'range' && (
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <input type="date" value={attendanceRange.startDate} onChange={(e) => setAttendanceRange((prev) => ({ ...prev, startDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none flex-1 sm:flex-initial" />
                    <input type="date" value={attendanceRange.endDate} onChange={(e) => setAttendanceRange((prev) => ({ ...prev, endDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none flex-1 sm:flex-initial" />
                  </div>
                )}
                <span className="text-xs text-slate-500 font-semibold bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 w-full sm:w-auto text-center sm:text-left">
                  {weekDates[0]} to {weekDates[weekDates.length - 1]}
                </span>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto md:justify-end">
                <button
                  type="button"
                  onClick={handleSaveAttendance}
                  disabled={selectedEmpIds.length === 0 || attendanceLoading || saveLoading}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex-1 md:flex-initial justify-center inline-flex items-center whitespace-nowrap"
                >
                  {saveLoading ? 'Saving...' : <span className="inline-flex items-center gap-2"><SaveIcon className="h-4 w-4" /> Save Attendance Grid</span>}
                </button>
              </div>
            </div>

            {/* Attendance Sheet */}
            <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col animate-in fade-in duration-200">
              {attendanceLoading ? (
                <div className="p-8 text-center text-slate-500">Loading weekly attendance grid...</div>
              ) : attendanceList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 italic">No active employees found to mark attendance.</div>
              ) : (
                <div className="overflow-auto flex-1">
                  <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
                    <thead className="sticky top-0 bg-slate-50 shadow-sm z-10 text-xs">
                      <tr className="border-b border-slate-200 text-slate-600 uppercase tracking-wider">
                        <th className="p-4 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={attendanceList.length > 0 && selectedEmpIds.length === attendanceList.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEmpIds(attendanceList.map(item => item.employeeId));
                              } else {
                                setSelectedEmpIds([]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                          />
                        </th>
                        <th className="p-4 font-semibold w-52">Employee</th>
                        {weekDates.map((dateStr) => (
                          <th key={dateStr} className="p-2 font-semibold text-center whitespace-nowrap">
                            {getDayLabel(dateStr)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {attendanceList.map((item) => (
                        <tr key={item.employeeId} className="hover:bg-slate-50/50 transition">
                          <td className="p-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedEmpIds.includes(item.employeeId)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEmpIds(prev => [...prev, item.employeeId]);
                                } else {
                                  setSelectedEmpIds(prev => prev.filter(id => id !== item.employeeId));
                                }
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-4 w-4"
                            />
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <div className="font-bold text-slate-800">{item.name}</div>
                            <div className="text-xs text-slate-500">{item.designation || 'Labour'}</div>
                          </td>
                          {weekDates.map((dateStr) => {
                            const status = item.statuses[dateStr] || 'Unmarked';
                            return (
                              <td key={dateStr} className="p-2 text-center">
                                <select
                                  value={status}
                                  onChange={(e) => handleStatusChange(item.employeeId, dateStr, e.target.value)}
                                  className={`text-xs font-bold rounded p-2 border outline-none cursor-pointer w-full transition-colors ${
                                    status === 'Present' ? 'bg-green-100 text-green-800 border-green-200' :
                                    status === 'Half-Day' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                    status === 'Absent' ? 'bg-red-100 text-red-800 border-red-200' :
                                    'bg-slate-50 text-slate-400 border-slate-200'
                                  }`}
                                >
                                  <option value="Present">Present (1.0)</option>
                                  <option value="Half-Day">Half-Day (0.5)</option>
                                  <option value="Absent">Absent (0.0)</option>
                                  <option value="Unmarked">Unmarked (-)</option>
                                </select>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- TAB 3: SALARIES --- */}
        {activeTab === 'salaries' && (
          <div className="space-y-4 h-full flex flex-col">
            {/* Salary Period Filters */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm shrink-0 w-full">
              <div className="flex flex-wrap items-center gap-2 w-full">
                <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Payroll Period:</span>
                <select value={salaryMode} onChange={(e) => setSalaryMode(e.target.value)} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium w-full sm:w-auto">
                  <option value="month">Month</option>
                  <option value="week">Week</option>
                  <option value="range">Selected Dates</option>
                </select>
                {salaryMode === 'month' && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <select
                      value={salaryMonth}
                      onChange={(e) => setSalaryMonth(Number(e.target.value))}
                      className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium flex-1 sm:flex-initial"
                    >
                      {MONTHS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <select
                      value={salaryYear}
                      onChange={(e) => setSalaryYear(Number(e.target.value))}
                      className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium flex-1 sm:flex-initial"
                    >
                      {getYears().map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                )}
                {salaryMode === 'week' && (
                  <input type="date" value={salaryWeekDate} onChange={(e) => setSalaryWeekDate(e.target.value)} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-auto" />
                )}
                {salaryMode === 'range' && (
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <input type="date" value={salaryRange.startDate} onChange={(e) => setSalaryRange((prev) => ({ ...prev, startDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none flex-1 sm:flex-initial" />
                    <input type="date" value={salaryRange.endDate} onChange={(e) => setSalaryRange((prev) => ({ ...prev, endDate: e.target.value }))} className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none flex-1 sm:flex-initial" />
                  </div>
                )}
              </div>
            </div>

            {/* Salaries Sheet */}
            <div className="card overflow-hidden p-0 border border-slate-200 flex-1 flex flex-col">
              {salariesLoading ? (
                <div className="p-8 text-center text-slate-500">Loading payroll board...</div>
              ) : salaries.length === 0 ? (
                <div className="p-8 text-center text-slate-500 italic">No employee data to compute salary.</div>
              ) : (
                <div className="overflow-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50 shadow-sm z-10">
                      <tr className="border-b border-slate-200 text-sm text-slate-600 uppercase tracking-wider">
                        <th className="p-4 font-semibold">Employee</th>
                        <th className="p-4 font-semibold whitespace-nowrap">Daily Rate</th>
                        <th className="p-4 font-semibold whitespace-nowrap">New Days</th>
                        <th className="p-4 font-semibold whitespace-nowrap">Base Wage</th>
                        <th className="p-4 font-semibold whitespace-nowrap">Bonus</th>
                        <th className="p-4 font-semibold whitespace-nowrap">Total Wage</th>
                        <th className="p-4 font-semibold whitespace-nowrap">Paid Amt</th>
                        <th className="p-4 font-semibold whitespace-nowrap">Pending</th>
                        <th className="p-4 font-semibold text-center">Status</th>
                        <th className="p-4 font-semibold text-right">Transactions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 whitespace-nowrap text-sm">
                      {salaries.map((record) => {
                        const hasHistory = record.history && record.history.length > 0;
                        const isHistoryOpen = historyEmpId === record.employee._id;
                        
                        return (
                          <React.Fragment key={record.employee._id}>
                            <tr className="hover:bg-slate-50/50 transition">
                              <td className="p-4">
                                <div className="font-bold text-slate-800 flex items-center gap-2">
                                  {record.employee.name}
                                  {record.employee.salaryType === 'Fixed' && (
                                    <span className="bg-purple-100 text-purple-800 border border-purple-200 px-1.5 py-0.5 rounded text-[10px] font-extrabold">FIXED</span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500">{record.employee.designation || 'Labour'}</div>
                              </td>
                              <td className="p-4 font-medium text-slate-700">
                                {record.employee.salaryType === 'Fixed' ? '—' : `₹${record.dailyWagesSnapshot.toLocaleString()}`}
                              </td>
                              <td className="p-4 font-semibold text-slate-700">
                                {record.employee.salaryType === 'Fixed' ? '—' : (() => {
                                  const newDays = record.attendedDays - (record.paidAmount - (record.bonus || 0)) / record.dailyWagesSnapshot;
                                  const rounded = Math.max(0, Math.round(newDays * 10) / 10);
                                  return `${rounded} days`;
                                })()}
                              </td>
                              <td className="p-4 text-slate-700 font-medium">
                                <div className="flex items-center gap-2">
                                  <span>₹{record.baseSalary.toLocaleString()}</span>
                                  {salaryMode === 'month' && (
                                    <button
                                      onClick={() => openBaseSalaryModal(record)}
                                      className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100 transition inline-flex items-center"
                                      title="Set Custom Base Wage"
                                    >
                                      <EditIcon className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 text-green-600 font-bold">₹{(record.bonus || 0).toLocaleString()}</td>
                              <td className="p-4 text-slate-800 font-extrabold">₹{record.totalSalary.toLocaleString()}</td>
                              <td className="p-4 text-blue-600 font-bold">₹{record.paidAmount.toLocaleString()}</td>
                              <td className="p-4 text-red-600 font-bold">₹{record.pendingAmount.toLocaleString()}</td>
                              <td className="p-4 text-center">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${getStatusColor(record.paymentStatus)}`}>
                                  {record.paymentStatus}
                                </span>
                              </td>
                              <td className="p-4 text-right space-y-1 md:space-y-0 md:space-x-2">
                                {hasHistory && (
                                  <button
                                    onClick={() => setHistoryEmpId(isHistoryOpen ? null : record.employee._id)}
                                    className={`p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer ${isHistoryOpen ? 'text-slate-800 bg-slate-200' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
                                    title={isHistoryOpen ? 'Hide Logs' : 'Show Logs'}
                                  >
                                    <HistoryIcon className="h-5 w-5" />
                                  </button>
                                )}
                                
                                {salaryMode === 'month' && (
                                  <button
                                    onClick={() => openPaymentModal(record)}
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2 rounded-lg transition-colors inline-flex items-center cursor-pointer"
                                    title="Pay / Bonus"
                                  >
                                    <PlusIcon className="h-5 w-5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                            
                            {/* Nested History Log View */}
                            {isHistoryOpen && hasHistory && (
                              <tr className="bg-slate-50/70">
                                <td colSpan="10" className="p-4 border-t border-b border-slate-200">
                                  <div className="max-w-xl bg-white border border-slate-200 rounded-lg p-3 shadow-inner">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Transaction Logs for {record.employee.name}</div>
                                    <div className="space-y-2">
                                      {record.history.map((tx, idx) => (
                                        <div key={tx._id || idx} className="flex justify-between items-center text-xs border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                                          <div>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold mr-2 ${tx.type === 'Bonus' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                                              {tx.type.toUpperCase()}
                                            </span>
                                            <span className="text-slate-500">{new Date(tx.date).toLocaleString()}</span>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <span className="font-extrabold text-slate-800">₹{tx.amount.toLocaleString()}</span>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteTransaction(record._id, tx._id, tx.type)}
                                              className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1.5 rounded-lg transition-colors inline-flex items-center ml-2 cursor-pointer"
                                              title="Delete transaction and its linked expense"
                                            >
                                              <TrashIcon className="h-4 w-4" />
                                            </button>
                                          </div>
                                        </div>
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
          </div>
        )}
      </div>

      {/* --- ADD / EDIT EMPLOYEE MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{formData._id ? 'Edit Employee Details' : 'Add New Employee'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <input 
                  type="text" name="name" required value={formData.name} onChange={handleTextChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number * (10 digits, unique ID)</label>
                <input 
                  type="text" name="phone" required value={formData.phone} onChange={handleTextChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  placeholder="e.g. 9443212345"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                <input 
                  type="text" name="designation" value={formData.designation} onChange={handleTextChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  placeholder="e.g. Operator, Driver, Labour, supervisor"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Salary Type</label>
                <select 
                  name="salaryType" value={formData.salaryType || 'Daily'} onChange={handleTextChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white mb-3"
                >
                  <option value="Daily">Daily Wages (Salary per day)</option>
                  <option value="Fixed">Custom / Fixed Salary</option>
                </select>
              </div>

              {(!formData.salaryType || formData.salaryType === 'Daily') ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Daily Wages (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                    <input 
                      type="number" name="dailyWages" required value={formData.dailyWages} onChange={handleTextChange} min="0" step="1"
                      className="w-full border border-slate-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-blue-500 outline-none transition"
                      placeholder="e.g. 700"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Custom / Fixed Salary (₹) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                    <input 
                      type="number" name="customSalary" required value={formData.customSalary} onChange={handleTextChange} min="0" step="1"
                      className="w-full border border-slate-300 rounded-lg p-2.5 pl-8 focus:ring-2 focus:ring-blue-500 outline-none transition"
                      placeholder="e.g. 15000"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select 
                  name="status" value={formData.status} onChange={handleTextChange}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              
              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100 mt-6 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer">
                  {formData._id ? 'Update Details' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- PAY SALARY / ADD BONUS MODAL --- */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <div>
                <h2 className="text-lg font-bold text-blue-900">Process Salary Payout</h2>
                <p className="text-xs text-blue-600 mt-0.5">Crediting for {MONTHS.find(m => m.value === salaryMonth)?.label} {salaryYear}</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-blue-400 hover:text-blue-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Employee Name</label>
                <div className="font-bold text-slate-800 text-base">{paymentData.employeeName}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded border border-slate-200">
                <div>
                  <span className="text-slate-500">Base Salary:</span>
                  <div className="font-bold text-slate-700">₹{paymentData.baseSalary.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-slate-500">Bonus Paid:</span>
                  <div className="font-bold text-slate-700">₹{paymentData.bonus.toLocaleString()}</div>
                </div>
                <div className="col-span-2 border-t border-slate-200 mt-1 pt-1 flex justify-between">
                  <span className="text-slate-500 font-medium">Total paid so far:</span>
                  <span className="font-bold text-blue-600">₹{paymentData.paidAmount.toLocaleString()}</span>
                </div>
                <div className="col-span-2 flex justify-between">
                  <span className="text-slate-500 font-medium">Remaining Pending:</span>
                  <span className="font-bold text-red-600">₹{paymentData.pendingAmount.toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Transaction Type *</label>
                <select
                  value={paymentData.type}
                  onChange={(e) => setPaymentData({ ...paymentData, type: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm"
                >
                  <option value="Salary">Salary Payout (Partial/Full)</option>
                  <option value="Bonus">Add Bonus Payment</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount to Pay (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                  <input 
                    type="number" 
                    required 
                    value={paymentData.amount} 
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} 
                    min="1" 
                    step="1"
                    className="w-full text-lg font-bold border border-slate-300 rounded-lg p-3 pl-8 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>
                {paymentData.type === 'Salary' && (
                  <div className="text-[10px] text-slate-500 mt-1 italic">Note: Cannot exceed the pending salary limit of ₹{paymentData.pendingAmount.toLocaleString()}</div>
                )}
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer">
                  Confirm & Payout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- OVERRIDE BASE SALARY MODAL --- */}
      {isBaseSalaryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-blue-50">
              <div>
                <h2 className="text-lg font-bold text-blue-900">Set Custom Base Salary</h2>
                <p className="text-xs text-blue-600 mt-0.5">Overriding for {MONTHS.find(m => m.value === salaryMonth)?.label} {salaryYear}</p>
              </div>
              <button onClick={() => setIsBaseSalaryModalOpen(false)} className="text-blue-400 hover:text-blue-600 text-2xl leading-none">&times;</button>
            </div>
            
            <form onSubmit={handleBaseSalarySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Employee Name</label>
                <div className="font-bold text-slate-800 text-base">{baseSalaryData.employeeName}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Custom Base Salary (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₹</span>
                  <input 
                    type="number" 
                    required 
                    value={baseSalaryData.baseSalary} 
                    onChange={(e) => setBaseSalaryData({ ...baseSalaryData, baseSalary: e.target.value })} 
                    min="0" 
                    step="1"
                    className="w-full text-lg font-bold border border-slate-300 rounded-lg p-3 pl-8 focus:ring-2 focus:ring-blue-500 outline-none transition"
                  />
                </div>
                <div className="text-[10px] text-slate-500 mt-1 italic">Note: This manually overrides this month's automatically calculated base wage.</div>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsBaseSalaryModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition shadow-md cursor-pointer">
                  Save Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- EMPLOYEE ATTENDANCE HISTORY MODAL --- */}
      {attendanceHistoryEmp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Attendance History</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Tracking logs for <span className="font-semibold text-slate-700">{attendanceHistoryEmp.name}</span> ({attendanceHistoryEmp.designation || 'Labour'})
                </p>
              </div>
              <button 
                onClick={() => setAttendanceHistoryEmp(null)} 
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none cursor-pointer border-0 bg-transparent outline-none"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Stats Summary Dashboard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Work Days</div>
                  <div className="text-2xl font-extrabold text-blue-800 mt-1">
                    {attendanceHistoryStats.totalWorkingDays}
                  </div>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                  <div className="text-[10px] font-bold text-green-600 uppercase tracking-wider">Present</div>
                  <div className="text-2xl font-extrabold text-green-800 mt-1">
                    {attendanceHistoryStats.present}
                  </div>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
                  <div className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Half-Day</div>
                  <div className="text-2xl font-extrabold text-orange-800 mt-1">
                    {attendanceHistoryStats.halfDay}
                  </div>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                  <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Absent</div>
                  <div className="text-2xl font-extrabold text-red-800 mt-1">
                    {attendanceHistoryStats.absent}
                  </div>
                </div>
              </div>

              {/* Logs List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Attendance Logs</h3>
                
                {attendanceLogsLoading ? (
                  <div className="p-8 text-center text-slate-500 italic">Loading attendance logs...</div>
                ) : attendanceLogs.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 italic">
                    No attendance records found for this employee.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[40vh] overflow-y-auto shadow-inner bg-white">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="p-3 font-semibold">Date</th>
                          <th className="p-3 font-semibold text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {attendanceLogs.map((log) => {
                          const dateStr = log.date;
                          const d = new Date(dateStr);
                          const formattedDate = !isNaN(d.getTime())
                            ? `${String(d.getUTCDate()).padStart(2, '0')} ${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`
                            : dateStr;
                          const weekday = !isNaN(d.getTime())
                            ? d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
                            : '';

                          return (
                            <tr key={log._id} className="hover:bg-slate-50 transition">
                              <td className="p-3 font-medium text-slate-700">
                                <div>{formattedDate}</div>
                                <div className="text-xs text-slate-400 font-normal">{weekday}</div>
                              </td>
                              <td className="p-3 text-right">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                                  log.status === 'Present' ? 'bg-green-100 text-green-800 border-green-200' :
                                  log.status === 'Half-Day' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                  'bg-red-100 text-red-800 border-red-200'
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
              <button 
                type="button" 
                onClick={() => setAttendanceHistoryEmp(null)} 
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition shadow-md cursor-pointer text-sm"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
