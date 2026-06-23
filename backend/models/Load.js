import mongoose from 'mongoose';

export const roundToNearestTen = (amount) => {
  const rounded = Math.round(amount);
  const lastDigit = rounded % 10;
  if (lastDigit < 5) {
    return rounded - lastDigit;
  } else {
    return rounded + (10 - lastDigit);
  }
};

const loadSchema = new mongoose.Schema(
  {
    vehicleNumber: { type: String, trim: true, default: '' },
    date: { type: Date, default: Date.now },
    quarryName: { type: String, trim: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true },
    buyerNameSnapshot: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    unitType: { type: String, enum: ['units', 'tons'], default: 'tons' },
    totalAmount: { type: Number },
    allocatedAmount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Pre-save middleware to auto-calculate rounded totalAmount
loadSchema.pre('save', function (next) {
  if (this.price != null && this.quantity != null) {
    this.totalAmount = roundToNearestTen(this.price * this.quantity);
  }
  next();
});

// Virtual for pending amount: totalAmount - allocatedAmount
loadSchema.virtual('pendingAmount').get(function () {
  const total = this.totalAmount ?? roundToNearestTen(this.price * this.quantity);
  return Math.max(0, total - (this.allocatedAmount || 0));
});

const Load = mongoose.model('Load', loadSchema);
export default Load;
