import type { SimpleFinOpsConfig } from "../../../../src/types/finops-config";
import { ComplianceService } from "../../../../src/domain/governance/compliance-service";

jest.mock("../../../../src/domain/governance/region-service", () => ({
  RegionDiscoveryService: class RegionDiscoveryService {},
}));

describe("ComplianceService tagging commands", () => {
  const baseConfig: SimpleFinOpsConfig = {
    account_id: "000000000000",
    email_config: {
      from: "finops@example.com",
      to: ["finops@example.com"],
    },
    cost_analysis: {
      group_by_tag: "Project",
      total_monthly_threshold: 0,
    },
    required_tags: ["Project"],
    schedules: {
      cost_analysis: "monthly",
      compliance_check: "weekly",
    },
  };

  it("should append --region extracted from ARN for tag-resources fallback command", () => {
    const service = new ComplianceService(baseConfig.required_tags!);
    const arn =
      "arn:aws:cloudformation:us-east-1:000345487168:stack/aws-sam-cli-managed-default/5cd6a110-df21-11f0-b856-12803230e195";

    const command = service.buildTaggingCommand(arn, ["Project"]);

    expect(command).toContain('aws resourcegroupstaggingapi tag-resources --resource-arn-list "');
    expect(command).toContain("--region us-east-1");
  });

  it("should generate a copy/paste-safe S3 bucket tagging command", () => {
    const service = new ComplianceService(baseConfig.required_tags!);
    const arn = "arn:aws:s3:::cdk-hnb659fds-assets-000345487168-eu-south-2";

    const command = service.buildTaggingCommand(arn, ["project"]);

    expect(command).toContain('BUCKET="cdk-hnb659fds-assets-000345487168-eu-south-2"');
    expect(command).toContain('2>/dev/null || echo "[]"');
    expect(command).not.toContain("\\nfor t in tags");
  });
});
