import React, { useMemo } from 'react';
import RecordFilters from './RecordFilters';
import { filterRecords } from '../utils/recordFilters';
import { formatDateTime } from '../utils/dateTime';

const money = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

const EmptyRow = ({ colSpan, label }) => (
  <tr>
    <td colSpan={colSpan} className="p-6 text-center text-sm text-slate-500">{label}</td>
  </tr>
);

const RecordTable = ({ title, count, headers, children, empty, wide }) => (
  <div className={`border border-slate-200 rounded-lg overflow-hidden ${wide ? 'xl:col-span-2' : ''}`}>
    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-900">{title} ({count})</div>
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white border-b border-slate-100 text-slate-500 uppercase text-xs">
          <tr>
            {headers.map((header) => (
              <th key={header} className={`p-3 ${['Amount', 'Total', 'Pending', 'Daily Wage', 'Unit Price', 'Ton Price'].includes(header) ? 'text-right' : ''}`}>{header}</th>
            ))}
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
          [item.customerNameSnapshot, item.vehicleNumber, item.materialNameSnapshot, item.billNumber]
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
          <RecordTable title="Customers" count={filteredCustomers.length} headers={['Name', 'Phone', 'Vehicles']} empty="No customers match filters.">
            {filteredCustomers.map((customer) => (
              <tr key={customer._id}>
                <td className="p-3 font-semibold text-slate-900">{customer.name}</td>
                <td className="p-3 text-slate-600">{customer.phone || '-'}</td>
                <td className="p-3 text-slate-600">{(customer.vehicles || []).map((v) => v.number).join(', ') || '-'}</td>
              </tr>
            ))}
          </RecordTable>
        )}

        {(!filters.type || filters.type === 'Employee') && (
          <RecordTable title="Employees" count={filteredEmployees.length} headers={['Name', 'Role', 'Daily Wage']} empty="No employees match filters.">
            {filteredEmployees.map((employee) => (
              <tr key={employee._id}>
                <td className="p-3 font-semibold text-slate-900">{employee.name}</td>
                <td className="p-3 text-slate-600">{employee.designation || '-'}</td>
                <td className="p-3 text-right text-slate-900 font-semibold">{money(employee.dailyWages)}</td>
              </tr>
            ))}
          </RecordTable>
        )}

        {(!filters.type || filters.type === 'Bill') && (
          <RecordTable title="Bills" count={filteredBills.length} headers={['Date', 'Time', 'Customer', 'Vehicle', 'Material', 'Total', 'Pending']} empty="No bills match filters." wide>
            {filteredBills.map((bill) => {
              const dt = formatDateTime(bill.date);
              return (
                <tr key={bill._id}>
                  <td className="p-3 text-slate-600">{dt.date}</td>
                  <td className="p-3 text-slate-600">{dt.time}</td>
                  <td className="p-3 font-semibold text-slate-900">{bill.customerNameSnapshot}</td>
                  <td className="p-3 text-slate-600">{bill.vehicleNumber || '-'}</td>
                  <td className="p-3 text-slate-600">{bill.materialNameSnapshot}</td>
                  <td className="p-3 text-right text-slate-900 font-semibold">{money(Number(bill.totalAmount || 0) + Number(bill.passAmount || 0))}</td>
                  <td className="p-3 text-right text-red-600 font-semibold">{money(bill.pendingAmount)}</td>
                </tr>
              );
            })}
          </RecordTable>
        )}

        {(!filters.type || filters.type === 'Expense') && (
          <RecordTable title="Expenses" count={filteredExpenses.length} headers={['Date', 'Time', 'Type', 'Amount']} empty="No expenses match filters.">
            {filteredExpenses.map((expense) => {
              const dt = formatDateTime(expense.date);
              return (
                <tr key={expense._id}>
                  <td className="p-3 text-slate-600">{dt.date}</td>
                  <td className="p-3 text-slate-600">{dt.time}</td>
                  <td className="p-3 font-semibold text-slate-900">{expense.type}</td>
                  <td className="p-3 text-right text-slate-900 font-semibold">{money(expense.amount)}</td>
                </tr>
              );
            })}
          </RecordTable>
        )}

        {(!filters.type || filters.type === 'Material') && (
          <RecordTable title="Materials" count={filteredMaterials.length} headers={['Name', 'Unit Price', 'Ton Price']} empty="No materials match filters.">
            {filteredMaterials.map((material) => (
              <tr key={material._id}>
                <td className="p-3 font-semibold text-slate-900">{material.name}</td>
                <td className="p-3 text-right text-slate-900 font-semibold">{money(material.currentPrice)}</td>
                <td className="p-3 text-right text-slate-900 font-semibold">{money(material.pricePerTon ?? material.currentPrice)}</td>
              </tr>
            ))}
          </RecordTable>
        )}
      </div>
    </section>
  );
};

export default BusinessRecords;
