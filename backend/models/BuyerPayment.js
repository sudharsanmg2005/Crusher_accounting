import mongoose from 'mongoose';

const buyerAllocationDetailSchema = new mongoose.Schema(
  {
    loadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Load', required: true },
    allocatedAmount: { type: Number, required: true }
  },
  { _id: false }
);

const buyerPaymentSchema = new mongoose.Schema(
  {
    paymentNumber: { type: String, required: true, unique: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true },
    paymentDate: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    notes: { type: String, default: '' },
    paidBy: { type: String, default: '' },
    outstandingBalanceAfterPayment: { type: Number, required: true },
    allocationDetails: [buyerAllocationDetailSchema],
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }
  },
  { timestamps: true }
);

buyerPaymentSchema.index({ buyerId: 1 });
buyerPaymentSchema.index({ paymentDate: 1 });

const BuyerPayment = mongoose.model('BuyerPayment', buyerPaymentSchema);
export default BuyerPayment;
