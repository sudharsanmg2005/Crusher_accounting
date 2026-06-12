import express from 'express';
import { createBuyerPayment, updateBuyerPayment, deleteBuyerPayment } from '../controllers/buyerPaymentController.js';
import { requireWriteAccess } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.post('/', requireWriteAccess, createBuyerPayment);
router.put('/:id', requireWriteAccess, updateBuyerPayment);
router.delete('/:id', requireWriteAccess, deleteBuyerPayment);

export default router;
