import mongoose from 'mongoose';
import Buyer from '../models/Buyer.js';
import Load from '../models/Load.js';
import BuyerPayment from '../models/BuyerPayment.js';
import Expense from '../models/Expense.js';

export const generateBuyerPaymentNumber = async () => {
  const lastPayment = await BuyerPayment.findOne({ paymentNumber: /^BUYPAY-\d+$/ })
    .sort({ paymentNumber: -1 });
  let nextNum = 1;
  if (lastPayment && lastPayment.paymentNumber) {
    const match = lastPayment.paymentNumber.match(/^BUYPAY-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  return `BUYPAY-${String(nextNum).padStart(5, '0')}`;
};

const runInTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    if (error.message?.includes('replica set') || error.codeName === 'CommandNotSupportedOnReplicaSet') {
      return fn(null);
    }
    throw error;
  } finally {
    session.endSession();
  }
};

export const recordBuyerPayment = async ({ buyerId, amount, date, notes, paidBy }) => {
  const received = Number(amount);
  if (!Number.isFinite(received) || received <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  return runInTransaction(async (session) => {
    const buyer = await Buyer.findOne({ _id: buyerId, isDeleted: false }).session(session);
    if (!buyer) {
      throw new Error('Buyer not found');
    }

    const loads = await Load.find({ buyer: buyerId, isDeleted: false })
      .sort({ date: 1, createdAt: 1 })
      .session(session);

    let totalOutstanding = 0;
    const pendingLoads = [];

    for (const load of loads) {
      const pending = (load.price * load.quantity) - (load.allocatedAmount || 0);
      if (pending > 0) {
        totalOutstanding += pending;
        pendingLoads.push({ load, pending });
      }
    }

    if (received - totalOutstanding > 1e-4) {
      throw new Error(`Payment amount (₹${received.toFixed(2)}) cannot exceed outstanding balance (₹${totalOutstanding.toFixed(2)})`);
    }

    let remaining = received;
    const allocationDetails = [];

    for (const item of pendingLoads) {
      if (remaining <= 0) break;
      const { load, pending } = item;
      const allocate = Math.min(remaining, pending);

      load.allocatedAmount = (load.allocatedAmount || 0) + allocate;
      await load.save({ session });

      allocationDetails.push({
        loadId: load._id,
        allocatedAmount: allocate
      });

      remaining -= allocate;
    }

    const outstandingBalanceAfterPayment = Math.max(0, totalOutstanding - received);
    const paymentNumber = await generateBuyerPaymentNumber();

    // Create Expense of type "Load"
    const [expense] = await Expense.create(
      [
        {
          date: date ? new Date(date) : new Date(),
          type: 'Load',
          description: `Payment to Buyer: ${buyer.name}${notes ? ` - ${notes}` : ''}`,
          amount: received,
          isDeleted: false
        }
      ],
      { session }
    );

    const [payment] = await BuyerPayment.create(
      [
        {
          paymentNumber,
          buyerId,
          paymentDate: date ? new Date(date) : new Date(),
          amount: received,
          notes: notes || '',
          paidBy: paidBy || '',
          outstandingBalanceAfterPayment,
          allocationDetails,
          expenseId: expense._id
        }
      ],
      { session }
    );

    return payment;
  });
};

export const recalculateBuyerBalances = async (buyerId, providedSession = null) => {
  const runRecalc = async (session) => {
    const loads = await Load.find({ buyer: buyerId, isDeleted: false })
      .sort({ date: 1, createdAt: 1 })
      .session(session);

    const payments = await BuyerPayment.find({ buyerId })
      .sort({ paymentDate: 1, createdAt: 1 })
      .session(session);

    for (const load of loads) {
      load.allocatedAmount = 0;
    }

    for (const payment of payments) {
      let remaining = payment.amount;
      const newAllocations = [];

      for (const load of loads) {
        if (remaining <= 0) break;

        const pending = (load.price * load.quantity) - (load.allocatedAmount || 0);

        if (pending > 0) {
          const allocate = Math.min(remaining, pending);
          load.allocatedAmount = (load.allocatedAmount || 0) + allocate;

          newAllocations.push({
            loadId: load._id,
            allocatedAmount: allocate
          });

          remaining -= allocate;
        }
      }

      payment.allocationDetails = newAllocations;
    }

    let runningLoadCost = 0;
    let runningPaid = 0;
    const sortedTimeline = [];

    for (const load of loads) {
      sortedTimeline.push({
        type: 'load',
        date: load.date,
        createdAt: load.createdAt,
        amount: load.price * load.quantity
      });
    }

    for (const payment of payments) {
      sortedTimeline.push({
        type: 'payment',
        date: payment.paymentDate,
        createdAt: payment.createdAt,
        amount: payment.amount,
        doc: payment
      });
    }

    sortedTimeline.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      if (a.type !== b.type) return a.type === 'load' ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    for (const item of sortedTimeline) {
      if (item.type === 'load') {
        runningLoadCost += item.amount;
      } else {
        runningPaid += item.amount;
        const outstanding = Math.max(0, runningLoadCost - runningPaid);
        item.doc.outstandingBalanceAfterPayment = outstanding;
      }
    }

    for (const load of loads) {
      await load.save({ session });
    }

    for (const payment of payments) {
      await payment.save({ session });
    }
  };

  if (providedSession) {
    await runRecalc(providedSession);
  } else {
    await runInTransaction(runRecalc);
  }
};
