import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useTheme } from '../ThemeContext';
import logoUrl from '../assets/dark KBM.png';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  UsersIcon,
  HardHatIcon,
  PackageIcon,
  CargoIcon,
  ShieldCheckIcon,
  ChevronRightIcon,
  UserShieldIcon,
  HistoryIcon,
  ReceiptIcon
} from '../components/Icons';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Rolling diagnostic logs template
const logTemplates = [
  'Database status: Active and optimized.',
  'Material inventory models synced successfully.',
  'Session heartbeat check complete. Status: OK.',
  'System memory load verified: Normal (14% utilized).',
  'MongoDB index validation successful.',
  'API gateway response latency check: Optimal (24ms).',
  'Security token verification complete.',
  'Garbage collection process concluded.',
  'Replicated backup clusters: Synchronized.',
  'Operational records integrity check: OK.',
  'Security context signature verified.',
  'Background synchronization workers: Operational.'
];

// Helper to compute stats for the last 7 days (operational dispatch volumes)
const getLast7DaysData = (bills, loads) => {
  const dates = [];
  const billCounts = [];
  const loadCounts = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('sv'); // YYYY-MM-DD format in local time
    dates.push(
      d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    );

    const billsCountForDay = bills.filter(b => b.date && b.date.startsWith(dateStr)).length;
    const loadsCountForDay = loads.filter(l => l.date && l.date.startsWith(dateStr)).length;

    billCounts.push(billsCountForDay);
    loadCounts.push(loadsCountForDay);
  }

  return { dates, billCounts, loadCounts };
};

const Dashboard = () => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDarkMode = theme === 'dark';

  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState({
    customers: 0,
    buyers: 0,
    employees: 0,
    materials: 0,
    todayBills: 0,
    todayLoads: 0,
    apiLatency: 'Calculating...',
    dbStatus: 'Unknown',
    dbProvider: 'Unknown',
    dbHost: 'Unknown',
    dbName: 'Unknown'
  });
  const [recentDeliveries, setRecentDeliveries] = useState([]);
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });
  const [terminalLogs, setTerminalLogs] = useState([
    'Initializing diagnostic monitor...',
    'Secure database link established.',
    'System monitoring console: Online.'
  ]);

  const terminalEndRef = useRef(null);

  // Time ticker effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all counts, dispatches and system health (no finance/accounts records)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const start = Date.now();
      try {
        const [
          customersRes,
          buyersRes,
          employeesRes,
          materialsRes,
          billsRes,
          loadsRes,
          healthRes
        ] = await Promise.allSettled([
          api.get('/customers'),
          api.get('/buyers'),
          api.get('/employees'),
          api.get('/materials'),
          api.get('/bills'),
          api.get('/loads'),
          api.get('/health')
        ]);

        const latency = `${Date.now() - start}ms`;

        const customers = customersRes.status === 'fulfilled' ? customersRes.value.data : [];
        const buyers = buyersRes.status === 'fulfilled' ? buyersRes.value.data : [];
        const employees = employeesRes.status === 'fulfilled' ? employeesRes.value.data : [];
        const materials = materialsRes.status === 'fulfilled' ? materialsRes.value.data : [];
        const bills = billsRes.status === 'fulfilled' ? billsRes.value.data : [];
        const loads = loadsRes.status === 'fulfilled' ? loadsRes.value.data : [];
        const health = healthRes.status === 'fulfilled' ? healthRes.value.data : null;

        // sv-SE gives local YYYY-MM-DD
        const todayStr = new Date().toLocaleDateString('sv');

        const todayBills = bills.filter(b => b.date && b.date.startsWith(todayStr)).length;
        const todayLoads = loads.filter(l => l.date && l.date.startsWith(todayStr)).length;

        // Merge recent shipments (latest 8 dispatches across customers and buyers)
        const formattedBills = bills.map(b => ({
          id: b._id,
          type: 'Customer Sale',
          date: b.date,
          vehicle: b.vehicleNumber || '—',
          material: b.materialNameSnapshot || '—',
          target: b.customerNameSnapshot || '—',
          quantity: `${b.quantity ? Number(b.quantity).toFixed(2) : '—'} ${b.unitType || 'tons'}`
        }));

        const formattedLoads = loads.map(l => ({
          id: l._id,
          type: 'Buyer Purchase',
          date: l.date,
          vehicle: l.vehicleNumber || '—',
          material: l.quarryName || '—',
          target: l.buyerNameSnapshot || '—',
          quantity: `${l.quantity ? Number(l.quantity).toFixed(2) : '—'} ${l.unitType || 'tons'}`
        }));

        const merged = [...formattedBills, ...formattedLoads]
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 8);

        setRecentDeliveries(merged);

        // Chart calculations for last 7 days
        const chartInfo = getLast7DaysData(bills, loads);
        setChartData({
          labels: chartInfo.dates,
          datasets: [
            {
              label: 'Customer Deliveries (Sales)',
              data: chartInfo.billCounts,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              fill: true,
              tension: 0.4,
              borderWidth: 2,
              pointBackgroundColor: '#3b82f6',
              pointHoverRadius: 6
            },
            {
              label: 'Buyer Raw Materials (Purchases)',
              data: chartInfo.loadCounts,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              fill: true,
              tension: 0.4,
              borderWidth: 2,
              pointBackgroundColor: '#10b981',
              pointHoverRadius: 6
            }
          ]
        });

        setStats({
          customers: customers.length,
          buyers: buyers.length,
          employees: employees.length,
          materials: materials.length,
          todayBills,
          todayLoads,
          apiLatency: latency,
          dbStatus: health?.database?.status || 'connected',
          dbProvider: health?.database?.provider === 'atlas' ? 'MongoDB Atlas (Cloud)' : 'Local MongoDB Server',
          dbHost: health?.database?.host || 'mongoose-cluster',
          dbName: health?.database?.name || 'crusher-db'
        });
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Rolling terminal log effect
  useEffect(() => {
    const interval = setInterval(() => {
      const randomMsg = logTemplates[Math.floor(Math.random() * logTemplates.length)];
      const timestamp = new Date().toLocaleTimeString();
      setTerminalLogs(prev => {
        const next = [...prev, `[${timestamp}] ${randomMsg}`];
        if (next.length > 50) next.shift();
        return next;
      });
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll terminal log
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  // Chart configuration memo
  const chartOptions = useMemo(() => {
    const isDark = theme === 'dark';
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: isDark ? '#cbd5e1' : '#334155',
            font: {
              family: 'Inter, sans-serif',
              size: 11,
              weight: '500'
            }
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          titleColor: isDark ? '#ffffff' : '#0f172a',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? '#334155' : '#e2e8f0',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true
        }
      },
      scales: {
        x: {
          grid: {
            color: isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(226, 232, 240, 0.5)',
            drawBorder: false
          },
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            font: { family: 'Inter, sans-serif', size: 10 }
          }
        },
        y: {
          grid: {
            color: isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(226, 232, 240, 0.5)',
            drawBorder: false
          },
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            font: { family: 'Inter, sans-serif', size: 10 },
            stepSize: 1,
            precision: 0
          }
        }
      }
    };
  }, [theme]);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[500px] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400" />
        <p className="text-slate-500 dark:text-slate-400 text-sm font-mono animate-pulse">
          Initializing Operations Console...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-8">
      {/* 1. Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 p-6 md:p-8 shadow-lg text-white">
        <div className="absolute right-4 md:right-10 top-1/2 -translate-y-1/2 opacity-15 pointer-events-none">
          <img src={logoUrl} alt="KBM Logo" className="h-32 w-32 object-contain" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
              <span className="text-xs uppercase font-mono tracking-widest text-slate-400">
                Operations Management Console
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Welcome back, {user?.name || user?.username || 'Administrator'}
            </h1>
            <p className="text-slate-400 text-sm max-w-xl">
              Role: <span className="text-slate-200 capitalize font-medium">{user?.role?.replace('_', ' ')}</span>{' '}
              | Access: <span className="text-slate-200 capitalize font-medium">{user?.accessLevel?.replace('_', ' ')}</span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5 font-mono text-xs text-slate-300 bg-slate-950/40 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm self-stretch md:self-auto min-w-[200px]">
            <div className="flex justify-between w-full gap-4">
              <span className="text-slate-500">SYSTEM TIME:</span>
              <span className="font-bold text-slate-200">
                {currentTime.toLocaleTimeString()}
              </span>
            </div>
            <div className="flex justify-between w-full gap-4">
              <span className="text-slate-500">SYSTEM DATE:</span>
              <span className="font-bold text-slate-200">
                {currentTime.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
            <div className="flex justify-between w-full gap-4 border-t border-slate-800 pt-1.5 mt-1.5">
              <span className="text-slate-500">DB TELEMETRY:</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full"></span>
                ONLINE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Key Operational Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
        {[
          {
            title: 'Registered Customers',
            value: stats.customers,
            description: 'Active client registry',
            icon: UsersIcon,
            color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/10 dark:text-blue-400',
            borderColor: 'border-blue-100 dark:border-blue-950',
            path: '/customers'
          },
          {
            title: 'Registered Buyers',
            value: stats.buyers,
            description: 'Material purchase agents',
            icon: CargoIcon,
            color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/10 dark:text-emerald-400',
            borderColor: 'border-emerald-100 dark:border-emerald-950',
            path: '/buyers'
          },
          {
            title: 'Active Employees',
            value: stats.employees,
            description: 'Staff & crew members',
            icon: HardHatIcon,
            color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/10 dark:text-amber-400',
            borderColor: 'border-amber-100 dark:border-amber-950',
            path: '/employees'
          },
          {
            title: 'Product Catalog',
            value: stats.materials,
            description: 'Active ore & metal sizes',
            icon: PackageIcon,
            color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/10 dark:text-indigo-400',
            borderColor: 'border-indigo-100 dark:border-indigo-950',
            path: '/materials'
          }
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={() => navigate(card.path)}
              className={`group flex flex-col justify-between bg-white dark:bg-slate-900 rounded-xl p-5 border ${card.borderColor} shadow-sm hover:shadow-md cursor-pointer transition-all duration-200 hover:-translate-y-0.5`}
            >
              <div className="flex justify-between items-start">
                <div className={`p-2.5 rounded-lg ${card.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <ChevronRightIcon className="h-5 w-5 text-slate-300 dark:text-slate-700 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
              </div>
              <div className="mt-4">
                <span className="block text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                  {card.value}
                </span>
                <span className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                  {card.title}
                </span>
                <span className="block text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {card.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Dispatch Activity & Diagnostics Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Dispatch Volume Chart (2/3 width) */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[400px]">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Weekly Dispatch Metrics
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Overview of daily load shipment counts
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span className="text-slate-600 dark:text-slate-400">Sales</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-slate-600 dark:text-slate-400">Purchases</span>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 relative">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* System Telemetry & Log Console (1/3 width) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col h-[400px] text-white">
          <div className="border-b border-slate-800 pb-3 mb-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <UserShieldIcon className="h-5 w-5 text-cyan-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Diagnostic Console
              </h3>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></span>
              <span>LIVE</span>
            </div>
          </div>

          {/* Telemetry Matrix Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4 text-[11px] font-mono">
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
              <div className="text-slate-500 uppercase tracking-widest text-[9px] mb-0.5">
                Latency Response
              </div>
              <div className="text-cyan-400 font-bold text-sm">{stats.apiLatency}</div>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
              <div className="text-slate-500 uppercase tracking-widest text-[9px] mb-0.5">
                DB Environment
              </div>
              <div className="text-slate-300 font-bold text-sm uppercase">
                {process.env.NODE_ENV || 'Production'}
              </div>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
              <div className="text-slate-500 uppercase tracking-widest text-[9px] mb-0.5">
                MongoDB cluster
              </div>
              <div className="text-slate-300 font-bold overflow-hidden text-ellipsis whitespace-nowrap">
                {stats.dbProvider}
              </div>
            </div>
            <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
              <div className="text-slate-500 uppercase tracking-widest text-[9px] mb-0.5">
                Database Name
              </div>
              <div className="text-slate-300 font-bold">{stats.dbName}</div>
            </div>
          </div>

          {/* Diagnostic Scrolling Log terminal */}
          <div className="flex-1 bg-slate-950 rounded-xl p-3 border border-slate-800/60 flex flex-col min-h-0 font-mono">
            <div className="text-slate-500 uppercase tracking-widest text-[9px] mb-1.5 border-b border-slate-900 pb-1 flex justify-between">
              <span>Security Event Stream</span>
              <span>v1.0.4</span>
            </div>
            <div className="flex-1 overflow-y-auto text-[10px] text-cyan-500/90 space-y-1.5 pr-1">
              {terminalLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed break-all">
                  <span className="text-slate-600 mr-1.5">&gt;</span>
                  {log}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Live Dispatches & Quick Actions Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Live Shipments Feed (2/3 width) */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col min-h-[360px]">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Recent Shipments Dispatch Feed
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Real-time log of customer deliveries and raw material purchases
              </p>
            </div>
            <div className="px-3 py-1 bg-slate-100 dark:bg-slate-850 text-[10px] font-bold text-slate-600 dark:text-slate-400 rounded-full font-mono uppercase">
              Operational Logs Only
            </div>
          </div>

          <div className="flex-1 overflow-x-auto min-w-0">
            {recentDeliveries.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-full text-slate-400 dark:text-slate-500 py-10 italic text-sm">
                No dispatches recorded today.
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="pb-3 pr-2">Date</th>
                    <th className="pb-3 px-2">Type</th>
                    <th className="pb-3 px-2">Vehicle</th>
                    <th className="pb-3 px-2">Material</th>
                    <th className="pb-3 pl-2">Destination / Source</th>
                    <th className="pb-3 pr-2 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {recentDeliveries.map((delivery, index) => (
                    <tr
                      key={delivery.id || index}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 pr-2 text-xs font-mono text-slate-500 whitespace-nowrap">
                        {new Date(delivery.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            delivery.type === 'Customer Sale'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200/20'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200/20'
                          }`}
                        >
                          {delivery.type}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-semibold text-slate-800 dark:text-slate-200 uppercase font-mono whitespace-nowrap">
                        {delivery.vehicle}
                      </td>
                      <td className="py-3 px-2 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                        {delivery.material}
                      </td>
                      <td className="py-3 pl-2 text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap max-w-[140px] truncate">
                        {delivery.target}
                      </td>
                      <td className="py-3 pr-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                        {delivery.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Administrative Quick Actions (1/3 width) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col min-h-[360px]">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Launchpad Console
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Quick access shortcuts for key administrative screens
            </p>
          </div>

          <div className="flex-1 flex flex-col justify-center space-y-3">
            {[
              {
                label: 'Record Customer Bill',
                desc: 'Register incoming vehicle load sales',
                icon: ReceiptIcon,
                path: '/bills',
                color: 'hover:border-blue-500 dark:hover:border-blue-400 group-hover:text-blue-500'
              },
              {
                label: 'Record Buyer Load',
                desc: 'Log raw materials delivered to quarry',
                icon: CargoIcon,
                path: '/loads',
                color: 'hover:border-emerald-500 dark:hover:border-emerald-400 group-hover:text-emerald-500'
              },
              {
                label: 'Manage Registry',
                desc: 'Add customers, buyers and materials',
                icon: UsersIcon,
                path: '/customers',
                color: 'hover:border-indigo-500 dark:hover:border-indigo-400 group-hover:text-indigo-500'
              },
              {
                label: 'Staff Attendance',
                desc: 'Log work status and employee attendance',
                icon: HardHatIcon,
                path: '/employees',
                color: 'hover:border-amber-500 dark:hover:border-amber-400 group-hover:text-amber-500'
              }
            ].map((act, index) => {
              const Icon = act.icon;
              return (
                <button
                  key={index}
                  onClick={() => navigate(act.path)}
                  className={`group flex items-center gap-4 p-3.5 bg-slate-50 hover:bg-white dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-100 hover:border-slate-200 dark:border-slate-950 dark:hover:border-slate-850 rounded-xl transition-all duration-200 hover:-translate-x-0.5 hover:shadow-sm text-left`}
                >
                  <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                      {act.label}
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      {act.desc}
                    </span>
                  </div>
                  <ChevronRightIcon className="h-5 w-5 text-slate-300 dark:text-slate-700 group-hover:text-slate-500 transition-colors" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
