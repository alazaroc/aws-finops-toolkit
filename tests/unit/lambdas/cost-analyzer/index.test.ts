import { handler } from "../../../../src/lambdas/cost-analyzer/index";
import { CostAnalysisService } from "../../../../src/domain/costs/cost-analysis-service";
import { EmailService } from "../../../../src/infrastructure/email-service";
import { FinOpsReportService } from "../../../../src/infrastructure/report-delivery-service";
import { SimpleEnvLoader } from "../../../../src/core/config-loader";
import { HtmlReportBuilder } from "../../../../src/infrastructure/html-builder";

describe("CostAnalyzer Lambda", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.REPORTS_BUCKET = "test-bucket";
  });

  it("successfully runs cost analysis and sends email", async () => {
    // Mock config and account info
    jest.spyOn(SimpleEnvLoader, "loadFromEnv").mockResolvedValue({
      account_id: "123456789012",
      cost_analysis: { group_by_tag: "project", total_monthly_threshold: 1 },
      required_tags: ["project"],
      email_config: { from: "test@example.com", to: ["recipient@example.com"] },
    } as any);

    // Mock runAnalysis
    const mockReport = {
      reportDate: new Date(),
      accountId: "123456789012",
      totalCost: 150.5,
      previousTotalCost: 100.0,
      periodStart: new Date(),
      periodEnd: new Date(),
      groupedCosts: [],
      tagBreakdowns: [],
      anomalies: [],
      regionalBreakdown: [],
      serviceBreakdown: [],
    };

    jest.spyOn(CostAnalysisService.prototype, "analyzeCosts").mockResolvedValue(mockReport as any);

    // Mock storage and email
    const storeSpy = jest
      .spyOn(FinOpsReportService.prototype, "storeReports")
      .mockResolvedValue({} as any);
    const emailSpy = jest
      .spyOn(EmailService.prototype, "sendHtmlEmail")
      .mockResolvedValue({} as any);

    const result = await (handler as any)({} as any, { awsRequestId: "test-req" } as any, () => {});

    expect(result.statusCode).toBe(200);
    expect(storeSpy).toHaveBeenCalled();
    expect(emailSpy).toHaveBeenCalled();

    const sentSubject = emailSpy.mock.calls[0][1] as string;
    expect(sentSubject).toContain("$150.50");
  });

  it("renders cost allocation tag error when costs are fully untagged", () => {
    const html = HtmlReportBuilder.buildCostBreakdownTable(
      [
        {
          groupValue: "untagged",
          cost: 105.91,
          previousCost: 123.93,
          threshold: 100,
          isOverThreshold: true,
          topServices: [{ service: "Amazon OpenSearch Service", cost: 25.67 }],
        },
      ],
      "CodiInap",
      {
        costAllocationTagEnabled: false,
        errorMessage:
          "Cost Allocation Tag may not be enabled for tag CodiInap. AWS Cost Explorer returned only untagged costs for this grouping.",
      }
    );

    expect(html).toContain(
      "Cost Allocation Tag may not be enabled for tag CodiInap. AWS Cost Explorer returned only untagged costs for this grouping."
    );
    expect(html).toContain("<th>Cost</th>");
    expect(html).toContain("<th>Prev. Mo</th>");
    expect(html).toContain("<th>Δ %</th>");
    expect(html).toContain("<th>Threshold</th>");
    expect(html).toContain("<th>Status</th>");
    expect(html).not.toContain("<th>CodiInap</th>");
    expect(html).not.toContain("<th>Top Services</th>");
    expect(html).not.toContain("<strong>untagged</strong>");
    expect(html).not.toContain("Amazon OpenSearch Service");
  });
});
