import { Handler, ScheduledEvent } from "aws-lambda";
import { SimpleFinOpsConfig } from "../../types/finops-config";
import { SimpleEnvLoader } from "../../core/config-loader";
import { logger } from "../../core/logger";
import { EmailService } from "../../infrastructure/email-service";
import { HtmlReportBuilder } from "../../infrastructure/html-builder";
import { RegionDiscoveryService } from "../../domain/governance/region-service";
import { FinOpsReportService, ReportLinks } from "../../infrastructure/report-delivery-service";
import {
  TagInventoryService,
  TagAnalysisResult,
} from "../../domain/governance/tag-inventory-service";

interface TagInventoryReport extends TagAnalysisResult {
  reportDate: Date;
  accountId: string;
  accountAlias?: string;
  regionsAnalyzed: string[];
}

/**
 * Tag Inventory Analyzer Lambda for comprehensive tag analysis
 */
class TagInventoryAnalyzer {
  private static readonly REPORT_TYPE = "tag-inventory";
  private emailService: EmailService;
  private regionDiscovery: RegionDiscoveryService;
  private config: SimpleFinOpsConfig;
  private tagInventoryService: TagInventoryService;
  private reportService: FinOpsReportService;

  constructor(config: SimpleFinOpsConfig) {
    this.emailService = new EmailService();
    this.regionDiscovery = new RegionDiscoveryService();
    this.config = config;
    this.tagInventoryService = new TagInventoryService(this.getRequiredTags());
    this.reportService = new FinOpsReportService();
  }

  private getRequiredTags(): string[] {
    return this.config.required_tags || ["Project", "Environment", "Owner"];
  }

  async runAnalysis(): Promise<TagInventoryReport> {
    const regions = await this.getRegionsToAnalyze();
    const result = await this.tagInventoryService.analyzeTags(regions);

    return {
      reportDate: new Date(),
      accountId: process.env.AWS_ACCOUNT_ID || this.config.account_id || "unknown",
      accountAlias: this.config.account_alias,
      regionsAnalyzed: regions,
      ...result,
    };
  }

  generateHtmlReport(report: TagInventoryReport, reportLinks: ReportLinks = {}): string {
    const accountDisplay = report.accountAlias
      ? `${report.accountId} (${report.accountAlias})`
      : report.accountId;

    const isFiltered = !!(
      this.config.tag_inventory?.include_regions?.length || this.config.regions?.length
    );
    const executiveSummary = HtmlReportBuilder.buildExecutiveSummary({
      title: "🏷️ Tag Inventory Summary",
      date: report.reportDate,
      accountId: accountDisplay,
      description: isFiltered
        ? "<em>Note: This is a <strong>filtered scan</strong> limited to specific regions.</em>"
        : undefined,
      additionalMetrics: {
        "📋 Resources Scanned": report.totalResourcesScanned.toString(),
        "🔑 Unique Tags": report.uniqueTagKeys.toString(),
        "🔗 Similar Tags Found": report.requiredTagsAnalysis.similarTags.length.toString(),
        "🌍 Regions": HtmlReportBuilder.formatRegionsAnalyzed(report.regionsAnalyzed),
      },
    });

    // Required Tags Analysis table
    const requiredTagsTable = HtmlReportBuilder.buildSummaryTable(
      report.requiredTagsAnalysis.requiredTags.map((rt) => {
        const similar = report.requiredTagsAnalysis.similarTags.find((s) => s.original === rt);
        return {
          requiredTag: rt,
          similarFound: similar ? "⚠️ Yes" : "✅ No",
          similarTags: similar ? similar.similar.join(", ") : "N/A",
        };
      }),
      {
        title: "📋 Required Tags Analysis",
        columns: [
          { key: "requiredTag", label: "Required Tag" },
          { key: "similarFound", label: "Similar Found?" },
          { key: "similarTags", label: "Similar Tags Found" },
        ],
      }
    );

    const tagKeysTable = HtmlReportBuilder.buildSummaryTable(
      report.tagUsageStats.slice(0, 50).map((t) => ({
        key: t.key,
        count: t.resourceCount,
        uniqueValues: t.values.size,
        regions: t.regions.size,
        types: t.resourceTypes.size,
        values: Object.entries(t.valueFrequencies)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([val, freq]) => `${val || "(empty)"} (${freq})`),
      })),
      {
        title:
          report.tagUsageStats.length > 50
            ? "🔑 Tag Key Inventory (Top 50)"
            : "🔑 Tag Key Inventory",
        columns: [
          { key: "key", label: "Tag Key" },
          { key: "count", label: "Resource Count" },
          { key: "uniqueValues", label: "Unique Values" },
          { key: "regions", label: "Regions" },
          { key: "types", label: "Resource Types" },
          {
            key: "values",
            label: "Most Frequent Values (3)",
            format: (v) =>
              Array.isArray(v)
                ? `<ul style="margin:0; padding:0 0 0 16px; list-style-type:disc;">${v.map((val) => `<li style="margin-bottom:2px;">${val}</li>`).join("")}</ul>`
                : v,
          },
        ],
      }
    );

    const unusualTagsTable = HtmlReportBuilder.buildSummaryTable(
      report.unusualTags
        .map((t) => ({
          key: t.key,
          count: t.resourceCount,
          types: Array.from(t.resourceTypes).join(", "),
        }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
        .slice(0, 20),
      {
        title: "⚠️ Unusual or Specific Tags",
        note: "Tags used on very few resources (potential typos or special cases)",
        columns: [
          { key: "key", label: "Tag Key" },
          { key: "count", label: "Count" },
          { key: "types", label: "Resource Types" },
        ],
      }
    );

    const regionBreakdownTable = HtmlReportBuilder.buildSummaryTable(
      Object.entries(report.resourcesByRegion)
        .map(([region, count]) => ({ region, count }))
        .sort((a, b) => b.count - a.count),
      {
        title: "🌍 Resources by Region",
        columns: [
          { key: "region", label: "Region" },
          { key: "count", label: "Resource Count" },
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
      regionBreakdownTable,
      tagKeysTable,
      unusualTagsTable,
      requiredTagsTable,
      footer,
    ].join(HtmlReportBuilder.buildSectionDivider());
    return HtmlReportBuilder.buildHtmlDocument("AWS Tag Inventory Report", body);
  }

  async storeAndSend(report: TagInventoryReport) {
    const links = this.reportService.getReportLinks(
      TagInventoryAnalyzer.REPORT_TYPE,
      report.reportDate
    );
    const htmlContent = this.generateHtmlReport(report, links);

    await this.reportService.storeReports(
      TagInventoryAnalyzer.REPORT_TYPE,
      report.reportDate,
      report,
      htmlContent,
      report.accountId
    );

    const emailConfig = EmailService.getEmailConfig(this.config);
    const subject = EmailService.formatSubject(
      `🏷️ Tag Inventory: ${report.totalResourcesScanned} resources`,
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

    return this.reportService.formatLambdaResponse("Tag inventory completed", {
      totalResources: report.totalResourcesScanned,
      uniqueTags: report.uniqueTagKeys,
      links,
    });
  }

  private async getRegionsToAnalyze(): Promise<string[]> {
    return await this.regionDiscovery.getFilteredRegions({
      includeRegions: this.config.tag_inventory?.include_regions || this.config.regions,
      excludeRegions: this.config.tag_inventory?.exclude_regions,
    });
  }

  static async loadConfig(): Promise<SimpleFinOpsConfig> {
    return await SimpleEnvLoader.loadFromEnv();
  }
}

export const handler: Handler<ScheduledEvent, any> = async () => {
  try {
    const config = await TagInventoryAnalyzer.loadConfig();
    const analyzer = new TagInventoryAnalyzer(config);
    const report = await analyzer.runAnalysis();
    return await analyzer.storeAndSend(report);
  } catch (error) {
    logger.error("Tag inventory failed", error as Error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Internal Error" }),
    };
  }
};
