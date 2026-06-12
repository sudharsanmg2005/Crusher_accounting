import { recordPayment } from '../services/paymentService.js';

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
