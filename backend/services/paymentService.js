import mongoose from 'mongoose';
import Bill from '../models/Bill.js';
import Payment from '../models/Payment.js';
import Customer from '../models/Customer.js';

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
 * Helper to run operations within a MongoDB transaction.
 * If MongoDB is running in standalone mode (no replica set), it falls back to a sessionless run.
 */
export const runInTransaction = async (fn) => {
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
      console.warn('MongoDB is not running as a replica set. Falling back to non-transactional execution.');
      return fn(null);
    }
    throw error;
  } finally {
    session.endSession();
  }
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

    // 2. Fetch all active bills for the customer, sorted oldest first
    const bills = await Bill.find({ customer: customerId, isDeleted: false })
      .sort({ date: 1, createdAt: 1 })
      .session(session);

    // Calculate total outstanding balance
    let totalOutstanding = 0;
    const pendingBills = [];

    for (const bill of bills) {
      const grandTotal = bill.totalAmount + (bill.passAmount || 0);
      const allocated = bill.allocatedAmount || 0;
      const pending = grandTotal - allocated;
      if (pending > 0) {
        totalOutstanding += pending;
        pendingBills.push({ bill, pending });
      }
    }

    // Validation: Payment cannot exceed outstanding balance
    if (received - totalOutstanding > 1e-4) {
      throw new Error(`Payment amount (₹${received.toFixed(2)}) cannot exceed outstanding balance (₹${totalOutstanding.toFixed(2)})`);
    }

    // 3. FIFO Payment Allocation
    let remaining = received;
    const allocationDetails = [];

    for (const item of pendingBills) {
      if (remaining <= 0) break;
      const { bill, pending } = item;
      const allocate = Math.min(remaining, pending);

      bill.allocatedAmount = (bill.allocatedAmount || 0) + allocate;
      await bill.save({ session });

      allocationDetails.push({
        billId: bill._id,
        billNumber: bill.billNumber,
        allocatedAmount: allocate
      });

      remaining -= allocate;
    }

    // Calculate remaining outstanding balance
    const outstandingBalanceAfterPayment = Math.max(0, totalOutstanding - received);
    const paymentNumber = await generatePaymentNumber();

    // 4. Store payment history permanently
    const [payment] = await Payment.create(
      [
        {
          paymentNumber,
          customerId,
          paymentDate: date ? new Date(date) : new Date(),
          amount: received,
          notes: notes || '',
          receivedBy: receivedBy || '',
          outstandingBalanceAfterPayment,
          allocationDetails
        }
      ],
      { session }
    );

    return payment;
  });
};

/**
 * Self-healing balance reconciliation function.
 * Resets allocated amounts on all bills of a customer and re-allocates all customer payments
 * in FIFO order. Preserves payment history and ledger history while updating allocations.
 */
export const recalculateCustomerBalances = async (customerId, providedSession = null) => {
  const runRecalc = async (session) => {
    // Fetch all active bills (sorted by date/createdAt) and all payments (sorted by paymentDate/createdAt)
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

    // Sort to determine running balance at each payment point
    sortedBillsAndPayments.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
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
    await runInTransaction(runRecalc);
  }
};

/**
 * Migrates old bill-specific payments to the new Customer Outstanding Balance System.
 * Creates payment records for any active bills with physical paidAmount values that don't have payment documents,
 * converts old payment documents to the new format, and recalulates outstanding balances for all active customers.
 */
export const migrateOldPayments = async () => {
  try {
    // 1. Recreate missing payment documents for bills with physical `paidAmount > 0` but no payment documents.
    const activeBills = await Bill.find({ isDeleted: false });
    
    for (const bill of activeBills) {
      if (!bill.customer) {
        console.warn(`[Migration] Active bill ${bill.billNumber || bill._id} has no customer reference. Skipping.`);
        continue;
      }
      const oldPaid = Number(bill._doc?.paidAmount || bill.get('paidAmount') || 0);
      if (oldPaid > 0) {
        const paymentCount = await Payment.countDocuments({ bill: bill._id });
        const newPaymentCount = await Payment.countDocuments({ 'allocationDetails.billId': bill._id });
        
        if (paymentCount === 0 && newPaymentCount === 0) {
          console.log(`[Migration] Bill ${bill.billNumber} has physical paidAmount ₹${oldPaid} but no Payment record. Creating migrated payment record...`);
          
          const paymentNumber = await generateMigratedPaymentNumber();
          
          await Payment.create({
            paymentNumber,
            customerId: bill.customer,
            paymentDate: bill.date || new Date(),
            amount: oldPaid,
            notes: 'Migrated from bill paidAmount record',
            receivedBy: 'System Migration',
            outstandingBalanceAfterPayment: 0,
            allocationDetails: [
              {
                billId: bill._id,
                billNumber: bill.billNumber || 'Unknown',
                allocatedAmount: oldPaid
              }
            ],
            bill: bill._id
          });
        }
      }
    }

    // 2. Migrate old payment documents (which have a bill ref but no customerId)
    const oldPayments = await Payment.find({ customerId: { $exists: false } });
    if (oldPayments.length > 0) {
      console.log(`[Migration] Found ${oldPayments.length} old payment records to migrate...`);
      
      const customerIdsToRecalculate = new Set();
      
      for (const oldPayment of oldPayments) {
        const billId = oldPayment.bill || oldPayment._doc?.bill;
        if (!billId) continue;
        
        const bill = await Bill.findById(billId);
        if (!bill) {
          console.warn(`[Migration] Bill not found for old payment ${oldPayment._id}. Skipping.`);
          continue;
        }
        
        const customerId = bill.customer;
        if (!customerId) continue;
        
        const paymentNumber = await generateMigratedPaymentNumber();
        
        oldPayment.paymentNumber = paymentNumber;
        oldPayment.customerId = customerId;
        oldPayment.paymentDate = oldPayment.date || oldPayment.createdAt || new Date();
        oldPayment.receivedBy = oldPayment.method || 'Cash';
        oldPayment.notes = oldPayment.note || 'Migrated payment';
        oldPayment.outstandingBalanceAfterPayment = 0;
        oldPayment.allocationDetails = [
          {
            billId: bill._id,
            billNumber: bill.billNumber || 'Unknown',
            allocatedAmount: oldPayment.amount
          }
        ];
        
        await oldPayment.save();
        customerIdsToRecalculate.add(customerId.toString());
      }
      
      console.log(`[Migration] Migrated ${oldPayments.length} payment records.`);
      
      for (const cid of customerIdsToRecalculate) {
        await recalculateCustomerBalances(cid);
      }
    }

    // Resolve database conflict for customer Sornam
    try {
      const sornam = await Customer.findOne({ $or: [{ phone: '9942835200' }, { name: 'Sornam' }] });
      if (sornam) {
        console.log(`[Migration] Resolving conflict for Sornam (${sornam._id})...`);
        const sornamBills = await Bill.find({ customer: sornam._id, isDeleted: false });
        for (const bill of sornamBills) {
          if (bill.billNumber !== 'KBM-00003') {
            bill.isDeleted = true;
            await bill.save();
            console.log(`[Migration] Soft-deleted conflicting bill ${bill.billNumber} for Sornam.`);
          }
        }
        await recalculateCustomerBalances(sornam._id);
      }
    } catch (sornamErr) {
      console.error('[Migration] Error resolving Sornam conflict:', sornamErr);
    }

    // 3. Make sure all customers have their balances/allocations computed to initialize default values
    const customers = await Customer.find({ isDeleted: false });
    for (const customer of customers) {
      await recalculateCustomerBalances(customer._id);
    }
    
    console.log('[Migration] Database migration & outstanding balance reconciliation complete.');
  } catch (err) {
    console.error('[Migration] Error during old payments migration:', err);
  }
};

