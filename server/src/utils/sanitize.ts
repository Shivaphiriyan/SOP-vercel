const SENSITIVE_KEYS = new Set([
  'password',
  'adminpassword',
  'currentpassword',
  'newpassword',
  'token',
  'jwt',
  'authorization',
  'auth',
  'secret',
  'api_secret',
  'apisecret',
  'cloudinary_api_secret',
  'database_url',
  'db_url',
  'hourly_rate',
  'net_pay',
  'gross_pay',
  'bank_account',
  'salary',
  'pay_rate',
  'earnings'
]);

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const sKey of SENSITIVE_KEYS) {
    if (normalized === sKey || normalized.includes(sKey)) {
      return true;
    }
  }
  return false;
}

function sanitizeStringValue(str: string): string {
  if (/^Bearer\s+/i.test(str)) {
    return '[REDACTED AUTHORIZATION TOKEN]';
  }
  if (/^postgres(ql)?:\/\//i.test(str)) {
    return '[REDACTED DATABASE URL]';
  }
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(str)) {
    return '[REDACTED JWT TOKEN]';
  }
  return str;
}

export function sanitizeLogData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeStringValue(data);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item));
  }

  if (typeof data === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitiveKey(key)) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitizeLogData(value);
      }
    }
    return sanitizedObj;
  }

  return data;
}
