import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, trim: true },
    addedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const customerSchema = new mongoose.Schema(
  {
    customerCode: { type: String, trim: true, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    vehicles: [vehicleSchema],
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

customerSchema.index({ name: 1, phone: 1, isDeleted: 1 });

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;

