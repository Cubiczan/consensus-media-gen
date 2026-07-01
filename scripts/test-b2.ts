import { S3Client, HeadBucketCommand, PutObjectCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

const B2_KEY_ID = process.env.B2_KEY_ID!;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY!;
const B2_ENDPOINT = process.env.B2_ENDPOINT!;
const B2_BUCKET = process.env.B2_BUCKET!;

const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: 'us-east-005',
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APPLICATION_KEY },
  forcePathStyle: true,
});

async function main() {
  console.log(`Endpoint: ${B2_ENDPOINT}`);
  console.log(`Bucket: ${B2_BUCKET}`);

  // Check bucket exists
  try {
    await s3.send(new HeadBucketCommand({ Bucket: B2_BUCKET }));
    console.log(`✓ Bucket "${B2_BUCKET}" accessible`);
  } catch (err: any) {
    console.error(`✗ Bucket "${B2_BUCKET}" not accessible:`, err.message);
    process.exit(1);
  }

  // Test write
  console.log('Testing write...');
  try {
    await s3.send(new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: 'cvmg/test-connection.txt',
      Body: Buffer.from(`CVMG B2 connection test\nTime: ${new Date().toISOString()}\n`),
      ContentType: 'text/plain',
      Metadata: { 'x-cvmg-test': 'true' },
    }));
    console.log('✓ Write test passed');
  } catch (err: any) {
    console.error('✗ Write test failed:', err.message);
    process.exit(1);
  }

  console.log('\n✅ B2 is fully configured and ready!');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });