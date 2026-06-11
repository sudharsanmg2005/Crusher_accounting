import Load from '../models/Load.js';
import Buyer from '../models/Buyer.js';

export const getLoads = async (req, res, next) => {
  try {
    const { startDate, endDate, search, buyerId } = req.query;
    const filter = { isDeleted: false };

    if (buyerId) {
      filter.buyer = buyerId;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { quarryName: regex },
        { buyerNameSnapshot: regex },
        { vehicleType: regex }
      ];
    }

    const loads = await Load.find(filter).sort({ date: -1 });
    res.json(loads);
  } catch (err) {
    next(err);
  }
};

export const createLoad = async (req, res, next) => {
  try {
    const { vehicleType, date, quarryName, buyerId, price, quantity, unitType } = req.body;
    
    if (!buyerId) {
      res.status(400);
      throw new Error('Buyer is required');
    }

    const buyerRecord = await Buyer.findById(buyerId);
    if (!buyerRecord) {
      res.status(404);
      throw new Error('Buyer not found');
    }

    const load = await Load.create({
      vehicleType,
      date: date ? new Date(date) : new Date(),
      quarryName: quarryName ? quarryName.trim() : undefined,
      buyer: buyerId,
      buyerNameSnapshot: buyerRecord.name,
      price,
      quantity,
      unitType: unitType || 'units'
    });

    res.status(201).json({
      ...load.toObject(),
      auditDetails: `Created load: Vehicle ${vehicleType}, Buyer ${buyerRecord.name}, Quarry ${quarryName || 'N/A'}, Price ${price}`
    });
  } catch (err) {
    next(err);
  }
};

export const updateLoad = async (req, res, next) => {
  try {
    const load = await Load.findById(req.params.id);
    if (!load) {
      res.status(404);
      throw new Error('Load not found');
    }

    const { vehicleType, date, quarryName, buyerId, price, quantity, unitType } = req.body;
    
    if (buyerId !== undefined && !buyerId) {
      res.status(400);
      throw new Error('Buyer is required');
    }

    if (vehicleType !== undefined) load.vehicleType = vehicleType;
    if (date !== undefined) load.date = new Date(date);
    
    if (quarryName !== undefined) {
      load.quarryName = quarryName ? quarryName.trim() : undefined;
    }
    
    if (buyerId !== undefined) {
      const buyerRecord = await Buyer.findById(buyerId);
      if (!buyerRecord) {
        res.status(404);
        throw new Error('Buyer not found');
      }
      load.buyer = buyerId;
      load.buyerNameSnapshot = buyerRecord.name;
    }

    if (price !== undefined) load.price = price;
    if (quantity !== undefined) load.quantity = quantity;
    if (unitType !== undefined) load.unitType = unitType;

    const updated = await load.save();
    res.json({
      ...updated.toObject(),
      auditDetails: `Updated load ID ${updated._id}: Vehicle ${updated.vehicleType}, Buyer ${updated.buyerNameSnapshot}, Quarry ${updated.quarryName || 'N/A'}`
    });
  } catch (err) {
    next(err);
  }
};

export const deleteLoad = async (req, res, next) => {
  try {
    const load = await Load.findById(req.params.id);
    if (!load) {
      res.status(404);
      throw new Error('Load not found');
    }

    load.isDeleted = true;
    await load.save();

    res.json({
      message: 'Load removed',
      auditDetails: `Deleted load ID ${load._id}: Vehicle ${load.vehicleType}, Buyer ${load.buyerNameSnapshot}`
    });
  } catch (err) {
    next(err);
  }
};
