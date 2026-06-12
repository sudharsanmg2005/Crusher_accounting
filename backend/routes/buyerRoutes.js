import express from 'express';
import { getBuyers, createBuyer, updateBuyer, deleteBuyer, getBuyerById } from '../controllers/buyerController.js';

const router = express.Router();

router.route('/')
  .get(getBuyers)
  .post(createBuyer);

router.route('/:id')
  .get(getBuyerById)
  .put(updateBuyer)
  .delete(deleteBuyer);

export default router;
