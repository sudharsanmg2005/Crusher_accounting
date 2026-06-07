/**
 * Verify MongoDB Atlas (or any MONGO_URI) connectivity.
 * Run: npm run verify:atlas
 */
import dotenv from 'dotenv';
import { connectDB, getDatabaseStatus } from '../config/db.js';
import mongoose from 'mongoose';

dotenv.config();

try {
  await connectDB();
  const status = getDatabaseStatus();
  console.log('\nConnection verified successfully');
  console.log(`  Provider : ${status.provider}`);
  console.log(`  Host     : ${status.host}`);
  console.log(`  Database : ${status.name}`);
  console.log(`  Status   : ${status.status}`);
} catch (err) {
  console.error('Verification failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
