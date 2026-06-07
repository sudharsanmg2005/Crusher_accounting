import express from 'express';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getArchivedEmployees,
  restoreEmployee,
  permanentDeleteEmployee,
  getAttendance,
  saveAttendance,
  deleteAttendanceRange,
  getSalaries,
  getSalarySummary,
  paySalary,
  deleteTransaction
} from '../controllers/employeeController.js';
import { requireSuperAdmin, requireWriteAccess } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getEmployees)
  .post(requireWriteAccess, createEmployee);

router.route('/archived')
  .get(requireSuperAdmin, getArchivedEmployees);

router.route('/:id')
  .put(requireWriteAccess, updateEmployee)
  .delete(requireWriteAccess, deleteEmployee);

router.route('/:id/restore')
  .patch(requireSuperAdmin, restoreEmployee);

router.route('/:id/permanent')
  .delete(requireSuperAdmin, permanentDeleteEmployee);

router.route('/attendance')
  .get(getAttendance)
  .post(requireWriteAccess, saveAttendance)
  .delete(requireWriteAccess, deleteAttendanceRange);

router.route('/salaries')
  .get(getSalaries);

router.route('/salaries/summary')
  .get(getSalarySummary);

router.route('/salaries/pay')
  .post(requireWriteAccess, paySalary);

router.route('/salaries/payment/:paymentId/history/:transactionId')
  .delete(requireWriteAccess, deleteTransaction);

export default router;
