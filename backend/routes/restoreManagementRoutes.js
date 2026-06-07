import express from 'express';
import {
  previewRestoreManagement,
  restoreManagedCustomer,
  restoreManagedEmployee,
  bulkRestoreManagedRecords,
  restoreAllManagedRecords,
  permanentDeleteManagedCustomer,
  permanentDeleteManagedEmployee
} from '../controllers/restoreManagementController.js';
import { requireSuperAdmin } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.get('/preview', requireSuperAdmin, previewRestoreManagement);
router.patch('/customers/:id/restore', requireSuperAdmin, restoreManagedCustomer);
router.patch('/employees/:id/restore', requireSuperAdmin, restoreManagedEmployee);
router.delete('/customers/:id/permanent', requireSuperAdmin, permanentDeleteManagedCustomer);
router.delete('/employees/:id/permanent', requireSuperAdmin, permanentDeleteManagedEmployee);
router.post('/bulk', requireSuperAdmin, bulkRestoreManagedRecords);
router.post('/restore-all', requireSuperAdmin, restoreAllManagedRecords);

export default router;
