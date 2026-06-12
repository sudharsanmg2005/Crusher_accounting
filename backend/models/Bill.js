import mongoose from 'mongoose';

const billSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerNameSnapshot: { type: String, required: true },

    billNumber: { type: String, trim: true },
    vehicleNumber: { type: String, trim: true, default: '' },

    material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    materialNameSnapshot: { type: String, required: true },

    quantity: { type: Number, required: true },
    quantityUnit: { type: String, enum: ['unit', 'ton'], default: 'unit' },
    pricePerUnit: { type: Number, required: true },
    isBackdated: { type: Boolean, default: false },
    totalAmount: { type: Number, required: true },
    // Govt permission fee ("PASS") added to each line item.
    passAmount: { type: Number, default: 0 },

    allocatedAmount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for pending amount: (totalAmount + passAmount) - allocatedAmount
billSchema.virtual('pendingAmount').get(function () {
  const grandTotal = this.totalAmount + (this.passAmount || 0);
  return Math.max(0, grandTotal - (this.allocatedAmount || 0));
});

// Virtual for paidAmount for backward-compatibility
billSchema.virtual('paidAmount').get(function () {
  return this.allocatedAmount || 0;
});

// Indexes for performance optimization
billSchema.index({ customer: 1, isDeleted: 1 });
billSchema.index({ date: 1 });

const Bill = mongoose.model('Bill', billSchema);
export default Bill;


