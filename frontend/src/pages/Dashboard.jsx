import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';
import logoUrl from '../assets/dark KBM.png';
import {
  UsersIcon,
  HardHatIcon,
  PackageIcon,
  CargoIcon,
  ChevronRightIcon,
  ReceiptIcon
} from '../components/Icons';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState({
    customers: 0,
    buyers: 0,
    employees: 0,
    materials: 0,
    todayBills: 0,
    todayLoads: 0
  });
  const [recentDeliveries, setRecentDeliveries] = useState([]);

  // Time ticker effect for display clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch operational metrics (strictly no financial values or system/telemetry configs)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [
          customersRes,
          buyersRes,
          employeesRes,
          materialsRes,
          billsRes,
          loadsRes
        ] = await Promise.allSettled([
          api.get('/customers'),
          api.get('/buyers'),
          api.get('/employees'),
          api.get('/materials'),
          api.get('/bills'),
          api.get('/loads')
        ]);

        const customers = customersRes.status === 'fulfilled' ? customersRes.value.data : [];
        const buyers = buyersRes.status === 'fulfilled' ? buyersRes.value.data : [];
        const employees = employeesRes.status === 'fulfilled' ? employeesRes.value.data : [];
        const materials = materialsRes.status === 'fulfilled' ? materialsRes.value.data : [];
        const bills = billsRes.status === 'fulfilled' ? billsRes.value.data : [];
        const loads = loadsRes.status === 'fulfilled' ? loadsRes.value.data : [];

        const todayStr = new Date().toLocaleDateString('sv'); // sv-SE outputs YYYY-MM-DD
        const todayBills = bills.filter(b => b.date && b.date.startsWith(todayStr)).length;
        const todayLoads = loads.filter(l => l.date && l.date.startsWith(todayStr)).length;

        // Formulate dispatches (Sales)
        const formattedBills = bills.map(b => ({
          id: b._id,
          type: 'Customer Sale',
          date: b.date,
          vehicle: b.vehicleNumber || '—',
          material: b.materialNameSnapshot || '—',
          target: b.customerNameSnapshot || '—',
          quantity: `${b.quantity ? Number(b.quantity).toFixed(2) : '—'} ${b.unitType || 'tons'}`
        }));

        // Formulate purchases (Loads)
        const formattedLoads = loads.map(l => ({
          id: l._id,
          type: 'Buyer Purchase',
          date: l.date,
          vehicle: l.vehicleNumber || '—',
          material: l.quarryName || '—',
          target: l.buyerNameSnapshot || '—',
          quantity: `${l.quantity ? Number(l.quantity).toFixed(2) : '—'} ${l.unitType || 'tons'}`
        }));

        // Merge latest 10 dispatches
        const merged = [...formattedBills, ...formattedLoads]
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 10);

        setRecentDeliveries(merged);

        setStats({
          customers: customers.length,
          buyers: buyers.length,
          employees: employees.length,
          materials: materials.length,
          todayBills,
          todayLoads
        });
      } catch (err) {
        console.error('Failed to load dashboard metrics', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[500px] space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400" />
        <p className="text-slate-500 dark:text-slate-400 text-sm font-sans animate-pulse">
          Loading dashboard overview...
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
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-xs uppercase font-sans font-semibold tracking-wider text-slate-400">
                Krishna Blue Metals Operations Portal
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Welcome back, {user?.name || user?.username || 'Administrator'}
            </h1>
            <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
              Hello! Here is your daily operational summary. Today, we have recorded{' '}
              <span className="text-blue-300 font-bold">{stats.todayBills} Customer Dispatches</span> and{' '}
              <span className="text-emerald-300 font-bold">{stats.todayLoads} Supplier Deliveries</span>.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 font-sans text-xs text-slate-300 bg-slate-950/40 p-4 rounded-xl border border-slate-700/50 backdrop-blur-sm self-stretch md:self-auto min-w-[200px]">
            <div className="flex justify-between w-full gap-4">
              <span className="text-slate-500 font-medium">TIME:</span>
              <span className="font-bold text-slate-200">
                {currentTime.toLocaleTimeString()}
              </span>
            </div>
            <div className="flex justify-between w-full gap-4">
              <span className="text-slate-500 font-medium">DATE:</span>
              <span className="font-bold text-slate-200">
                {currentTime.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Key Operational Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6">
        {[
          {
            title: "Today's Client Bills",
            value: stats.todayBills,
            description: 'Customer deliveries today',
            icon: ReceiptIcon,
            color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/10 dark:text-blue-400',
            borderColor: 'border-blue-100 dark:border-blue-950',
            path: '/bills'
          },
          {
            title: "Today's Supplier Loads",
            value: stats.todayLoads,
            description: 'Raw materials received today',
            icon: CargoIcon,
            color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/10 dark:text-emerald-400',
            borderColor: 'border-emerald-100 dark:border-emerald-950',
            path: '/loads'
          },
          {
            title: 'Active Workforce',
            value: stats.employees,
            description: 'Registered crew members',
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

      {/* 3. Operational Feed & Quick Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Shipments Feed (2/3 width) */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col min-h-[500px]">
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
              Operational Logs
            </div>
          </div>

          <div className="flex-1 overflow-x-auto min-w-0">
            {recentDeliveries.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-full text-slate-400 dark:text-slate-500 py-10 italic text-sm">
                No dispatches recorded.
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
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors font-medium"
                    >
                      <td className="py-3.5 pr-2 text-xs font-mono text-slate-500 whitespace-nowrap">
                        {new Date(delivery.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3.5 px-2 whitespace-nowrap">
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
                      <td className="py-3.5 px-2 font-semibold text-slate-800 dark:text-slate-200 uppercase font-mono whitespace-nowrap">
                        {delivery.vehicle}
                      </td>
                      <td className="py-3.5 px-2 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                        {delivery.material}
                      </td>
                      <td className="py-3.5 pl-2 text-slate-700 dark:text-slate-200 whitespace-nowrap max-w-[140px] truncate">
                        {delivery.target}
                      </td>
                      <td className="py-3.5 pr-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                        {delivery.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Section: Actions & Registry Summary (1/3 width) */}
        <div className="flex flex-col gap-6">
          {/* Quick Actions Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Launchpad Console
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Quick access shortcuts for key administrative screens
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  label: 'Record Customer Bill',
                  desc: 'Register incoming vehicle load sales',
                  icon: ReceiptIcon,
                  path: '/bills'
                },
                {
                  label: 'Record Buyer Load',
                  desc: 'Log raw materials delivered to quarry',
                  icon: CargoIcon,
                  path: '/loads'
                },
                {
                  label: 'Manage Registry',
                  desc: 'Add customers, buyers and materials',
                  icon: UsersIcon,
                  path: '/customers'
                },
                {
                  label: 'Staff Attendance',
                  desc: 'Log work status and employee attendance',
                  icon: HardHatIcon,
                  path: '/employees'
                }
              ].map((act, index) => {
                const Icon = act.icon;
                return (
                  <button
                    key={index}
                    onClick={() => navigate(act.path)}
                    className="group flex items-center gap-4 p-3 bg-slate-50 hover:bg-white dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-100 hover:border-slate-200 dark:border-slate-950 dark:hover:border-slate-850 rounded-xl transition-all duration-200 hover:-translate-x-0.5 hover:shadow-sm text-left w-full"
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

          {/* Registry Totals Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <UsersIcon className="h-5 w-5 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Registry Summary
                </h3>
              </div>
              <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded uppercase tracking-wider">
                All-time
              </span>
            </div>

            <div className="space-y-3.5 text-xs font-medium">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-400 dark:text-slate-500">Registered Customers</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {stats.customers} accounts
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-t border-slate-100 dark:border-slate-850 pt-2">
                <span className="text-slate-400 dark:text-slate-500">Registered Suppliers (Buyers)</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {stats.buyers} buyers
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-t border-slate-100 dark:border-slate-850 pt-2">
                <span className="text-slate-400 dark:text-slate-500">Registered Workforce</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {stats.employees} crew members
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-t border-slate-100 dark:border-slate-850 pt-2">
                <span className="text-slate-400 dark:text-slate-500">Material Classifications</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {stats.materials} products
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
