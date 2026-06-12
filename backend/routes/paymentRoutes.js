import express from 'express';
import { createPayment, updatePayment, deletePayment } from '../controllers/paymentController.js';
import { requireWriteAccess } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.post('/', requireWriteAccess, createPayment);
router.put('/:id', requireWriteAccess, updatePayment);
router.delete('/:id', requireWriteAccess, deletePayment);

export default router;
