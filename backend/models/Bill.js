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

    paymentStatus: {
      type: String,
      enum: ['Pending', 'Partially Paid', 'Paid'],
      default: 'Pending'
    },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, required: true },
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const Bill = mongoose.model('Bill', billSchema);
export default Bill;

