import { handler } from "../../../../src/lambdas/optimization-insights/index";
import { OptimizationService } from "../../../../src/domain/optimization/optimization-service";
import { EmailService } from "../../../../src/infrastructure/email-service";
import { FinOpsReportService } from "../../../../src/infrastructure/report-delivery-service";
import { SimpleEnvLoader } from "../../../../src/core/config-loader";

describe("OptimizationInsights Lambda", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("successfully runs optimization insights and sends email", async () => {
    jest.spyOn(SimpleEnvLoader, "loadFromEnv").mockResolvedValue({
      account_id: "123456789012",
      email_config: { from: "test@example.com", to: ["recipient@example.com"] },
    } as any);

    const mockReport = {
      reportDate: new Date(),
      accountId: "123456789012",
      executiveSummary: {
        totalPotentialSavings: 1000,
        recommendationCount: 5,
        topOpportunity: null,
        serviceAvailability: {
          timestamp: new Date(),
          services: {
            costOptimizationHub: { available: true, status: "Active", message: "OK" },
            trustedAdvisor: { available: true, status: "Available", message: "OK" },
            computeOptimizer: { available: true, status: "Active", message: "OK" },
          },
        },
      },
      recommendations: [],
      unavailableServices: [],
    };

    jest.spyOn(OptimizationService.prototype, "runAnalysis").mockResolvedValue(mockReport as any);
    jest.spyOn(FinOpsReportService.prototype, "storeReports").mockResolvedValue({} as any);
    jest.spyOn(EmailService.prototype, "sendHtmlEmail").mockResolvedValue({} as any);

    const result = await (handler as any)({} as any, { awsRequestId: "test-req" } as any, () => {});

    expect(result.statusCode).toBe(200);
    expect(OptimizationService.prototype.runAnalysis).toHaveBeenCalled();
  });
});
