import express from 'express';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  getCustomerHistory,
  deleteCustomer,
  getArchivedCustomers,
  restoreCustomer,
  permanentDeleteCustomer,
  addCustomerVehicle
} from '../controllers/customerController.js';
import { requireSuperAdmin, requireWriteAccess } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.route('/').get(getCustomers).post(requireWriteAccess, createCustomer);
router.route('/archived').get(requireSuperAdmin, getArchivedCustomers);
router.route('/:id').put(requireWriteAccess, updateCustomer).delete(requireWriteAccess, deleteCustomer);
router.route('/:id/restore').patch(requireSuperAdmin, restoreCustomer);
router.route('/:id/permanent').delete(requireSuperAdmin, permanentDeleteCustomer);
router.route('/:id/vehicles').post(requireWriteAccess, addCustomerVehicle);
router.route('/:id/history').get(getCustomerHistory);

export default router;

