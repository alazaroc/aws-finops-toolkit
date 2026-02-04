import { EC2Client, DescribeRegionsCommand } from "@aws-sdk/client-ec2";
import { logger } from "../../core/logger";

/**
 * Service for AWS region discovery and management
 */
export class RegionDiscoveryService {
  private ec2Client: EC2Client;

  constructor() {
    this.ec2Client = new EC2Client({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }

  /**
   * Discover all available AWS regions
   * @returns Array of region names
   */
  async discoverAllRegions(): Promise<string[]> {
    try {
      const command = new DescribeRegionsCommand({});
      const response = await (this.ec2Client as any).send(command);

      const regions = response.Regions?.map((region: any) => region.RegionName!) || [];

      return regions;
    } catch (error) {
      logger.error("Region discovery failed", error as Error);
      throw error;
    }
  }

  /**
   * Get filtered regions based on include/exclude configuration
   * @param options Filter options
   * @returns Array of filtered regions
   */
  async getFilteredRegions(options: {
    includeRegions?: string[];
    excludeRegions?: string[];
  }): Promise<string[]> {
    const { includeRegions, excludeRegions } = options;

    // If specific regions are included, use those
    if (includeRegions && includeRegions.length > 0) {
      return includeRegions;
    }

    // Otherwise, get all regions and apply exclusions
    const allRegions = await this.discoverAllRegions();

    if (excludeRegions && excludeRegions.length > 0) {
      const filteredRegions = allRegions.filter((region) => !excludeRegions.includes(region));
      return filteredRegions;
    }

    return allRegions;
  }
}
