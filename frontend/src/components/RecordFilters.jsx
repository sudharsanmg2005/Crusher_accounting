import React from 'react';

const RecordFilters = ({
  filters,
  onChange,
  customers = [],
  admins = [],
  typeOptions = [],
  statusOptions = [],
  searchPlaceholder = 'Search records',
  summary = []
}) => {
  const toYMD = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const set = (patch) => onChange((prev) => {
    const next = { ...prev, ...patch };
    const todayStr = toYMD(new Date());

    if (patch.hasOwnProperty('mode')) {
      if (patch.mode === 'particular_date' && !next.particularDate) {
        next.particularDate = todayStr;
      } else if (patch.mode === 'month' && !next.month) {
        next.month = todayStr.substring(0, 7);
      } else if (patch.mode === 'week' && !next.weekStart) {
        const d = new Date();
        const day = d.getDay();
        const sunday = new Date(d);
        sunday.setDate(d.getDate() - day);
        next.weekStart = toYMD(sunday);
      } else if (patch.mode === 'selected_dates') {
        if (!next.startDate) {
          const d = new Date();
          const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
          next.startDate = toYMD(firstDay);
        }
        if (!next.endDate) {
          next.endDate = todayStr;
        }
      }
    }

    if (patch.hasOwnProperty('weekStart') && patch.weekStart) {
      const d = new Date(patch.weekStart + 'T00:00:00');
      const day = d.getDay();
      const sunday = new Date(d);
      sunday.setDate(d.getDate() - day);
      next.weekStart = toYMD(sunday);
    }

    return next;
  });

  return (
    <div className="p-4 border-b border-slate-200 bg-white space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder={searchPlaceholder}
          className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />

        {typeOptions.length > 0 && (
          <select
            value={filters.type}
            onChange={(e) => set({ type: e.target.value })}
            className="border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All types</option>
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}

        {customers.length > 0 && (
          <select
            value={filters.customerId}
            onChange={(e) => set({ customerId: e.target.value })}
            className="border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer._id} value={customer._id}>{customer.name}</option>
            ))}
          </select>
        )}

        {statusOptions.length > 0 && (
          <select
            value={filters.status}
            onChange={(e) => set({ status: e.target.value })}
            className="border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All status</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}

        {admins.length > 0 && (
          <select
            value={filters.adminId}
            onChange={(e) => set({ adminId: e.target.value })}
            className="border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All admins</option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>{admin.name}</option>
            ))}
          </select>
        )}

        <select
          value={filters.mode}
          onChange={(e) => set({ mode: e.target.value })}
          className="border border-slate-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="date_newest">Date: newest first</option>
          <option value="date_oldest">Date: oldest first</option>
          <option value="alpha_az">Name A to Z</option>
          <option value="alpha_za">Name Z to A</option>
          <option value="particular_date">Particular date</option>
          <option value="selected_dates">Selected dates</option>
          <option value="month">Month</option>
          <option value="week">Week</option>
        </select>
      </div>

      {['particular_date', 'month', 'week', 'selected_dates'].includes(filters.mode) && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg animate-in slide-in-from-top-1 duration-200">
          {filters.mode === 'particular_date' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Particular Date:</span>
              <input
                type="date"
                value={filters.particularDate}
                onChange={(e) => set({ particularDate: e.target.value })}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              />
            </div>
          )}
          {filters.mode === 'month' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Month:</span>
              <input
                type="month"
                value={filters.month}
                onChange={(e) => set({ month: e.target.value })}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              />
            </div>
          )}
          {filters.mode === 'week' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Week Start (Snaps to Sun):</span>
              <input
                type="date"
                value={filters.weekStart}
                onChange={(e) => set({ weekStart: e.target.value })}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              />
            </div>
          )}
          {filters.mode === 'selected_dates' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date Range:</span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => set({ startDate: e.target.value })}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => set({ endDate: e.target.value })}
                className="border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              />
            </div>
          )}
        </div>
      )}

      {summary.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          {summary.map(({ label, value, tone = 'slate' }) => (
            <span
              key={label}
              className={`rounded-lg px-3 py-2 font-semibold border ${
                tone === 'green'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : tone === 'red'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : tone === 'orange'
                      ? 'bg-orange-50 border-orange-200 text-orange-700'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {label}: {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecordFilters;
