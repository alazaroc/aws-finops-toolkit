import { OptimizationService } from "../../../../src/domain/optimization/optimization-service";
import { AwsServiceChecker } from "../../../../src/domain/optimization/aws-service-checker";
import { mockClient } from "aws-sdk-client-mock";
import {
  CostOptimizationHubClient,
  ListRecommendationsCommand,
} from "@aws-sdk/client-cost-optimization-hub";
import {
  SupportClient,
  DescribeTrustedAdvisorChecksCommand,
  DescribeTrustedAdvisorCheckResultCommand,
} from "@aws-sdk/client-support";

describe("OptimizationService", () => {
  let service: OptimizationService;
  const cohMock = mockClient(CostOptimizationHubClient as any);
  const supportMock = mockClient(SupportClient as any);

  beforeEach(() => {
    service = new OptimizationService({
      account_id: "123456789012",
      cost_analysis: { group_by_tag: "project", total_monthly_threshold: 1 },
      required_tags: [],
      schedules: { cost_analysis: "monthly", compliance_check: "weekly" },
    });
    cohMock.reset();
    supportMock.reset();
    jest.restoreAllMocks();
  });

  it("aggregates recommendations from multiple sources", async () => {
    // Mock service availability
    jest.spyOn(AwsServiceChecker.prototype, "checkAllServices").mockResolvedValue({
      timestamp: new Date(),
      services: {
        costOptimizationHub: { available: true, status: "Active", message: "OK" },
        trustedAdvisor: { available: true, status: "Available", message: "OK" },
        computeOptimizer: { available: true, status: "Active", message: "OK" },
      },
    });

    jest
      .spyOn(AwsServiceChecker.prototype, "checkCostOptimizationHub")
      .mockResolvedValue({ available: true, status: "Active", message: "OK" });
    jest
      .spyOn(AwsServiceChecker.prototype, "checkTrustedAdvisor")
      .mockResolvedValue({ available: true, status: "Available", message: "OK" });

    // Mock COH
    cohMock.on(ListRecommendationsCommand as any).resolves({
      items: [
        {
          resourceId: "i-123",
          estimatedMonthlySavings: "50.0",
          actionType: "Rightsize",
          currentResourceType: "Ec2Instance",
          region: "us-east-1",
        },
      ],
    } as any);

    // Mock TA
    supportMock.on(DescribeTrustedAdvisorChecksCommand as any).resolves({
      checks: [
        {
          id: "check-1",
          name: "Low Utilization Amazon EC2 Instances",
          category: "cost_optimizing",
        },
      ],
    } as any);
    supportMock.on(DescribeTrustedAdvisorCheckResultCommand as any).resolves({
      result: {
        status: "warning",
        checkId: "check-1",
        flaggedResources: [{ resourceId: "i-456", status: "warning", region: "us-east-1" }],
      },
    } as any);

    const report = await service.runAnalysis();

    expect(report.executiveSummary.recommendationCount).toBe(2);
    expect(report.executiveSummary.totalPotentialSavings).toBeGreaterThan(50);

    const cohRec = report.recommendations.find((r) => r.source === "COH");
    expect(cohRec?.resourceId).toBe("i-123");

    const taRec = report.recommendations.find((r) => r.source === "TA");
    expect(taRec?.resourceId).toBe("i-456");
  });
});
