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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

if (isProduction) {
  app.set('trust proxy', 1);
}

// Connect Database
connectDB();

// ======================
// CORS Configuration
// ======================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://crusher-accounting-tzsl.vercel.app'
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without origin
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(`CORS blocked: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Handle preflight requests
app.options('*', cors());

// Middleware
app.use(express.json());
app.use(isProduction ? morgan('combined') : morgan('dev'));

// Health Check
app.get('/api/health', (req, res) => {
  const database = getDatabaseStatus();

  res.json({
    status: database.status === 'connected' ? 'ok' : 'degraded',
    environment: process.env.NODE_ENV || 'development',
    database
  });
});

// Routes
app.use('/api/auth', authRoutes);

app.use(
  '/api/customers',
  requireAuth,
  requireAdmin,
  auditWrites,
  customerRoutes
);

app.use(
  '/api/materials',
  requireAuth,
  requireAdmin,
  auditWrites,
  materialRoutes
);

app.use(
  '/api/bills',
  requireAuth,
  requireAdmin,
  auditWrites,
  billRoutes
);

app.use(
  '/api/expenses',
  requireAuth,
  requireAdmin,
  auditWrites,
  expenseRoutes
);

app.use(
  '/api/reports',
  requireAuth,
  requireAdmin,
  reportRoutes
);

app.use(
  '/api/employees',
  requireAuth,
  requireAdmin,
  auditWrites,
  employeeRoutes
);

app.use(
  '/api/restore-management',
  requireAuth,
  requireAdmin,
  auditWrites,
  restoreManagementRoutes
);

app.use(
  '/api/loads',
  requireAuth,
  requireAdmin,
  auditWrites,
  loadRoutes
);

app.use(
  '/api/buyers',
  requireAuth,
  requireAdmin,
  auditWrites,
  buyerRoutes
);

// Production Frontend Hosting
if (isProduction) {
  const frontendDist = path.join(__dirname, '../frontend/dist');

  app.use(express.static(frontendDist));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }

    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('CRUSHER BUSINESS ACCOUNTING SYSTEM API');
  });
}

// Error Handling
app.use(notFound);
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(
    `Server running on http://${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`
  );
});