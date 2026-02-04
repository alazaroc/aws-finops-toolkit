import { Handler, ScheduledEvent } from "aws-lambda";
import { SimpleFinOpsConfig } from "../../types/finops-config";
import { SimpleEnvLoader } from "../../core/config-loader";
import { logger } from "../../core/logger";
import { EmailService } from "../../infrastructure/email-service";
import { HtmlReportBuilder } from "../../infrastructure/html-builder";
import { FinOpsReportService, ReportLinks } from "../../infrastructure/report-delivery-service";
import { CostAnalysisService, CostAnalysisReport } from "../../domain/costs/cost-analysis-service";

/**
 * Cost Analyzer Lambda for AWS cost analysis and reporting
 */
class CostAnalyzer {
  private static readonly REPORT_TYPE = "cost-analysis";
  private emailService: EmailService;
  private config: SimpleFinOpsConfig;
  private costAnalysisService: CostAnalysisService;
  private reportService: FinOpsReportService;

  constructor(config: SimpleFinOpsConfig) {
    this.emailService = new EmailService();
    this.config = config;
    this.costAnalysisService = new CostAnalysisService(config);
    this.reportService = new FinOpsReportService();
  }

  async runAnalysis(): Promise<CostAnalysisReport> {
    return await this.costAnalysisService.analyzeCosts();
  }

  generateHtmlReport(report: CostAnalysisReport, reportLinks: ReportLinks = {}): string {
    const accountDisplay = report.accountAlias
      ? `${report.accountId} (${report.accountAlias})`
      : report.accountId;

    const isFiltered = !!this.config.regions?.length;
    const executiveSummary = HtmlReportBuilder.buildExecutiveSummary({
      title: "💰 Cost Analysis Summary",
      date: report.reportDate,
      accountId: accountDisplay,
      description: isFiltered
        ? "<em>Note: This is a <strong>filtered scan</strong> limited to specific regions.</em>"
        : undefined,
      totalSavings: report.totalCost, // Using as Total Cost
      additionalMetrics: {
        "🗓️ Period": HtmlReportBuilder.formatDateRange(
          report.periodStart,
          report.periodEnd,
          report.periodEndExclusive
        ),
        [`🔙 Previous Mo (${(() => {
          const d = new Date(report.periodStart);
          d.setMonth(d.getMonth() - 1);
          return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        })()})`]: `$${report.previousTotalCost.toFixed(2)}`,
        "📈 MoM Change": (() => {
          const diff = report.totalCost - report.previousTotalCost;
          const pct = report.previousTotalCost > 0 ? (diff / report.previousTotalCost) * 100 : 100;
          return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
        })(),
        "📁 Projects": report.projects.length.toString(),
        "🚨 Anomalies": report.anomalies.length.toString(),
        "🌍 Regions": HtmlReportBuilder.formatRegionsAnalyzed(
          report.regionalBreakdown.map((r) => r.region)
        ),
      },
    });

    // Tag breakdown tables with top services
    const tagTables = report.tagBreakdowns
      .map((tb) => HtmlReportBuilder.buildCostBreakdownTable(tb.projects, tb.tagName))
      .join("");

    // Zero cost projects
    const zeroCostTables = report.tagBreakdowns
      .map((tb) => {
        if (tb.zeroCostProjects.length === 0) return "";
        return HtmlReportBuilder.buildList(
          tb.zeroCostProjects,
          `Projects with $0 cost (tag: ${tb.tagName}):`
        );
      })
      .join("");

    // Anomalies table
    const anomalyTable =
      report.anomalies.length > 0
        ? HtmlReportBuilder.buildSummaryTable(report.anomalies, {
            title: "🚨 Cost Anomalies Detected",
            note: "Significant cost increases compared to the same period in the previous month.",
            columns: [
              { key: "project", label: "Project" },
              {
                key: "previousCost",
                label: "Prev Cost (Last Mo)",
                format: (v) => `$${v.toFixed(2)}`,
              },
              { key: "currentCost", label: "Current Cost", format: (v) => `$${v.toFixed(2)}` },
              {
                key: "percentageChange",
                label: "Change",
                format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
              },
            ],
          })
        : "";

    // Global breakdowns
    const serviceTable = HtmlReportBuilder.buildSummaryTable(report.serviceBreakdown, {
      title: "🛠️ Breakdown by Service (Global)",
      columns: [
        { key: "service", label: "Service" },
        { key: "cost", label: "Cost", format: (v) => `$${v.toFixed(2)}` },
        {
          key: "previousCost",
          label: "Prev. Mo",
          format: (v) => `<span style="color: #6b7280;">$${v.toFixed(2)}</span>`,
        },
        {
          key: "cost",
          label: "Δ %",
          format: (v, row) => {
            const diff = v - row.previousCost;
            const pct = row.previousCost > 0 ? (diff / row.previousCost) * 100 : 100;
            const color = pct > 5 ? "#ef4444" : pct < -5 ? "#10b981" : "#6b7280";
            return `<span style="color: ${color}; font-weight: 500;">${pct > 0 ? "+" : ""}${pct.toFixed(1)}%</span>`;
          },
        },
        { key: "percentage", label: "% Share", format: (v) => `${v.toFixed(1)}%` },
      ],
    });

    const regionTable = HtmlReportBuilder.buildSummaryTable(report.regionalBreakdown, {
      title: "🌍 Breakdown by Region (Global)",
      columns: [
        { key: "region", label: "Region" },
        { key: "cost", label: "Cost", format: (v) => `$${v.toFixed(2)}` },
        {
          key: "previousCost",
          label: "Prev. Mo",
          format: (v) => `<span style="color: #6b7280;">$${v.toFixed(2)}</span>`,
        },
        {
          key: "cost",
          label: "Δ %",
          format: (v, row) => {
            const diff = v - row.previousCost;
            const pct = row.previousCost > 0 ? (diff / row.previousCost) * 100 : 100;
            const color = pct > 5 ? "#ef4444" : pct < -5 ? "#10b981" : "#6b7280";
            return `<span style="color: ${color}; font-weight: 500;">${pct > 0 ? "+" : ""}${pct.toFixed(1)}%</span>`;
          },
        },
        { key: "percentage", label: "% Share", format: (v) => `${v.toFixed(1)}%` },
      ],
    });

    const footer = HtmlReportBuilder.buildFooter({
      s3Url: reportLinks.jsonS3Url,
      consoleUrl: reportLinks.jsonConsoleUrl,
      directUrl: reportLinks.jsonDirectUrl,
      additionalInfo: ["Excludes Credits, Refunds and Tax by default."],
    });

    const body = [
      executiveSummary,
      anomalyTable,
      tagTables,
      zeroCostTables,
      serviceTable,
      regionTable,
      footer,
    ].join(HtmlReportBuilder.buildSectionDivider());
    return HtmlReportBuilder.buildHtmlDocument("AWS Cost Analysis Report", body);
  }

  async storeAndSend(report: CostAnalysisReport) {
    const links = this.reportService.getReportLinks(CostAnalyzer.REPORT_TYPE, report.reportDate);
    const htmlContent = this.generateHtmlReport(report, links);

    await this.reportService.storeReports(
      CostAnalyzer.REPORT_TYPE,
      report.reportDate,
      report,
      htmlContent,
      report.accountId
    );

    // Send email
    const subject = EmailService.formatSubject(
      `💰 AWS Cost Report - $${report.totalCost.toFixed(2)}`,
      {
        accountId: report.accountId,
        accountAlias: report.accountAlias,
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

    return this.reportService.formatLambdaResponse("Cost analysis completed", {
      totalCost: report.totalCost,
      links,
    });
  }

  static async loadConfig(): Promise<SimpleFinOpsConfig> {
    return await SimpleEnvLoader.loadFromEnv();
  }
}

export const handler: Handler<ScheduledEvent, any> = async (event, context) => {
  const childLogger = logger.child({ requestId: context.awsRequestId });

  try {
    const config = await CostAnalyzer.loadConfig();
    const analyzer = new CostAnalyzer(config);

    const report = await analyzer.runAnalysis();
    return await analyzer.storeAndSend(report);
  } catch (error) {
    childLogger.error("Cost analysis failed", error as Error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : "Internal Error" }),
    };
  }
};
