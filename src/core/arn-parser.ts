/**
 * ARN Parser Utility
 * Centralizes ARN parsing logic to eliminate code duplication
 */
export class ArnParser {
  /**
   * Extract region from ARN (4th component).
   * @param arn - AWS ARN
   * @returns Region (e.g. us-east-1) or empty string if not present
   */
  static extractRegion(arn: string): string {
    const parts = arn.split(":");
    // arn:partition:service:region:account-id:resource
    return parts.length >= 4 ? parts[3] : "";
  }

  /**
   * Extract instance ID from EC2 instance ARN
   * @param arn - EC2 instance ARN
   * @returns Instance ID (i-xxxxxxxxx)
   */
  static extractInstanceId(arn: string): string {
    const match = arn.match(/instance\/(i-[a-f0-9]+)/);
    return match ? match[1] : arn;
  }

  /**
   * Extract function name from Lambda function ARN
   * @param arn - Lambda function ARN
   * @returns Function name
   */
  static extractFunctionName(arn: string): string {
    const match = arn.match(/function:([^:]+)/);
    return match ? match[1] : arn;
  }

  /**
   * Extract volume ID from EBS volume ARN
   * @param arn - EBS volume ARN
   * @returns Volume ID (vol-xxxxxxxxx)
   */
  static extractVolumeId(arn: string): string {
    const match = arn.match(/volume\/(vol-[a-f0-9]+)/);
    return match ? match[1] : arn;
  }

  /**
   * Extract resource type from ARN
   * @param arn - AWS resource ARN
   * @returns Resource type (EC2, Lambda, EBS, etc.)
   */
  static extractResourceType(arn: string): string {
    if (arn.includes("instance/")) {
      return "EC2";
    }
    if (arn.includes("volume/")) {
      return "EBS";
    }
    if (arn.includes("function:")) {
      return "Lambda";
    }
    if (arn.includes("db:")) {
      return "RDS";
    }
    if (arn.includes("loadbalancer/")) {
      return "Load Balancer";
    }

    // Fallback: extract from ARN structure
    const parts = arn.split(":");
    if (parts.length >= 3) {
      return parts[2].toUpperCase();
    }

    return "Unknown";
  }

  /**
   * Extract resource ID from various ARN formats
   * @param arn - AWS resource ARN
   * @returns Resource ID
   */
  static extractResourceId(arn: string): string {
    // Try specific extractors first
    if (arn.includes("instance/")) {
      return this.extractInstanceId(arn);
    }
    if (arn.includes("volume/")) {
      return this.extractVolumeId(arn);
    }
    if (arn.includes("function:")) {
      return this.extractFunctionName(arn);
    }

    // Generic extraction from ARN
    const parts = arn.split("/");
    if (parts.length > 1) {
      return parts[parts.length - 1];
    }

    // Fallback to last part after colon
    const colonParts = arn.split(":");
    return colonParts[colonParts.length - 1];
  }

  /**
   * Validate if a resource ID has the correct format for its type
   * @param resourceId - Resource ID to validate
   * @param resourceType - Expected resource type
   * @returns True if valid format
   */
  static isValidResourceId(resourceId: string, resourceType: string): boolean {
    if (!resourceId || resourceId === "unknown" || resourceId === "undefined") {
      return false;
    }

    switch (resourceType?.toLowerCase()) {
      case "ec2":
        return /^i-[a-f0-9]{8,17}$/.test(resourceId);
      case "ebs":
        return /^vol-[a-f0-9]{8,17}$/.test(resourceId);
      case "lambda":
        // Lambda function names: 1-64 chars, alphanumeric + hyphens/underscores
        return /^[a-zA-Z0-9_-]{1,64}$/.test(resourceId);
      case "rds":
        return /^[a-zA-Z][a-zA-Z0-9-]{0,62}$/.test(resourceId);
      default:
        // For other types, basic validation
        return resourceId.length > 0 && resourceId.length < 200;
    }
  }
}
