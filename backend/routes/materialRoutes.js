import express from 'express';
import {
  getMaterials,
  createMaterial,
  updateMaterialPrice,
  deleteMaterial,
  getArchivedMaterials,
  restoreMaterial,
  permanentDeleteMaterial
} from '../controllers/materialController.js';
import { requireSuperAdmin, requireWriteAccess } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.route('/').get(getMaterials).post(requireWriteAccess, createMaterial);
router.route('/archived').get(requireSuperAdmin, getArchivedMaterials);
router.route('/:id/price').put(requireWriteAccess, updateMaterialPrice);
router.route('/:id').delete(requireWriteAccess, deleteMaterial);
router.route('/:id/restore').patch(requireSuperAdmin, restoreMaterial);
router.route('/:id/permanent').delete(requireSuperAdmin, permanentDeleteMaterial);

export default router;

