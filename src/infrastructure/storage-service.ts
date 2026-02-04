import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "../core/logger";

/**
 * Report Storage Service
 * Centralizes S3 storage logic to eliminate duplication
 */
export class ReportStorage {
  private s3Client: S3Client;
  public readonly bucketName: string;

  constructor(bucketName?: string, region?: string) {
    this.s3Client = new S3Client({
      region: region || process.env.AWS_REGION || "us-east-1",
    });
    this.bucketName = bucketName || process.env.REPORTS_BUCKET || "finops-toolkit-reports";
  }

  /**
   * Store JSON report in S3
   * @param key - S3 object key
   * @param data - Report data to store
   * @param metadata - Optional metadata
   */
  async storeJsonReport(
    key: string,
    data: any,
    metadata?: Record<string, string>
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: JSON.stringify(data, null, 2),
        ContentType: "application/json",
        Metadata: {
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      });

      await (this.s3Client as any).send(command);

      const s3Url = `s3://${this.bucketName}/${key}`;
      return s3Url;
    } catch (error) {
      logger.error("Failed to store JSON report", error as Error, {
        bucket: this.bucketName,
        key,
      });
      throw error;
    }
  }

  /**
   * Store HTML report in S3
   * @param key - S3 object key
   * @param htmlContent - HTML content to store
   * @param metadata - Optional metadata
   */
  async storeHtmlReport(
    key: string,
    htmlContent: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: htmlContent,
        ContentType: "text/html",
        Metadata: {
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      });

      await (this.s3Client as any).send(command);

      const s3Url = `s3://${this.bucketName}/${key}`;
      return s3Url;
    } catch (error) {
      logger.error("Failed to store HTML report", error as Error, {
        bucket: this.bucketName,
        key,
      });
      throw error;
    }
  }

  /**
   * Generate S3 console URL for a report
   * @param key - S3 object key
   * @param region - AWS region (optional)
   * @returns Console URL
   */
  generateConsoleUrl(key: string, region?: string): string {
    const targetRegion = region || process.env.AWS_REGION || "us-east-1";
    return `https://s3.console.aws.amazon.com/s3/object/${this.bucketName}?region=${targetRegion}&prefix=${key}`;
  }

  /**
   * Generate direct S3 HTTPS URL for a report
   * @param key - S3 object key
   * @param region - AWS region (optional)
   * @returns Direct HTTPS URL
   */
  generateDirectUrl(key: string, region?: string): string {
    const targetRegion = region || process.env.AWS_REGION || "us-east-1";
    return `https://${this.bucketName}.s3.${targetRegion}.amazonaws.com/${key}`;
  }

  /**
   * Build standardized report key
   * @param reportType - Type of report (cost-analysis, compliance, etc.)
   * @param date - Report date
   * @param format - File format (json, html)
   * @returns S3 key
   */
  static buildReportKey(reportType: string, date: Date, format: "json" | "html"): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const timestamp = date.toISOString().replace(/[:.]/g, "-");

    return `reports/${reportType}/${year}/${month}/${day}/${reportType}-${timestamp}.${format}`;
  }

  /**
   * Compress large JSON data before storage
   * @param data - Data to compress
   * @returns Compressed data info
   */
  static compressJsonData(data: any): {
    compressed: string;
    originalSize: number;
    compressedSize: number;
  } {
    const jsonString = JSON.stringify(data);
    const originalSize = jsonString.length;

    // For now, just return minified JSON
    // In the future, could add gzip compression
    const compressed = JSON.stringify(data);
    const compressedSize = compressed.length;

    return {
      compressed,
      originalSize,
      compressedSize,
    };
  }
}
