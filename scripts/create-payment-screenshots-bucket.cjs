// Creates the payment-screenshots storage bucket in Supabase
// Uses the service role key from .env via the PostgREST API
// (The supabase CLI doesn't have a direct bucket-create command)

const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
});

const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const projectRef = url.replace('https://', '').replace('.supabase.co', '');

// Use the Supabase Management API to create the bucket
// Endpoint: POST https://{projectRef}.supabase.co/storage/v1/bucket
const bucketName = 'payment-screenshots';
const bucketConfig = {
  name: bucketName,
  public: false,
  file_size_limit: 5242880, // 5MB
  allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
};

const body = JSON.stringify(bucketConfig);

const options = {
  hostname: `${projectRef}.supabase.co`,
  port: 443,
  path: '/storage/v1/bucket',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log(`\n✓ Bucket "${bucketName}" created successfully`);
    } else if (res.statusCode === 409) {
      console.log(`\n→ Bucket "${bucketName}" already exists (this is OK)`);
    } else {
      console.log('\n✗ Failed');
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
  process.exit(1);
});

req.write(body);
req.end();
