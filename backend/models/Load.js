import mongoose from 'mongoose';

const loadSchema = new mongoose.Schema(
  {
    vehicleType: { type: String, required: true, trim: true },
    date: { type: Date, default: Date.now },
    quarryName: { type: String, trim: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true },
    buyerNameSnapshot: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    unitType: { type: String, enum: ['units', 'tons'], default: 'units' },
    allocatedAmount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for pending amount: (price * quantity) - allocatedAmount
loadSchema.virtual('pendingAmount').get(function () {
  return Math.max(0, (this.price * this.quantity) - (this.allocatedAmount || 0));
});

const Load = mongoose.model('Load', loadSchema);
export default Load;
