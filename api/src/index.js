// api/src/index.js - MODULARIZED & CLEANED VERSION
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';

// Import middleware
import { authGuard, adminGuard, unlockGuard, optionalAuth, nonManufacturerGuard } from './middleware/auth.js';

// Import commission helpers
import { 
  calculateCommissionForOrder, 
  recalculateCommissionIfPriceChanged, 
  checkCommissionPayoutTrigger 
} from './helpers/commission.js';

// Import route creators
import { createReportsRouter } from './routes/reports.js';
import createOperationalReportsRouter from './routes/reportsOperational.js';
import createCycleTimeReportsRouter from './routes/reportsCycleTime.js';
import createSettingsRouter from './routes/settings.js';
import { createAuthRouter } from './routes/auth.js';
import { createUsersRouter } from './routes/users.js';
import { createAccountsRouter } from './routes/accounts.js';
import { createOrdersRouter } from './routes/orders.js';
import { createItemsRouter } from './routes/items.js';
import { createMeasurementsRouter } from './routes/measurements.js';
import { createStagesRouter } from './routes/stages.js';
import { createLocksRouter } from './routes/locks.js';
import { createAuditRouter } from './routes/audit.js';
import { createPublicRouter } from './routes/public.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createManufacturersRouter } from './routes/manufacturers.js';
import { createCommissionsRouter } from './routes/commissions.js';
import { createCommissionSettingsRouter } from './routes/commissionSettings.js';
import { STAGE_THRESHOLDS } from './config/stageThresholds.js';

const prisma = new PrismaClient();
const app = express();

const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0'; // Listen on all interfaces for AWS

// =============================
// CORS Configuration
// =============================
const allowedOrigins = [];

// Add CORS_ORIGIN if specified
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()));
}

// Add SERVER_IP origins if specified
if (process.env.SERVER_IP && process.env.SERVER_IP !== 'undefined') {
  allowedOrigins.push(
    `http://${process.env.SERVER_IP}:3000`,
    `http://${process.env.SERVER_IP}:4000`,
    `http://${process.env.SERVER_IP}`
  );
}

// Always add localhost for development
allowedOrigins.push('http://localhost:3000', 'http://localhost:4000');

// Add the known AWS IP as a fallback
allowedOrigins.push('http://50.19.66.100:3000', 'http://50.19.66.100:4000');

// Remove duplicates
const uniqueOrigins = [...new Set(allowedOrigins)];

console.log('CORS Allowed Origins:', uniqueOrigins);

app.use(cors({ 
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (uniqueOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
}));

// =============================
// Global Middleware
// =============================
app.use(express.json());
app.use(cookieParser());

// Request logging for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, {
    hasAuth: !!req.headers.authorization,
    origin: req.headers.origin
  });
  next();
});

// =============================
// Make commission functions available globally
// =============================
// These are used by orders and items routes
global.calculateCommissionForOrder = calculateCommissionForOrder;
global.recalculateCommissionIfPriceChanged = recalculateCommissionIfPriceChanged;
global.checkCommissionPayoutTrigger = checkCommissionPayoutTrigger;

// =============================
// Initialize Route Modules
// =============================
const reportsRouter = createReportsRouter(prisma);
const operationalReportsRouter = createOperationalReportsRouter(prisma);
const cycleTimeReportsRouter = createCycleTimeReportsRouter(prisma);
const settingsRouter = createSettingsRouter(prisma);
const authRouter = createAuthRouter();
const usersRouter = createUsersRouter();
const accountsRouter = createAccountsRouter(prisma);
const ordersRouter = createOrdersRouter(prisma);
const itemsRouter = createItemsRouter();
const measurementsRouter = createMeasurementsRouter();
const stagesRouter = createStagesRouter();
const locksRouter = createLocksRouter();
const auditRouter = createAuditRouter();
const publicRouter = createPublicRouter();
const notificationsRouter = createNotificationsRouter(prisma);
const manufacturersRouter = createManufacturersRouter(prisma);
const commissionsRouter = createCommissionsRouter(prisma);
const commissionSettingsRouter = createCommissionSettingsRouter(prisma);

// =============================
// Mount Routes
// =============================

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Public routes (no auth, rate limited)
app.use('/public', publicRouter);

// Authentication routes - mixed auth requirements
app.use('/auth', (req, res, next) => {
  // Apply authGuard only to specific routes
  if (req.path === '/me' || req.path === '/logout' || req.path === '/change-password') {
    return authGuard(req, res, () => {
      authRouter(req, res, next);
    });
  }
  // Other auth routes don't need authentication (login, check)
  authRouter(req, res, next);
});

// Reports modules (auth required, manufacturers blocked)
app.use('/reports', authGuard, nonManufacturerGuard, reportsRouter);
app.use('/reports', authGuard, nonManufacturerGuard, operationalReportsRouter);
app.use('/reports', authGuard, nonManufacturerGuard, cycleTimeReportsRouter);
console.log('✅ Reports modules loaded');

// Settings API (admin only)
app.use('/settings', adminGuard, settingsRouter);
console.log('✅ Settings API loaded');

// User management (admin only)
app.use('/users', adminGuard, usersRouter);

// Manufacturer management (admin only) - adminGuard includes auth checking
app.use('/manufacturers', adminGuard, manufacturersRouter);
console.log('✅ Manufacturers API loaded');

// Account management (auth required, manufacturers blocked)
app.use('/accounts', authGuard, nonManufacturerGuard, accountsRouter);

// Order management (auth required - manufacturers get filtered access)
app.use('/orders', authGuard, ordersRouter);

// Item management - routes are nested under orders (manufacturers get filtered access)
app.use('/orders', authGuard, itemsRouter);

// Measurement endpoints (manufacturers can update measurements)
app.use('/orders', authGuard, measurementsRouter);

// Stage management (manufacturers get filtered access)
app.use('/orders', authGuard, stagesRouter);

// Lock/unlock functionality (manufacturers blocked)
app.use('/orders', authGuard, locksRouter);

// Audit logs (manufacturers blocked)
app.use('/audit', authGuard, nonManufacturerGuard, auditRouter);
app.use('/comprehensive-audit', authGuard, nonManufacturerGuard, auditRouter);

// Notifications API (auth required, role-filtered)
app.use('/notifications', authGuard, notificationsRouter);
console.log('✅ Notifications API loaded');

// Commission management (auth required, role-based access)
app.use('/commissions', authGuard, commissionsRouter);
app.use('/commission-settings', authGuard, commissionSettingsRouter);
console.log('✅ Commission module loaded');

// =============================
// Error Handler
// =============================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// =============================
// 404 Handler
// =============================
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.path);
  res.status(404).json({ error: 'Route not found' });
});

// =============================
// Server Startup
// =============================
app.listen(PORT, HOST, () => {
  console.log(`API server running at http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\nDefault credentials (change in production!):`);
  console.log(`Admin: admin@stealthmachinetools.com / admin123`);
  console.log(`Agent: john@stealthmachinetools.com / agent123`);
  console.log('\n✅ All modules loaded successfully');
  console.log('📊 Database:', process.env.DATABASE_URL ? 'Connected' : 'Using default');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
    prisma.$disconnect();
  });
});

export default app;
