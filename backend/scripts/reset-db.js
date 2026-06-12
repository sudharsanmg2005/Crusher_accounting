import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import AuditLog from '../models/AuditLog.js';
import Bill from '../models/Bill.js';
import Buyer from '../models/Buyer.js';
import Customer from '../models/Customer.js';
import Employee from '../models/Employee.js';
import Expense from '../models/Expense.js';
import Load from '../models/Load.js';
import Material from '../models/Material.js';
import Payment from '../models/Payment.js';
import SalaryPayment from '../models/SalaryPayment.js';

dotenv.config();

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(uri);
  console.log('Connected.');

  // Delete all records in all collections except User
  console.log('Clearing Attendance records...');
  await Attendance.deleteMany({});
  
  console.log('Clearing AuditLogs...');
  await AuditLog.deleteMany({});
  
  console.log('Clearing Bills...');
  await Bill.deleteMany({});
  
  console.log('Clearing Buyers...');
  await Buyer.deleteMany({});
  
  console.log('Clearing Customers...');
  await Customer.deleteMany({});
  
  console.log('Clearing Employees...');
  await Employee.deleteMany({});
  
  console.log('Clearing Expenses...');
  await Expense.deleteMany({});
  
  console.log('Clearing Loads...');
  await Load.deleteMany({});
  
  console.log('Clearing Materials...');
  await Material.deleteMany({});
  
  console.log('Clearing Payments...');
  await Payment.deleteMany({});
  
  console.log('Clearing SalaryPayments...');
  await SalaryPayment.deleteMany({});

  // Keep only the super admin User record
  console.log('Clearing all users except the super admin (MohanGowri)...');
  const deleteUsersResult = await User.deleteMany({ username: { $ne: 'MohanGowri' } });
  console.log(`Deleted ${deleteUsersResult.deletedCount} other users.`);

  // Make sure the super admin is active, not deleted, and role is super_admin
  const superAdmin = await User.findOne({ username: 'MohanGowri' });
  const hash = await bcrypt.hash('AKRamesh1977#', 10);
  if (superAdmin) {
    superAdmin.passwordHash = hash;
    superAdmin.role = 'super_admin';
    superAdmin.accessLevel = 'full_access';
    superAdmin.isActive = true;
    superAdmin.isDeleted = false;
    superAdmin.deletedAt = undefined;
    await superAdmin.save();
    console.log(`Verified super admin "MohanGowri" is active and reset password to AKRamesh1977#.`);
  } else {
    const newAdmin = new User({
      name: 'Mohan Gowri',
      username: 'MohanGowri',
      passwordHash: hash,
      role: 'super_admin',
      accessLevel: 'full_access',
      isActive: true,
      isDeleted: false
    });
    await newAdmin.save();
    console.log('Created super admin "MohanGowri" with password: AKRamesh1977#');
  }

  console.log('Database cleanup and reset complete.');
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Reset failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
