import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucket = 'reports';

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;

    if (!endpoint) throw new Error('S3_ENDPOINT is not defined');
    if (!accessKeyId) throw new Error('S3_ACCESS_KEY is not defined');
    if (!secretAccessKey) throw new Error('S3_SECRET_KEY is not defined');

    this.s3Client = new S3Client({
      endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async fileExists(key: string) {
    try {
      await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error.name === 'NotFound') return false;
      throw error;
    }
  }

  async uploadCsv(key: string, csvContent: string) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: csvContent,
      ContentType: 'text/csv; charset=utf-8',
    });
    await this.s3Client.send(command);
    console.log(`Uploaded ${key}`);
  }

  async getCsv(key: string) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.s3Client.send(command);
    return await response.Body?.transformToString();
  }
}
