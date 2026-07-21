const http = require('http');

async function testCheckIn() {
  // 1. Login
  const loginData = JSON.stringify({
    username: 'testuser3',
    password: 'password123',
    tenantSlug: 'test-tenant-3'
  });

  const loginOptions = {
    hostname: 'localhost',
    port: 5000,
    path: '/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  };

  const token = await new Promise((resolve, reject) => {
    const req = http.request(loginOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Login failed: ${res.statusCode} ${data}`));
        } else {
          resolve(JSON.parse(data).token);
        }
      });
    });
    req.on('error', reject);
    req.write(loginData);
    req.end();
  });

  console.log("Logged in. Token:", token.substring(0, 20) + "...");

  // 2. Check-in with coordinates far from NYC
  const checkInData = JSON.stringify({
    lat: 34.0522,
    lng: -118.2437,
    accuracy: 10
  });

  const checkInOptions = {
    hostname: 'localhost',
    port: 5000,
    path: '/attendance/check-in',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(checkInData),
      'Authorization': `Bearer ${token}`
    }
  };

  await new Promise((resolve, reject) => {
    const req = http.request(checkInOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`\nHTTP Response Status Code: ${res.statusCode}`);
        console.log(`HTTP Response Body:\n${data}`);
        resolve();
      });
    });
    req.on('error', reject);
    req.write(checkInData);
    req.end();
  });
}

testCheckIn().catch(console.error);
