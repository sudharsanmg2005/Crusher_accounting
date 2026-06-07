import mongoose from 'mongoose';

const paymentHistorySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now, required: true },
  type: { type: String, enum: ['Salary', 'Bonus'], required: true },
  expenseRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }
});

const salaryPaymentSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    attendedDays: { type: Number, required: true },
    dailyWagesSnapshot: { type: Number, required: true },
    baseSalary: { type: Number, required: true },
    bonus: { type: Number, default: 0 },
    totalSalary: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
    history: [paymentHistorySchema]
  },
  { timestamps: true }
);

// Prevent duplicate salary entries for the same employee in the same month/year
salaryPaymentSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

const SalaryPayment = mongoose.model('SalaryPayment', salaryPaymentSchema);
export default SalaryPayment;
