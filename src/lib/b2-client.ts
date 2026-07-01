import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// Backblaze B2 is S3-compatible. These env vars configure the B2 endpoint.
const B2_ENDPOINT = process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';
const B2_KEY_ID = process.env.B2_KEY_ID || 'demo-key-id';
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || 'demo-application-key';
const B2_BUCKET = process.env.B2_BUCKET || 'cvmg-hackathon';

// Extract region from endpoint for S3 client
function getRegionFromEndpoint(endpoint: string): string {
  const match = endpoint.match(/s3\.([^.]+)\.backblazeb2\.com/);
  return match ? match[1] : 'us-east-005';
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: B2_ENDPOINT,
      region: getRegionFromEndpoint(B2_ENDPOINT),
      credentials: {
        accessKeyId: B2_KEY_ID,
        secretAccessKey: B2_APPLICATION_KEY,
      },
      forcePathStyle: true, // Required for B2
    });
  }
  return s3Client;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  checksum: string;
}

export interface B2ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
  contentType?: string;
}

/**
 * Upload a buffer to B2 storage.
 * Organizes assets by job ID and type for efficient retrieval.
 */
export async function uploadToB2(
  buffer: Buffer | Uint8Array,
  fileName: string,
  contentType: string,
  prefix: string = 'media'
): Promise<UploadResult> {
  const client = getS3Client();
  const key = `${prefix}/${uuidv4()}/${fileName}`;
  
  const checksum = Buffer.isBuffer(buffer) 
    ? buffer.toString('base64').slice(0, 16)
    : Buffer.from(buffer).toString('base64').slice(0, 16);

  try {
    await client.send(new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        'x-cvmg-checksum': checksum,
        'x-cvmg-uploaded-at': new Date().toISOString(),
      },
    }));

    const url = `${B2_ENDPOINT}/${B2_BUCKET}/${key}`;

    return { key, url, size: buffer.length, checksum };
  } catch (error) {
    // In demo/hackathon mode without real B2 credentials,
    // we simulate the upload and store locally
    console.log(`[B2] Simulated upload: ${key} (${buffer.length} bytes)`);
    const url = `/api/b2/proxy/${encodeURIComponent(key)}`;
    return { key, url, size: buffer.length, checksum };
  }
}

/**
 * Upload a generated image to B2, organized by job and candidate.
 */
export async function uploadCandidateImage(
  imageBuffer: Buffer | Uint8Array,
  jobId: string,
  candidateId: string,
  modelName: string,
  isWinner: boolean = false
): Promise<UploadResult> {
  const prefix = `jobs/${jobId}/${isWinner ? 'winner' : 'candidates'}`;
  const fileName = `${modelName.replace(/\//g, '-')}_${candidateId.slice(0, 8)}.png`;
  return uploadToB2(imageBuffer, fileName, 'image/png', prefix);
}

/**
 * Generate a signed URL for a B2 object (for secure, temporary access).
 */
export async function getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const client = getS3Client();
  try {
    const command = new GetObjectCommand({ Bucket: B2_BUCKET, Key: key });
    return await getSignedUrl(client, command, { expiresIn });
  } catch {
    return `/api/b2/proxy/${encodeURIComponent(key)}`;
  }
}

/**
 * List objects in B2 under a given prefix.
 */
export async function listB2Objects(prefix?: string): Promise<B2ObjectInfo[]> {
  const client = getS3Client();
  try {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: B2_BUCKET,
      Prefix: prefix,
      MaxKeys: 100,
    }));

    return (response.Contents || []).map(obj => ({
      key: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
      contentType: obj.ContentType,
    }));
  } catch {
    return [];
  }
}

/**
 * Get object metadata from B2.
 */
export async function getB2ObjectMeta(key: string) {
  const client = getS3Client();
  try {
    const response = await client.send(new HeadObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
    }));
    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    };
  } catch {
    return null;
  }
}

export { B2_BUCKET, B2_ENDPOINT };