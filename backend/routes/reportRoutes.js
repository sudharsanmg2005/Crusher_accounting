import express from 'express';
import {
  getDailyIncome,
  getMonthlyIncome,
  getExpensesReport,
  getProfitReport,
  getGeneralStatement
} from '../controllers/reportController.js';

const router = express.Router();

router.get('/income/daily', getDailyIncome);
router.get('/income/monthly', getMonthlyIncome);
router.get('/expenses', getExpensesReport);
router.get('/profit', getProfitReport);
router.get('/summary', getGeneralStatement);

export default router;

