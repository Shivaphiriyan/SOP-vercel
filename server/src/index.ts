import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import { getPrisma } from './context';
import authRouter from './routes/auth';
import sopsRouter from './routes/sops';
import attendanceRouter from './routes/attendance';
import leaveRouter from './routes/leave';
import payrollRouter from './routes/payroll';
import dashboardRouter from './routes/dashboard';
import adminRouter from './routes/admin';
import { authenticateUser, setTenantContext } from './middleware/auth';
import { saveEvidencePhoto } from './utils/upload';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Serve static uploads
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// Set up CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Register authentication, user, and SOP execution routes
app.use('/', authRouter);
app.use('/', sopsRouter);
app.use('/', attendanceRouter);
app.use('/', leaveRouter);
app.use('/', payrollRouter);
app.use('/', dashboardRouter);
app.use('/', adminRouter);

// Multer memory storage configuration for evidence uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// POST /uploads - upload evidence photo
app.post('/uploads', authenticateUser, setTenantContext, (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a file.' });
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

// Basic health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Simple query to verify DB connection (uses getPrisma context helper)
    const tenantCount = await getPrisma().tenants.count();
    res.json({
      status: 'OK',
      database: 'Connected',
      tenantsCount: tenantCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      database: 'Disconnected',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
