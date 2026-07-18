import Load from '../models/Load.js';
import Buyer from '../models/Buyer.js';
import { normalizeVehicleNumber, validateVehicleNumber } from '../utils/vehicleNumber.js';

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
        filter.date.$gte = new Date(`${startDate}T00:00:00+05:30`);
      }
      if (endDate) {
        filter.date.$lte = new Date(`${endDate}T23:59:59.999+05:30`);
      }
    }

    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { quarryName: regex },
        { buyerNameSnapshot: regex },
        { vehicleNumber: regex }
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
    const { vehicleNumber, date, quarryName, buyerId, price, quantity, unitType } = req.body;
    
    if (!buyerId) {
      res.status(400);
      throw new Error('Buyer is required');
    }

    const buyerRecord = await Buyer.findById(buyerId);
    if (!buyerRecord) {
      res.status(404);
      throw new Error('Buyer not found');
    }

    const normalizedVehicle = vehicleNumber ? normalizeVehicleNumber(vehicleNumber) : '';
    if (normalizedVehicle) {
      const vehicleError = validateVehicleNumber(normalizedVehicle);
      if (vehicleError) {
        return res.status(400).json({ message: vehicleError });
      }
      const exists = buyerRecord.vehicles.some((v) => normalizeVehicleNumber(v.number) === normalizedVehicle);
      if (!exists) {
        buyerRecord.vehicles.push({ number: normalizedVehicle });
        await buyerRecord.save();
      }
    }

    const load = await Load.create({
      vehicleNumber: normalizedVehicle,
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
      auditDetails: `Created load: Vehicle ${normalizedVehicle || 'N/A'}, Buyer ${buyerRecord.name}, Material/Quarry ${quarryName || 'N/A'}, Price ${price}`
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

    const { vehicleNumber, date, quarryName, buyerId, price, quantity, unitType } = req.body;
    
    if (buyerId !== undefined && !buyerId) {
      res.status(400);
      throw new Error('Buyer is required');
    }

    if (vehicleNumber !== undefined) {
      const normalizedVehicle = vehicleNumber ? normalizeVehicleNumber(vehicleNumber) : '';
      if (normalizedVehicle) {
        const vehicleError = validateVehicleNumber(normalizedVehicle);
        if (vehicleError) {
          return res.status(400).json({ message: vehicleError });
        }
        const bId = buyerId !== undefined ? buyerId : load.buyer;
        if (bId) {
          const buyerRecord = await Buyer.findById(bId);
          if (buyerRecord) {
            const exists = buyerRecord.vehicles.some((v) => normalizeVehicleNumber(v.number) === normalizedVehicle);
            if (!exists) {
              buyerRecord.vehicles.push({ number: normalizedVehicle });
              await buyerRecord.save();
            }
          }
        }
      }
      load.vehicleNumber = normalizedVehicle;
    }

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

      if (load.vehicleNumber) {
        const exists = buyerRecord.vehicles.some((v) => normalizeVehicleNumber(v.number) === load.vehicleNumber);
        if (!exists) {
          buyerRecord.vehicles.push({ number: load.vehicleNumber });
          await buyerRecord.save();
        }
      }
    }

    if (price !== undefined) load.price = price;
    if (quantity !== undefined) load.quantity = quantity;
    if (unitType !== undefined) load.unitType = unitType;

    const updated = await load.save();
    res.json({
      ...updated.toObject(),
      auditDetails: `Updated load ID ${updated._id}: Vehicle ${updated.vehicleNumber || 'N/A'}, Buyer ${updated.buyerNameSnapshot}, Material/Quarry ${updated.quarryName || 'N/A'}`
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
      auditDetails: `Deleted load ID ${load._id}: Vehicle ${load.vehicleNumber || 'N/A'}, Buyer ${load.buyerNameSnapshot}`
    });
  } catch (err) {
    next(err);
  }
};

export const createLoadsBulk = async (req, res, next) => {
  try {
    const { date, loads } = req.body;

    if (!loads || !Array.isArray(loads) || loads.length === 0) {
      res.status(400);
      throw new Error('No loads provided for bulk creation');
    }

    // Get all unique buyerIds in the batch
    const buyerIds = [...new Set(loads.map((l) => l.buyerId))];
    const buyers = await Buyer.find({ _id: { $in: buyerIds }, isDeleted: false });
    const buyerMap = new Map(buyers.map((b) => [b._id.toString(), b]));

    const loadsToCreate = [];
    const buyersToSave = new Set();

    for (const l of loads) {
      const { vehicleNumber, quarryName, buyerId, price, quantity, unitType } = l;

      if (!buyerId) {
        res.status(400);
        throw new Error('Buyer ID is required for all loads');
      }

      const buyerRecord = buyerMap.get(buyerId);
      if (!buyerRecord) {
        res.status(404);
        throw new Error(`Buyer not found for ID: ${buyerId}`);
      }

      const normalizedVehicle = vehicleNumber ? normalizeVehicleNumber(vehicleNumber) : '';
      if (normalizedVehicle) {
        const vehicleError = validateVehicleNumber(normalizedVehicle);
        if (vehicleError) {
          return res.status(400).json({ message: vehicleError });
        }
        const exists = buyerRecord.vehicles.some((v) => normalizeVehicleNumber(v.number) === normalizedVehicle);
        if (!exists) {
          buyerRecord.vehicles.push({ number: normalizedVehicle });
          buyersToSave.add(buyerRecord);
        }
      }

      loadsToCreate.push({
        vehicleNumber: normalizedVehicle,
        date: date ? new Date(date) : new Date(),
        quarryName: quarryName ? quarryName.trim() : undefined,
        buyer: buyerId,
        buyerNameSnapshot: buyerRecord.name,
        price: Number(price) || 0,
        quantity: Number(quantity) || 0,
        unitType: unitType || 'tons'
      });
    }

    // Save all buyers who got new vehicles
    for (const buyer of buyersToSave) {
      await buyer.save();
    }

    // Insert loads
    const createdLoads = await Load.insertMany(loadsToCreate);

    // Recalculate balances for all affected buyers
    const { recalculateBuyerBalances } = await import('../services/buyerPaymentService.js');
    for (const buyerId of buyerIds) {
      await recalculateBuyerBalances(buyerId);
    }

    res.status(201).json({
      loads: createdLoads,
      auditDetails: `Bulk created ${createdLoads.length} loads on ${date}`
    });
  } catch (err) {
    next(err);
  }
};
