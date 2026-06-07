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
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    vehicles: [vehicleSchema],
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

customerSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, phone: { $type: 'string', $ne: '' } }
  }
);

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;

