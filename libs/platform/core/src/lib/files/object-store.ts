import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { contentDisposition } from './content-type';

export interface FilesOptions {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface ObjectStore {
  put(input: PutObjectInput): Promise<void>;
  presignGet(key: string, fileName: string, seconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: FilesOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      // MinIO needs path-style; R2 accepts both.
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.length,
      }),
    );
  }

  presignGet(key: string, fileName: string, seconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(fileName),
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: seconds },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export class InMemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, PutObjectInput>();

  async put(input: PutObjectInput): Promise<void> {
    this.objects.set(input.key, input);
  }

  async presignGet(
    key: string,
    fileName: string,
    seconds: number,
  ): Promise<string> {
    if (!this.objects.has(key)) throw new Error('No such object');
    const params = new URLSearchParams({
      'response-content-disposition': contentDisposition(fileName),
      expires: String(seconds),
    });
    return `https://objects.test/${key}?${params}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
