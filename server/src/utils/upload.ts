import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config';

// Configure Cloudinary using centralized configuration
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true
});

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function uploadToCloudinary(fileBuffer: Buffer, tenantId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `sop_evidence/${tenantId}`,
        resource_type: 'image',
        transformation: [
          { width: 1920, height: 1920, crop: 'limit' },
          { quality: 'auto:good', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Cloudinary upload failed'));
        }
        resolve(result.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

function saveToLocalStorage(fileBuffer: Buffer, tenantId: string, mimeType: string): string {
  // Validate tenantId to prevent path traversal
  const safeTenantId = UUID_REGEX.test(tenantId)
    ? tenantId
    : tenantId.replace(/[^a-zA-Z0-9_-]/g, '');

  if (!safeTenantId) {
    throw new Error('Invalid tenant context for file upload.');
  }

  const baseUploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
  const tenantUploadsDir = path.join(baseUploadsDir, safeTenantId);

  // Path traversal check
  if (!tenantUploadsDir.startsWith(baseUploadsDir)) {
    throw new Error('Invalid path traversal detected in upload directory.');
  }

  fs.mkdirSync(tenantUploadsDir, { recursive: true });

  const ext = MIME_EXTENSION_MAP[mimeType] || '.jpg';
  const filename = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(tenantUploadsDir, filename);

  fs.writeFileSync(filePath, fileBuffer);

  return `/uploads/${safeTenantId}/${filename}`;
}

export async function saveEvidencePhoto(
  fileBuffer: Buffer,
  tenantId: string,
  mimeType: string
): Promise<string> {
  const isCloudinaryAvailable = config.cloudinary.isConfigured;

  // In production, Cloudinary is mandatory. Do not use local storage or return local paths.
  if (config.isProduction) {
    if (!isCloudinaryAvailable) {
      throw new Error('Cloudinary configuration is required in production environment.');
    }
    return await uploadToCloudinary(fileBuffer, tenantId);
  }

  // In development, attempt Cloudinary if configured; fall back to local storage if unavailable or failed.
  if (isCloudinaryAvailable) {
    try {
      return await uploadToCloudinary(fileBuffer, tenantId);
    } catch (err) {
      console.error('Cloudinary upload failed in development environment, falling back to local storage:', err);
    }
  }

  // Development-only local file storage
  return saveToLocalStorage(fileBuffer, tenantId, mimeType);
}
