import express from 'express';
import { createPayment } from '../controllers/paymentController.js';
import { requireWriteAccess } from '../middleware/permissionMiddleware.js';

const router = express.Router();

router.post('/', requireWriteAccess, createPayment);

export default router;
