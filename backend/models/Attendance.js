import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    status: { type: String, required: true, enum: ['Present', 'Absent', 'Half-Day'] },
    isArchived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Unique index to prevent duplicate attendance logs on the same date for an employee
attendanceSchema.index({ date: 1, employee: 1 }, { unique: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;
