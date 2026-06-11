import express from 'express';
import {
  loginAdmin,
  getMe,
  createAdmin,
  bootstrapFirstAdmin,
  getAdmins,
  updateAdmin,
  deleteAdmin,
  getAdminLogs,
  getAllAuditLogs,
  restoreAuditLog,
  deleteAuditLog,
  resetSuperAdminPassword
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { requireSuperAdmin } from '../middleware/permissionMiddleware.js';
import { auditWrites } from '../middleware/auditMiddleware.js';

const router = express.Router();

router.post('/login', loginAdmin);
router.get('/me', requireAuth, getMe);
router.post('/reset-super-admin-password', requireAuth, requireSuperAdmin, auditWrites, resetSuperAdminPassword);

// Only super admins can manage other admins.
router.get('/admins', requireAuth, requireAdmin, requireSuperAdmin, getAdmins);
router.post('/admins', requireAuth, requireAdmin, requireSuperAdmin, auditWrites, createAdmin);
router.get('/admins/:id/logs', requireAuth, requireAdmin, requireSuperAdmin, getAdminLogs);
router.get('/audit-logs', requireAuth, requireAdmin, requireSuperAdmin, getAllAuditLogs);
router.post('/audit-logs/:id/restore', requireAuth, requireAdmin, requireSuperAdmin, restoreAuditLog);
router.delete('/audit-logs/:id', requireAuth, requireAdmin, requireSuperAdmin, deleteAuditLog);
router.put('/admins/:id', requireAuth, requireAdmin, requireSuperAdmin, auditWrites, updateAdmin);
router.delete('/admins/:id', requireAuth, requireAdmin, requireSuperAdmin, auditWrites, deleteAdmin);

// One-time endpoint to create the first admin
router.post('/bootstrap-admin', bootstrapFirstAdmin);

export default router;

