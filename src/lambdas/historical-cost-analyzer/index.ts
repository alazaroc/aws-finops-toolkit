import { Handler, APIGatewayProxyEvent } from "aws-lambda";
import { SimpleFinOpsConfig } from "../../types/finops-config";
import { SimpleEnvLoader } from "../../core/config-loader";
import { logger } from "../../core/logger";
import { ArrayUtils } from "../../core/array-utils";
import { HtmlReportBuilder } from "../../infrastructure/html-builder";
import { FinOpsReportService, ReportLinks } from "../../infrastructure/report-delivery-service";
import {
  HistoricalCostService,
  HistoricalCostReport,
  HistoricalCostRequest,
} from "../../domain/costs/historical-cost-service";

/**
 * Historical Cost Analyzer Lambda for multi-period cost analysis
 */
class HistoricalCostAnalyzer {
  private static readonly REPORT_TYPE = "historical-cost-analysis";
  private config: SimpleFinOpsConfig;
  private historicalCostService: HistoricalCostService;
  private reportService: FinOpsReportService;

  constructor(config: SimpleFinOpsConfig) {
    this.config = config;
    this.historicalCostService = new HistoricalCostService(config);
    this.reportService = new FinOpsReportService();
  }

  async analyze(request: HistoricalCostRequest): Promise<HistoricalCostReport> {
    return await this.historicalCostService.analyzeHistoricalCosts(request);
  }

  generateHtmlReport(report: HistoricalCostReport, reportLinks: ReportLinks = {}): string {
    const accountDisplay = report.accountAlias
      ? `${report.accountId} (${report.accountAlias})`
      : report.accountId;

    const isFiltered = !!this.config.regions?.length;
    const body = [
      HtmlReportBuilder.buildExecutiveSummary({
        title: "📅 Historical Cost Summary",
        date: report.reportDate,
        accountId: accountDisplay,
        description: isFiltered
          ? "<em>Note: This is a <strong>filtered scan</strong> limited to specific regions.</em>"
          : undefined,
        totalSavings: report.totalCost, // Borrowing field for total cost
        itemCount: report.monthlyCosts.length,
        itemLabel: "📅 Months Analyzed",
        topItem: report.topProjects[0]
          ? { label: "🏆 Top Project", value: report.topProjects[0].project }
          : null,
        additionalMetrics: {
          "📈 Avg Monthly": `$${report.averageMonthlyCost.toFixed(2)}`,
          "📊 MoM Trend": `${report.trends.monthOverMonth > 0 ? "+" : ""}${report.trends.monthOverMonth.toFixed(1)}%`,
        },
      }),
      HtmlReportBuilder.buildHistoricalCostTable(report.projectMonthlyCosts, "Project"),
      HtmlReportBuilder.buildHistoricalCostTable(report.serviceMonthlyCosts, "Service"),
      HtmlReportBuilder.buildFooter({
        s3Url: reportLinks.jsonS3Url,
        consoleUrl: reportLinks.jsonConsoleUrl,
        directUrl: reportLinks.jsonDirectUrl,
      }),
    ].join(HtmlReportBuilder.buildSectionDivider());

    return HtmlReportBuilder.buildHtmlDocument("AWS Historical Cost Report", body);
  }

  async storeAndRespond(report: HistoricalCostReport) {
    const links = this.reportService.getReportLinks(
      HistoricalCostAnalyzer.REPORT_TYPE,
      report.reportDate
    );
    const htmlContent = this.generateHtmlReport(report, links);

    await this.reportService.storeReports(
      HistoricalCostAnalyzer.REPORT_TYPE,
      report.reportDate,
      report,
      htmlContent,
      report.accountId
    );

    return this.reportService.formatLambdaResponse("Historical cost analysis completed", {
      totalCost: report.totalCost,
      averageMonthly: report.averageMonthlyCost,
      topProject: report.topProjects[0]?.project || "N/A",
      links,
    });
  }

  static async loadConfig(): Promise<SimpleFinOpsConfig> {
    return await SimpleEnvLoader.loadFromEnv({ requireEmailConfig: false });
  }
}

/**
 * Robust request parsing for Historical Cost Analyzer
 */
export function parseHistoricalCostRequest(event: any): HistoricalCostRequest {
  if (!event) return {};

  const queryParams = event.queryStringParameters || {};
  let body: any = {};
  try {
    if (typeof event.body === "string") {
      body = JSON.parse(event.body);
    }
  } catch (e) {
    // Ignore parse error
  }

  // Combine query and body (body wins)
  const monthsBack = body.monthsBack ?? queryParams.monthsBack ?? event.monthsBack;
  const periodLength = body.periodLength ?? queryParams.periodLength ?? event.periodLength;
  const groupBy = body.groupBy ?? queryParams.groupBy ?? event.groupBy;
  const includeHtml = body.includeHtml ?? queryParams.includeHtml ?? event.includeHtml;
  const outputFormat = body.outputFormat ?? queryParams.outputFormat ?? event.outputFormat;

  return {
    monthsBack: typeof monthsBack === "string" ? parseInt(monthsBack, 10) : (monthsBack ?? 0),
    periodLength:
      typeof periodLength === "string" ? parseInt(periodLength, 10) : (periodLength ?? 6),
    groupBy: groupBy || "project",
    includeHtml: includeHtml === "true" || includeHtml === true,
    outputFormat: outputFormat as any,
  };
}

export const handler: Handler<any, any> = async (event, context) => {
  const childLogger = logger.child({ requestId: context.awsRequestId });

  try {
    const config = await HistoricalCostAnalyzer.loadConfig();
    const analyzer = new HistoricalCostAnalyzer(config);

    // Parse request
    const request = parseHistoricalCostRequest(event);

    const report = await analyzer.analyze(request);
    return await analyzer.storeAndRespond(report);
  } catch (error) {
    childLogger.error("Historical cost analysis failed", error as Error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Internal Error" }),
    };
  }
};
