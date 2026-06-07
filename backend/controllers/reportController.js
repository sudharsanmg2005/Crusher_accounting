import Bill from '../models/Bill.js';
import Expense from '../models/Expense.js';
import Customer from '../models/Customer.js';

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

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Normalize to cover full days (inclusive range)
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const durationDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    prevEnd.setHours(23, 59, 59, 999);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (durationDays - 1));
    prevStart.setHours(0, 0, 0, 0);

    const billFilter = { date: { $gte: start, $lte: end }, isDeleted: false };
    const prevBillFilter = { date: { $gte: prevStart, $lte: prevEnd }, isDeleted: false };
    if (customerId) {
      billFilter.customer = customerId;
      prevBillFilter.customer = customerId;
    }

    const [bills, prevBills] = await Promise.all([
      Bill.find(billFilter).sort({ date: 1 }),
      Bill.find(prevBillFilter).sort({ date: 1 })
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

      return {
        sno: idx + 1,
        date: formatDateDDMMYYYY(b.date),
        vehicle: b.vehicleNumber || '',
        material: b.materialNameSnapshot || '',
        weight: weight.toFixed(2),
        price: formatMaybeIntOr2(price),
        amount: amount.toFixed(2),
        pass: formatMaybeIntOr2(pass),
        total: formatMaybeIntOr2(total)
      };
    });

    const sumAmount = bills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    const sumPass = bills.reduce((sum, b) => sum + (Number(b.passAmount) || 0), 0);
    const sumPaid = bills.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
    const currentWeekBalance = sumAmount + sumPass; // AMOUNT + PASS

    const prevSumAmount = prevBills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
    const prevSumPass = prevBills.reduce((sum, b) => sum + (Number(b.passAmount) || 0), 0);
    const prevSumPaid = prevBills.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
    const lastWeekBalance = prevSumAmount + prevSumPass; // AMOUNT + PASS

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
      rows
    });
  } catch (err) {
    next(err);
  }
};

export const getDailyIncome = async (req, res, next) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

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
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;

    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);

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
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
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

