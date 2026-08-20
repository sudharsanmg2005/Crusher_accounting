import { recordBuyerPayment, recalculateBuyerBalances, runInTransaction } from '../services/buyerPaymentService.js';
import BuyerPayment from '../models/BuyerPayment.js';
import Load, { roundToNearestTen } from '../models/Load.js';
import Expense from '../models/Expense.js';
import Buyer from '../models/Buyer.js';

export const createBuyerPayment = async (req, res, next) => {
  try {
    const { buyerId, amount, date, notes, paidBy } = req.body;

    if (!buyerId) {
      return res.status(400).json({ message: 'buyerId is required' });
    }

    const payment = await recordBuyerPayment({
      buyerId,
      amount,
      date,
      notes,
      paidBy: paidBy || req.user?.name || ''
    });

    res.status(201).json({
      payment,
      auditDetails: `Recorded buyer payment of ${amount} for buyer ${buyerId}`
    });
  } catch (err) {
    next(err);
  }
};

export const updateBuyerPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, date, notes, paidBy } = req.body;

    const initialPayment = await BuyerPayment.findById(id);
    if (!initialPayment) {
      return res.status(404).json({ message: 'Buyer payment not found' });
    }

    const buyerId = initialPayment.buyerId;

    const updatedPayment = await runInTransaction(async (session) => {
      const payment = await BuyerPayment.findById(id).session(session);
      if (!payment) {
        const err = new Error('Buyer payment not found');
        err.statusCode = 404;
        throw err;
      }

      if (amount !== undefined) {
        const numAmount = Number(amount);
        if (Number.isNaN(numAmount) || numAmount <= 0) {
          const err = new Error('Payment amount must be greater than zero');
          err.statusCode = 400;
          throw err;
        }

        payment.amount = numAmount;

        if (payment.expenseId) {
          const expense = await Expense.findById(payment.expenseId).session(session);
          if (expense) {
            expense.amount = numAmount;
            await expense.save({ session });
          }
        }
      }

      if (date !== undefined) {
        payment.paymentDate = new Date(date);
        if (payment.expenseId) {
          const expense = await Expense.findById(payment.expenseId).session(session);
          if (expense) {
            expense.date = new Date(date);
            await expense.save({ session });
          }
        }
      }

      if (notes !== undefined) {
        payment.notes = notes;
        if (payment.expenseId) {
          const expense = await Expense.findById(payment.expenseId).session(session);
          if (expense) {
            const buyer = await Buyer.findById(buyerId).session(session);
            expense.description = `Payment to Buyer: ${buyer ? buyer.name : 'Unknown'}${notes ? ` - ${notes}` : ''}`;
            await expense.save({ session });
          }
        }
      }

      if (paidBy !== undefined) {
        payment.paidBy = paidBy;
      }

      await payment.save({ session });

      await recalculateBuyerBalances(buyerId, session);

      return await BuyerPayment.findById(id).session(session);
    }, buyerId ? `buyer:${buyerId}` : null);

    res.json({
      payment: updatedPayment,
      auditDetails: `Updated buyer payment ${updatedPayment.paymentNumber} for buyer ${buyerId} to amount ${updatedPayment.amount}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const deleteBuyerPayment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const initialPayment = await BuyerPayment.findById(id);
    if (!initialPayment) {
      return res.status(404).json({ message: 'Buyer payment not found' });
    }

    const buyerId = initialPayment.buyerId;

    await runInTransaction(async (session) => {
      const payment = await BuyerPayment.findById(id).session(session);
      if (!payment) {
        const err = new Error('Buyer payment not found');
        err.statusCode = 404;
        throw err;
      }

      // Soft delete Expense
      if (payment.expenseId) {
        const expense = await Expense.findById(payment.expenseId).session(session);
        if (expense) {
          expense.isDeleted = true;
          await expense.save({ session });
        }
      }

      await BuyerPayment.deleteOne({ _id: id }).session(session);

      await recalculateBuyerBalances(buyerId, session);
    }, buyerId ? `buyer:${buyerId}` : null);

    res.json({
      message: 'Buyer payment deleted successfully',
      auditDetails: `Deleted buyer payment ${initialPayment.paymentNumber} for buyer ${buyerId} of amount ${initialPayment.amount}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};
