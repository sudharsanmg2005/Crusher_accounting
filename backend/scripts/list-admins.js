import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

dotenv.config();
await mongoose.connect(process.env.MONGO_URI);
const admins = await User.find({ role: { $in: ['super_admin', 'admin'] } }).select('username name role isActive isDeleted');
console.log(JSON.stringify(admins, null, 2));
await mongoose.disconnect();
