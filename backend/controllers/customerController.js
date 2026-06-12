import Customer from '../models/Customer.js';
import Bill from '../models/Bill.js';
import Payment from '../models/Payment.js';
import { normalizeVehicleNumber, validateVehicleNumber } from '../utils/vehicleNumber.js';
import { assertUniquePhone, normalizePhone } from '../utils/phone.js';
import { restoreCustomerRecord } from '../services/restoreService.js';
import { permanentlyDeleteCustomer as purgeCustomer } from '../services/purgeService.js';

export const getCustomers = async (req, res, next) => {
  try {
    const customers = await Customer.find({ isDeleted: false }).sort({ createdAt: -1 });
    res.json(customers);
  } catch (err) {
    next(err);
  }
};

export const createCustomer = async (req, res, next) => {
  try {
    const { name, phone, address, vehicles = [] } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Customer name is required' });
    }
    const normalizedPhone = await assertUniquePhone(Customer, phone);
    const mappedVehicles = vehicles.map((v) => ({ number: normalizeVehicleNumber(v.number || v) }));
    for (const v of mappedVehicles) {
      const vehicleError = validateVehicleNumber(v.number);
      if (vehicleError) {
        return res.status(400).json({ message: vehicleError });
      }
    }
    const customer = await Customer.create({
      name,
      phone: normalizedPhone,
      address,
      vehicles: mappedVehicles
    });
    res.status(201).json({
      ...customer.toObject(),
      auditDetails: `Created customer ${customer.name}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const { name, phone, address, vehicles } = req.body;
    const customer = await Customer.findById(req.params.id);
    if (!customer || customer.isDeleted) {
      res.status(404);
      throw new Error('Customer not found');
    }

    if (name) customer.name = name;
    if (phone !== undefined) {
      customer.phone = await assertUniquePhone(Customer, phone, customer._id);
    }
    if (address !== undefined) customer.address = address;
    if (Array.isArray(vehicles)) {
      customer.vehicles = vehicles.map((v) => {
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

    const updated = await customer.save();
    res.json({
      ...updated.toObject(),
      auditDetails: `Edited customer ${updated.name}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const addCustomerVehicle = async (req, res, next) => {
  try {
    const { number } = req.body;
    if (!number || !String(number).trim()) {
      return res.status(400).json({ message: 'Vehicle number is required' });
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer || customer.isDeleted) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const normalized = normalizeVehicleNumber(number);
    const vehicleError = validateVehicleNumber(normalized);
    if (vehicleError) {
      return res.status(400).json({ message: vehicleError });
    }
    const exists = customer.vehicles.some((v) => normalizeVehicleNumber(v.number) === normalized);
    if (!exists) {
      customer.vehicles.push({ number: normalized });
      await customer.save();
    }

    res.json({
      ...customer.toObject(),
      auditDetails: `Added vehicle ${normalized} to customer ${customer.name}`
    });
  } catch (err) {
    next(err);
  }
};

export const getCustomerHistory = async (req, res, next) => {
  try {
    const customerId = req.params.id;
    const customer = await Customer.findById(customerId);
    if (!customer || customer.isDeleted) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const { startDate, endDate } = req.query;
    const billFilter = { customer: customerId, isDeleted: false };
    const paymentFilter = { customerId };

    if (startDate || endDate) {
      billFilter.date = {};
      paymentFilter.paymentDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        billFilter.date.$gte = start;
        paymentFilter.paymentDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        billFilter.date.$lte = end;
        paymentFilter.paymentDate.$lte = end;
      }
    }

    // 1. Fetch bills and payments matching filter
    const bills = await Bill.find(billFilter).sort({ date: -1 });
    const payments = await Payment.find(paymentFilter).sort({ paymentDate: -1 });

    const customerObjId = new mongoose.Types.ObjectId(customerId);
    const customerIdMatch = { $in: [customerObjId, customerId] };

    // 2. Aggregate stats (within the selected range)
    const billMatch = { customer: customerIdMatch, isDeleted: false };
    const paymentMatch = { customerId: customerIdMatch };
    if (startDate || endDate) {
      billMatch.date = billFilter.date;
      paymentMatch.paymentDate = paymentFilter.paymentDate;
    }

    const billAgg = await Bill.aggregate([
      { $match: billMatch },
      {
        $group: {
          _id: null,
          totalBillsAmount: { $sum: { $add: ['$totalAmount', { $ifNull: ['$passAmount', 0] }] } },
          totalBillsCount: { $sum: 1 },
          lastBillDate: { $max: '$date' }
        }
      }
    ]);

    const paymentAgg = await Payment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: null,
          totalPaymentsAmount: { $sum: '$amount' },
          lastPaymentDate: { $max: '$paymentDate' }
        }
      }
    ]);

    // Overall outstanding (cumulative of all time, ignoring date filter)
    const overallBillAgg = await Bill.aggregate([
      { $match: { customer: customerIdMatch, isDeleted: false } },
      { $group: { _id: null, total: { $sum: { $add: ['$totalAmount', { $ifNull: ['$passAmount', 0] }] } } }
    ]);
    const overallPaymentAgg = await Payment.aggregate([
      { $match: { customerId: customerIdMatch } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const bStats = billAgg[0] || { totalBillsAmount: 0, totalBillsCount: 0, lastBillDate: null };
    const pStats = paymentAgg[0] || { totalPaymentsAmount: 0, lastPaymentDate: null };

    const overallBilled = overallBillAgg[0]?.total || 0;
    const overallPaid = overallPaymentAgg[0]?.total || 0;
    const totalOutstandingAmount = Math.max(0, overallBilled - overallPaid);

    const summary = {
      totalBillsAmount: bStats.totalBillsAmount,
      totalPaidAmount: pStats.totalPaymentsAmount,
      totalOutstandingAmount,
      totalBillsCount: bStats.totalBillsCount,
      lastBillDate: bStats.lastBillDate,
      lastPaymentDate: pStats.lastPaymentDate
    };

    // 3. Generate running ledger (always computed cumulatively)
    const allBillsForLedger = await Bill.find({ customer: customerId, isDeleted: false }).sort({ date: 1, createdAt: 1 });
    const allPaymentsForLedger = await Payment.find({ customerId }).sort({ paymentDate: 1, createdAt: 1 });

    const ledgerEntries = [];
    for (const b of allBillsForLedger) {
      ledgerEntries.push({
        date: b.date,
        type: 'Bill Created',
        reference: b.billNumber,
        debit: b.totalAmount + (b.passAmount || 0),
        credit: 0,
        createdAt: b.createdAt
      });
    }
    for (const p of allPaymentsForLedger) {
      ledgerEntries.push({
        date: p.paymentDate,
        type: 'Payment Received',
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
      if (a.type !== b.type) return a.type === 'Bill Created' ? -1 : 1;
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

    // Filter ledger if date filters are active
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : 0;
      const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
      ledger = ledger.filter((item) => {
        const time = new Date(item.date).getTime();
        return time >= start && time <= end;
      });
    }

    res.json({
      customer,
      summary,
      bills,
      payments,
      ledger
    });
  } catch (err) {
    next(err);
  }
};

export const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      res.status(404);
      throw new Error('Customer not found');
    }
    customer.isDeleted = true;
    await customer.save();
    res.json({
      message: 'Customer deleted',
      auditDetails: `Deleted customer ${customer.name}`
    });
  } catch (err) {
    next(err);
  }
};

export const getArchivedCustomers = async (req, res, next) => {
  try {
    const customers = await Customer.find({ isDeleted: true }).sort({ updatedAt: -1 });
    res.json(customers);
  } catch (err) {
    next(err);
  }
};

export const restoreCustomer = async (req, res, next) => {
  try {
    const { action = 'restore' } = req.body || {};
    const result = await restoreCustomerRecord(req.params.id, action);
    const statusCode = result.conflict ? 409 : 200;
    res.status(statusCode).json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const permanentDeleteCustomer = async (req, res, next) => {
  try {
    const result = await purgeCustomer(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};
