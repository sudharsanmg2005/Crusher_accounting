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
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const Load = mongoose.model('Load', loadSchema);
export default Load;
