import express from 'express';
import {
  getBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
  restoreBill,
  permanentDeleteBill,
  addPaymentToBill,
  getTodaySummary,
  getArchivedBills,
  createBillsBulk
} from '../controllers/billController.js';
import {
  requireBillCreateAccess,
  requireWriteAccess,
  requireSuperAdmin
} from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.route('/').get(getBills).post(requireBillCreateAccess, createBill);
router.route('/bulk').post(requireBillCreateAccess, createBillsBulk);
router.route('/summary/today').get(getTodaySummary);
router.route('/archived').get(requireSuperAdmin, getArchivedBills);
router.route('/:id').get(getBillById).put(requireWriteAccess, updateBill).delete(requireWriteAccess, deleteBill);
router.route('/:id/restore').patch(requireSuperAdmin, restoreBill);
router.route('/:id/permanent').delete(requireSuperAdmin, permanentDeleteBill);
router.route('/:id/payments').post(requireWriteAccess, addPaymentToBill);
// Backward-compatible alias (frontend calls /pay)
router.route('/:id/pay').post(requireWriteAccess, addPaymentToBill);

export default router;

