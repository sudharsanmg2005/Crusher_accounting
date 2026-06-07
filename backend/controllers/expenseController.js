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
    if (date) expense.date = new Date(date);
    if (type) expense.type = type;
    if (description !== undefined) expense.description = description;
    if (amount != null) expense.amount = amount;

    const updated = await expense.save();
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

