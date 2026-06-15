import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import api from '../api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalBills: 0,
    totalRevenue: 0,
    pendingAmount: 0,
    totalExpenses: 0
  });
  const [loading, setLoading] = useState(true);
  // report type controls (match Reports page): 'monthly' | 'weekly' | 'range'
  const today = React.useMemo(() => new Date(), []);
  const initialMonthlyRange = React.useMemo(() => {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { startDate: toYMD(firstDay), endDate: toYMD(lastDay) };
  }, [today]);

  const [reportType, setReportType] = useState('monthly');
  const [dateRange, setDateRange] = useState(initialMonthlyRange);
  // fixed sort direction (newest first)
  const fixedSort = 'desc';

  useEffect(() => {
    fetchDashboardData();
    const id = setInterval(fetchDashboardData, 15000); // poll every 15s for realtime-ish updates
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // when reportType changes, update the dateRange for monthly/weekly
    if (reportType === 'monthly') setDateRange(initialMonthlyRange);
    if (reportType === 'range') setDateRange(initialMonthlyRange);
    if (reportType === 'weekly') {
      const day = today.getDay();
      const sunday = new Date(today);
      sunday.setDate(today.getDate() - day);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setDateRange({ startDate: toYMD(sunday), endDate: toYMD(saturday) });
    }
  }, [reportType, initialMonthlyRange, today]);

  const fetchDashboardData = async () => {
    try {
      // In a real app we'd have a specific /api/dashboard endpoint
      // For now, let's fetch summary from existing endpoints or mock it
      // if endpoints don't aggregate data well.
      
      const [customersRes, billsRes, expensesRes] = await Promise.all([
        api.get('/customers'),
        api.get('/bills'),
        api.get('/expenses')
      ]);

      const customers = customersRes.data;
      const bills = billsRes.data;
      const expenses = expensesRes.data;

      const totalRevenue = bills.reduce((acc, bill) => acc + (bill.totalAmount || 0), 0);
      const pendingAmount = bills.reduce((acc, bill) => acc + (bill.pendingAmount || 0), 0);
      const totalExpenses = expenses.reduce((acc, exp) => acc + (exp.amount || 0), 0);

      // prepare trend source data (bills and expenses) for charts
      // ensure bills and expenses are sorted by date
      const billsSorted = bills.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
      const expensesSorted = expenses.slice().sort((a, b) => new Date(a.date) - new Date(b.date));

      setStats({
        totalCustomers: customers.length,
        totalBills: bills.length,
        totalRevenue,
        pendingAmount,
        totalExpenses
      });
      // attach raw data for charts
      setRawData({ bills: billsSorted, expenses: expensesSorted });
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data', error);
      setLoading(false);
    }
  };

  const [rawData, setRawData] = useState({ bills: [], expenses: [] });

  // compute timeframe-limited aggregates for displayed stats
  const computedTotals = React.useMemo(() => {
    const now = new Date();
    let startDate;
    let endDate = now;
    if (reportType === 'weekly') {
      const day = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (reportType === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      // range
      startDate = new Date(dateRange.startDate);
      endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
    }
    // filter bills/expenses to timeframe
    const curSort = fixedSort;
    const billsInRange = rawData.bills.filter(b => {
      const d = new Date(b.date);
      return d >= startDate && d <= endDate;
    }).sort((a, b) => curSort === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));

    const expensesInRange = rawData.expenses.filter(e => {
      const d = new Date(e.date);
      return d >= startDate && d <= endDate;
    }).sort((a, b) => curSort === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));

    const revenue = billsInRange.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
    const pending = billsInRange.reduce((acc, b) => acc + (b.pendingAmount || 0), 0);
    const expensesSum = expensesInRange.reduce((acc, e) => acc + (e.amount || 0), 0);

    // unique customers in timeframe
    const customersSet = new Set();
    billsInRange.forEach(b => {
      if (b.customerId) customersSet.add(b.customerId);
      else if (b.customerNameSnapshot) customersSet.add(b.customerNameSnapshot);
    });

    return {
      revenue,
      pending,
      expenses: expensesSum,
      customers: customersSet.size
    };
  }, [rawData, reportType, dateRange]);

  const displayStatCards = [
    { title: 'Total Revenue', value: `₹${computedTotals.revenue.toLocaleString()}`, color: 'bg-green-50 text-green-700', border: 'border-green-200' },
    { title: 'Pending Payments', value: `₹${computedTotals.pending.toLocaleString()}`, color: 'bg-orange-50 text-orange-700', border: 'border-orange-200' },
    { title: 'Total Expenses', value: `₹${computedTotals.expenses.toLocaleString()}`, color: 'bg-red-50 text-red-700', border: 'border-red-200' },
    { title: 'Customers', value: computedTotals.customers, color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
  ];

  // build chart datasets from rawData based on timeframe
  const buildTrendData = () => {
    const now = new Date();
    let startDate;
    let endDate = now;
    if (reportType === 'weekly') {
      const day = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (reportType === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else { // range
      startDate = new Date(dateRange.startDate);
      endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
    }

    // generate labels: each day between startDate and now
    const days = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const labels = days.map(d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));

    const sumByDay = (items, valueGetter) => {
      const map = {};
      items.forEach(it => {
        const d = new Date(it.date);
        if (d >= startDate && d <= endDate) {
          const key = d.toDateString();
          map[key] = (map[key] || 0) + (valueGetter(it) || 0);
        }
      });
      return days.map(d => map[d.toDateString()] || 0);
    };

    const curSort = fixedSort;
    // use filtered+sorted arrays matching computedTotals logic
    const billsInRange = rawData.bills.filter(b => {
      const d = new Date(b.date);
      return d >= startDate && d <= endDate;
    }).sort((a, b) => curSort === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));

    const expensesInRange = rawData.expenses.filter(e => {
      const d = new Date(e.date);
      return d >= startDate && d <= endDate;
    }).sort((a, b) => curSort === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));

    const revenueSeries = sumByDay(billsInRange, b => b.totalAmount || 0);
    const expenseSeries = sumByDay(expensesInRange, e => e.amount || 0);

    // apply sort order if requested (chart needs chronological order; sortOrder only affects labels/datasets direction)
    if (curSort === 'asc') {
      // labels already asc; do nothing
    } else {
      labels.reverse();
      revenueSeries.reverse();
      expenseSeries.reverse();
    }

    const barData = {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: revenueSeries,
          backgroundColor: 'rgba(59, 130, 246, 0.6)'
        },
        {
          label: 'Expenses',
          data: expenseSeries,
          backgroundColor: 'rgba(239, 68, 68, 0.6)'
        }
      ]
    };

    const pieData = {
      labels: ['Revenue', 'Expenses', 'Pending'],
      datasets: [
        {
          data: [computedTotals.revenue, computedTotals.expenses, computedTotals.pending],
          backgroundColor: ['rgba(16, 185, 129, 0.6)', 'rgba(239, 68, 68, 0.6)', 'rgba(245, 158, 11, 0.6)'],
          borderWidth: 1
        }
      ]
    };

    return { barData, pieData };
  };

  const { barData, pieData } = buildTrendData();

  if (loading) {
    return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <div className="flex items-center w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row sm:items-center bg-white border border-slate-300 rounded-lg shadow-sm p-3 gap-3 w-full sm:w-auto">
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Report Type</label>
              <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="range">Selected Days</option>
              </select>
            </div>

            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Start Date</label>
              <input type="date" name="startDate" value={dateRange.startDate} onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))} disabled={reportType !== 'range'} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50" />
            </div>

            <div className="w-full sm:w-auto">
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">End Date</label>
              <input type="date" name="endDate" value={dateRange.endDate} onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))} disabled={reportType !== 'range'} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50" />
            </div>
          </div>
          {/* sort toggle removed per request */}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayStatCards.map((stat, index) => (
          <div key={index} className={`card border ${stat.border} ${stat.color}`}>
            <h3 className="text-sm font-semibold opacity-80 uppercase tracking-wider mb-1">{stat.title}</h3>
            <p className="text-3xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Revenue Trends</h2>
          <div className="h-64 flex items-center justify-center">
             <Bar data={barData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>
        <div className="card">
          <h2 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Financial Overview</h2>
          <div className="h-64 flex items-center justify-center">
            <Pie data={pieData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
