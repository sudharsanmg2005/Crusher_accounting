import { recordPayment, recalculateCustomerBalances, runInTransaction } from '../services/paymentService.js';
import Payment from '../models/Payment.js';
import Bill from '../models/Bill.js';

export const createPayment = async (req, res, next) => {
  try {
    const { customerId, amount, date, notes, receivedBy } = req.body;

    if (!customerId) {
      return res.status(400).json({ message: 'customerId is required' });
    }

    const payment = await recordPayment({
      customerId,
      amount,
      date,
      notes,
      receivedBy: receivedBy || req.user?.name || ''
    });

    res.status(201).json({
      payment,
      auditDetails: `Recorded customer payment of ${amount} for customer ${customerId}`
    });
  } catch (err) {
    next(err);
  }
};

export const updatePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, date, notes, receivedBy } = req.body;

    const initialPayment = await Payment.findById(id);
    if (!initialPayment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const customerId = initialPayment.customerId;

    const updatedPayment = await runInTransaction(async (session) => {
      const payment = await Payment.findById(id).session(session);
      if (!payment) {
        const err = new Error('Payment not found');
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
      }

      if (date !== undefined) {
        payment.paymentDate = new Date(date);
      }
      if (notes !== undefined) {
        payment.notes = notes;
      }
      if (receivedBy !== undefined) {
        payment.receivedBy = receivedBy;
      }

      await payment.save({ session });

      // Recalculate balances and allocations for the customer
      await recalculateCustomerBalances(customerId, session);

      return await Payment.findById(id).session(session);
    }, customerId ? `customer:${customerId}` : null);

    res.json({
      payment: updatedPayment,
      auditDetails: `Updated payment ${updatedPayment.paymentNumber} for customer ${customerId} to amount ${updatedPayment.amount}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};

export const deletePayment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const initialPayment = await Payment.findById(id);
    if (!initialPayment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const customerId = initialPayment.customerId;

    await runInTransaction(async (session) => {
      await Payment.deleteOne({ _id: id }).session(session);

      // Recalculate balances and allocations for the customer after deleting the payment
      await recalculateCustomerBalances(customerId, session);
    }, customerId ? `customer:${customerId}` : null);

    res.json({
      message: 'Payment deleted successfully',
      auditDetails: `Deleted payment ${initialPayment.paymentNumber} for customer ${customerId} of amount ${initialPayment.amount}`
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    next(err);
  }
};
