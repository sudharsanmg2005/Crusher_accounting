import mongoose from 'mongoose';

const priceHistorySchema = new mongoose.Schema(
  {
    price: { type: Number, required: true },
    effectiveFrom: { type: Date, default: Date.now }
  },
  { _id: false }
);

const materialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    currentPrice: { type: Number, required: true },
    pricePerTon: { type: Number },
    priceHistory: [priceHistorySchema],
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const Material = mongoose.model('Material', materialSchema);
export default Material;

