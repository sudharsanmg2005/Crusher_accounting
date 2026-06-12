import { recordPayment, recalculateCustomerBalances } from '../services/paymentService.js';
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

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const customerId = payment.customerId;

    // Validate payment amount limit if it is being updated
    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (Number.isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ message: 'Payment amount must be greater than zero' });
      }

      const allBills = await Bill.find({ customer: customerId, isDeleted: false });
      const allPayments = await Payment.find({ customerId });

      const totalBilled = allBills.reduce((sum, b) => sum + b.totalAmount + (b.passAmount || 0), 0);
      const totalPaidOther = allPayments
        .filter((p) => p._id.toString() !== payment._id.toString())
        .reduce((sum, p) => sum + p.amount, 0);

      const maxAllowed = totalBilled - totalPaidOther;
      if (numAmount - maxAllowed > 1e-4) {
        return res.status(400).json({
          message: `Payment amount (₹${numAmount.toFixed(2)}) cannot exceed outstanding balance (₹${Math.max(0, maxAllowed).toFixed(2)})`
        });
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

    await payment.save();

    // Recalculate balances and allocations for the customer
    await recalculateCustomerBalances(customerId);

    const updatedPayment = await Payment.findById(id);

    res.json({
      payment: updatedPayment,
      auditDetails: `Updated payment ${payment.paymentNumber} for customer ${customerId} to amount ${payment.amount}`
    });
  } catch (err) {
    next(err);
  }
};

export const deletePayment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const customerId = payment.customerId;

    await Payment.deleteOne({ _id: id });

    // Recalculate balances and allocations for the customer after deleting the payment
    await recalculateCustomerBalances(customerId);

    res.json({
      message: 'Payment deleted successfully',
      auditDetails: `Deleted payment ${payment.paymentNumber} for customer ${customerId} of amount ${payment.amount}`
    });
  } catch (err) {
    next(err);
  }
};
