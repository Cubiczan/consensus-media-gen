async function main() {
  const keyId = process.env.B2_KEY_ID!;
  const appKey = process.env.B2_APPLICATION_KEY!;
  
  console.log('Authorizing with Backblaze B2 API...');

  // Use native B2 API to get correct endpoint info
  const auth = Buffer.from(`${keyId}:${appKey}`).toString('base64');
  
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Auth failed (${res.status}):`, text);
    process.exit(1);
  }

  const data = await res.json();
  console.log('✓ Authenticated successfully');
  console.log('  Account ID:', data.accountId);
  console.log('  S3 Endpoint:', data.s3ApiUrl);
  console.log('  API Endpoint:', data.apiUrl);
  console.log('  Allowed Bucket:', data.allowed?.bucketName || '(all)');
  console.log('  Capabilities:', data.allowed?.capabilities?.join(', '));
  
  // Update .env with correct endpoint
  const fs = await import('fs');
  const envPath = process.cwd() + '/.env';
  let env = fs.readFileSync(envPath, 'utf-8');
  
  // Replace or add B2_ENDPOINT
  if (env.includes('B2_ENDPOINT=')) {
    env = env.replace(/B2_ENDPOINT=.*/, `B2_ENDPOINT=${data.s3ApiUrl}`);
  } else {
    env += `\nB2_ENDPOINT=${data.s3ApiUrl}`;
  }

  // Update bucket name if restricted
  if (data.allowed?.bucketName) {
    if (env.includes('B2_BUCKET=')) {
      env = env.replace(/B2_BUCKET=.*/, `B2_BUCKET=${data.allowed.bucketName}`);
    } else {
      env += `\nB2_BUCKET=${data.allowed.bucketName}`;
    }
  }
  
  fs.writeFileSync(envPath, env);
  console.log(`\n✓ Updated .env with correct endpoint: ${data.s3ApiUrl}`);
  if (data.allowed?.bucketName) {
    console.log(`✓ Updated bucket name: ${data.allowed.bucketName}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});