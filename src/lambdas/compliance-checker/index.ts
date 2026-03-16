import { Handler, ScheduledEvent } from "aws-lambda";
import { SimpleFinOpsConfig } from "../../types/finops-config";
import { SimpleEnvLoader } from "../../core/config-loader";
import { logger } from "../../core/logger";
import { EmailService } from "../../infrastructure/email-service";
import { HtmlReportBuilder } from "../../infrastructure/html-builder";
import { RegionDiscoveryService } from "../../domain/governance/region-service";
import { FinOpsReportService, ReportLinks } from "../../infrastructure/report-delivery-service";
import {
  ComplianceService,
  ComplianceAnalysisResult,
} from "../../domain/governance/compliance-service";

interface ComplianceReport extends ComplianceAnalysisResult {
  reportDate: Date;
  accountId: string;
  accountAlias?: string;
  regionsAnalyzed: string[];
  requiredTags: string[];
}

/**
 * Compliance Checker Lambda for AWS resource tagging compliance
 */
class ComplianceChecker {
  private static readonly REPORT_TYPE = "compliance";
  private emailService: EmailService;
  private regionDiscovery: RegionDiscoveryService;
  private config: SimpleFinOpsConfig;
  private complianceService: ComplianceService;
  private reportService: FinOpsReportService;

  constructor(config: SimpleFinOpsConfig) {
    this.emailService = new EmailService();
    this.regionDiscovery = new RegionDiscoveryService();
    this.config = config;
    this.complianceService = new ComplianceService(this.getRequiredTags());
    this.reportService = new FinOpsReportService();
  }

  private getRequiredTags(): string[] {
    return this.config.required_tags || ["Project", "Environment", "Owner"];
  }

  async runAnalysis(): Promise<ComplianceReport> {
    const regions = await this.getRegionsToAnalyze();
    const result = await this.complianceService.analyzeCompliance(regions);

    return {
      reportDate: new Date(),
      accountId: process.env.AWS_ACCOUNT_ID || this.config.account_id || "unknown",
      accountAlias: this.config.account_alias,
      regionsAnalyzed: regions,
      requiredTags: this.getRequiredTags(),
      ...result,
    };
  }

  generateHtmlReport(report: ComplianceReport, reportLinks: ReportLinks = {}): string {
    const accountDisplay = report.accountAlias
      ? `${report.accountId} (${report.accountAlias})`
      : report.accountId;

    const isFiltered = !!(
      this.config.compliance?.include_regions?.length || this.config.regions?.length
    );
    const executiveSummary = HtmlReportBuilder.buildExecutiveSummary({
      title: "🛡️ Tag Compliance Summary",
      date: report.reportDate,
      accountId: accountDisplay,
      description: `Resources are considered compliant if they possess all required tags: <strong>${report.requiredTags.join(", ")}</strong>.${isFiltered ? " <br/><em>Note: This is a <strong>filtered scan</strong> limited to specific regions.</em>" : ""}`,
      additionalMetrics: {
        "📈 Compliance Rate": `${report.compliancePercentage.toFixed(1)}%`,
        "📋 Resources Checked": report.totalResources.toString(),
        "❌ Non-Compliant": report.nonCompliantResources.length.toString(),
        "🌍 Regions": HtmlReportBuilder.formatRegionsAnalyzed(report.regionsAnalyzed),
      },
    });

    const regionComplianceData = Object.entries(report.resourcesByRegion)
      .map(([region, total]) => {
        const nonCompliant = report.nonCompliantByRegion[region]?.length || 0;
        const rate = total > 0 ? ((total - nonCompliant) / total) * 100 : 100;
        return {
          region,
          total,
          nonCompliant,
          rate: `${rate.toFixed(1)}%`,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    const regionSummaryTable = HtmlReportBuilder.buildSummaryTable(regionComplianceData, {
      title: "🌍 Resources & Compliance by Region",
      columns: [
        { key: "region", label: "Region" },
        { key: "total", label: "Total Resources" },
        { key: "nonCompliant", label: "Non-Compliant" },
        { key: "rate", label: "Compliance Rate" },
      ],
    });

    const commonMissingTags = this.complianceService.getMostCommonMissingTags(
      report.nonCompliantResources
    );
    const missingTagsTable = HtmlReportBuilder.buildSummaryTable(commonMissingTags, {
      title: "🏷️ Most Common Missing Tags",
      columns: [
        { key: "tag", label: "Tag Key" },
        { key: "count", label: "Missing Count" },
        { key: "percentage", label: "Impact (%)", format: (v) => `${v.toFixed(1)}%` },
      ],
    });

    const summaryByTypeData = Object.entries(
      this.complianceService.getComplianceSummaryByResourceType(report.nonCompliantResources)
    )
      .map(([type, stats]) => ({
        type,
        count: stats.count,
        percentage: `${stats.percentage.toFixed(1)}%`,
      }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

    const typeSummaryTable = HtmlReportBuilder.buildSummaryTable(summaryByTypeData, {
      title: "📋 Non-Compliance by Resource Type",
      columns: [
        { key: "type", label: "Resource Type" },
        { key: "count", label: "Non-Compliant Count" },
        { key: "percentage", label: "% of Total Issues" },
      ],
    });

    const nonCompliantResourcesTable = HtmlReportBuilder.buildSummaryTable(
      report.nonCompliantResources.slice(0, 50).map((r) => ({
        ...r,
        missingTags: r.missingTags.join(", "),
      })),
      {
        title: "❌ Non-Compliant Resources (Top 50)",
        note: `Total non-compliant resources: ${report.nonCompliantResources.length}. Fix these by adding the missing tags.`,
        columns: [
          { key: "resourceArn", label: "Resource ARN" },
          { key: "resourceType", label: "Type" },
          { key: "region", label: "Region" },
          { key: "missingTags", label: "Missing Tags" },
        ],
      }
    );

    const footer = HtmlReportBuilder.buildFooter({
      s3Url: reportLinks.jsonS3Url,
      consoleUrl: reportLinks.jsonConsoleUrl,
      directUrl: reportLinks.jsonDirectUrl,
    });

    const body = [
      executiveSummary,
      regionSummaryTable,
      missingTagsTable,
      typeSummaryTable,
      nonCompliantResourcesTable,
      footer,
    ].join(HtmlReportBuilder.buildSectionDivider());
    return HtmlReportBuilder.buildHtmlDocument("AWS Tag Compliance Report", body);
  }

  async storeAndSend(report: ComplianceReport) {
    const links = this.reportService.getReportLinks(
      ComplianceChecker.REPORT_TYPE,
      report.reportDate
    );
    const htmlContent = this.generateHtmlReport(report, links);

    await this.reportService.storeReports(
      ComplianceChecker.REPORT_TYPE,
      report.reportDate,
      report,
      htmlContent,
      report.accountId
    );

    const emailConfig = EmailService.getEmailConfig(this.config);
    const subject = EmailService.formatSubject(
      `🛡️ Tag Compliance: ${report.compliancePercentage.toFixed(1)}%`,
      {
        accountId: report.accountId,
        accountAlias: report.accountAlias,
      }
    );

    await this.emailService.sendHtmlEmail(
      emailConfig.to,
      subject,
      htmlContent,
      undefined,
      emailConfig.from,
      emailConfig.displayName
    );

    return this.reportService.formatLambdaResponse("Compliance check completed", {
      complianceRate: report.compliancePercentage,
      nonCompliantCount: report.nonCompliantResources.length,
      links,
    });
  }

  private async getRegionsToAnalyze(): Promise<string[]> {
    return await this.regionDiscovery.getFilteredRegions({
      includeRegions: this.config.compliance?.include_regions || this.config.regions,
      excludeRegions: this.config.compliance?.exclude_regions,
    });
  }

  static async loadConfig(): Promise<SimpleFinOpsConfig> {
    return await SimpleEnvLoader.loadFromEnv();
  }
}

export const handler: Handler<ScheduledEvent, any> = async () => {
  try {
    const config = await ComplianceChecker.loadConfig();
    const checker = new ComplianceChecker(config);
    const report = await checker.runAnalysis();
    return await checker.storeAndSend(report);
  } catch (error) {
    logger.error("Compliance analysis failed", error as Error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Internal Error" }),
    };
  }
};
