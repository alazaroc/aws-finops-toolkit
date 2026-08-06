import { Handler, ScheduledEvent } from "aws-lambda";
import { SimpleFinOpsConfig } from "../../types/finops-config";
import { SimpleEnvLoader } from "../../core/config-loader";
import { logger } from "../../core/logger";
import { EmailService } from "../../infrastructure/email-service";
import { HtmlReportBuilder } from "../../infrastructure/html-builder";
import { FinOpsReportService, ReportLinks } from "../../infrastructure/report-delivery-service";
import { CostAnalysisService, CostAnalysisReport, AccountBreakdown } from "../../domain/costs/cost-analysis-service";

/**
 * Cost Analyzer Lambda for AWS cost analysis and reporting
 */
export class CostAnalyzer {
  private static readonly REPORT_TYPE = "cost-analysis";
  private emailService: EmailService;
  private config: SimpleFinOpsConfig;
  private costAnalysisService: CostAnalysisService;
  private reportService: FinOpsReportService;

  /**
   * Format Δ% column: shows "NEW" for items with previous cost < $1,
   * otherwise shows the percentage change with color coding.
   */
  private static formatDelta(currentCost: number, previousCost: number): string {
    if (previousCost < 1) {
      return `<span style="color: #6366f1; font-weight: 500;">NEW</span>`;
    }
    const diff = currentCost - previousCost;
    const pct = (diff / previousCost) * 100;
    const color = pct > 5 ? "#ef4444" : pct < -5 ? "#10b981" : "#6b7280";
    return `<span style="color: ${color}; font-weight: 500;">${pct > 0 ? "+" : ""}${pct.toFixed(1)}%</span>`;
  }

  constructor(config: SimpleFinOpsConfig) {
    this.emailService = new EmailService();
    this.config = config;
    this.costAnalysisService = new CostAnalysisService(config);
    this.reportService = new FinOpsReportService();
  }

  async runAnalysis(): Promise<CostAnalysisReport> {
    logger.info("Running cost analysis", {
      groupByTag: this.config.cost_analysis.group_by_tag,
      regions: this.config.regions,
    });
    return await this.costAnalysisService.analyzeCosts();
  }

  generateHtmlReport(report: CostAnalysisReport, reportLinks: ReportLinks = {}): string {
    const accountDisplay = report.accountAlias
      ? `${report.accountId} (${report.accountAlias})`
      : report.accountId;

    const isFiltered = !!this.config.regions?.length;
    const orgNote = report.organizationMode
      ? `<strong>🏢 Organization mode</strong> — consolidated across ${report.organizationInfo?.accountCount || "all"} accounts.`
      : undefined;
    const description = [orgNote, isFiltered
      ? "<em>Note: This is a <strong>filtered scan</strong> limited to specific regions.</em>"
      : undefined].filter(Boolean).join("<br>") || undefined;
    const executiveSummary = HtmlReportBuilder.buildExecutiveSummary({
      title: "💰 Cost Analysis Summary",
      date: report.reportDate,
      accountId: accountDisplay,
      description,
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
          const pctStr = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

          // Find dominant driver if one service explains >70% of the change
          if (Math.abs(diff) > 1 && report.serviceBreakdown.length > 0) {
            const topService = report.serviceBreakdown[0];
            const topDiff = topService.cost - topService.previousCost;
            if (Math.abs(topDiff) / Math.abs(diff) > 0.7) {
              const isNew = topService.previousCost < 1;
              const driver = isNew
                ? `${topService.service} (new)`
                : topService.service;
              return `${pctStr} — driven by ${driver}`;
            }
          }
          return pctStr;
        })(),
        "Tag Values": report.groupedCosts.length.toString(),
        "🚨 Anomalies": report.anomalies.length.toString(),
        ...(report.creditsApplied && report.creditsApplied > 0.01
          ? {
              "🎟️ Credits Applied": `-$${report.creditsApplied.toFixed(2)}`,
              "💳 Net Cost (you pay)": `$${(report.netCost ?? report.totalCost).toFixed(2)}`,
            }
          : {}),
        "🌍 Regions": HtmlReportBuilder.formatRegionsAnalyzed(
          report.regionalBreakdown.map((r) => r.region)
        ),
      },
    });

    // Tag breakdown tables with top services
    const tagTables = report.tagBreakdowns
      .map((tb) =>
        HtmlReportBuilder.buildCostBreakdownTable(tb.groupedCosts, tb.tagName, {
          costAllocationTagEnabled: tb.costAllocationTagEnabled,
          errorMessage: tb.errorMessage,
        })
      )
      .join("");

    // Zero cost tag values
    const zeroCostTables = report.tagBreakdowns
      .map((tb) => {
        if (tb.zeroCostGroupValues.length === 0) {
          return "";
        }
        return HtmlReportBuilder.buildList(
          tb.zeroCostGroupValues,
          `Tag values with $0 cost (tag: ${tb.tagName}):`
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
              { key: "groupValue", label: "Tag Value" },
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
          format: (v, row) => CostAnalyzer.formatDelta(v, row.previousCost),
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
          format: (v, row) => CostAnalyzer.formatDelta(v, row.previousCost),
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

    // Account breakdown (Organizations multi-account)
    const accountTable =
      report.organizationMode && report.accountBreakdown && report.accountBreakdown.length > 0
        ? HtmlReportBuilder.buildSummaryTable(report.accountBreakdown, {
            title: `🏢 Breakdown by Account (${report.organizationInfo?.accountCount || 0} accounts)`,
            note: `Organization: ${report.organizationInfo?.id || "N/A"}`,
            columns: [
              {
                key: "accountName",
                label: "Account",
                format: (v, row) => `${v} <span style="color:#6b7280;font-size:0.85em;">(${row.accountId})</span>`,
              },
              { key: "cost", label: "Cost", format: (v) => `$${v.toFixed(2)}` },
              {
                key: "previousCost",
                label: "Prev. Mo",
                format: (v) => `<span style="color: #6b7280;">$${v.toFixed(2)}</span>`,
              },
              {
                key: "cost",
                label: "Δ %",
                format: (v, row) => CostAnalyzer.formatDelta(v, row.previousCost),
              },
              { key: "percentage", label: "% Share", format: (v) => `${v.toFixed(1)}%` },
            ],
          })
        : "";

    const body = [
      executiveSummary,
      anomalyTable,
      tagTables,
      zeroCostTables,
      accountTable,
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
    const hasCredits = !!report.creditsApplied && report.creditsApplied > 0.01;
    const netStr = hasCredits ? ` (net $${(report.netCost ?? report.totalCost).toFixed(2)})` : "";
    const subject = report.organizationMode
      ? EmailService.formatSubject(
          `💰 AWS Cost Report - $${report.totalCost.toFixed(2)}${netStr}`,
          { additionalInfo: `Organization (${report.organizationInfo?.accountCount || 0} accounts)` }
        )
      : EmailService.formatSubject(
          `💰 AWS Cost Report - $${report.totalCost.toFixed(2)}${netStr}`,
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
