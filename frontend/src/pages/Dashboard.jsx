import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';
import logoUrl from '../assets/dark KBM.png';
import {
  CargoIcon,
  ReceiptIcon,
  PackageIcon,
  CalendarIcon,
  UndoIcon
} from '../components/Icons';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Master Data
  const [customers, setCustomers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [bills, setBills] = useState([]);
  const [loads, setLoads] = useState([]);

  // Filters State
  const [timelineFilter, setTimelineFilter] = useState('all'); // 'today' | 'week' | 'month' | 'year' | 'custom' | 'all'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');

  // Tab State for Details List
  const [activeTab, setActiveTab] = useState('inward'); // 'inward' | 'outward'

  // Time ticker effect for display clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch operational data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [
          customersRes,
          buyersRes,
          materialsRes,
          billsRes,
          loadsRes
        ] = await Promise.allSettled([
          api.get('/customers'),
          api.get('/buyers'),
          api.get('/materials'),
          api.get('/bills'),
          api.get('/loads')
        ]);

        setCustomers(customersRes.status === 'fulfilled' ? customersRes.value.data : []);
        setBuyers(buyersRes.status === 'fulfilled' ? buyersRes.value.data : []);
        setMaterials(materialsRes.status === 'fulfilled' ? materialsRes.value.data : []);
        setBills(billsRes.status === 'fulfilled' ? billsRes.value.data : []);
        setLoads(loadsRes.status === 'fulfilled' ? loadsRes.value.data : []);
      } catch (err) {
        console.error('Failed to load dashboard metrics', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter Helper
  const isDateInRange = (dateStr, rangeType, customStart, customEnd) => {
    if (!dateStr) return false;
    const itemDate = new Date(dateStr);
    const now = new Date();
    
    switch (rangeType) {
      case 'today': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return itemDate >= start && itemDate <= end;
      }
      case 'week': {
        // Start of week: Sunday
        const day = now.getDay();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, 0, 0, 0, 0);
        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
        return itemDate >= start && itemDate <= end;
      }
      case 'month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return itemDate >= start && itemDate <= end;
      }
      case 'year': {
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        return itemDate >= start && itemDate <= end;
      }
      case 'custom': {
        if (!customStart || !customEnd) return true;
        const start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        const end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
        return itemDate >= start && itemDate <= end;
      }
      case 'all':
      default:
        return true;
    }
  };

  // Filtered Datasets
  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      // 1. Date Range
      if (!isDateInRange(b.date, timelineFilter, customStartDate, customEndDate)) return false;
      // 2. Material Filter
      if (selectedMaterial && b.materialNameSnapshot !== selectedMaterial) return false;
      // 3. Customer Filter
      if (selectedCustomer && b.customer !== selectedCustomer) return false;
      // 4. Supplier Filter (if filtering by supplier, outgoing bills should not match)
      if (selectedSupplier) return false;
      return true;
    });
  }, [bills, timelineFilter, customStartDate, customEndDate, selectedMaterial, selectedCustomer, selectedSupplier]);

  const filteredLoads = useMemo(() => {
    return loads.filter(l => {
      // 1. Date Range
      if (!isDateInRange(l.date, timelineFilter, customStartDate, customEndDate)) return false;
      // 2. Material Filter
      if (selectedMaterial && l.quarryName !== selectedMaterial) return false;
      // 3. Supplier Filter
      if (selectedSupplier && l.buyer !== selectedSupplier) return false;
      // 4. Customer Filter (if filtering by customer, incoming loads should not match)
      if (selectedCustomer) return false;
      return true;
    });
  }, [loads, timelineFilter, customStartDate, customEndDate, selectedMaterial, selectedCustomer, selectedSupplier]);

  // Aggregate Calculations
  const totalTonsIn = useMemo(() => {
    return filteredLoads
      .filter(l => l.unitType === 'tons')
      .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [filteredLoads]);

  const totalUnitsIn = useMemo(() => {
    return filteredLoads
      .filter(l => l.unitType === 'units')
      .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [filteredLoads]);

  const totalTonsOut = useMemo(() => {
    return filteredBills
      .filter(b => b.quantityUnit === 'ton')
      .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  }, [filteredBills]);

  const totalUnitsOut = useMemo(() => {
    return filteredBills
      .filter(b => b.quantityUnit === 'unit')
      .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  }, [filteredBills]);

  const netTons = totalTonsIn - totalTonsOut;

  // Compile unique materials list
  const uniqueMaterialNames = useMemo(() => {
    const names = new Set();
    materials.forEach(m => { if (m.name) names.add(m.name); });
    loads.forEach(l => { if (l.quarryName) names.add(l.quarryName); });
    bills.forEach(b => { if (b.materialNameSnapshot) names.add(b.materialNameSnapshot); });
    return Array.from(names).sort();
  }, [materials, loads, bills]);

  // Compile Material Flow aggregates
  const materialFlowData = useMemo(() => {
    return uniqueMaterialNames.map(name => {
      const matLoads = filteredLoads.filter(l => l.quarryName === name);
      const tonsIn = matLoads.filter(l => l.unitType === 'tons').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
      const unitsIn = matLoads.filter(l => l.unitType === 'units').reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
      
      const matBills = filteredBills.filter(b => b.materialNameSnapshot === name);
      const tonsOut = matBills.filter(b => b.quantityUnit === 'ton').reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
      const unitsOut = matBills.filter(b => b.quantityUnit === 'unit').reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

      const netTonsBalance = tonsIn - tonsOut;

      return {
        name,
        tonsIn,
        unitsIn,
        tonsOut,
        unitsOut,
        netTonsBalance
      };
    }).filter(item => {
      if (selectedMaterial && item.name !== selectedMaterial) return false;
      return item.tonsIn > 0 || item.unitsIn > 0 || item.tonsOut > 0 || item.unitsOut > 0;
    });
  }, [uniqueMaterialNames, filteredLoads, filteredBills, selectedMaterial]);

  const resetFilters = () => {
    setTimelineFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedMaterial('');
    setSelectedCustomer('');
    setSelectedSupplier('');
  };

  const getActiveFilterLabel = () => {
    const parts = [];
    const timelineLabelMap = {
      today: 'Today',
      week: 'This Week',
      month: 'This Month',
      year: 'This Year',
      all: 'All Time',
      custom: 'Custom Range'
    };
    parts.push(`Timeline: ${timelineLabelMap[timelineFilter]}`);
    if (timelineFilter === 'custom' && customStartDate && customEndDate) {
      parts.push(`(${customStartDate} to ${customEndDate})`);
    }
    if (selectedMaterial) parts.push(`Material: ${selectedMaterial}`);
    if (selectedCustomer) {
      const cust = customers.find(c => c._id === selectedCustomer);
      parts.push(`Customer: ${cust ? cust.name : 'Selected'}`);
    }
    if (selectedSupplier) {
      const supp = buyers.find(b => b._id === selectedSupplier);
      parts.push(`Supplier: ${supp ? supp.name : 'Selected'}`);
    }
    return parts.join(' | ');
  };

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
        <div className="hidden md:block absolute right-72 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
          <img src={logoUrl} alt="KBM Logo" className="h-28 w-28 object-contain" />
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
              Material Flow & Load Dashboard
            </h1>
            <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
              Active Filters: <span className="text-blue-300 font-bold">{getActiveFilterLabel()}</span>
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

      {/* 2. Interactive Filters Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Interactive Control Panel
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Filter material quantities by time periods, material types, and customer/supplier registries
            </p>
          </div>
          
          {(timelineFilter !== 'all' || selectedMaterial || selectedCustomer || selectedSupplier) && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:hover:bg-red-950/40 dark:text-red-400 text-xs font-bold rounded-lg border border-red-200/30 transition-all"
            >
              <UndoIcon className="h-4 w-4" />
              Reset Filters
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Date/Timeline Column */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Timeline Range
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Today', value: 'today' },
                { label: 'This Week', value: 'week' },
                { label: 'This Month', value: 'month' },
                { label: 'This Year', value: 'year' },
                { label: 'All Time', value: 'all' },
                { label: 'Custom Range', value: 'custom' },
              ].map(btn => (
                <button
                  key={btn.value}
                  onClick={() => {
                    setTimelineFilter(btn.value);
                    if (btn.value !== 'custom') {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    timelineFilter === btn.value
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {timelineFilter === 'custom' && (
              <div className="flex items-center gap-3 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <CalendarIcon className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <span className="text-slate-400 text-xs font-bold">to</span>
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <CalendarIcon className="h-4 w-4" />
                  </span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Entity Selectors Column */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Material Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Material
              </label>
              <select
                value={selectedMaterial}
                onChange={e => setSelectedMaterial(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Materials</option>
                {uniqueMaterialNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Customer Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Customer (Outward)
              </label>
              <select
                value={selectedCustomer}
                onChange={e => {
                  setSelectedCustomer(e.target.value);
                  if (e.target.value) {
                    setSelectedSupplier(''); // mutual exclusion
                  }
                }}
                className="w-full border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Customers</option>
                {customers.map(c => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Supplier Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Supplier (Inward)
              </label>
              <select
                value={selectedSupplier}
                onChange={e => {
                  setSelectedSupplier(e.target.value);
                  if (e.target.value) {
                    setSelectedCustomer(''); // mutual exclusion
                  }
                }}
                className="w-full border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Suppliers</option>
                {buyers.map(b => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Key Tons and Units Flow Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Incoming Tons Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-450 rounded-2xl">
            <CargoIcon className="h-8 w-8" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-slate-450 dark:text-slate-500 uppercase tracking-wider">
              Total Incoming Load
            </span>
            <span className="block text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">
              {totalTonsIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg font-bold text-slate-500">tons</span>
            </span>
            <div className="flex gap-4 mt-2 text-xs font-semibold text-slate-500 dark:text-slate-455">
              <span>{filteredLoads.length} inward loads</span>
              {totalUnitsIn > 0 && (
                <span className="border-l border-slate-200 dark:border-slate-800 pl-3">
                  {totalUnitsIn.toLocaleString()} units
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Outgoing Tons Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center gap-5 hover:shadow-md transition-shadow">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl">
            <ReceiptIcon className="h-8 w-8" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-slate-455 dark:text-slate-500 uppercase tracking-wider">
              Total Outgoing Load
            </span>
            <span className="block text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">
              {totalTonsOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg font-bold text-slate-500">tons</span>
            </span>
            <div className="flex gap-4 mt-2 text-xs font-semibold text-slate-500 dark:text-slate-455">
              <span>{filteredBills.length} outward bills</span>
              {totalUnitsOut > 0 && (
                <span className="border-l border-slate-200 dark:border-slate-800 pl-3">
                  {totalUnitsOut.toLocaleString()} units
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Net Stock Flow Card */}
        <div className={`bg-white dark:bg-slate-900 border rounded-2xl p-6 shadow-sm flex items-center gap-5 hover:shadow-md transition-all ${
          netTons >= 0 
            ? 'border-emerald-100 dark:border-emerald-950/50 bg-gradient-to-br from-white to-emerald-50/10 dark:from-slate-900 dark:to-emerald-950/5' 
            : 'border-rose-100 dark:border-rose-950/50 bg-gradient-to-br from-white to-rose-50/10 dark:from-slate-900 dark:to-rose-950/5'
        }`}>
          <div className={`p-4 rounded-2xl ${
            netTons >= 0 
              ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450' 
              : 'bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
          }`}>
            <PackageIcon className="h-8 w-8" />
          </div>
          <div>
            <span className="block text-sm font-semibold text-slate-450 dark:text-slate-500 uppercase tracking-wider">
              Net Flow Balance
            </span>
            <span className={`block text-3xl font-extrabold mt-1 ${
              netTons >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-455'
            }`}>
              {netTons >= 0 ? '+' : ''}{netTons.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-lg font-bold text-slate-500">tons</span>
            </span>
            <span className="block text-xs text-slate-400 dark:text-slate-500 mt-1 font-medium">
              {netTons >= 0 ? 'Surplus (Inflow exceeding Outflow)' : 'Deficit (Outflow exceeding Inflow)'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Material-wise Flow Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <PackageIcon className="h-5 w-5 text-indigo-500" />
              Material Quantity Flow Summary
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Aggregated quantities incoming (supplier loads) and outgoing (customer sales) by material classification
            </p>
          </div>
          <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800/60 text-[10px] font-bold text-slate-500 dark:text-slate-400 rounded-full font-mono uppercase self-start sm:self-auto border border-slate-200/30">
            Aggregated Stocks
          </div>
        </div>

        <div className="overflow-x-auto">
          {materialFlowData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500 italic text-sm">
              No material flow activity in the selected range.
            </div>
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <th className="pb-3 pr-4">Material Name</th>
                  <th className="pb-3 px-4 text-center">Inward (Into Company)</th>
                  <th className="pb-3 px-4 text-center">Outward (To Customer)</th>
                  <th className="pb-3 px-4 text-right">Net Ton Balance</th>
                  <th className="pb-3 pl-6 pr-2 w-1/4">Flow Ratio (In vs Out)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {materialFlowData.map((item, idx) => {
                  const totalTons = item.tonsIn + item.tonsOut;
                  const inPercent = totalTons > 0 ? (item.tonsIn / totalTons) * 100 : 0;
                  const outPercent = totalTons > 0 ? (item.tonsOut / totalTons) * 100 : 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="py-4 pr-4 font-bold text-slate-850 dark:text-slate-200">
                        {item.name}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="block font-bold text-emerald-600 dark:text-emerald-400">
                          {item.tonsIn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tons
                        </span>
                        {item.unitsIn > 0 && (
                          <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                            {item.unitsIn.toLocaleString()} units
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="block font-bold text-blue-600 dark:text-blue-400">
                          {item.tonsOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tons
                        </span>
                        {item.unitsOut > 0 && (
                          <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                            {item.unitsOut.toLocaleString()} units
                          </span>
                        )}
                      </td>
                      <td className={`py-4 px-4 text-right font-mono font-bold text-sm ${
                        item.netTonsBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-455'
                      }`}>
                        {item.netTonsBalance >= 0 ? '+' : ''}{item.netTonsBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tons
                      </td>
                      <td className="py-4 pl-6 pr-2">
                        {totalTons > 0 ? (
                          <div className="space-y-1.5">
                            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              {inPercent > 0 && (
                                <div 
                                  style={{ width: `${inPercent}%` }} 
                                  className="bg-emerald-500 dark:bg-emerald-600 transition-all duration-500"
                                  title={`Incoming: ${inPercent.toFixed(1)}%`}
                                />
                              )}
                              {outPercent > 0 && (
                                <div 
                                  style={{ width: `${outPercent}%` }} 
                                  className="bg-blue-500 dark:bg-blue-600 transition-all duration-500"
                                  title={`Outgoing: ${outPercent.toFixed(1)}%`}
                                />
                              )}
                            </div>
                            <div className="flex justify-between text-[10px] font-bold font-mono text-slate-400">
                              <span>IN: {inPercent.toFixed(0)}%</span>
                              <span>OUT: {outPercent.toFixed(0)}%</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600 italic">No ton records</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 5. Detailed Transactions Ledger */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Detailed Transaction Ledger
            </h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Itemized ledger of supplier loads and customer bills matching your current filter criteria
            </p>
          </div>
          
          {/* Tab Switches */}
          <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/20">
            <button
              onClick={() => setActiveTab('inward')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'inward'
                  ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-350'
              }`}
            >
              Inward Supplier Loads ({filteredLoads.length})
            </button>
            <button
              onClick={() => setActiveTab('outward')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'outward'
                  ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-150 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-350'
              }`}
            >
              Outward Customer Bills ({filteredBills.length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          {activeTab === 'inward' ? (
            filteredLoads.length === 0 ? (
              <div className="flex justify-center items-center py-12 text-slate-400 dark:text-slate-500 italic text-sm">
                No inward supplier loads match the current filter.
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="pb-3 pr-2">Date</th>
                    <th className="pb-3 px-2">Vehicle</th>
                    <th className="pb-3 px-2">Supplier (Buyer)</th>
                    <th className="pb-3 px-2">Material</th>
                    <th className="pb-3 px-2 text-right">Quantity</th>
                    <th className="pb-3 px-2 text-right">Price/Unit</th>
                    <th className="pb-3 pr-2 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredLoads.map((load, index) => (
                    <tr key={load._id || index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors font-medium">
                      <td className="py-3.5 pr-2 text-xs font-mono text-slate-500 whitespace-nowrap">
                        {new Date(load.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3.5 px-2 font-semibold text-slate-800 dark:text-slate-200 uppercase font-mono whitespace-nowrap">
                        {load.vehicleNumber || '—'}
                      </td>
                      <td className="py-3.5 px-2 text-slate-700 dark:text-slate-350 whitespace-nowrap">
                        {load.buyerNameSnapshot || '—'}
                      </td>
                      <td className="py-3.5 px-2 text-slate-650 dark:text-slate-400 text-xs whitespace-nowrap font-bold">
                        {load.quarryName || '—'}
                      </td>
                      <td className="py-3.5 px-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                        {load.quantity ? Number(load.quantity).toFixed(2) : '—'} <span className="text-[10px] text-slate-400">{load.unitType || 'tons'}</span>
                      </td>
                      <td className="py-3.5 px-2 text-right font-mono text-slate-500 text-xs whitespace-nowrap">
                        ₹{load.price ? Number(load.price).toLocaleString() : '0'}
                      </td>
                      <td className="py-3.5 pr-2 text-right font-mono font-extrabold text-slate-800 dark:text-slate-150 text-xs whitespace-nowrap">
                        ₹{load.totalAmount ? Number(load.totalAmount).toLocaleString() : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            filteredBills.length === 0 ? (
              <div className="flex justify-center items-center py-12 text-slate-400 dark:text-slate-500 italic text-sm">
                No outward customer bills match the current filter.
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <th className="pb-3 pr-2">Date</th>
                    <th className="pb-3 px-2">Bill No</th>
                    <th className="pb-3 px-2">Vehicle</th>
                    <th className="pb-3 px-2">Customer</th>
                    <th className="pb-3 px-2">Material</th>
                    <th className="pb-3 px-2 text-right">Quantity</th>
                    <th className="pb-3 px-2 text-right">Price/Unit</th>
                    <th className="pb-3 pr-2 text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredBills.map((bill, index) => (
                    <tr key={bill._id || index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors font-medium">
                      <td className="py-3.5 pr-2 text-xs font-mono text-slate-500 whitespace-nowrap">
                        {new Date(bill.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3.5 px-2 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {bill.billNumber || '—'}
                      </td>
                      <td className="py-3.5 px-2 font-semibold text-slate-800 dark:text-slate-200 uppercase font-mono whitespace-nowrap">
                        {bill.vehicleNumber || '—'}
                      </td>
                      <td className="py-3.5 px-2 text-slate-700 dark:text-slate-350 whitespace-nowrap">
                        {bill.customerNameSnapshot || '—'}
                      </td>
                      <td className="py-3.5 px-2 text-slate-650 dark:text-slate-400 text-xs whitespace-nowrap font-bold">
                        {bill.materialNameSnapshot || '—'}
                      </td>
                      <td className="py-3.5 px-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                        {bill.quantity ? Number(bill.quantity).toFixed(2) : '—'} <span className="text-[10px] text-slate-400">{bill.quantityUnit || 'ton'}s</span>
                      </td>
                      <td className="py-3.5 px-2 text-right font-mono text-slate-500 text-xs whitespace-nowrap">
                        ₹{bill.pricePerUnit ? Number(bill.pricePerUnit).toLocaleString() : '0'}
                      </td>
                      <td className="py-3.5 pr-2 text-right font-mono font-extrabold text-slate-800 dark:text-slate-150 text-xs whitespace-nowrap">
                        ₹{bill.totalAmount ? Number(bill.totalAmount).toLocaleString() : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
