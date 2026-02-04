import { TagInventoryService } from "../../../../src/domain/governance/tag-inventory-service";
import { ResourceService } from "../../../../src/domain/governance/resource-discovery-service";

describe("TagInventoryService", () => {
  let service: TagInventoryService;

  beforeEach(() => {
    service = new TagInventoryService(["project", "owner"]);
    jest.restoreAllMocks();
  });

  it("analyzes tag usage correctly", async () => {
    const mockResources = [
      {
        ResourceARN: "arn:aws:ec2:us-east-1:123:instance/i-1",
        Tags: [
          { Key: "project", Value: "toolkit" },
          { Key: "Environment", Value: "prod" },
        ],
      },
      {
        ResourceARN: "arn:aws:ec2:us-east-1:123:instance/i-2",
        Tags: [
          { Key: "project", Value: "toolkit" },
          { Key: "Propject", Value: "typo" },
        ],
      },
      {
        ResourceARN: "arn:aws:s3:::my-bucket",
        Tags: [{ Key: "owner", Value: "team-a" }],
      },
    ];

    jest
      .spyOn(ResourceService.prototype, "collectResourcesFromRegions")
      .mockResolvedValue(mockResources as any);

    const result = await service.analyzeTags(["us-east-1"]);

    expect(result.totalResourcesScanned).toBe(3);
    expect(result.uniqueTagKeys).toBe(4); // project, Environment, Propject, owner

    const projectTag = result.tagUsageStats.find((t) => t.key === "project");
    expect(projectTag?.resourceCount).toBe(2);
    expect(projectTag?.valueFrequencies["toolkit"]).toBe(2);

    // Check similar tags (typo detection)
    const similarProject = result.requiredTagsAnalysis.similarTags.find(
      (s) => s.original === "project"
    );
    expect(similarProject?.similar).toContain("Propject");
  });
});
