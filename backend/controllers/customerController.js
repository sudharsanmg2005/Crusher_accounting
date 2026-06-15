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

    // 2. Compute stats (within the selected range) in JavaScript
    let totalBillsAmount = 0;
    let totalBillsCount = 0;
    let lastBillDate = null;
    for (const b of bills) {
      totalBillsAmount += (b.totalAmount || 0) + (b.passAmount || 0);
      totalBillsCount++;
      if (!lastBillDate || new Date(b.date) > new Date(lastBillDate)) {
        lastBillDate = b.date;
      }
    }

    const allBillsOfCustomer = await Bill.find({ customer: customerId, isDeleted: false }, 'date');
    const billDateMap = new Map(allBillsOfCustomer.map(b => [b._id.toString(), b.date]));

    let totalPaymentsAmount = 0;
    let lastPaymentDate = null;
    const start = startDate ? new Date(startDate) : null;
    if (start) start.setHours(0, 0, 0, 0);

    for (const p of payments) {
      let effectiveAmount = p.amount || 0;
      if (start) {
        let allocatedBeforeStart = 0;
        for (const alloc of (p.allocationDetails || [])) {
          const billDate = billDateMap.get(alloc.billId.toString());
          if (billDate && new Date(billDate) < start) {
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

    // Overall outstanding (cumulative of all time, ignoring date filter)
    const allBillsForOutstanding = await Bill.find({ customer: customerId, isDeleted: false });
    const allPaymentsForOutstanding = await Payment.find({ customerId });

    let overallBilled = 0;
    for (const b of allBillsForOutstanding) {
      overallBilled += (b.totalAmount || 0) + (b.passAmount || 0);
    }

    let overallPaid = 0;
    for (const p of allPaymentsForOutstanding) {
      overallPaid += (p.amount || 0);
    }

    let totalOutstandingAmount = 0;
    if (startDate || endDate) {
      totalOutstandingAmount = Math.max(0, totalBillsAmount - totalPaymentsAmount);
    } else {
      totalOutstandingAmount = Math.max(0, overallBilled - overallPaid);
    }

    const summary = {
      totalBillsAmount,
      totalPaidAmount: totalPaymentsAmount,
      totalOutstandingAmount,
      totalBillsCount,
      lastBillDate,
      lastPaymentDate,
      overallBilled,
      overallPaid,
      overallOutstanding: Math.max(0, overallBilled - overallPaid)
    };

    // 3. Generate running ledger (always computed cumulatively)
    const allBillsForLedger = await Bill.find({ customer: customerId, isDeleted: false }).sort({ date: 1, createdAt: 1 });
    const allPaymentsForLedger = await Payment.find({ customerId }).sort({ paymentDate: 1, createdAt: 1 });

    const ledgerEntries = [];
    for (const b of allBillsForLedger) {
      ledgerEntries.push({
        date: b.date,
        type: 'Bill Created',
        reference: '—',
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
