import mongoose from 'mongoose';
import Buyer from '../models/Buyer.js';
import Load, { roundToNearestTen } from '../models/Load.js';
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
      const pending = (load.totalAmount ?? roundToNearestTen(load.price * load.quantity)) - (load.allocatedAmount || 0);
      if (pending > 0) {
        totalOutstanding += pending;
        pendingLoads.push({ load, pending });
      }
    }

    // Overpayments/advances are allowed; excess will carry over as credit.
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

        const pending = (load.totalAmount ?? roundToNearestTen(load.price * load.quantity)) - (load.allocatedAmount || 0);

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
        amount: load.totalAmount ?? roundToNearestTen(load.price * load.quantity)
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

export const migrateOldBuyerPayments = async () => {
  try {
    const BuyerPayment = (await import('../models/BuyerPayment.js')).default;
    const Expense = (await import('../models/Expense.js')).default;
    const Buyer = (await import('../models/Buyer.js')).default;

    const payments = await BuyerPayment.find();
    console.log(`[Migration] Found ${payments.length} buyer payments to check/migrate.`);

    let migratedCount = 0;
    for (const payment of payments) {
      let expenseExists = false;
      if (payment.expenseId) {
        const expense = await Expense.findOne({ _id: payment.expenseId, isDeleted: false });
        if (expense) {
          expenseExists = true;
        }
      }

      if (!expenseExists) {
        // Find the buyer details to construct a good description
        const buyer = await Buyer.findById(payment.buyerId);
        const buyerName = buyer ? buyer.name : 'Unknown Buyer';

        const expense = await Expense.create({
          date: payment.paymentDate || payment.createdAt || new Date(),
          type: 'Load',
          description: `Payment to Buyer: ${buyerName}${payment.notes ? ` - ${payment.notes}` : ''}`,
          amount: payment.amount,
          isDeleted: false
        });

        payment.expenseId = expense._id;
        await payment.save();
        migratedCount++;
      }
    }
    if (migratedCount > 0) {
      console.log(`[Migration] Successfully migrated/synced ${migratedCount} buyer payments to Expense system.`);
    } else {
      console.log(`[Migration] All buyer payments are already synced with the Expense system.`);
    }
  } catch (error) {
    console.error('[Migration] Error migrating old buyer payments:', error);
  }
};

