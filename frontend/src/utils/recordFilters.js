export const defaultRecordFilters = {
  search: '',
  customerId: '',
  status: '',
  type: '',
  adminId: '',
  mode: 'date_newest',
  particularDate: '',
  startDate: '',
  endDate: '',
  month: '',
  weekStart: ''
};

export const toYMD = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const filterRecords = (items, filters, options = {}) => {
  const {
    getDate = (item) => item.date || item.createdAt || item.updatedAt,
    getSearchText = (item) => '',
    getCustomerId,
    getStatus,
    getType,
    getName
  } = options;

  let result = [...items];
  const search = filters.search?.trim().toLowerCase();

  if (search) {
    result = result.filter((item) => getSearchText(item).toLowerCase().includes(search));
  }

  if (filters.customerId && getCustomerId) {
    result = result.filter((item) => String(getCustomerId(item) || '') === filters.customerId);
  }

  if (filters.status && getStatus) {
    result = result.filter((item) => getStatus(item) === filters.status);
  }

  if (filters.type && getType) {
    result = result.filter((item) => getType(item) === filters.type);
  }

  if (filters.adminId && options.getAdminId) {
    result = result.filter((item) => String(options.getAdminId(item) || '') === filters.adminId);
  }

  if (filters.mode === 'particular_date' && filters.particularDate) {
    result = result.filter((item) => toYMD(getDate(item)) === filters.particularDate);
  }

  if (filters.mode === 'selected_dates' && filters.startDate && filters.endDate) {
    const start = new Date(`${filters.startDate}T00:00:00`);
    const end = new Date(`${filters.endDate}T23:59:59`);
    result = result.filter((item) => {
      const value = new Date(getDate(item));
      return value >= start && value <= end;
    });
  }

  if (filters.mode === 'month' && filters.month) {
    result = result.filter((item) => toYMD(getDate(item)).startsWith(filters.month));
  }

  if (filters.mode === 'week' && filters.weekStart) {
    const d = new Date(`${filters.weekStart}T00:00:00`);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    result = result.filter((item) => {
      const value = new Date(getDate(item));
      return value >= start && value <= end;
    });
  }

  const nameField = getName || ((item) => item.name || item.customerNameSnapshot || '');

  if (filters.mode === 'alpha_az') {
    result.sort((a, b) => nameField(a).localeCompare(nameField(b)));
  } else if (filters.mode === 'alpha_za') {
    result.sort((a, b) => nameField(b).localeCompare(nameField(a)));
  } else if (filters.mode === 'date_oldest') {
    result.sort((a, b) => new Date(getDate(a)) - new Date(getDate(b)));
  } else {
    result.sort((a, b) => new Date(getDate(b)) - new Date(getDate(a)));
  }

  if (search) {
    result.sort((a, b) => {
      const nameA = (nameField(a) || '').toLowerCase();
      const nameB = (nameField(b) || '').toLowerCase();
      const aStarts = nameA.startsWith(search);
      const bStarts = nameB.startsWith(search);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });
  }

  return result;
};
