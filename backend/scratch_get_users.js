import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set in backend/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to database.');

  const users = await User.find({ isDeleted: { $ne: true } });
  console.log('\nActive users in MongoDB Atlas:');
  console.dir(users.map(u => ({
    id: u._id,
    name: u.name,
    username: u.username,
    role: u.role,
    accessLevel: u.accessLevel,
    isActive: u.isActive
  })), { depth: null });

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Error:', err);
  await mongoose.disconnect().catch(() => {});
});
