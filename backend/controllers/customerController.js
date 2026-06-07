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
    const customer = await Customer.findById(req.params.id);
    if (!customer || customer.isDeleted) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const { startDate, endDate } = req.query;
    const filter = { customer: req.params.id, isDeleted: false };

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

    const bills = await Bill.find(filter).sort({ date: -1 });
    const payments = await Payment.find({ bill: { $in: bills.map((bill) => bill._id) } }).sort({ date: -1 });
    const paymentsByBill = payments.reduce((acc, payment) => {
      const id = payment.bill.toString();
      acc[id] = acc[id] || [];
      acc[id].push(payment);
      return acc;
    }, {});

    const rows = bills.map((bill) => ({
      ...bill.toObject(),
      payments: paymentsByBill[bill._id.toString()] || []
    }));

    const totalAmount = bills.reduce((sum, bill) => sum + bill.totalAmount + (Number(bill.passAmount) || 0), 0);
    const paidAmount = bills.reduce((sum, bill) => sum + (Number(bill.paidAmount) || 0), 0);
    const balance = bills.reduce((sum, bill) => sum + (Number(bill.pendingAmount) || 0), 0);

    res.json({ bills: rows, totals: { totalAmount, paidAmount, balance } });
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
