import Customer from '../models/Customer.js';
import Employee from '../models/Employee.js';
import Bill from '../models/Bill.js';
import Expense from '../models/Expense.js';
import Material from '../models/Material.js';
import Payment from '../models/Payment.js';
import Attendance from '../models/Attendance.js';

const notArchivedError = (label) => {
  const err = new Error(`${label} must be in deleted backups before permanent deletion`);
  err.statusCode = 400;
  return err;
};

const notFoundError = (label) => {
  const err = new Error(`${label} not found`);
  err.statusCode = 404;
  return err;
};

export const permanentlyDeleteCustomer = async (id) => {
  const customer = await Customer.findById(id);
  if (!customer) throw notFoundError('Customer');
  if (!customer.isDeleted) throw notArchivedError('Customer');

  const label = customer.name;
  await Customer.deleteOne({ _id: customer._id });

  return {
    message: `Customer "${label}" permanently deleted from database`,
    auditDetails: `Permanently deleted customer backup ${label} (${customer.phone || 'no phone'})`
  };
};

export const permanentlyDeleteEmployee = async (id) => {
  const employee = await Employee.findById(id);
  if (!employee) throw notFoundError('Employee');
  if (!employee.isDeleted) throw notArchivedError('Employee');

  const label = employee.name;
  await Attendance.deleteMany({ employee: employee._id });
  await Employee.deleteOne({ _id: employee._id });

  return {
    message: `Employee "${label}" permanently deleted from database`,
    auditDetails: `Permanently deleted employee backup ${label} (${employee.phone || 'no phone'}) and related attendance`
  };
};

export const permanentlyDeleteBill = async (id) => {
  const bill = await Bill.findById(id);
  if (!bill) throw notFoundError('Bill');
  if (!bill.isDeleted) throw notArchivedError('Bill');

  const label = `${bill.customerNameSnapshot} - ${bill.billNumber || bill._id}`;
  await Payment.deleteMany({ bill: bill._id });
  await Bill.deleteOne({ _id: bill._id });

  return {
    message: `Bill permanently deleted from database`,
    auditDetails: `Permanently deleted bill backup ${label}`
  };
};

export const permanentlyDeleteExpense = async (id) => {
  const expense = await Expense.findById(id);
  if (!expense) throw notFoundError('Expense');
  if (!expense.isDeleted) throw notArchivedError('Expense');

  const label = `${expense.type} (${expense.description || 'No description'})`;
  await Expense.deleteOne({ _id: expense._id });

  return {
    message: `Expense permanently deleted from database`,
    auditDetails: `Permanently deleted expense backup ${label} for ${expense.amount}`
  };
};

export const permanentlyDeleteMaterial = async (id) => {
  const material = await Material.findById(id);
  if (!material) throw notFoundError('Material');
  if (!material.isDeleted) throw notArchivedError('Material');

  const label = material.name;
  await Material.deleteOne({ _id: material._id });

  return {
    message: `Material permanently deleted from database`,
    auditDetails: `Permanently deleted material backup ${label}`
  };
};
