import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, getDatabaseStatus } from './config/db.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { auditWrites } from './middleware/auditMiddleware.js';
import customerRoutes from './routes/customerRoutes.js';
import materialRoutes from './routes/materialRoutes.js';
import billRoutes from './routes/billRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import restoreManagementRoutes from './routes/restoreManagementRoutes.js';
import loadRoutes from './routes/loadRoutes.js';
import buyerRoutes from './routes/buyerRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import buyerPaymentRoutes from './routes/buyerPaymentRoutes.js';

import { migrateOldPayments } from './services/paymentService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

if (isProduction) {
  app.set('trust proxy', 1);
}

connectDB().then(async () => {
  try {
    await migrateOldPayments();
  } catch (err) {
    console.error('Database migration failed on startup:', err);
  }
});

const resolveCors = () => {
  const configured = process.env.CORS_ORIGIN?.trim();
  if (configured === '*') return { origin: true };
  if (configured) return { origin: configured.split(',').map((item) => item.trim()) };
  // Default fallback if CORS_ORIGIN is not configured:
  // Reflect the request origin (origin: true) to allow connection from the frontend.
  return { origin: true };
};

app.use(cors(resolveCors()));
app.use(express.json());
app.use(isProduction ? morgan('combined') : morgan('dev'));

app.get('/api/health', (req, res) => {
  const database = getDatabaseStatus();
  res.json({
    status: database.status === 'connected' ? 'ok' : 'degraded',
    environment: process.env.NODE_ENV || 'development',
    database
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/customers', requireAuth, requireAdmin, auditWrites, customerRoutes);
app.use('/api/materials', requireAuth, requireAdmin, auditWrites, materialRoutes);
app.use('/api/bills', requireAuth, requireAdmin, auditWrites, billRoutes);
app.use('/api/expenses', requireAuth, requireAdmin, auditWrites, expenseRoutes);
app.use('/api/reports', requireAuth, requireAdmin, reportRoutes);
app.use('/api/employees', requireAuth, requireAdmin, auditWrites, employeeRoutes);
app.use('/api/restore-management', requireAuth, requireAdmin, auditWrites, restoreManagementRoutes);
app.use('/api/loads', requireAuth, requireAdmin, auditWrites, loadRoutes);
app.use('/api/buyers', requireAuth, requireAdmin, auditWrites, buyerRoutes);
app.use('/api/payments', requireAuth, requireAdmin, auditWrites, paymentRoutes);
app.use('/api/buyer-payments', requireAuth, requireAdmin, auditWrites, buyerPaymentRoutes);


if (isProduction) {
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('CRUSHER BUSINESS ACCOUNTING SYSTEM API');
  });
}

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`);
});
