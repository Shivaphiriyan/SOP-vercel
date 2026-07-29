import express from 'express';
import path from 'path';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { getPrisma } from './context';
import authRouter from './routes/auth';
import sopsRouter from './routes/sops';
import attendanceRouter from './routes/attendance';
import leaveRouter from './routes/leave';
import payrollRouter from './routes/payroll';
import dashboardRouter from './routes/dashboard';
import adminRouter from './routes/admin';
import notificationsRouter from './routes/notifications';
import auditLogsRouter from './routes/auditLogs';
import { authenticateUser, setTenantContext } from './middleware/auth';
import { saveEvidencePhoto } from './utils/upload';
import { errorHandler } from './middleware/error';

const app = express();

// Configure CORS (Must be before helmet and rate limiters for OPTIONS preflight)
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
);

// Apply security headers with cross-origin policy enabled
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// Apply general API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use(apiLimiter);

// Stricter rate limiter for login and signup routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' }
});
app.use('/auth/login', authLimiter);
app.use('/auth/signup', authLimiter);

// Body parser limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve static uploads (Non-production development environments only)
if (!config.isProduction) {
  app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));
}

// Register authentication, user, and SOP execution routes
app.use('/', authRouter);
app.use('/', sopsRouter);
app.use('/', attendanceRouter);
app.use('/', leaveRouter);
app.use('/', payrollRouter);
app.use('/', dashboardRouter);
app.use('/', adminRouter);
app.use('/', notificationsRouter);
app.use('/', auditLogsRouter);

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Multer memory storage configuration for evidence uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed!'));
    }
  }
});

// POST /uploads - upload evidence photo
app.post('/uploads', authenticateUser, setTenantContext, (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds maximum allowed limit of 5MB.' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Invalid upload request.' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please select an image file.' });
    }
    
    try {
      const url = await saveEvidencePhoto(
        req.file.buffer,
        req.user!.tenantId,
        req.file.mimetype
      );
      
      res.json({ url });
    } catch (error) {
      next(error);
    }
  });
});

// Minimal health check endpoint
app.get('/health', async (req, res) => {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    res.json({
      status: 'OK',
      database: 'Connected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      database: 'Disconnected'
    });
  }
});

// Catch-all 404 handler for API routes that don't match
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler middleware (must be registered after all routes and handlers)
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
