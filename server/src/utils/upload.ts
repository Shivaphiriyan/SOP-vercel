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

export async function saveEvidencePhoto(fileBuffer: Buffer, tenantId: string, mimeType: string): Promise<string> {
  // Attempt Cloudinary upload first
  try {
    return await new Promise<string>((resolve, reject) => {
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
  } catch (err) {
    console.error('Cloudinary upload error, falling back to local storage:', err);
  }

  // Fallback to local disk storage if Cloudinary fails
  const uuid = crypto.randomUUID();
  const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads', tenantId);
  fs.mkdirSync(uploadsDir, { recursive: true });

  const filename = `${uuid}.jpg`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, fileBuffer);

  return `/uploads/${tenantId}/${filename}`;
}
