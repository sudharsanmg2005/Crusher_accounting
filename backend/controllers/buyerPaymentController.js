import { recordBuyerPayment, recalculateBuyerBalances } from '../services/buyerPaymentService.js';
import BuyerPayment from '../models/BuyerPayment.js';
import Load from '../models/Load.js';
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

    const payment = await BuyerPayment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Buyer payment not found' });
    }

    const buyerId = payment.buyerId;

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (Number.isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ message: 'Payment amount must be greater than zero' });
      }

      const allLoads = await Load.find({ buyer: buyerId, isDeleted: false });
      const allPayments = await BuyerPayment.find({ buyerId });

      const totalLoadCost = allLoads.reduce((sum, l) => sum + l.price * l.quantity, 0);
      const totalPaidOther = allPayments
        .filter((p) => p._id.toString() !== payment._id.toString())
        .reduce((sum, p) => sum + p.amount, 0);

      const maxAllowed = totalLoadCost - totalPaidOther;
      if (numAmount - maxAllowed > 1e-4) {
        return res.status(400).json({
          message: `Payment amount (₹${numAmount.toFixed(2)}) cannot exceed outstanding balance (₹${Math.max(0, maxAllowed).toFixed(2)})`
        });
      }

      payment.amount = numAmount;

      // Update Expense amount
      if (payment.expenseId) {
        const expense = await Expense.findById(payment.expenseId);
        if (expense) {
          expense.amount = numAmount;
          await expense.save();
        }
      }
    }

    if (date !== undefined) {
      payment.paymentDate = new Date(date);
      if (payment.expenseId) {
        const expense = await Expense.findById(payment.expenseId);
        if (expense) {
          expense.date = new Date(date);
          await expense.save();
        }
      }
    }

    if (notes !== undefined) {
      payment.notes = notes;
      if (payment.expenseId) {
        const expense = await Expense.findById(payment.expenseId);
        if (expense) {
          const buyer = await Buyer.findById(buyerId);
          expense.description = `Payment to Buyer: ${buyer ? buyer.name : 'Unknown'}${notes ? ` - ${notes}` : ''}`;
          await expense.save();
        }
      }
    }

    if (paidBy !== undefined) {
      payment.paidBy = paidBy;
    }

    await payment.save();

    await recalculateBuyerBalances(buyerId);

    const updatedPayment = await BuyerPayment.findById(id);

    res.json({
      payment: updatedPayment,
      auditDetails: `Updated buyer payment ${payment.paymentNumber} for buyer ${buyerId} to amount ${payment.amount}`
    });
  } catch (err) {
    next(err);
  }
};

export const deleteBuyerPayment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payment = await BuyerPayment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Buyer payment not found' });
    }

    const buyerId = payment.buyerId;

    // Soft delete Expense
    if (payment.expenseId) {
      const expense = await Expense.findById(payment.expenseId);
      if (expense) {
        expense.isDeleted = true;
        await expense.save();
      }
    }

    await BuyerPayment.deleteOne({ _id: id });

    await recalculateBuyerBalances(buyerId);

    res.json({
      message: 'Buyer payment deleted successfully',
      auditDetails: `Deleted buyer payment ${payment.paymentNumber} for buyer ${buyerId} of amount ${payment.amount}`
    });
  } catch (err) {
    next(err);
  }
};
