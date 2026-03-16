import { CostAnalysisService } from "../../../../src/domain/costs/cost-analysis-service";
import { CostExplorerService } from "../../../../src/domain/costs/cost-explorer-client";
import { SimpleFinOpsConfig } from "../../../../src/types/finops-config";

describe("CostAnalysisService", () => {
  let config: SimpleFinOpsConfig;
  let service: CostAnalysisService;

  beforeEach(() => {
    config = {
      account_id: "123456789012",
      cost_analysis: {
        group_by_tag: "project",
        total_monthly_threshold: 100,
      },
      required_tags: ["project"],
      schedules: {
        cost_analysis: "monthly",
        compliance_check: "weekly",
      },
      regions: ["us-east-1"],
    };
    service = new CostAnalysisService(config);
    jest.restoreAllMocks();
  });

  it("calculates report correctly with mocked data", async () => {
    // Mock getCombinedRegionAndServiceBreakdown
    // Mock getCombinedRegionAndServiceBreakdown (Current and Previous)
    const combinedMock = jest.spyOn(
      CostExplorerService.prototype,
      "getCombinedRegionAndServiceBreakdown"
    );

    // Current period
    combinedMock.mockResolvedValueOnce({
      ResultsByTime: [
        {
          Groups: [
            { Keys: ["us-east-1", "AmazonEC2"], Metrics: { UnblendedCost: { Amount: "50" } } },
            { Keys: ["us-east-1", "AmazonS3"], Metrics: { UnblendedCost: { Amount: "10" } } },
          ],
        },
      ],
    } as any);

    // Previous period
    combinedMock.mockResolvedValueOnce({
      ResultsByTime: [
        {
          Groups: [
            { Keys: ["us-east-1", "AmazonEC2"], Metrics: { UnblendedCost: { Amount: "40" } } },
            { Keys: ["us-east-1", "AmazonS3"], Metrics: { UnblendedCost: { Amount: "10" } } },
          ],
        },
      ],
    } as any);

    // Mock getCostsByServiceAndTag (Current and Previous)
    const tagServiceMock = jest.spyOn(CostExplorerService.prototype, "getCostsByServiceAndTag");

    // Current month
    tagServiceMock.mockResolvedValueOnce({
      ResultsByTime: [
        {
          Groups: [
            { Keys: ["project$FinOps", "AmazonEC2"], Metrics: { UnblendedCost: { Amount: "40" } } },
            { Keys: ["project$FinOps", "AmazonS3"], Metrics: { UnblendedCost: { Amount: "5" } } },
            { Keys: ["project$Other", "AmazonEC2"], Metrics: { UnblendedCost: { Amount: "10" } } },
          ],
        },
      ],
    } as any);

    // Previous month (for anomalies and MoM)
    tagServiceMock.mockResolvedValueOnce({
      ResultsByTime: [
        {
          Groups: [
            { Keys: ["project$FinOps", "AmazonEC2"], Metrics: { UnblendedCost: { Amount: "30" } } },
            { Keys: ["project$Other", "AmazonEC2"], Metrics: { UnblendedCost: { Amount: "10" } } },
          ],
        },
      ],
    } as any);

    const report = await service.analyzeCosts();

    expect(report.totalCost).toBe(60);
    expect(report.previousTotalCost).toBe(50);
    expect(report.groupedCosts.length).toBe(2);

    const finopsGroup = report.groupedCosts.find((p) => p.groupValue === "FinOps");
    expect(finopsGroup?.cost).toBe(45);
    expect(finopsGroup?.previousCost).toBe(30);

    expect(report.serviceBreakdown.length).toBe(2);
    expect(report.serviceBreakdown.find((s) => s.service === "AmazonEC2")?.previousCost).toBe(40);

    expect(report.anomalies.length).toBe(1);
    expect(report.anomalies[0].groupValue).toBe("FinOps");
  });
});
