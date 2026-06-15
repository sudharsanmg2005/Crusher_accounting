import Buyer from '../models/Buyer.js';
import Load from '../models/Load.js';
import BuyerPayment from '../models/BuyerPayment.js';
import { normalizeVehicleNumber, validateVehicleNumber } from '../utils/vehicleNumber.js';


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
    const { name, phone, address, vehicles = [] } = req.body;
    if (!name || !phone) {
      res.status(400);
      throw new Error('Name and phone number are required');
    }

    const mappedVehicles = vehicles.map((v) => ({ number: normalizeVehicleNumber(v.number || v) }));
    for (const v of mappedVehicles) {
      const vehicleError = validateVehicleNumber(v.number);
      if (vehicleError) {
        return res.status(400).json({ message: vehicleError });
      }
    }

    const buyer = await Buyer.create({ name, phone, address, vehicles: mappedVehicles });
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

    const { name, phone, address, vehicles } = req.body;
    if (name !== undefined) buyer.name = name;
    if (phone !== undefined) buyer.phone = phone;
    if (address !== undefined) buyer.address = address;
    if (Array.isArray(vehicles)) {
      buyer.vehicles = vehicles.map((v) => {
        const number = normalizeVehicleNumber(v.number);
        const vehicleError = validateVehicleNumber(number);
        if (vehicleError) {
          const err = new Error(vehicleError);
          err.statusCode = 400;
          throw err;
        }
        return {
          _id: v._id,
          number,
          addedAt: v.addedAt || new Date()
        };
      });
    }

    const updated = await buyer.save();
    res.json({
      ...updated.toObject(),
      auditDetails: `Updated buyer: ${updated.name}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const addBuyerVehicle = async (req, res, next) => {
  try {
    const { number } = req.body;
    if (!number || !String(number).trim()) {
      return res.status(400).json({ message: 'Vehicle number is required' });
    }

    const buyer = await Buyer.findById(req.params.id);
    if (!buyer || buyer.isDeleted) {
      return res.status(404).json({ message: 'Buyer not found' });
    }

    const normalized = normalizeVehicleNumber(number);
    const vehicleError = validateVehicleNumber(normalized);
    if (vehicleError) {
      return res.status(400).json({ message: vehicleError });
    }
    const exists = buyer.vehicles.some((v) => normalizeVehicleNumber(v.number) === normalized);
    if (!exists) {
      buyer.vehicles.push({ number: normalized });
      await buyer.save();
    }
    res.status(200).json(buyer);
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

export const getBuyerById = async (req, res, next) => {
  try {
    const buyerId = req.params.id;
    const { startDate, endDate } = req.query;

    const buyer = await Buyer.findById(buyerId);
    if (!buyer || buyer.isDeleted) {
      return res.status(404).json({ message: 'Buyer not found' });
    }

    const loadFilter = { buyer: buyerId, isDeleted: false };
    const paymentFilter = { buyerId };

    if (startDate || endDate) {
      loadFilter.date = {};
      paymentFilter.paymentDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        loadFilter.date.$gte = start;
        paymentFilter.paymentDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        loadFilter.date.$lte = end;
        paymentFilter.paymentDate.$lte = end;
      }
    }

    const loads = await Load.find(loadFilter).sort({ date: -1 });
    const payments = await BuyerPayment.find(paymentFilter).sort({ paymentDate: -1 });

    let totalLoadsAmount = 0;
    let totalLoadsCount = 0;
    let lastLoadDate = null;
    for (const l of loads) {
      totalLoadsAmount += l.price * l.quantity;
      totalLoadsCount++;
      if (!lastLoadDate || new Date(l.date) > new Date(lastLoadDate)) {
        lastLoadDate = l.date;
      }
    }

    const allLoadsOfBuyer = await Load.find({ buyer: buyerId, isDeleted: false }, 'date');
    const loadDateMap = new Map(allLoadsOfBuyer.map(l => [l._id.toString(), l.date]));

    let totalPaymentsAmount = 0;
    let lastPaymentDate = null;
    const start = startDate ? new Date(startDate) : null;
    if (start) start.setHours(0, 0, 0, 0);

    for (const p of payments) {
      let effectiveAmount = p.amount || 0;
      if (start) {
        let allocatedBeforeStart = 0;
        for (const alloc of (p.allocationDetails || [])) {
          const loadDate = loadDateMap.get(alloc.loadId.toString());
          if (loadDate && new Date(loadDate) < start) {
            allocatedBeforeStart += alloc.allocatedAmount;
          }
        }
        effectiveAmount = Math.max(0, effectiveAmount - allocatedBeforeStart);
      }
      totalPaymentsAmount += effectiveAmount;
      if (!lastPaymentDate || new Date(p.paymentDate) > new Date(lastPaymentDate)) {
        lastPaymentDate = p.paymentDate;
      }
    }

    const allLoadsForOutstanding = await Load.find({ buyer: buyerId, isDeleted: false });
    const allPaymentsForOutstanding = await BuyerPayment.find({ buyerId });

    const overallBilled = allLoadsForOutstanding.reduce((sum, l) => sum + l.price * l.quantity, 0);
    const overallPaid = allPaymentsForOutstanding.reduce((sum, p) => sum + p.amount, 0);
    
    let totalOutstandingAmount = 0;
    if (startDate || endDate) {
      totalOutstandingAmount = Math.max(0, totalLoadsAmount - totalPaymentsAmount);
    } else {
      totalOutstandingAmount = Math.max(0, overallBilled - overallPaid);
    }

    const summary = {
      totalBillsAmount: totalLoadsAmount,
      totalPaidAmount: totalPaymentsAmount,
      totalOutstandingAmount,
      totalBillsCount: totalLoadsCount,
      lastBillDate: lastLoadDate,
      lastPaymentDate,
      overallBilled,
      overallPaid,
      overallOutstanding: Math.max(0, overallBilled - overallPaid)
    };

    const allLoadsForLedger = await Load.find({ buyer: buyerId, isDeleted: false }).sort({ date: 1, createdAt: 1 });
    const allPaymentsForLedger = await BuyerPayment.find({ buyerId }).sort({ paymentDate: 1, createdAt: 1 });

    const ledgerEntries = [];
    for (const l of allLoadsForLedger) {
      ledgerEntries.push({
        date: l.date,
        type: 'Load Created',
        reference: '—',
        debit: l.price * l.quantity,
        credit: 0,
        createdAt: l.createdAt
      });
    }

    for (const p of allPaymentsForLedger) {
      ledgerEntries.push({
        date: p.paymentDate,
        type: 'Payment Made',
        reference: p.paymentNumber,
        debit: 0,
        credit: p.amount,
        createdAt: p.createdAt
      });
    }

    ledgerEntries.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      if (a.type !== b.type) return a.type === 'Load Created' ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    let runningBal = 0;
    let ledger = ledgerEntries.map((e) => {
      runningBal += e.debit - e.credit;
      return {
        date: e.date,
        transactionType: e.type,
        referenceNumber: e.reference,
        debit: e.debit,
        credit: e.credit,
        runningBalance: runningBal
      };
    });

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : 0;
      const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
      ledger = ledger.filter((item) => {
        const time = new Date(item.date).getTime();
        return time >= start && time <= end;
      });
    }

    res.json({
      buyer,
      summary,
      bills: loads,
      payments,
      ledger
    });
  } catch (err) {
    next(err);
  }
};

