/**
 * Ensures a single super admin account for production.
 * Run once before deployment: npm run prepare:production
 *
 * Required in .env:
 *   SUPER_ADMIN_USERNAME=MohanGowri
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();

const SUPER_ADMIN_USERNAME = (process.env.SUPER_ADMIN_USERNAME || 'MohanGowri').trim();

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const superAdmin = await User.findOne({
    username: SUPER_ADMIN_USERNAME,
    isDeleted: { $ne: true }
  });

  if (!superAdmin) {
    throw new Error(
      `Super admin "${SUPER_ADMIN_USERNAME}" was not found. Create this account before running prepare:production.`
    );
  }

  superAdmin.role = 'super_admin';
  superAdmin.accessLevel = 'full_access';
  superAdmin.isActive = true;
  superAdmin.isDeleted = false;
  superAdmin.deletedAt = undefined;
  await superAdmin.save();

  const otherSuperAdmins = await User.find({
    role: 'super_admin',
    _id: { $ne: superAdmin._id },
    isDeleted: { $ne: true }
  });

  for (const admin of otherSuperAdmins) {
    admin.role = 'admin';
    admin.accessLevel = admin.accessLevel || 'full_access';
    await admin.save();
    console.log(`Demoted extra super admin to admin: ${admin.username}`);
  }

  const testAccounts = await User.find({
    username: /^test_super_/,
    isDeleted: { $ne: true }
  });

  for (const account of testAccounts) {
    account.isActive = false;
    account.isDeleted = true;
    account.deletedAt = new Date();
    await account.save();
    console.log(`Archived test account: ${account.username}`);
  }

  const activeSuperCount = await User.countDocuments({
    role: 'super_admin',
    isActive: true,
    isDeleted: { $ne: true }
  });

  console.log('\nProduction admin summary');
  console.log(`  Super admin username : ${superAdmin.username}`);
  console.log(`  Super admin name     : ${superAdmin.name}`);
  console.log(`  Active super admins  : ${activeSuperCount}`);

  if (activeSuperCount !== 1) {
    throw new Error('Expected exactly one active super admin after preparation');
  }

  console.log('\nProduction admin preparation complete.');
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('FAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
