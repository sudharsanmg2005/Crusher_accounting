import Bill from '../models/Bill.js';
import Expense from '../models/Expense.js';
import Customer from '../models/Customer.js';
import Payment from '../models/Payment.js';
import Buyer from '../models/Buyer.js';
import Load, { roundToNearestTen } from '../models/Load.js';
import BuyerPayment from '../models/BuyerPayment.js';

const pad2 = (n) => String(n).padStart(2, '0');

const formatDateDDMMYYYY = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const formatDateDDMMYYYY_DOTS = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const formatINR2 = (n) => {
  const num = Number(n) || 0;
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(num);
};

const formatMaybeIntOr2 = (n) => {
  const num = Number(n) || 0;
  const rounded = Math.round(num);
  // Allow tiny floating errors so values like 8457.0000001 display as "8457"
  const eps = 1e-6;
  if (Math.abs(num - rounded) < eps) return String(rounded);
  return num.toFixed(2);
};

export const getGeneralStatement = async (req, res, next) => {
  try {
    const { startDate, endDate, customerId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'startDate and endDate are required' });
    }

    const start = new Date(`${startDate}T00:00:00+05:30`);
    const end = new Date(`${endDate}T23:59:59.999+05:30`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const durationDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(start.getTime() - durationDays * 24 * 60 * 60 * 1000);

    const billFilter = { date: { $gte: start, $lte: end }, isDeleted: false };
    const prevBillFilter = { date: { $gte: prevStart, $lte: prevEnd }, isDeleted: false };
    const paymentFilter = { paymentDate: { $gte: start, $lte: end } };
    const prevPaymentFilter = { paymentDate: { $gte: prevStart, $lte: prevEnd } };
    if (customerId) {
      billFilter.customer = customerId;
      prevBillFilter.customer = customerId;
      paymentFilter.customerId = customerId;
      prevPaymentFilter.customerId = customerId;
    }

    const [bills, prevBills, payments, prevPayments] = await Promise.all([
      Bill.find(billFilter).sort({ date: 1 }),
      Bill.find(prevBillFilter).sort({ date: 1 }),
      Payment.find(paymentFilter),
      Payment.find(prevPaymentFilter)
    ]);

    const customer =
      customerId
        ? await Customer.findById(customerId).select({ name: 1 })
        : null;

    const rows = bills.map((b, idx) => {
      const weight = Number(b.quantity) || 0;
      const price = Number(b.pricePerUnit) || 0;
      const amount = Number(b.totalAmount) || 0;
      const pass = Number(b.passAmount) || 0;
      const total = amount + pass; // Matches the PDF-style columns: AMOUNT + PASS = TOTAL

      const row = {
        sno: idx + 1,
        billNumber: b.billNumber || '',
        date: formatDateDDMMYYYY(b.date),
        vehicle: b.vehicleNumber || '',
        material: b.materialNameSnapshot || '',
        weight: weight.toFixed(2),
        price: formatMaybeIntOr2(price),
        amount: amount.toFixed(2),
        pass: formatMaybeIntOr2(pass),
        total: formatMaybeIntOr2(total),
        allocatedAmount: formatMaybeIntOr2(b.allocatedAmount || 0),
        pendingAmount: formatMaybeIntOr2(b.pendingAmount || 0)
      };

      if (!customerId) {
        row.customerName = b.customerNameSnapshot || '';
      }

      return row;
    });

    const sumAmount = bills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    const sumPass = bills.reduce((sum, b) => sum + (Number(b.passAmount) || 0), 0);
    const sumPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const currentWeekBalance = sumAmount + sumPass; // AMOUNT + PASS

    const prevSumAmount = prevBills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    const prevSumPass = prevBills.reduce((sum, b) => sum + (Number(b.passAmount) || 0), 0);
    const prevSumPaid = prevPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const lastWeekBalance = Math.max(0, prevSumAmount + prevSumPass - prevSumPaid);

  const title = customer ? `${customer.name} Bill` : 'GENERAL STATEMENT';

    return res.json({
      title,
      rangeLabel: `${formatDateDDMMYYYY_DOTS(start)} - ${formatDateDDMMYYYY_DOTS(end)}`,
      customer: customerId
        ? {
            id: customerId,
            name: customer?.name || ''
          }
        : null,
      totals: {
        currentWeekBalance: `₹ ${formatINR2(currentWeekBalance)}`,
        // "RECEIVED AMOUNT" must reflect partial payments received.
        receivedAmount: `₹ ${formatINR2(sumPaid)}`,
        lastWeekBalance: `₹ ${formatINR2(lastWeekBalance)}`,
        // Remaining balance after received payments.
        totalBalance: `₹ ${formatINR2(Math.max(0, currentWeekBalance - sumPaid))}`
      },
      rows,
      payments: payments.map((p) => ({
        paymentNumber: p.paymentNumber || '',
        date: formatDateDDMMYYYY(p.paymentDate || p.date),
        amount: formatMaybeIntOr2(p.amount),
        notes: p.notes || p.note || '',
        receivedBy: p.method || p.receivedBy || ''
      }))
    });
  } catch (err) {
    next(err);
  }
};

export const getDailyIncome = async (req, res, next) => {
  try {
    const { date } = req.query;
    let dateStr;
    if (date) {
      dateStr = date;
    } else {
      const utcNow = new Date();
      const istNow = new Date(utcNow.getTime() + 5.5 * 60 * 60 * 1000);
      dateStr = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, '0')}-${String(istNow.getUTCDate()).padStart(2, '0')}`;
    }
    const start = new Date(`${dateStr}T00:00:00+05:30`);
    const end = new Date(`${dateStr}T23:59:59.999+05:30`);

    const bills = await Bill.find({ date: { $gte: start, $lte: end }, isDeleted: false });
    const total = bills.reduce((sum, b) => sum + b.totalAmount + (Number(b.passAmount) || 0), 0);
    res.json({ date: start, total, bills });
  } catch (err) {
    next(err);
  }
};

export const getMonthlyIncome = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const utcNow = new Date();
    const istNow = new Date(utcNow.getTime() + 5.5 * 60 * 60 * 1000);
    const y = parseInt(year) || istNow.getUTCFullYear();
    const m = parseInt(month) || (istNow.getUTCMonth() + 1);

    const mStr = String(m).padStart(2, '0');
    const start = new Date(`${y}-${mStr}-01T00:00:00+05:30`);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = new Date(`${y}-${mStr}-${lastDay}T23:59:59.999+05:30`);

    const bills = await Bill.find({ date: { $gte: start, $lte: end }, isDeleted: false });
    const total = bills.reduce((sum, b) => sum + b.totalAmount + (Number(b.passAmount) || 0), 0);
    res.json({ year: y, month: m, total, bills });
  } catch (err) {
    next(err);
  }
};

export const getExpensesReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { isDeleted: false };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        filter.date.$gte = new Date(`${startDate}T00:00:00+05:30`);
      }
      if (endDate) {
        filter.date.$lte = new Date(`${endDate}T23:59:59.999+05:30`);
      }
    }
    const expenses = await Expense.find(filter);
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    const byType = {};
    expenses.forEach((e) => {
      byType[e.type] = (byType[e.type] || 0) + e.amount;
    });

    res.json({ total, expenses, byType });
  } catch (err) {
    next(err);
  }
};

export const getProfitReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const billFilter = { isDeleted: false };
    const expenseFilter = { isDeleted: false };
    if (startDate || endDate) {
      billFilter.date = {};
      expenseFilter.date = {};
      if (startDate) {
        billFilter.date.$gte = new Date(startDate);
        expenseFilter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        billFilter.date.$lte = new Date(endDate);
        expenseFilter.date.$lte = new Date(endDate);
      }
    }

    const bills = await Bill.find(billFilter);
    const expenses = await Expense.find(expenseFilter);

    const incomeTotal = bills.reduce((sum, b) => sum + b.totalAmount + (Number(b.passAmount) || 0), 0);
    const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const profit = incomeTotal - expenseTotal;

    res.json({ incomeTotal, expenseTotal, profit });
  } catch (err) {
    next(err);
  }
};

const parseDateRange = (query) => {
  const { filter, startDate, endDate } = query;
  
  // Calculate current date/time in Asia/Kolkata (IST) timezone
  const utcNow = new Date();
  const istNow = new Date(utcNow.getTime() + 5.5 * 60 * 60 * 1000);
  
  // Format current date in YYYY-MM-DD local format
  const toYMD = (d) => {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };

  const todayStr = toYMD(istNow);
  let start = new Date();
  let end = new Date();

  if (filter === 'today') {
    start = new Date(`${todayStr}T00:00:00+05:30`);
    end = new Date(`${todayStr}T23:59:59.999+05:30`);
  } else if (filter === 'week') {
    // Current week starting Sunday
    const day = istNow.getUTCDay();
    const sunday = new Date(istNow);
    sunday.setUTCDate(istNow.getUTCDate() - day);
    const sundayStr = toYMD(sunday);
    
    const saturday = new Date(sunday);
    saturday.setUTCDate(sunday.getUTCDate() + 6);
    const saturdayStr = toYMD(saturday);

    start = new Date(`${sundayStr}T00:00:00+05:30`);
    end = new Date(`${saturdayStr}T23:59:59.999+05:30`);
  } else if (filter === 'month') {
    const year = istNow.getUTCFullYear();
    const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
    const lastDay = new Date(Date.UTC(year, istNow.getUTCMonth() + 1, 0)).getUTCDate();
    
    start = new Date(`${year}-${month}-01T00:00:00+05:30`);
    end = new Date(`${year}-${month}-${lastDay}T23:59:59.999+05:30`);
  } else if (filter === 'custom' || (startDate && endDate)) {
    const sStr = startDate || todayStr;
    const eStr = endDate || todayStr;
    start = new Date(`${sStr}T00:00:00+05:30`);
    end = new Date(`${eStr}T23:59:59.999+05:30`);
  } else {
    // Default to this month
    const year = istNow.getUTCFullYear();
    const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
    const lastDay = new Date(Date.UTC(year, istNow.getUTCMonth() + 1, 0)).getUTCDate();
    
    start = new Date(`${year}-${month}-01T00:00:00+05:30`);
    end = new Date(`${year}-${month}-${lastDay}T23:59:59.999+05:30`);
  }

  return { start, end };
};

export const getReportDashboard = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);

    // Total bills generated & total amount billed in date range
    const billStats = await Bill.aggregate([
      { $match: { isDeleted: false, date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalBilled: { $sum: { $add: ['$totalAmount', { $ifNull: ['$passAmount', 0] }] } }
        }
      }
    ]);

    // Total payments received in date range
    const paymentStats = await Payment.aggregate([
      { $match: { paymentDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalReceived: { $sum: '$amount' }
        }
      }
    ]);

    // Total active customers
    const totalCustomers = await Customer.countDocuments({ isDeleted: false });

    // Total outstanding (billed - paid up to 'end' date)
    const allBills = await Bill.find({ isDeleted: false, date: { $lte: end } });
    const allPayments = await Payment.find({ paymentDate: { $lte: end } });

    const customerBalances = {};
    for (const b of allBills) {
      if (b.customer) {
        const cid = b.customer.toString();
        customerBalances[cid] = (customerBalances[cid] || 0) + (b.totalAmount + (b.passAmount || 0));
      }
    }
    for (const p of allPayments) {
      if (p.customerId) {
        const cid = p.customerId.toString();
        customerBalances[cid] = (customerBalances[cid] || 0) - p.amount;
      }
    }

    let totalOutstandingAmount = 0;
    let customersWithOutstanding = 0;
    for (const cid in customerBalances) {
      const bal = customerBalances[cid];
      if (bal > 1e-4) {
        totalOutstandingAmount += bal;
        customersWithOutstanding++;
      }
    }

    res.json({
      totalBillsGenerated: billStats[0]?.count || 0,
      totalAmountBilled: billStats[0]?.totalBilled || 0,
      totalPaymentsReceived: paymentStats[0]?.totalReceived || 0,
      totalOutstandingAmount,
      totalCustomers,
      customersWithOutstandingBalances: customersWithOutstanding
    });
  } catch (err) {
    next(err);
  }
};

export const getOutstandingReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);

    const customers = await Customer.find({ isDeleted: false });
    const billsInRange = await Bill.find({ isDeleted: false, date: { $gte: start, $lte: end } });
    const paymentsInRange = await Payment.find({ paymentDate: { $gte: start, $lte: end } });

    const overallBills = await Bill.find({ isDeleted: false, date: { $lte: end } });
    const overallPayments = await Payment.find({ paymentDate: { $lte: end } });

    const inRangeBilled = {};
    const inRangePaid = {};
    const overallBilled = {};
    const overallPaid = {};
    const lastPaymentDates = {};

    for (const b of billsInRange) {
      if (b.customer) {
        const cid = b.customer.toString();
        inRangeBilled[cid] = (inRangeBilled[cid] || 0) + (b.totalAmount + (b.passAmount || 0));
      }
    }
    for (const p of paymentsInRange) {
      if (p.customerId) {
        const cid = p.customerId.toString();
        inRangePaid[cid] = (inRangePaid[cid] || 0) + p.amount;
      }
    }
    for (const b of overallBills) {
      if (b.customer) {
        const cid = b.customer.toString();
        overallBilled[cid] = (overallBilled[cid] || 0) + (b.totalAmount + (b.passAmount || 0));
      }
    }
    for (const p of overallPayments) {
      if (p.customerId) {
        const cid = p.customerId.toString();
        overallPaid[cid] = (overallPaid[cid] || 0) + p.amount;
        
        const pdate = new Date(p.paymentDate);
        if (!lastPaymentDates[cid] || pdate > lastPaymentDates[cid]) {
          lastPaymentDates[cid] = pdate;
        }
      }
    }

    const report = customers.map((c) => {
      const cid = c._id.toString();
      const billed = overallBilled[cid] || 0;
      const paid = overallPaid[cid] || 0;
      const outstanding = Math.max(0, billed - paid);

      return {
        customerId: cid,
        customerName: c.name,
        phone: c.phone,
        totalBillsAmount: inRangeBilled[cid] || 0,
        totalPaidAmount: inRangePaid[cid] || 0,
        outstandingBalance: outstanding,
        lastPaymentDate: lastPaymentDates[cid] || null
      };
    });

    report.sort((a, b) => (a.customerName || '').localeCompare(b.customerName || ''));

    res.json(report);
  } catch (err) {
    next(err);
  }
};

export const getPaymentReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);

    const payments = await Payment.find({ paymentDate: { $gte: start, $lte: end } })
      .populate('customerId', 'name')
      .sort({ paymentDate: -1 });

    const report = payments.map((p) => ({
      paymentNumber: p.paymentNumber,
      paymentDate: p.paymentDate,
      customerId: p.customerId?._id,
      customerName: p.customerId?.name || 'Unknown',
      amountPaid: p.amount,
      receivedBy: p.receivedBy,
      notes: p.notes,
      outstandingBalanceAfterPayment: p.outstandingBalanceAfterPayment,
      allocationDetails: p.allocationDetails.map((d) => ({
        billId: d.billId,
        billNumber: d.billNumber,
        allocatedAmount: d.allocatedAmount
      }))
    }));

    res.json(report);
  } catch (err) {
    next(err);
  }
};

export const getPartialPaymentReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);

    const payments = await Payment.find({ paymentDate: { $gte: start, $lte: end } })
      .populate('customerId', 'name')
      .sort({ paymentDate: -1 });

    const report = payments.map((p) => {
      const billsAdjusted = p.allocationDetails.map((d) => d.billNumber).join(', ');
      const allocatedPerBill = p.allocationDetails.map((d) => `${d.billNumber}: ₹${d.allocatedAmount}`).join(', ');

      return {
        paymentDate: p.paymentDate,
        customerName: p.customerId?.name || 'Unknown',
        paymentAmount: p.amount,
        billsAdjusted,
        allocatedAmountPerBill: allocatedPerBill,
        remainingOutstanding: p.outstandingBalanceAfterPayment
      };
    });

    res.json(report);
  } catch (err) {
    next(err);
  }
};

export const getCustomerStatementReport = async (req, res, next) => {
  try {
    const customerId = req.params.customerId;
    const { start, end } = parseDateRange(req.query);

    const customer = await Customer.findById(customerId);
    if (!customer || customer.isDeleted) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Bills and Payments in range
    const bills = await Bill.find({ customer: customerId, isDeleted: false, date: { $gte: start, $lte: end } }).sort({ date: 1 });
    const payments = await Payment.find({ customerId, paymentDate: { $gte: start, $lte: end } }).sort({ paymentDate: 1 });

    // Ledger (always compute running balance cumulatively from the beginning)
    const allBills = await Bill.find({ customer: customerId, isDeleted: false }).sort({ date: 1, createdAt: 1 });
    const allPayments = await Payment.find({ customerId }).sort({ paymentDate: 1, createdAt: 1 });

    const ledgerEntries = [];
    for (const b of allBills) {
      ledgerEntries.push({
        date: b.date,
        type: 'Bill Created',
        reference: '—',
        debit: b.totalAmount + (b.passAmount || 0),
        credit: 0,
        createdAt: b.createdAt
      });
    }
    for (const p of allPayments) {
      ledgerEntries.push({
        date: p.paymentDate,
        type: 'Payment Received',
        reference: p.paymentNumber,
        debit: 0,
        credit: p.amount,
        createdAt: p.createdAt
      });
    }

    ledgerEntries.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      if (a.type !== b.type) return a.type === 'Bill Created' ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    let runningBal = 0;
    let ledger = ledgerEntries.map((e) => {
      runningBal += e.debit - e.credit;
      return {
        date: e.date,
        reference: e.reference,
        debit: e.debit,
        credit: e.credit,
        balance: runningBal
      };
    });

    // Filter ledger to date range
    const startTime = start.getTime();
    const endTime = end.getTime();
    ledger = ledger.filter((item) => {
      const time = new Date(item.date).getTime();
      return time >= startTime && time <= endTime;
    });

    // Summary calculations (within range)
    const totalBillsAmount = bills.reduce((sum, b) => sum + b.totalAmount + (b.passAmount || 0), 0);
    const totalPaidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    
    // Overall cumulative outstanding balance up to 'end'
    const cumulativeBilled = allBills.filter((b) => new Date(b.date).getTime() <= endTime).reduce((sum, b) => sum + b.totalAmount + (b.passAmount || 0), 0);
    const cumulativePaid = allPayments.filter((p) => new Date(p.paymentDate).getTime() <= endTime).reduce((sum, p) => sum + p.amount, 0);
    const outstandingBalance = Math.max(0, cumulativeBilled - cumulativePaid);

    res.json({
      customer,
      bills: bills.map((b) => ({
        billNumber: b.billNumber,
        date: b.date,
        totalAmount: b.totalAmount + (b.passAmount || 0),
        allocatedAmount: b.allocatedAmount,
        pendingAmount: b.pendingAmount
      })),
      payments: payments.map((p) => ({
        paymentNumber: p.paymentNumber,
        paymentDate: p.paymentDate,
        amountPaid: p.amount,
        notes: p.notes
      })),
      ledger,
      summary: {
        totalBillsAmount,
        totalPaidAmount,
        outstandingBalance
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getBuyerOutstandingReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);

    const buyers = await Buyer.find({ isDeleted: false });
    const loadsInRange = await Load.find({ isDeleted: false, date: { $gte: start, $lte: end } });
    const paymentsInRange = await BuyerPayment.find({ paymentDate: { $gte: start, $lte: end } });

    const overallLoads = await Load.find({ isDeleted: false, date: { $lte: end } });
    const overallPayments = await BuyerPayment.find({ paymentDate: { $lte: end } });

    const inRangeBilled = {};
    const inRangePaid = {};
    const overallBilled = {};
    const overallPaid = {};

    for (const l of loadsInRange) {
      if (l.buyer) {
        const bid = l.buyer.toString();
        const amt = l.totalAmount ?? roundToNearestTen(l.price * l.quantity);
        inRangeBilled[bid] = (inRangeBilled[bid] || 0) + amt;
      }
    }
    for (const p of paymentsInRange) {
      if (p.buyerId) {
        const bid = p.buyerId.toString();
        inRangePaid[bid] = (inRangePaid[bid] || 0) + p.amount;
      }
    }
    for (const l of overallLoads) {
      if (l.buyer) {
        const bid = l.buyer.toString();
        const amt = l.totalAmount ?? roundToNearestTen(l.price * l.quantity);
        overallBilled[bid] = (overallBilled[bid] || 0) + amt;
      }
    }
    for (const p of overallPayments) {
      if (p.buyerId) {
        const bid = p.buyerId.toString();
        overallPaid[bid] = (overallPaid[bid] || 0) + p.amount;
      }
    }

    const report = buyers.map((b) => {
      const bid = b._id.toString();
      const billed = overallBilled[bid] || 0;
      const paid = overallPaid[bid] || 0;
      const outstanding = Math.max(0, billed - paid);

      return {
        buyerId: bid,
        buyerName: b.name,
        phone: b.phone,
        totalLoadsAmount: inRangeBilled[bid] || 0,
        totalPaidAmount: inRangePaid[bid] || 0,
        outstandingBalance: outstanding
      };
    });

    report.sort((a, b) => (a.buyerName || '').localeCompare(b.buyerName || ''));

    res.json(report);
  } catch (err) {
    next(err);
  }
};

export const getBuyerPaymentsReport = async (req, res, next) => {
  try {
    const { start, end } = parseDateRange(req.query);

    const payments = await BuyerPayment.find({ paymentDate: { $gte: start, $lte: end } })
      .populate('buyerId', 'name')
      .sort({ paymentDate: -1 });

    const report = payments.map((p) => ({
      paymentNumber: p.paymentNumber,
      paymentDate: p.paymentDate,
      buyerId: p.buyerId?._id,
      buyerName: p.buyerId?.name || 'Unknown',
      amountPaid: p.amount,
      paidBy: p.paidBy,
      notes: p.notes,
      outstandingBalanceAfterPayment: p.outstandingBalanceAfterPayment
    }));

    res.json(report);
  } catch (err) {
    next(err);
  }
};


