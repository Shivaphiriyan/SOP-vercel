import { API_URL } from '../config/api';

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Shared API request client helper
 * @param {string} endpoint - API endpoint path or full URL
 * @param {Object} options - Fetch configuration options (token, headers, body, method, etc.)
 * @returns {Promise<any>} Parsed response data
 */
export async function apiRequest(endpoint, options = {}) {
  const { token, headers = {}, body, ...customConfig } = options;

  const url =
    endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${API_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const requestHeaders = { ...headers };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  let requestBody = body;
  if (body && !(body instanceof FormData) && typeof body === 'object') {
    requestHeaders['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }

  const configOptions = {
    method: options.method || 'GET',
    headers: requestHeaders,
    body: requestBody,
    ...customConfig
  };

  let response;
  try {
    response = await fetch(url, configOptions);
  } catch {
    throw new ApiError(`Could not connect to backend server at ${API_URL}`, 0, null);
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text = await response.text();
      if (text) {
        data = { message: text };
      }
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMsg =
      (data && (data.error || data.message)) || `Request failed with status ${response.status}`;
    throw new ApiError(errorMsg, response.status, data);
  }

  return data;
}

export { API_URL };
