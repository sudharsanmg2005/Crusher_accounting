import mongoose from 'mongoose';

const allocationDetailSchema = new mongoose.Schema(
  {
    billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
    billNumber: { type: String, required: true },
    allocatedAmount: { type: Number, required: true }
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    paymentDate: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    notes: { type: String, default: '' },
    receivedBy: { type: String, default: '' },
    outstandingBalanceAfterPayment: { type: Number, required: true },
    allocationDetails: [allocationDetailSchema],
    bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' } // Keep for migration compatibility
  },
  { timestamps: true }
);

// Indexes for performance optimization
paymentSchema.index({ customerId: 1 });
paymentSchema.index({ paymentDate: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
