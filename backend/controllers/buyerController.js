import Buyer from '../models/Buyer.js';

export const getBuyers = async (req, res, next) => {
  try {
    const buyers = await Buyer.find({ isDeleted: false }).sort({ name: 1 });
    res.json(buyers);
  } catch (err) {
    next(err);
  }
};

export const createBuyer = async (req, res, next) => {
  try {
    const { name, phone, address } = req.body;
    if (!name || !phone) {
      res.status(400);
      throw new Error('Name and phone number are required');
    }

    const buyer = await Buyer.create({ name, phone, address });
    res.status(201).json({
      ...buyer.toObject(),
      auditDetails: `Created buyer: ${name} (${phone})`
    });
  } catch (err) {
    next(err);
  }
};

export const updateBuyer = async (req, res, next) => {
  try {
    const buyer = await Buyer.findById(req.params.id);
    if (!buyer) {
      res.status(404);
      throw new Error('Buyer not found');
    }

    const { name, phone, address } = req.body;
    if (name !== undefined) buyer.name = name;
    if (phone !== undefined) buyer.phone = phone;
    if (address !== undefined) buyer.address = address;

    const updated = await buyer.save();
    res.json({
      ...updated.toObject(),
      auditDetails: `Updated buyer: ${updated.name}`
    });
  } catch (err) {
    next(err);
  }
};

export const deleteBuyer = async (req, res, next) => {
  try {
    const buyer = await Buyer.findById(req.params.id);
    if (!buyer) {
      res.status(404);
      throw new Error('Buyer not found');
    }

    buyer.isDeleted = true;
    await buyer.save();

    res.json({
      message: 'Buyer removed',
      auditDetails: `Deleted buyer: ${buyer.name}`
    });
  } catch (err) {
    next(err);
  }
};
