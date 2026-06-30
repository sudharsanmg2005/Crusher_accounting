import express from 'express';
import {
  getDailyIncome,
  getMonthlyIncome,
  getExpensesReport,
  getProfitReport,
  getGeneralStatement,
  getReportDashboard,
  getOutstandingReport,
  getPaymentReport,
  getPartialPaymentReport,
  getCustomerStatementReport,
  getBuyerOutstandingReport,
  getBuyerPaymentsReport
} from '../controllers/reportController.js';

const router = express.Router();

router.get('/income/daily', getDailyIncome);
router.get('/income/monthly', getMonthlyIncome);
router.get('/expenses', getExpensesReport);
router.get('/profit', getProfitReport);
router.get('/summary', getGeneralStatement);

router.get('/dashboard', getReportDashboard);
router.get('/outstanding', getOutstandingReport);
router.get('/outstanding-buyers', getBuyerOutstandingReport);
router.get('/buyer-payments', getBuyerPaymentsReport);
router.get('/payments', getPaymentReport);
router.get('/partial-payments', getPartialPaymentReport);
router.get('/customer-statement/:customerId', getCustomerStatementReport);

export default router;


