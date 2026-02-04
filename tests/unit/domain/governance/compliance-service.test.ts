import { ComplianceService } from "../../../../src/domain/governance/compliance-service";
import { ResourceService } from "../../../../src/domain/governance/resource-discovery-service";

describe("ComplianceService", () => {
  let service: ComplianceService;

  beforeEach(() => {
    service = new ComplianceService(["project", "owner"]);
    jest.restoreAllMocks();
  });

  it("identifies non-compliant resources correctly", async () => {
    const mockResources = [
      {
        ResourceARN: "arn:aws:ec2:us-east-1:123:instance/compliant",
        Region: "us-east-1",
        Tags: [
          { Key: "project", Value: "toolkit" },
          { Key: "owner", Value: "team-a" },
        ],
      },
      {
        ResourceARN: "arn:aws:ec2:us-east-1:123:instance/non-compliant",
        Region: "us-east-1",
        Tags: [
          { Key: "project", Value: "toolkit" },
          // missing "owner"
        ],
      },
      {
        ResourceARN: "arn:aws:s3:::no-tags",
        Region: "us-east-1",
        Tags: [],
        // missing all
      },
    ];

    jest
      .spyOn(ResourceService.prototype, "collectResourcesFromRegions")
      .mockResolvedValue(mockResources as any);

    const result = await service.analyzeCompliance(["us-east-1"]);

    expect(result.totalResources).toBe(3);
    expect(result.compliantResources).toBe(1);
    expect(result.nonCompliantResources.length).toBe(2);
    expect(result.compliancePercentage).toBeCloseTo(33.3, 1);

    const missingOwner = result.nonCompliantResources.find((r) =>
      r.resourceArn.includes("non-compliant")
    );
    expect(missingOwner?.missingTags).toEqual(["owner"]);

    const missingAll = result.nonCompliantResources.find((r) => r.resourceArn.includes("no-tags"));
    expect(missingAll?.missingTags).toEqual(["project", "owner"]);
  });
});
