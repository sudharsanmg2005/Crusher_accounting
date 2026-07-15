import React, { useMemo, useState, useEffect } from 'react';
import RecordFilters from './RecordFilters';
import { filterRecords } from '../utils/recordFilters';
import { formatDateTime } from '../utils/dateTime';
import { TrashIcon } from '../components/Icons';
import { useConfirm } from '../components/ConfirmDialog';
import api from '../api';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

const EmptyRow = ({ colSpan, label }) => (
  <tr>
    <td colSpan={colSpan} className="p-6 text-center text-sm text-slate-500">{label}</td>
  </tr>
);

const RecordTable = ({
  title,
  count,
  headers,
  children,
  empty,
  wide,
  selectedCount = 0,
  onClearSelection,
  onBulkDelete,
  isAllSelected = false,
  onSelectAll
}) => (
  <div className={`border border-slate-200 rounded-lg overflow-hidden ${wide ? 'xl:col-span-2' : ''}`}>
    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-900 flex justify-between items-center">
      <span>{title} ({count})</span>
    </div>

    {selectedCount > 0 && (
      <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex justify-between items-center text-xs animate-in slide-in-from-top-1 duration-150 shrink-0">
        <span className="font-semibold text-red-800">{selectedCount} selected</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClearSelection}
            className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded font-semibold text-slate-700 transition cursor-pointer"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onBulkDelete}
            className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded font-bold text-white transition cursor-pointer"
          >
            Delete Selected
          </button>
        </div>
      </div>
    )}

    <div className="max-h-80 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white border-b border-slate-100 text-slate-500 uppercase text-xs z-10 shadow-sm">
          <tr>
            {count > 0 && (
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={onSelectAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>
            )}
            {headers.map((header) => (
              <th key={header} className={`p-3 ${['Amount', 'Total', 'Pending', 'Daily Wage', 'Unit Price', 'Ton Price'].includes(header) ? 'text-right' : ''}`}>{header}</th>
            ))}
            {count > 0 && <th className="p-3 w-16 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {count === 0 ? <EmptyRow colSpan={headers.length} label={empty} /> : children}
        </tbody>
      </table>
    </div>
  </div>
);

const BusinessRecords = ({ records, filters, onFiltersChange, onRefresh }) => {
  const confirm = useConfirm();

  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedBills, setSelectedBills] = useState([]);
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [selectedMaterials, setSelectedMaterials] = useState([]);

  useEffect(() => {
    setSelectedCustomers([]);
    setSelectedEmployees([]);
    setSelectedBills([]);
    setSelectedExpenses([]);
    setSelectedMaterials([]);
  }, [filters]);

  const handleDeleteCustomer = async (customer) => {
    const ok = await confirm({
      title: 'Delete Customer',
      message: `Are you sure you want to delete customer "${customer.name}"? This will archive their record.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await api.delete(`/customers/${customer._id}`);
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete customer.');
    }
  };

  const handleDeleteEmployee = async (employee) => {
    const ok = await confirm({
      title: 'Delete Employee',
      message: `Are you sure you want to delete employee "${employee.name}"? This will archive their record.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await api.delete(`/employees/${employee._id}`);
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete employee.');
    }
  };

  const handleDeleteBill = async (bill) => {
    const ok = await confirm({
      title: 'Delete Bill',
      message: `Are you sure you want to delete bill for "${bill.customerNameSnapshot}" on ${new Date(bill.date).toLocaleDateString()}? This will archive the bill.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await api.delete(`/bills/${bill._id}`);
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete bill.');
    }
  };

  const handleDeleteExpense = async (expense) => {
    const ok = await confirm({
      title: 'Delete Expense',
      message: `Are you sure you want to delete expense "${expense.type}" for Rs. ${Number(expense.amount).toLocaleString()}? This will archive the expense.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await api.delete(`/expenses/${expense._id}`);
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete expense.');
    }
  };

  const handleDeleteMaterial = async (material) => {
    const ok = await confirm({
      title: 'Delete Material',
      message: `Are you sure you want to delete material "${material.name}"? This will archive the material.`,
      confirmText: 'Delete',
      tone: 'danger'
    });
    if (!ok) return;
    try {
      await api.delete(`/materials/${material._id}`);
      onRefresh?.();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete material.');
    }
  };

  const handleBulkDelete = async (type, items, selectedStateSetter) => {
    if (items.length === 0) return;
    const ok = await confirm({
      title: `Delete Selected ${type}s`,
      message: `Are you sure you want to delete the ${items.length} selected ${type.toLowerCase()}(s)? This will archive these records.`,
      confirmText: 'Delete Selected',
      tone: 'danger'
    });
    if (!ok) return;

    try {
      let successCount = 0;
      let failCount = 0;

      await Promise.all(
        items.map(async (item) => {
          try {
            let endpoint = '';
            if (type === 'Customer') endpoint = `/customers/${item._id}`;
            else if (type === 'Employee') endpoint = `/employees/${item._id}`;
            else if (type === 'Bill') endpoint = `/bills/${item._id}`;
            else if (type === 'Expense') endpoint = `/expenses/${item._id}`;
            else if (type === 'Material') endpoint = `/materials/${item._id}`;

            await api.delete(endpoint);
            successCount++;
          } catch (err) {
            console.error(`Failed to delete ${type} ID ${item._id}`, err);
            failCount++;
          }
        })
      );

      alert(`Successfully deleted ${successCount} ${type.toLowerCase()}(s).`);
      selectedStateSetter([]);
      onRefresh?.();
    } catch (err) {
      alert('An error occurred during bulk deletion.');
    }
  };

  const handleSelectRow = (item, selectedState, selectedStateSetter) => {
    selectedStateSetter((prev) => {
      const exists = prev.some((x) => x._id === item._id);
      if (exists) {
        return prev.filter((x) => x._id !== item._id);
      } else {
        return [...prev, item];
      }
    });
  };

  const handleSelectAllRows = (filteredList, selectedState, selectedStateSetter) => {
    if (selectedState.length === filteredList.length) {
      selectedStateSetter([]);
    } else {
      selectedStateSetter(filteredList);
    }
  };
  const filteredCustomers = useMemo(
    () =>
      filterRecords(records.customers, filters, {
        getDate: (item) => item.createdAt,
        getSearchText: (item) =>
          [item.name, item.phone, item.address, ...(item.vehicles || []).map((v) => v.number)].filter(Boolean).join(' '),
        getType: () => 'Customer',
        getName: (item) => item.name
      }).filter((item) => !filters.type || filters.type === 'Customer'),
    [records.customers, filters]
  );

  const filteredEmployees = useMemo(
    () =>
      filterRecords(records.employees, filters, {
        getDate: (item) => item.createdAt,
        getSearchText: (item) => [item.name, item.phone, item.designation].filter(Boolean).join(' '),
        getType: () => 'Employee',
        getName: (item) => item.name
      }).filter((item) => !filters.type || filters.type === 'Employee'),
    [records.employees, filters]
  );

  const filteredBills = useMemo(
    () =>
      filterRecords(records.bills, filters, {
        getDate: (item) => item.date,
        getSearchText: (item) =>
          [item.customerNameSnapshot, item.vehicleNumber, item.materialNameSnapshot]
            .filter(Boolean)
            .join(' '),
        getCustomerId: (item) => item.customer,
        getStatus: (item) => item.paymentStatus,
        getType: () => 'Bill',
        getName: (item) => item.customerNameSnapshot
      }).filter((item) => !filters.type || filters.type === 'Bill'),
    [records.bills, filters]
  );

  const filteredExpenses = useMemo(
    () =>
      filterRecords(records.expenses, filters, {
        getDate: (item) => item.date,
        getSearchText: (item) => [item.type, item.description].filter(Boolean).join(' '),
        getType: () => 'Expense',
        getName: (item) => item.type
      }).filter((item) => !filters.type || filters.type === 'Expense'),
    [records.expenses, filters]
  );

  const filteredMaterials = useMemo(
    () =>
      filterRecords(records.materials, filters, {
        getDate: (item) => item.createdAt,
        getSearchText: (item) => item.name,
        getType: () => 'Material',
        getName: (item) => item.name
      }).filter((item) => !filters.type || filters.type === 'Material'),
    [records.materials, filters]
  );

  const billTotals = useMemo(
    () => ({
      total: filteredBills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0) + Number(bill.passAmount || 0), 0),
      pending: filteredBills.reduce((sum, bill) => sum + Number(bill.pendingAmount || 0), 0)
    }),
    [filteredBills]
  );

  const summaryItems = useMemo(() => {
    const items = [];
    if (!filters.type || filters.type === 'Customer') {
      items.push({ label: 'Customers', value: filteredCustomers.length });
    }
    if (!filters.type || filters.type === 'Employee') {
      items.push({ label: 'Employees', value: filteredEmployees.length });
    }
    if (!filters.type || filters.type === 'Bill') {
      items.push({ label: 'Bills', value: filteredBills.length });
      items.push({ label: 'Bill Total', value: money(billTotals.total) });
      items.push({ label: 'Pending', value: money(billTotals.pending), tone: 'red' });
    }
    if (!filters.type || filters.type === 'Expense') {
      items.push({ label: 'Expenses', value: filteredExpenses.length });
    }
    if (!filters.type || filters.type === 'Material') {
      items.push({ label: 'Materials', value: filteredMaterials.length });
    }
    return items;
  }, [
    filters.type,
    filteredCustomers.length,
    filteredEmployees.length,
    filteredBills.length,
    billTotals.total,
    billTotals.pending,
    filteredExpenses.length,
    filteredMaterials.length
  ]);

  return (
    <section className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Business Records</h2>
          <p className="text-sm text-slate-500 mt-1">Active customers, employees, bills, expenses, and materials.</p>
        </div>
        <button type="button" onClick={onRefresh} className="self-start md:self-auto bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-700 transition">
          Refresh Lists
        </button>
      </div>

      {filters && onFiltersChange && (
        <RecordFilters
          filters={filters}
          onChange={onFiltersChange}
          customers={records.customers}
          searchPlaceholder="Search all business records"
          typeOptions={[
            { value: 'Customer', label: 'Customers' },
            { value: 'Employee', label: 'Employees' },
            { value: 'Bill', label: 'Bills' },
            { value: 'Expense', label: 'Expenses' },
            { value: 'Material', label: 'Materials' }
          ]}
          statusOptions={[
            { value: 'Pending', label: 'Pending' },
            { value: 'Partially Paid', label: 'Partially Paid' },
            { value: 'Paid', label: 'Paid' }
          ]}
          summary={summaryItems}
        />
      )}

      <div className={`p-5 grid grid-cols-1 ${filters.type ? 'grid-cols-1' : 'xl:grid-cols-2'} gap-4`}>
        {(!filters.type || filters.type === 'Customer') && (
          <RecordTable
            title="Customers"
            count={filteredCustomers.length}
            headers={['Name', 'Phone', 'Vehicles']}
            empty="No customers match filters."
            selectedCount={selectedCustomers.length}
            onClearSelection={() => setSelectedCustomers([])}
            onBulkDelete={() => handleBulkDelete('Customer', selectedCustomers, setSelectedCustomers)}
            isAllSelected={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
            onSelectAll={() => handleSelectAllRows(filteredCustomers, selectedCustomers, setSelectedCustomers)}
          >
            {filteredCustomers.map((customer) => {
              const isSelected = selectedCustomers.some((x) => x._id === customer._id);
              return (
                <tr key={customer._id} className={isSelected ? 'bg-blue-50/10' : ''}>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(customer, selectedCustomers, setSelectedCustomers)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-3 font-semibold text-slate-900">{customer.name}</td>
                  <td className="p-3 text-slate-600">{customer.phone || '-'}</td>
                  <td className="p-3 text-slate-600">{(customer.vehicles || []).map((v) => v.number).join(', ') || '-'}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomer(customer)}
                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition cursor-pointer inline-flex items-center"
                      title="Delete Customer"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </RecordTable>
        )}

        {(!filters.type || filters.type === 'Employee') && (
          <RecordTable
            title="Employees"
            count={filteredEmployees.length}
            headers={['Name', 'Role', 'Daily Wage']}
            empty="No employees match filters."
            selectedCount={selectedEmployees.length}
            onClearSelection={() => setSelectedEmployees([])}
            onBulkDelete={() => handleBulkDelete('Employee', selectedEmployees, setSelectedEmployees)}
            isAllSelected={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
            onSelectAll={() => handleSelectAllRows(filteredEmployees, selectedEmployees, setSelectedEmployees)}
          >
            {filteredEmployees.map((employee) => {
              const isSelected = selectedEmployees.some((x) => x._id === employee._id);
              return (
                <tr key={employee._id} className={isSelected ? 'bg-blue-50/10' : ''}>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(employee, selectedEmployees, setSelectedEmployees)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-3 font-semibold text-slate-900">{employee.name}</td>
                  <td className="p-3 text-slate-600">{employee.designation || '-'}</td>
                  <td className="p-3 text-right text-slate-900 font-semibold">{money(employee.dailyWages)}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteEmployee(employee)}
                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition cursor-pointer inline-flex items-center"
                      title="Delete Employee"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </RecordTable>
        )}

        {(!filters.type || filters.type === 'Bill') && (
          <RecordTable
            title="Bills"
            count={filteredBills.length}
            headers={['Date', 'Time', 'Customer', 'Vehicle', 'Material', 'Total', 'Pending']}
            empty="No bills match filters."
            wide
            selectedCount={selectedBills.length}
            onClearSelection={() => setSelectedBills([])}
            onBulkDelete={() => handleBulkDelete('Bill', selectedBills, setSelectedBills)}
            isAllSelected={selectedBills.length === filteredBills.length && filteredBills.length > 0}
            onSelectAll={() => handleSelectAllRows(filteredBills, selectedBills, setSelectedBills)}
          >
            {filteredBills.map((bill) => {
              const dt = formatDateTime(bill.date);
              const isSelected = selectedBills.some((x) => x._id === bill._id);
              return (
                <tr key={bill._id} className={isSelected ? 'bg-blue-50/10' : ''}>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(bill, selectedBills, setSelectedBills)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-3 text-slate-600">{dt.date}</td>
                  <td className="p-3 text-slate-600">{dt.time}</td>
                  <td className="p-3 font-semibold text-slate-900">{bill.customerNameSnapshot}</td>
                  <td className="p-3 text-slate-600">{bill.vehicleNumber || '-'}</td>
                  <td className="p-3 text-slate-600">{bill.materialNameSnapshot}</td>
                  <td className="p-3 text-right text-slate-900 font-semibold">{money(Number(bill.totalAmount || 0) + Number(bill.passAmount || 0))}</td>
                  <td className="p-3 text-right text-red-600 font-semibold">{money(bill.pendingAmount)}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteBill(bill)}
                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition cursor-pointer inline-flex items-center"
                      title="Delete Bill"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </RecordTable>
        )}

        {(!filters.type || filters.type === 'Expense') && (
          <RecordTable
            title="Expenses"
            count={filteredExpenses.length}
            headers={['Date', 'Time', 'Type', 'Amount']}
            empty="No expenses match filters."
            selectedCount={selectedExpenses.length}
            onClearSelection={() => setSelectedExpenses([])}
            onBulkDelete={() => handleBulkDelete('Expense', selectedExpenses, setSelectedExpenses)}
            isAllSelected={selectedExpenses.length === filteredExpenses.length && filteredExpenses.length > 0}
            onSelectAll={() => handleSelectAllRows(filteredExpenses, selectedExpenses, setSelectedExpenses)}
          >
            {filteredExpenses.map((expense) => {
              const dt = formatDateTime(expense.date);
              const isSelected = selectedExpenses.some((x) => x._id === expense._id);
              return (
                <tr key={expense._id} className={isSelected ? 'bg-blue-50/10' : ''}>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(expense, selectedExpenses, setSelectedExpenses)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-3 text-slate-600">{dt.date}</td>
                  <td className="p-3 text-slate-600">{dt.time}</td>
                  <td className="p-3 font-semibold text-slate-900">{expense.type}</td>
                  <td className="p-3 text-right text-slate-900 font-semibold">{money(expense.amount)}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(expense)}
                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition cursor-pointer inline-flex items-center"
                      title="Delete Expense"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </RecordTable>
        )}

        {(!filters.type || filters.type === 'Material') && (
          <RecordTable
            title="Materials"
            count={filteredMaterials.length}
            headers={['Name', 'Unit Price', 'Ton Price']}
            empty="No materials match filters."
            selectedCount={selectedMaterials.length}
            onClearSelection={() => setSelectedMaterials([])}
            onBulkDelete={() => handleBulkDelete('Material', selectedMaterials, setSelectedMaterials)}
            isAllSelected={selectedMaterials.length === filteredMaterials.length && filteredMaterials.length > 0}
            onSelectAll={() => handleSelectAllRows(filteredMaterials, selectedMaterials, setSelectedMaterials)}
          >
            {filteredMaterials.map((material) => {
              const isSelected = selectedMaterials.some((x) => x._id === material._id);
              return (
                <tr key={material._id} className={isSelected ? 'bg-blue-50/10' : ''}>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectRow(material, selectedMaterials, setSelectedMaterials)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-3 font-semibold text-slate-900">{material.name}</td>
                  <td className="p-3 text-right text-slate-900 font-semibold">{money(material.currentPrice)}</td>
                  <td className="p-3 text-right text-slate-900 font-semibold">{money(material.pricePerTon ?? material.currentPrice)}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteMaterial(material)}
                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition cursor-pointer inline-flex items-center"
                      title="Delete Material"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </RecordTable>
        )}
      </div>
    </section>
  );
};

export default BusinessRecords;
