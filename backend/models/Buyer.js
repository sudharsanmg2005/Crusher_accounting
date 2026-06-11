import mongoose from 'mongoose';

const buyerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

buyerSchema.index({ name: 1, phone: 1, isDeleted: 1 });

const Buyer = mongoose.model('Buyer', buyerSchema);
export default Buyer;
