import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    designation: { type: String, trim: true },
    dailyWages: { type: Number, default: 0 },
    salaryType: { type: String, default: 'Daily', enum: ['Daily', 'Fixed'] },
    customSalary: { type: Number, default: 0 },
    status: { type: String, default: 'Active', enum: ['Active', 'Inactive'] },
    isDeleted: { type: Boolean, default: false },
    salarySettled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

employeeSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, phone: { $type: 'string', $ne: '' } }
  }
);

const Employee = mongoose.model('Employee', employeeSchema);
export default Employee;
