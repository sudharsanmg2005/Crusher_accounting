import Bill from '../models/Bill.js';
import Customer from '../models/Customer.js';
import Material from '../models/Material.js';
import Payment from '../models/Payment.js';
import Expense from '../models/Expense.js';
import { normalizeVehicleNumber, validateVehicleNumber } from '../utils/vehicleNumber.js';
import { permanentlyDeleteBill as purgeBill } from '../services/purgeService.js';
import { recordPayment, recalculateCustomerBalances } from '../services/paymentService.js';

const normalizeVehicle = normalizeVehicleNumber;

const generateBillNumber = async () => {
  const count = await Bill.countDocuments();
  return `KBM-${String(count + 1).padStart(5, '0')}`;
};

export const getBills = async (req, res, next) => {
  try {
    const { startDate, endDate, customerId, status, search } = req.query;
    const filter = { isDeleted: false };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    if (customerId) filter.customer = customerId;
    
    // Support virtual status filter
    if (status) {
      if (status === 'Pending') {
        // Pending: totalAmount + passAmount > allocatedAmount
        filter.$expr = {
          $gt: [
            { $add: ['$totalAmount', { $ifNull: ['$passAmount', 0] }] },
            { $ifNull: ['$allocatedAmount', 0] }
          ]
        };
      } else if (status === 'Paid') {
        // Paid: totalAmount + passAmount <= allocatedAmount
        filter.$expr = {
          $lte: [
            { $add: ['$totalAmount', { $ifNull: ['$passAmount', 0] }] },
            { $ifNull: ['$allocatedAmount', 0] }
          ]
        };
      }
    }

    if (search) {
      filter.$or = [
        { customerNameSnapshot: new RegExp(search, 'i') },
        { vehicleNumber: new RegExp(search, 'i') },
        { materialNameSnapshot: new RegExp(search, 'i') },
        { billNumber: new RegExp(search, 'i') }
      ];
    }

    const bills = await Bill.find(filter).sort({ date: -1 });
    res.json(bills);
  } catch (err) {
    next(err);
  }
};

export const getBillById = async (req, res, next) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill || bill.isDeleted) {
      res.status(404);
      throw new Error('Bill not found');
    }

    // Retrieve payments that adjusted this bill
    const rawPayments = await Payment.find({ 'allocationDetails.billId': bill._id }).sort({ paymentDate: -1 });
    
    // Map payments to match the expected format on the frontend
    const payments = rawPayments.map((p) => {
      const allocation = p.allocationDetails.find((d) => d.billId.toString() === bill._id.toString());
      return {
        _id: p._id,
        amount: allocation ? allocation.allocatedAmount : p.amount,
        date: p.paymentDate,
        method: p.receivedBy || 'Cash',
        note: p.notes
      };
    });

    res.json({ ...bill.toObject(), payments });
  } catch (err) {
    next(err);
  }
};

export const createBill = async (req, res, next) => {
  try {
    const {
      date,
      customerId,
      vehicleNumber,
      materialId,
      quantity,
      quantityUnit = 'unit',
      pricePerUnit,
      passAmount
    } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer || customer.isDeleted) {
      res.status(400);
      throw new Error('Customer not found');
    }
    const material = await Material.findById(materialId);
    if (!material) {
      res.status(400);
      throw new Error('Material not found');
    }

    const normalizedVehicle = normalizeVehicle(vehicleNumber);
    if (normalizedVehicle) {
      const vehicleError = validateVehicleNumber(normalizedVehicle);
      if (vehicleError) {
        return res.status(400).json({ message: vehicleError });
      }
      const exists = customer.vehicles.some((v) => normalizeVehicle(v.number) === normalizedVehicle);
      if (!exists) {
        customer.vehicles.push({ number: normalizedVehicle });
        await customer.save();
      }
    }

    const unit = quantityUnit === 'ton' ? 'ton' : 'unit';
    const defaultPrice = unit === 'ton'
      ? (material.pricePerTon ?? material.currentPrice)
      : material.currentPrice;
    const effectivePrice = pricePerUnit ?? defaultPrice;
    const totalAmount = quantity * effectivePrice;
    const passFee = passAmount != null ? Number(passAmount) : 0;
    const permissionCost = Number.isFinite(passFee) ? passFee : 0;
    const grandTotal = totalAmount + permissionCost;

    const billDate = date ? new Date(date) : new Date();
    const now = new Date();
    const isBackdated = billDate.getTime() < now.getTime() - 60000;

    const bill = await Bill.create({
      billNumber: await generateBillNumber(),
      date: billDate,
      customer: customer._id,
      customerNameSnapshot: customer.name,
      vehicleNumber: normalizedVehicle,
      material: material._id,
      materialNameSnapshot: material.name,
      quantity,
      quantityUnit: unit,
      pricePerUnit: effectivePrice,
      totalAmount,
      passAmount: permissionCost,
      allocatedAmount: 0,
      isBackdated
    });

    const auditBase = `Created bill ${bill.billNumber} for ${bill.customerNameSnapshot}`;
    const auditDetails = isBackdated
      ? `${auditBase} — BACKDATED entry for ${billDate.toISOString()} (missed bill recorded on past date/time)`
      : `${auditBase} (${bill.vehicleNumber || 'no vehicle'}) amount ${grandTotal}`;

    res.status(201).json({
      ...bill.toObject(),
      auditDetails
    });
  } catch (err) {
    next(err);
  }
};

export const updateBill = async (req, res, next) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill || bill.isDeleted) {
      res.status(404);
      throw new Error('Bill not found');
    }

    const { date, vehicleNumber, quantity, quantityUnit, pricePerUnit, passAmount } = req.body;

    if (date) bill.date = new Date(date);
    if (vehicleNumber !== undefined) {
      const normalizedVehicle = normalizeVehicle(vehicleNumber);
      if (normalizedVehicle) {
        const vehicleError = validateVehicleNumber(normalizedVehicle);
        if (vehicleError) {
          return res.status(400).json({ message: vehicleError });
        }
      }
      bill.vehicleNumber = normalizedVehicle;
      if (normalizedVehicle && bill.customer) {
        const customer = await Customer.findById(bill.customer);
        if (customer) {
          const exists = customer.vehicles.some((v) => normalizeVehicle(v.number) === normalizedVehicle);
          if (!exists) {
            customer.vehicles.push({ number: normalizedVehicle });
            await customer.save();
          }
        }
      }
    }
    if (quantity != null) bill.quantity = quantity;
    if (quantityUnit) bill.quantityUnit = quantityUnit === 'ton' ? 'ton' : 'unit';
    if (pricePerUnit != null) bill.pricePerUnit = pricePerUnit;
    if (passAmount != null) bill.passAmount = Number(passAmount) || 0;

    bill.totalAmount = bill.quantity * bill.pricePerUnit;
    
    // Save bill and trigger recalculation of allocations
    await bill.save();
    
    if (bill.customer) {
      await recalculateCustomerBalances(bill.customer);
    }

    const updated = await Bill.findById(bill._id);

    res.json({
      ...updated.toObject(),
      auditDetails: `Edited bill ${updated.billNumber} for ${updated.customerNameSnapshot} dated ${updated.date.toISOString().split('T')[0]}`
    });
  } catch (err) {
    next(err);
  }
};

export const deleteBill = async (req, res, next) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      res.status(404);
      throw new Error('Bill not found');
    }
    bill.isDeleted = true;
    await bill.save();

    if (bill.customer) {
      await recalculateCustomerBalances(bill.customer);
    }

    res.json({
      message: 'Bill removed',
      auditDetails: `Deleted bill ${bill.billNumber || ''} for ${bill.customerNameSnapshot} dated ${bill.date.toISOString().split('T')[0]}`
    });
  } catch (err) {
    next(err);
  }
};

export const restoreBill = async (req, res, next) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      res.status(404);
      throw new Error('Bill not found');
    }

    bill.isDeleted = false;
    await bill.save();

    if (bill.customer) {
      await recalculateCustomerBalances(bill.customer);
    }

    res.json({
      message: 'Bill restored',
      restored: bill,
      auditDetails: `Restored bill ${bill.billNumber} for ${bill.customerNameSnapshot}`
    });
  } catch (err) {
    next(err);
  }
};

export const addPaymentToBill = async (req, res, next) => {
  try {
    const { amount, date, method, note } = req.body;
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      res.status(404);
      throw new Error('Bill not found');
    }

    const received = Number(amount);
    if (!Number.isFinite(received) || received <= 0) {
      return res.status(400).json({ message: 'amount must be greater than 0' });
    }

    // Call customer-level FIFO payment allocation
    const payment = await recordPayment({
      customerId: bill.customer,
      amount: received,
      date: date ? new Date(date) : new Date(),
      notes: note || '',
      receivedBy: req.user?.name || method || ''
    });

    const updatedBill = await Bill.findById(bill._id);

    res.status(201).json({
      bill: updatedBill,
      payment,
      auditDetails: `Recorded payment of ${received} for ${bill.customerNameSnapshot} (${bill.vehicleNumber || bill.billNumber})`
    });
  } catch (err) {
    next(err);
  }
};

export const getTodaySummary = async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayBills = await Bill.find({
      date: { $gte: todayStart, $lte: todayEnd },
      isDeleted: false
    });

    const todayExpenses = await Expense.find({
      date: { $gte: todayStart, $lte: todayEnd },
      isDeleted: false
    });

    const todayIncome = todayBills.reduce((sum, b) => sum + b.totalAmount + (Number(b.passAmount) || 0), 0);
    const todayExpensesTotal = todayExpenses.reduce((sum, e) => sum + e.amount, 0);
    const pendingPayments = todayBills.reduce((sum, b) => sum + (b.totalAmount + (b.passAmount || 0) - (b.allocatedAmount || 0)), 0);

    res.json({
      todayIncome,
      todayExpenses: todayExpensesTotal,
      pendingPayments,
      billCount: todayBills.length,
      expenseCount: todayExpenses.length
    });
  } catch (err) {
    next(err);
  }
};

export const getArchivedBills = async (req, res, next) => {
  try {
    const bills = await Bill.find({ isDeleted: true }).sort({ date: -1 });
    res.json(bills);
  } catch (err) {
    next(err);
  }
};

export const permanentDeleteBill = async (req, res, next) => {
  try {
    const result = await purgeBill(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

