import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// TEMPORARY: local disk storage.
// Must be replaced with cloud object storage (e.g. Cloudflare R2) before this app is deployed anywhere
// beyond localhost, since most hosting platforms do not persist local files across restarts/deploys.
export async function saveEvidencePhoto(fileBuffer: Buffer, tenantId: string, mimeType: string): Promise<string> {
  const uuid = crypto.randomUUID();
  // Target folder is /server/uploads/{tenantId}/
  const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads', tenantId);
  fs.mkdirSync(uploadsDir, { recursive: true });

  const filename = `${uuid}.jpg`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, fileBuffer);

  return `/uploads/${tenantId}/${filename}`;
}
