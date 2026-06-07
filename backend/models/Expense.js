import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    type: { type: String, required: true },
    description: { type: String },
    amount: { type: Number, required: true },
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;

