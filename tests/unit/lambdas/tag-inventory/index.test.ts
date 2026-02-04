import { handler } from "../../../../src/lambdas/tag-inventory/index";
import { TagInventoryService } from "../../../../src/domain/governance/tag-inventory-service";
import { EmailService } from "../../../../src/infrastructure/email-service";
import { FinOpsReportService } from "../../../../src/infrastructure/report-delivery-service";
import { SimpleEnvLoader } from "../../../../src/core/config-loader";

describe("TagInventory Lambda", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("successfully runs tag inventory and sends email", async () => {
    jest.spyOn(SimpleEnvLoader, "loadFromEnv").mockResolvedValue({
      account_id: "123456789012",
      required_tags: ["project"],
      email_config: { from: "test@example.com", to: ["recipient@example.com"] },
      regions: ["us-east-1"],
    } as any);

    const mockResult = {
      totalResourcesScanned: 100,
      uniqueTagKeys: 10,
      resourcesByRegion: { "us-east-1": 100 },
      tagUsageStats: [],
      topTagsByUsage: [],
      unusualTags: [],
      requiredTagsAnalysis: {
        requiredTags: ["project"],
        similarTags: [],
      },
    };

    jest.spyOn(TagInventoryService.prototype, "analyzeTags").mockResolvedValue(mockResult as any);
    jest.spyOn(FinOpsReportService.prototype, "storeReports").mockResolvedValue({} as any);
    jest.spyOn(EmailService.prototype, "sendHtmlEmail").mockResolvedValue({} as any);

    const result = await (handler as any)({} as any, { awsRequestId: "test-req" } as any, () => {});

    expect(result.statusCode).toBe(200);
    expect(TagInventoryService.prototype.analyzeTags).toHaveBeenCalled();
  });
});
