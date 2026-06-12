/**
 * Manual integration test for backup restore and permanent delete flows.
 * Run: node scripts/test-backup-flows.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Customer from '../models/Customer.js';
import Employee from '../models/Employee.js';
import Expense from '../models/Expense.js';
import User from '../models/User.js';

dotenv.config();

const API = `http://127.0.0.1:${process.env.PORT || 5000}/api`;

const request = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

const assert = (label, condition, detail = '') => {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`PASS: ${label}`);
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const suffix = Date.now();

  let user = await User.findOne({ role: 'super_admin', isActive: true, isDeleted: false });
  if (!user) {
    user = await User.create({
      name: 'Test Super Admin',
      username: `test_super_${suffix}`,
      passwordHash: await bcrypt.hash('TestPass123!', 10),
      role: 'super_admin',
      accessLevel: 'full_access',
      isActive: true
    });
  }

  const token = jwt.sign(
    {
      userId: user._id.toString(),
      username: user.username,
      name: user.name,
      role: user.role,
      accessLevel: user.accessLevel
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const activeCustomer = await Customer.create({
    name: `Active Customer ${suffix}`,
    phone: String(9000000000 + (suffix % 100000000)).slice(0, 10),
    address: 'Main Road'
  });

  const deletedCustomer = await Customer.create({
    name: `Deleted Customer ${suffix}`,
    phone: String(8000000000 + (suffix % 100000000)).slice(0, 10),
    address: 'Backup Road',
    isDeleted: true
  });

  const conflictCustomer = await Customer.create({
    name: `Conflict Backup ${suffix}`,
    phone: activeCustomer.phone,
    address: 'Conflict Road',
    isDeleted: true
  });

  const deletedExpense = await Expense.create({
    type: 'Test Expense',
    description: `Backup ${suffix}`,
    amount: 123,
    isDeleted: true
  });

  const preview = await request('/restore-management/preview', { token });
  assert('Preview endpoint returns 200', preview.status === 200);
  const conflictCount =
    (preview.data.customers || []).filter((item) => item.restoreStatus === 'Existing').length +
    (preview.data.employees || []).filter((item) => item.restoreStatus === 'Existing').length;
  assert('Preview includes phone conflict', conflictCount >= 1);

  const restoreDeleted = await request(`/customers/${deletedCustomer._id}/restore`, {
    method: 'PATCH',
    token,
    body: { action: 'restore' }
  });
  assert('Restore available customer', restoreDeleted.status === 200, restoreDeleted.data.message);

  const restoredCustomer = await Customer.findById(deletedCustomer._id);
  assert('Customer marked active after restore', restoredCustomer?.isDeleted === false);

  await Customer.updateOne({ _id: deletedCustomer._id }, { isDeleted: true });

  const restoreConflict = await request(`/customers/${conflictCustomer._id}/restore`, {
    method: 'PATCH',
    token,
    body: { action: 'restore' }
  });
  assert('Restore conflict returns 409', restoreConflict.status === 409);

  const mergeConflict = await request(`/restore-management/customers/${conflictCustomer._id}/restore`, {
    method: 'PATCH',
    token,
    body: { action: 'keep' }
  });
  assert('Resolve conflict with keep', mergeConflict.status === 200);

  const purgeExpense = await request(`/expenses/${deletedExpense._id}/permanent`, {
    method: 'DELETE',
    token
  });
  assert('Permanent delete expense', purgeExpense.status === 200, purgeExpense.data.message);
  const expenseGone = await Expense.findById(deletedExpense._id);
  assert('Expense removed from database', !expenseGone);

  await Customer.updateOne({ _id: deletedCustomer._id }, { isDeleted: true });
  const purgeCustomer = await request(`/customers/${deletedCustomer._id}/permanent`, {
    method: 'DELETE',
    token
  });
  assert('Permanent delete customer backup', purgeCustomer.status === 200, purgeCustomer.data.message);
  const customerGone = await Customer.findById(deletedCustomer._id);
  assert('Customer backup removed from database', !customerGone);

  const purgeActive = await request(`/customers/${activeCustomer._id}/permanent`, {
    method: 'DELETE',
    token
  });
  assert('Active customer cannot be permanently deleted', purgeActive.status === 400);

  await Customer.deleteOne({ _id: activeCustomer._id });
  await Customer.deleteOne({ _id: conflictCustomer._id });

  console.log('\nAll backup/restore/purge integration checks passed.');
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('\nFAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
