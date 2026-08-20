import mongoose from 'mongoose';
import Bill from '../models/Bill.js';
import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';
import { withEntityLock } from '../utils/transactionLock.js';

/**
 * Generate a unique sequential payment number like PAY-00001
 */
export const generatePaymentNumber = async () => {
  const lastPayment = await Payment.findOne({ paymentNumber: /^PAY-\d+$/ })
    .sort({ paymentNumber: -1 });
  let nextNum = 1;
  if (lastPayment && lastPayment.paymentNumber) {
    const match = lastPayment.paymentNumber.match(/^PAY-(\d+)$/);
    if (match) {
      nextNum = parseInt(match[1]) + 1;
    }
  }
  return `PAY-${String(nextNum).padStart(5, '0')}`;
};

/**
 * Generate a unique sequential migration payment number like PAY-MIG-00001
 */
export const generateMigratedPaymentNumber = async () => {
  const lastMig = await Payment.findOne({ paymentNumber: /^PAY-MIG-\d+$/ })
    .sort({ paymentNumber: -1 });
  let nextMig = 1;
  if (lastMig && lastMig.paymentNumber) {
    const match = lastMig.paymentNumber.match(/^PAY-MIG-(\d+)$/);
    if (match) {
      nextMig = parseInt(match[1]) + 1;
    }
  }
  return `PAY-MIG-${String(nextMig).padStart(5, '0')}`;
};

/**
 * Helper to run operations within a MongoDB transaction & entity lock.
 * If MongoDB is running in standalone mode (no replica set), it falls back to a sessionless run,
 * protected by per-entity concurrency locking.
 */
export const runInTransaction = async (fn, entityKey = null) => {
  return withEntityLock(entityKey, async () => {
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
      // Fallback if standalone MongoDB does not support transactions
      if (error.message?.includes('replica set') || error.codeName === 'CommandNotSupportedOnReplicaSet') {
        return fn(null);
      }
      throw error;
    } finally {
      session.endSession();
    }
  });
};

/**
 * Records a customer payment and allocates it using FIFO logic to the oldest pending bills.
 * Must be transaction-safe.
 */
export const recordPayment = async ({ customerId, amount, date, notes, receivedBy }) => {
  const received = Number(amount);
  if (!Number.isFinite(received) || received <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  return runInTransaction(async (session) => {
    // 1. Verify customer exists
    const customer = await Customer.findOne({ _id: customerId, isDeleted: false }).session(session);
    if (!customer) {
      throw new Error('Customer not found');
    }

    const paymentNumber = await generatePaymentNumber();

    // 2. Create the payment record initially
    const [payment] = await Payment.create(
      [
        {
          paymentNumber,
          customerId,
          paymentDate: date ? new Date(date) : new Date(),
          amount: received,
          notes: notes || '',
          receivedBy: receivedBy || '',
          outstandingBalanceAfterPayment: 0,
          allocationDetails: []
        }
      ],
      { session }
    );

    // 3. Recalculate customer allocations & outstanding balance history atomically
    await recalculateCustomerBalances(customerId, session);

    // 4. Return updated payment document
    const updatedPayment = await Payment.findById(payment._id).session(session);
    return updatedPayment;
  }, `customer:${customerId}`);
};

/**
 * Self-healing balance reconciliation function.
 * Resets allocated amounts on all bills of a customer and re-allocates all customer payments
 * in FIFO order. Preserves payment history and ledger history while updating allocations.
 */
export const recalculateCustomerBalances = async (customerId, providedSession = null) => {
  const runRecalc = async (session) => {
    // Fetch all active bills and all payments
    const bills = await Bill.find({ customer: customerId, isDeleted: false })
      .sort({ date: 1, createdAt: 1 })
      .session(session);

    const payments = await Payment.find({ customerId })
      .sort({ paymentDate: 1, createdAt: 1 })
      .session(session);

    // Reset allocatedAmount on all bills
    for (const bill of bills) {
      bill.allocatedAmount = 0;
    }

    // Process payments one by one in FIFO order to re-allocate
    for (const payment of payments) {
      let remaining = payment.amount;
      const newAllocations = [];

      for (const bill of bills) {
        if (remaining <= 0) break;

        const grandTotal = bill.totalAmount + (bill.passAmount || 0);
        const allocated = bill.allocatedAmount || 0;
        const pending = grandTotal - allocated;

        if (pending > 0) {
          const allocate = Math.min(remaining, pending);
          bill.allocatedAmount = allocated + allocate;

          newAllocations.push({
            billId: bill._id,
            billNumber: bill.billNumber,
            allocatedAmount: allocate
          });

          remaining -= allocate;
        }
      }

      payment.allocationDetails = newAllocations;
    }

    // Calculate outstanding balances at each payment point to maintain correct history
    let runningBilled = 0;
    let runningPaid = 0;
    const sortedBillsAndPayments = [];

    for (const bill of bills) {
      sortedBillsAndPayments.push({
        type: 'bill',
        date: bill.date,
        createdAt: bill.createdAt,
        amount: bill.totalAmount + (bill.passAmount || 0)
      });
    }

    for (const payment of payments) {
      sortedBillsAndPayments.push({
        type: 'payment',
        date: payment.paymentDate,
        createdAt: payment.createdAt,
        amount: payment.amount,
        ref: payment
      });
    }

    // Sort to determine running balance at each payment point (same day: bills first)
    sortedBillsAndPayments.sort((a, b) => {
      const dateA = new Date(a.date).setHours(0, 0, 0, 0);
      const dateB = new Date(b.date).setHours(0, 0, 0, 0);
      if (dateA !== dateB) return dateA - dateB;
      if (a.type !== b.type) return a.type === 'bill' ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    for (const item of sortedBillsAndPayments) {
      if (item.type === 'bill') {
        runningBilled += item.amount;
      } else {
        runningPaid += item.amount;
        item.ref.outstandingBalanceAfterPayment = Math.max(0, runningBilled - runningPaid);
      }
    }

    // Save all updated bills
    for (const bill of bills) {
      await bill.save({ session });
    }

    // Save all updated payments
    for (const payment of payments) {
      await payment.save({ session });
    }
  };

  if (providedSession) {
    await runRecalc(providedSession);
  } else {
    await runInTransaction(runRecalc, `customer:${customerId}`);
  }
};

/**
 * Removes all auto-generated migrated payment documents (PAY-MIG-*) from the database
 * and recalculates customer balances for all active customers based strictly on
 * user-recorded payment documents.
 */
export const cleanupMigratedPayments = async () => {
  try {
    const deleteResult = await Payment.deleteMany({
      $or: [
        { paymentNumber: /^PAY-MIG-/ },
        { receivedBy: 'System Migration' }
      ]
    });
    if (deleteResult.deletedCount > 0) {
      console.log(`[Cleanup] Removed ${deleteResult.deletedCount} auto-migrated payment records.`);
    }

    // Make sure all customers have their balances/allocations computed based strictly on real payments
    const customers = await Customer.find({ isDeleted: false });
    for (const customer of customers) {
      await recalculateCustomerBalances(customer._id);
    }
    console.log('[Cleanup] Database cleanup & outstanding balance reconciliation complete.');
  } catch (err) {
    console.error('[Cleanup] Error during migrated payments cleanup:', err);
  }
};

export const migrateOldPayments = cleanupMigratedPayments;


