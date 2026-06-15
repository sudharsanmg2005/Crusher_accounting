import Expense from '../models/Expense.js';
import { permanentlyDeleteExpense as purgeExpense } from '../services/purgeService.js';

export const getExpenses = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { isDeleted: false };
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
    const expenses = await Expense.find(filter).sort({ date: -1 });
    res.json(expenses);
  } catch (err) {
    next(err);
  }
};

export const createExpense = async (req, res, next) => {
  try {
    const { date, type, description, amount } = req.body;
    const expense = await Expense.create({
      date: date ? new Date(date) : new Date(),
      type,
      description,
      amount
    });
    res.status(201).json({
      ...expense.toObject(),
      auditDetails: `Created expense ${type} for ${amount}`
    });
  } catch (err) {
    next(err);
  }
};

export const updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      res.status(404);
      throw new Error('Expense not found');
    }

    const { date, type, description, amount } = req.body;
    const oldAmount = expense.amount;
    const oldDate = expense.date;

    if (date) expense.date = new Date(date);
    if (type) expense.type = type;
    if (description !== undefined) expense.description = description;
    if (amount != null) expense.amount = amount;

    const updated = await expense.save();

    // Sync changes to BuyerPayment if type is Load
    if (expense.type === 'Load') {
      const BuyerPayment = (await import('../models/BuyerPayment.js')).default;
      const { recalculateBuyerBalances } = await import('../services/buyerPaymentService.js');
      const payment = await BuyerPayment.findOne({ expenseId: expense._id });
      if (payment) {
        let changed = false;
        if (amount != null && oldAmount !== amount) {
          payment.amount = amount;
          changed = true;
        }
        if (date && new Date(oldDate).getTime() !== new Date(date).getTime()) {
          payment.paymentDate = new Date(date);
          changed = true;
        }
        if (changed) {
          await payment.save();
          await recalculateBuyerBalances(payment.buyerId);
        }
      }
    }

    // Sync changes to SalaryPayment if type is Labour
    if (expense.type === 'Labour') {
      const SalaryPayment = (await import('../models/SalaryPayment.js')).default;
      const payment = await SalaryPayment.findOne({ 'history.expenseRef': expense._id });
      if (payment) {
        const entry = payment.history.find(h => h.expenseRef?.toString() === expense._id.toString());
        if (entry) {
          let changed = false;
          if (amount != null && oldAmount !== amount) {
            entry.amount = amount;
            changed = true;
          }
          if (date && new Date(oldDate).getTime() !== new Date(date).getTime()) {
            entry.date = new Date(date);
            changed = true;
          }
          if (changed) {
            payment.paidAmount = payment.history.reduce((sum, h) => sum + h.amount, 0);
            payment.pendingAmount = payment.totalSalary - payment.paidAmount;
            if (Math.abs(payment.pendingAmount) < 1e-4) {
              payment.pendingAmount = 0;
              payment.paymentStatus = 'Paid';
            } else if (payment.paidAmount > 0) {
              payment.paymentStatus = 'Partially Paid';
            } else {
              payment.paymentStatus = 'Unpaid';
            }
            await payment.save();
          }
        }
      }
    }

    res.json({
      ...updated.toObject(),
      auditDetails: `Edited expense ${updated.type} (${updated.description || 'No description'}) for ${updated.amount}`
    });
  } catch (err) {
    next(err);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      res.status(404);
      throw new Error('Expense not found');
    }
    expense.isDeleted = true;
    await expense.save();

    // Sync changes to BuyerPayment if type is Load
    if (expense.type === 'Load') {
      const BuyerPayment = (await import('../models/BuyerPayment.js')).default;
      const { recalculateBuyerBalances } = await import('../services/buyerPaymentService.js');
      const payment = await BuyerPayment.findOne({ expenseId: expense._id });
      if (payment) {
        const buyerId = payment.buyerId;
        await BuyerPayment.deleteOne({ _id: payment._id });
        await recalculateBuyerBalances(buyerId);
      }
    }

    // Sync changes to SalaryPayment if type is Labour
    if (expense.type === 'Labour') {
      const SalaryPayment = (await import('../models/SalaryPayment.js')).default;
      const payment = await SalaryPayment.findOne({ 'history.expenseRef': expense._id });
      if (payment) {
        payment.history = payment.history.filter(h => h.expenseRef?.toString() !== expense._id.toString());
        payment.paidAmount = payment.history.reduce((sum, h) => sum + h.amount, 0);
        payment.pendingAmount = payment.totalSalary - payment.paidAmount;
        if (Math.abs(payment.pendingAmount) < 1e-4) {
          payment.pendingAmount = 0;
          payment.paymentStatus = 'Paid';
        } else if (payment.paidAmount > 0) {
          payment.paymentStatus = 'Partially Paid';
        } else {
          payment.paymentStatus = 'Unpaid';
        }
        await payment.save();
      }
    }

    res.json({
      message: 'Expense removed',
      auditDetails: `Deleted expense ${expense.type} (${expense.description || 'No description'}) for ${expense.amount}`
    });
  } catch (err) {
    next(err);
  }
};

export const getArchivedExpenses = async (req, res, next) => {
  try {
    const expenses = await Expense.find({ isDeleted: true }).sort({ updatedAt: -1 });
    res.json(expenses);
  } catch (err) {
    next(err);
  }
};

export const restoreExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      res.status(404);
      throw new Error('Expense not found');
    }
    expense.isDeleted = false;
    await expense.save();
    res.json({
      message: 'Expense restored',
      restored: expense,
      auditDetails: `Restored expense ${expense.type} (${expense.description || 'No description'}) for ${expense.amount}`
    });
  } catch (err) {
    next(err);
  }
};

export const permanentDeleteExpense = async (req, res, next) => {
  try {
    const result = await purgeExpense(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

