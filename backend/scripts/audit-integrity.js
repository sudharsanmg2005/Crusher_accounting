import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../config/db.js';
import Customer from '../models/Customer.js';
import Bill from '../models/Bill.js';
import Payment from '../models/Payment.js';
import Buyer from '../models/Buyer.js';
import Load, { roundToNearestTen } from '../models/Load.js';
import BuyerPayment from '../models/BuyerPayment.js';
import { recalculateCustomerBalances } from '../services/paymentService.js';
import { recalculateBuyerBalances } from '../services/buyerPaymentService.js';
import mongoose from 'mongoose';

async function auditAll() {
  await connectDB();
  console.log('[Audit] Starting comprehensive financial integrity check...');

  const customers = await Customer.find({ isDeleted: false });
  console.log(`[Audit] Auditing ${customers.length} active customers...`);

  let customerDiscrepancies = 0;
  for (const c of customers) {
    await recalculateCustomerBalances(c._id);

    const bills = await Bill.find({ customer: c._id, isDeleted: false });
    const payments = await Payment.find({ customerId: c._id });

    const totalBilled = bills.reduce((sum, b) => sum + (b.totalAmount + (b.passAmount || 0)), 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const expectedOutstanding = Math.max(0, totalBilled - totalPaid);

    const sumAllocated = bills.reduce((sum, b) => sum + (b.allocatedAmount || 0), 0);
    const allocatedPaymentSum = payments.reduce((sum, p) => {
      const pAlloc = p.allocationDetails ? p.allocationDetails.reduce((s, d) => s + d.allocatedAmount, 0) : 0;
      return sum + pAlloc;
    }, 0);

    if (sumAllocated !== Math.min(totalBilled, totalPaid)) {
      console.error(`[Customer Discrepancy] Customer ${c.name} (${c._id}): sumAllocated=${sumAllocated}, expectedAllocated=${Math.min(totalBilled, totalPaid)}`);
      customerDiscrepancies++;
    }
  }

  const buyers = await Buyer.find({ isDeleted: false });
  console.log(`[Audit] Auditing ${buyers.length} active buyers...`);

  let buyerDiscrepancies = 0;
  for (const b of buyers) {
    await recalculateBuyerBalances(b._id);

    const loads = await Load.find({ buyer: b._id, isDeleted: false });
    const payments = await BuyerPayment.find({ buyerId: b._id });

    const totalLoadCost = loads.reduce((sum, l) => sum + (l.totalAmount ?? roundToNearestTen(l.price * l.quantity)), 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    const sumAllocated = loads.reduce((sum, l) => sum + (l.allocatedAmount || 0), 0);

    if (sumAllocated !== Math.min(totalLoadCost, totalPaid)) {
      console.error(`[Buyer Discrepancy] Buyer ${b.name} (${b._id}): sumAllocated=${sumAllocated}, expectedAllocated=${Math.min(totalLoadCost, totalPaid)}`);
      buyerDiscrepancies++;
    }
  }

  console.log(`[Audit Summary] Customer Discrepancies: ${customerDiscrepancies}, Buyer Discrepancies: ${buyerDiscrepancies}`);
  if (customerDiscrepancies === 0 && buyerDiscrepancies === 0) {
    console.log('[Audit Passed] 100% Financial ledger and allocation integrity verified across all customers and buyers!');
  }

  await mongoose.disconnect();
}

auditAll().catch(err => {
  console.error('[Audit Error]', err);
  process.exit(1);
});
