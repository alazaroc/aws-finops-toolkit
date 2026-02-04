import {
  handler,
  parseHistoricalCostRequest,
} from "../../../../src/lambdas/historical-cost-analyzer/index";
import { CostExplorerService } from "../../../../src/domain/costs/cost-explorer-client";
import { ReportStorage } from "../../../../src/infrastructure/storage-service";
import { SimpleEnvLoader } from "../../../../src/core/config-loader";

describe("historical-cost-analyzer handler", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("parses direct invocation payload", () => {
    const req = parseHistoricalCostRequest({
      monthsBack: 2,
      periodLength: "12",
      groupBy: "project",
      includeHtml: "true",
    });

    expect(req).toEqual({
      monthsBack: 2,
      periodLength: 12,
      groupBy: "project",
      includeHtml: true,
      outputFormat: undefined,
    });
  });

  it("supports query params + JSON body (body wins)", () => {
    const req = parseHistoricalCostRequest({
      httpMethod: "POST",
      queryStringParameters: { monthsBack: "1", groupBy: "fromQuery" },
      body: JSON.stringify({ monthsBack: 3, groupBy: "fromBody" }),
    });

    expect(req.monthsBack).toBe(3);
    expect(req.groupBy).toBe("fromBody");
    expect(req.periodLength).toBe(6);
  });

  it("returns S3 links for direct invocation", async () => {
    jest.spyOn(SimpleEnvLoader, "getCurrentAccountId").mockResolvedValue("123456789012");
    jest.spyOn(SimpleEnvLoader, "getAccountName").mockResolvedValue("test-alias");

    jest.spyOn(CostExplorerService.prototype, "getMonthlyTotals").mockResolvedValue({
      ResultsByTime: [
        {
          TimePeriod: { Start: "2026-01-01" },
          Total: { BlendedCost: { Amount: "100.00" } },
        },
        {
          TimePeriod: { Start: "2026-02-01" },
          Total: { BlendedCost: { Amount: "120.00" } },
        },
      ],
    } as any);

    const getCostsByDimension = jest
      .spyOn(CostExplorerService.prototype, "getCostsByDimension")
      .mockResolvedValue({
        ResultsByTime: [
          {
            TimePeriod: { Start: "2026-01-01" },
            Groups: [
              { Keys: ["project$A"], Metrics: { BlendedCost: { Amount: "80.00" } } },
              { Keys: ["project$B"], Metrics: { BlendedCost: { Amount: "20.00" } } },
            ],
          },
          {
            TimePeriod: { Start: "2026-02-01" },
            Groups: [
              { Keys: ["project$A"], Metrics: { BlendedCost: { Amount: "90.00" } } },
              { Keys: ["project$B"], Metrics: { BlendedCost: { Amount: "30.00" } } },
            ],
          },
        ],
      } as any);

    jest
      .spyOn(CostExplorerService.prototype, "getCombinedRegionAndServiceBreakdown")
      .mockResolvedValue({
        ResultsByTime: [
          {
            TimePeriod: { Start: "2026-01-01" },
            Groups: [
              { Keys: ["us-east-1", "AmazonEC2"], Metrics: { BlendedCost: { Amount: "55.00" } } },
              { Keys: ["us-east-1", "AmazonS3"], Metrics: { BlendedCost: { Amount: "5.00" } } },
              { Keys: ["eu-south-2", "AmazonS3"], Metrics: { BlendedCost: { Amount: "40.00" } } },
            ],
          },
          {
            TimePeriod: { Start: "2026-02-01" },
            Groups: [
              { Keys: ["us-east-1", "AmazonEC2"], Metrics: { BlendedCost: { Amount: "65.00" } } },
              { Keys: ["us-east-1", "AmazonS3"], Metrics: { BlendedCost: { Amount: "5.00" } } },
              { Keys: ["eu-south-2", "AmazonS3"], Metrics: { BlendedCost: { Amount: "50.00" } } },
            ],
          },
        ],
      } as any);

    jest
      .spyOn(ReportStorage.prototype, "storeJsonReport")
      .mockResolvedValue("s3://test-reports/reports/historical-cost/test.json");
    jest
      .spyOn(ReportStorage.prototype, "storeHtmlReport")
      .mockResolvedValue("s3://test-reports/reports/historical-cost/test.html");
    jest
      .spyOn(ReportStorage.prototype, "generateConsoleUrl")
      .mockImplementation((key: string) => `https://console.example/${key}`);

    const result = await handler(
      {
        monthsBack: 1,
        periodLength: 6,
        groupBy: "project",
      } as any,
      { awsRequestId: "req-1", functionName: "finops-historical-cost-analyzer" } as any
    );

    expect(getCostsByDimension).toHaveBeenCalledWith(
      "TAG",
      "project",
      expect.any(Date),
      expect.any(Date),
      expect.objectContaining({
        Not: expect.objectContaining({
          Dimensions: expect.objectContaining({
            Key: "RECORD_TYPE",
          }),
        }),
      })
    );

    const body = JSON.parse(result.body);
    expect(body.summary.links.htmlS3Url).toMatch(
      /s3:\/\/test-reports\/reports\/historical-cost-analysis\/.*\.html/
    );
    expect(body.summary.links.jsonS3Url).toMatch(
      /s3:\/\/test-reports\/reports\/historical-cost-analysis\/.*\.json/
    );
    expect(body.summary.links.htmlConsoleUrl).toMatch(/^https:\/\//);
    expect(body.summary.links.jsonConsoleUrl).toMatch(/^https:\/\//);
    expect(body.summary.topProject).toBe("A");

    const storedHtml = (ReportStorage.prototype.storeHtmlReport as jest.Mock).mock.calls[0][1];
    expect(storedHtml).toContain("🏆 Top Project");
    expect(storedHtml).toContain("A");
    expect(storedHtml).toContain("2026-01");
    expect(storedHtml).toContain("2026-02");
    expect(storedHtml).toContain("Monthly breakdown by Service");
  });
});
