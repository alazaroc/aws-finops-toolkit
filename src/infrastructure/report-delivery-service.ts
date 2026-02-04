import { ReportStorage } from "./storage-service";
import { logger } from "../core/logger";

export interface ReportLinks {
  jsonS3Url?: string;
  jsonConsoleUrl?: string;
  jsonDirectUrl?: string;
  htmlS3Url?: string;
  htmlConsoleUrl?: string;
  htmlDirectUrl?: string;
}

/**
 * Service to handle common report storage and response tasks for all Analyzers
 */
export class FinOpsReportService {
  private reportStorage: ReportStorage;

  constructor() {
    this.reportStorage = new ReportStorage();
  }

  /**
   * Pre-calculate report links before storage
   */
  getReportLinks(reportType: string, reportDate: Date): ReportLinks {
    const jsonKey = ReportStorage.buildReportKey(reportType, reportDate, "json");
    const htmlKey = ReportStorage.buildReportKey(reportType, reportDate, "html");

    return {
      jsonS3Url: `s3://${this.reportStorage.bucketName}/${jsonKey}`,
      jsonConsoleUrl: this.reportStorage.generateConsoleUrl(jsonKey),
      jsonDirectUrl: this.reportStorage.generateDirectUrl(jsonKey),
      htmlS3Url: `s3://${this.reportStorage.bucketName}/${htmlKey}`,
      htmlConsoleUrl: this.reportStorage.generateConsoleUrl(htmlKey),
      htmlDirectUrl: this.reportStorage.generateDirectUrl(htmlKey),
    };
  }

  /**
   * Store both JSON and HTML reports and return metadata
   */
  async storeReports(
    reportType: string,
    reportDate: Date,
    reportData: any,
    htmlContent: string,
    accountId: string
  ): Promise<ReportLinks> {
    try {
      const jsonKey = ReportStorage.buildReportKey(reportType, reportDate, "json");
      const htmlKey = ReportStorage.buildReportKey(reportType, reportDate, "html");

      const metadata = {
        reportType,
        accountId,
        generatedAt: new Date().toISOString(),
      };

      // Store JSON
      const jsonS3Url = await this.reportStorage.storeJsonReport(jsonKey, reportData, metadata);

      // Store HTML
      const htmlS3Url = await this.reportStorage.storeHtmlReport(htmlKey, htmlContent, metadata);

      return {
        jsonS3Url,
        jsonConsoleUrl: this.reportStorage.generateConsoleUrl(jsonKey),
        jsonDirectUrl: this.reportStorage.generateDirectUrl(jsonKey),
        htmlS3Url,
        htmlConsoleUrl: this.reportStorage.generateConsoleUrl(htmlKey),
        htmlDirectUrl: this.reportStorage.generateDirectUrl(htmlKey),
      };
    } catch (error) {
      logger.error(`Failed to store ${reportType} reports`, error as Error);
      throw error;
    }
  }

  /**
   * Format the standard Lambda response
   */
  formatLambdaResponse(message: string, summary: any) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `✅ ${message}`,
        summary,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}
