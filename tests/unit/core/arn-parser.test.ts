/**
 * Unit Tests - ArnParser
 * Tests ARN parsing utilities
 */

import { ArnParser } from "../../../src/core/arn-parser";

describe("ArnParser", () => {
  describe("extractInstanceId", () => {
    it("should extract instance ID from EC2 ARN", () => {
      const arn = "arn:aws:ec2:eu-south-2:123456789012:instance/i-1234567890abcdef0";
      const instanceId = ArnParser.extractInstanceId(arn);

      expect(instanceId).toBe("i-1234567890abcdef0");
    });

    it("should return full ARN if no instance ID found", () => {
      const arn = "invalid-arn";
      const result = ArnParser.extractInstanceId(arn);

      expect(result).toBe(arn);
    });

    it("should handle multiple instance IDs (return first)", () => {
      const arn = "arn:aws:ec2:region:account:instance/i-abc123";
      const instanceId = ArnParser.extractInstanceId(arn);

      expect(instanceId).toMatch(/^i-/);
    });
  });

  describe("extractFunctionName", () => {
    it("should extract Lambda function name from ARN", () => {
      const arn = "arn:aws:lambda:eu-south-2:123456789012:function:my-function";
      const functionName = ArnParser.extractFunctionName(arn);

      expect(functionName).toBe("my-function");
    });

    it("should extract function name with colons", () => {
      const arn = "arn:aws:lambda:us-east-1:123456789012:function:my-function:alias";
      const functionName = ArnParser.extractFunctionName(arn);

      expect(functionName).toBe("my-function");
    });

    it("should return full ARN if no function found", () => {
      const arn = "invalid-arn";
      const result = ArnParser.extractFunctionName(arn);

      expect(result).toBe(arn);
    });
  });

  describe("extractVolumeId", () => {
    it("should extract EBS volume ID from ARN", () => {
      const arn = "arn:aws:ec2:eu-south-2:123456789012:volume/vol-1234567890abcdef0";
      const volumeId = ArnParser.extractVolumeId(arn);

      expect(volumeId).toBe("vol-1234567890abcdef0");
    });

    it("should return full ARN if no volume ID found", () => {
      const arn = "invalid-arn";
      const result = ArnParser.extractVolumeId(arn);

      expect(result).toBe(arn);
    });
  });

  describe("extractResourceType", () => {
    it("should identify EC2 resources", () => {
      const arn = "arn:aws:ec2:region:account:instance/i-123456";
      expect(ArnParser.extractResourceType(arn)).toBe("EC2");
    });

    it("should identify EBS volumes", () => {
      const arn = "arn:aws:ec2:region:account:volume/vol-123456";
      expect(ArnParser.extractResourceType(arn)).toBe("EBS");
    });

    it("should identify Lambda functions", () => {
      const arn = "arn:aws:lambda:region:account:function:my-function";
      expect(ArnParser.extractResourceType(arn)).toBe("Lambda");
    });

    it("should identify RDS databases", () => {
      const arn = "arn:aws:rds:region:account:db:my-database";
      expect(ArnParser.extractResourceType(arn)).toBe("RDS");
    });

    it("should identify Load Balancers", () => {
      const arn = "arn:aws:elasticloadbalancing:region:account:loadbalancer/my-lb";
      expect(ArnParser.extractResourceType(arn)).toBe("Load Balancer");
    });

    it("should return valid type for unknown resources", () => {
      const arn = "arn:aws:unknown:region:account:resource";
      const type = ArnParser.extractResourceType(arn);
      expect(type).toBeDefined();
    });
  });

  describe("extractRegion", () => {
    it("should extract region from a standard regional ARN", () => {
      const arn = "arn:aws:cloudformation:us-east-1:000345487168:stack/example/123";
      expect(ArnParser.extractRegion(arn)).toBe("us-east-1");
    });

    it("should return empty string for global/no-region ARNs", () => {
      const arn = "arn:aws:s3:::my-bucket";
      expect(ArnParser.extractRegion(arn)).toBe("");
    });

    it("should return empty string for invalid ARN strings", () => {
      expect(ArnParser.extractRegion("not-an-arn")).toBe("");
    });
  });
});
