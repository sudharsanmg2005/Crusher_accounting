import express from 'express';
import { getBuyers, createBuyer, updateBuyer, deleteBuyer, getBuyerById, addBuyerVehicle } from '../controllers/buyerController.js';
import { requireWriteAccess } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getBuyers)
  .post(createBuyer);

router.route('/:id')
  .get(getBuyerById)
  .put(updateBuyer)
  .delete(deleteBuyer);

router.route('/:id/vehicles')
  .post(requireWriteAccess, addBuyerVehicle);

export default router;
