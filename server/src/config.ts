import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const env = process.env.NODE_ENV || 'development';

// 1. Validate JWT_SECRET (Required in all environments)
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || !jwtSecret.trim()) {
  console.error('[FATAL SECURITY ERROR] JWT_SECRET environment variable is missing.');
  process.exit(1);
}

// 2. Validate DATABASE_URL (Required in all environments)
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.trim()) {
  console.error('[FATAL CONFIG ERROR] DATABASE_URL environment variable is missing.');
  process.exit(1);
}

// 3. Validate Cloudinary secrets in production
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || '';
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || '';

if (env === 'production') {
  const missingCloudinaryVars: string[] = [];
  if (!cloudinaryCloudName.trim()) missingCloudinaryVars.push('CLOUDINARY_CLOUD_NAME');
  if (!cloudinaryApiKey.trim()) missingCloudinaryVars.push('CLOUDINARY_API_KEY');
  if (!cloudinaryApiSecret.trim()) missingCloudinaryVars.push('CLOUDINARY_API_SECRET');

  if (missingCloudinaryVars.length > 0) {
    console.error(
      `[FATAL SECURITY ERROR] Missing required Cloudinary configuration in production: ${missingCloudinaryVars.join(', ')}`
    );
    process.exit(1);
  }
}

// 4. Parse FRONTEND_URL (Supports multi-origin comma-separated list)
const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const frontendUrls = rawFrontendUrl
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

const hasCloudinaryConfig = Boolean(
  cloudinaryCloudName.trim() &&
  cloudinaryApiKey.trim() &&
  cloudinaryApiSecret.trim()
);

export const config = {
  env,
  isProduction: env === 'production',
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl,
  jwtSecret,
  frontendUrls,
  cloudinary: {
    cloudName: cloudinaryCloudName,
    apiKey: cloudinaryApiKey,
    apiSecret: cloudinaryApiSecret,
    isConfigured: hasCloudinaryConfig
  }
} as const;
