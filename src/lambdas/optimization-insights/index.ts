import { Handler, ScheduledEvent } from "aws-lambda";
import { SimpleFinOpsConfig } from "../../types/finops-config";
import { SimpleEnvLoader } from "../../core/config-loader";
import { logger } from "../../core/logger";
import { EmailService } from "../../infrastructure/email-service";
import { HtmlReportBuilder } from "../../infrastructure/html-builder";
import {
  OptimizationService,
  OptimizationInsightsReport,
} from "../../domain/optimization/optimization-service";
import { FinOpsReportService, ReportLinks } from "../../infrastructure/report-delivery-service";

// Local interface removed in favor of common ReportLinks

/**
 * Optimization Insights Lambda for collecting and consolidating cost optimization recommendations
 */
class OptimizationInsights {
  private static readonly REPORT_TYPE = "optimization-insights";
  private emailService: EmailService;
  private reportService: FinOpsReportService;
  private config: SimpleFinOpsConfig;
  private optimizationService: OptimizationService;

  constructor(config: SimpleFinOpsConfig) {
    this.emailService = new EmailService();
    this.reportService = new FinOpsReportService();
    this.config = config;
    this.optimizationService = new OptimizationService(config);
  }

  /**
   * Get pre-calculated report links
   */
  getLinks(date: Date): ReportLinks {
    return this.reportService.getReportLinks(OptimizationInsights.REPORT_TYPE, date);
  }

  /**
   * Run optimization analysis
   */
  async runAnalysis(): Promise<OptimizationInsightsReport> {
    return await this.optimizationService.runAnalysis();
  }

  /**
   * Generate HTML report using HtmlReportBuilder
   */
  generateHtmlReport(report: OptimizationInsightsReport, reportLinks: ReportLinks = {}): string {
    const accountDisplay = report.accountAlias
      ? `${report.accountId} (${report.accountAlias})`
      : report.accountId;

    // Build executive summary
    const isFiltered = !!this.config.regions?.length;
    const executiveSummary = HtmlReportBuilder.buildExecutiveSummary({
      title: "💡 Optimization Insights Summary",
      date: report.reportDate,
      accountId: accountDisplay,
      description: isFiltered
        ? "<em>Note: This report reflects a <strong>filtered view</strong> based on your regional configuration.</em>"
        : undefined,
      totalSavings: report.executiveSummary.totalPotentialSavings,
      itemCount: report.executiveSummary.recommendationCount,
      itemLabel: "📋 Items with Improvement Opportunities",
      topItem: report.executiveSummary.topOpportunity,
      additionalMetrics: {
        "🔧 Available Services":
          Object.values(report.executiveSummary.serviceAvailability.services)
            .filter((s) => s.available)
            .length.toString() + "/3",
      },
    });

    const serviceAvailabilitySection = HtmlReportBuilder.buildServiceAvailabilitySection(
      report.executiveSummary.serviceAvailability
    );

    // Build recommendations section
    const recommendationsSection = HtmlReportBuilder.buildOptimizationRecommendationsSection(
      report.recommendations
    );

    // Build footer
    const footer = HtmlReportBuilder.buildFooter({
      s3Url: reportLinks.jsonS3Url,
      consoleUrl: reportLinks.jsonConsoleUrl,
      directUrl: reportLinks.jsonDirectUrl,
      additionalInfo: [
        "This report consolidates recommendations from AWS Cost Optimization Hub, Trusted Advisor, and Compute Optimizer.",
        "Focus on high-priority recommendations first for maximum impact.",
        "Unavailable services may require specific support plans or opt-in configuration.",
      ],
    });

    const sections = [
      executiveSummary,
      serviceAvailabilitySection,
      recommendationsSection,
      footer,
    ].filter((section) => section && section.trim().length > 0);

    const body = sections.join(HtmlReportBuilder.buildSectionDivider());
    return HtmlReportBuilder.buildHtmlDocument("AWS Optimization Insights Report", body);
  }

  /**
   * Send email report using EmailService
   */
  async sendEmailReport(report: OptimizationInsightsReport, htmlContent: string): Promise<void> {
    const subject = EmailService.formatSubject(
      `💡 AWS Optimization Insights - ${report.executiveSummary.totalPotentialSavings.toFixed(2)}/month`,
      {
        accountId: report.accountId,
        accountAlias: report.accountAlias,
        additionalInfo: `${report.executiveSummary.recommendationCount} recommendations`,
      }
    );

    const emailConfig = EmailService.getEmailConfig(this.config);
    await this.emailService.sendHtmlEmail(
      emailConfig.to,
      subject,
      htmlContent,
      undefined,
      emailConfig.from,
      emailConfig.displayName
    );
  }

  /**
   * Store reports using FinOpsReportService
   */
  async storeReports(
    report: OptimizationInsightsReport,
    htmlContent: string
  ): Promise<ReportLinks> {
    return await this.reportService.storeReports(
      OptimizationInsights.REPORT_TYPE,
      report.reportDate,
      report,
      htmlContent,
      report.accountId
    );
  }

  static async loadConfig(): Promise<SimpleFinOpsConfig> {
    return await SimpleEnvLoader.loadFromEnv();
  }
}

/**
 * AWS Lambda handler for optimization insights
 */
export const handler: Handler<ScheduledEvent, any> = async (event, context) => {
  const childLogger = logger.child({
    requestId: context.awsRequestId,
    functionName: context.functionName,
  });

  try {
    const config = await OptimizationInsights.loadConfig();
    const insights = new OptimizationInsights(config);

    const report = await insights.runAnalysis();

    const links = insights.getLinks(report.reportDate);
    const htmlContent = insights.generateHtmlReport(report, links);

    await insights.storeReports(report, htmlContent);

    await insights.sendEmailReport(report, htmlContent);

    // Analysis completed successfully
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "✅ Optimization insights analysis completed successfully",
        summary: {
          totalPotentialSavings: report.executiveSummary.totalPotentialSavings,
          recommendationCount: report.executiveSummary.recommendationCount,
          annualSavingsPotential: report.executiveSummary.totalPotentialSavings * 12,
        },
      }),
    };
  } catch (error) {
    childLogger.error("Optimization insights analysis failed", error as Error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "❌ Error in optimization insights analysis",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
