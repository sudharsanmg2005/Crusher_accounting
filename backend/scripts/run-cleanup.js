import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/db.js';
import { cleanupMigratedPayments } from '../services/paymentService.js';
import mongoose from 'mongoose';

async function run() {
  await connectDB();
  console.log('[Runner] Executing cleanupMigratedPayments...');
  await cleanupMigratedPayments();
  console.log('[Runner] Cleanup completed successfully.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('[Runner] Error during cleanup:', err);
  process.exit(1);
});
