import express from 'express';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getArchivedExpenses,
  restoreExpense,
  permanentDeleteExpense
} from '../controllers/expenseController.js';
import { requireSuperAdmin, requireWriteAccess } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.route('/').get(getExpenses).post(requireWriteAccess, createExpense);
router.route('/archived').get(requireSuperAdmin, getArchivedExpenses);
router.route('/:id').put(requireWriteAccess, updateExpense).delete(requireWriteAccess, deleteExpense);
router.route('/:id/restore').patch(requireSuperAdmin, restoreExpense);
router.route('/:id/permanent').delete(requireSuperAdmin, permanentDeleteExpense);

export default router;

