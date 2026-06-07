import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['super_admin', 'admin'],
      default: 'admin'
    },
    accessLevel: {
      type: String,
      enum: ['full_access', 'read_only', 'create_bills'],
      default: 'full_access'
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
export default User;

