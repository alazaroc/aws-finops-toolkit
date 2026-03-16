import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostAndUsageCommandOutput,
  GetCostAndUsageRequest,
  Dimension,
  GroupDefinition,
} from "@aws-sdk/client-cost-explorer";
import { logger } from "../../core/logger";

/**
 * Filter options for Cost Explorer queries
 */
interface FilterOptions {
  excludeServices?: string[];
  includeServices?: string[];
  excludeAccounts?: string[];
  includeAccounts?: string[];
  excludeChargeTypes?: string[];
  includeRegions?: string[];
  excludeRegions?: string[];
}

export interface CostExplorerGroup {
  Keys?: string[];
  Metrics?: {
    BlendedCost?: { Amount?: string };
    UnblendedCost?: { Amount?: string };
    UsageQuantity?: { Amount?: string };
  };
}

export interface CostExplorerTimeResult {
  TimePeriod?: {
    Start?: string;
    End?: string;
  };
  Groups?: CostExplorerGroup[];
}

export interface CostExplorerResult {
  ResultsByTime?: CostExplorerTimeResult[];
}

/**
 * Enhanced Cost Explorer service with centralized query building
 */
export class CostExplorerService {
  private costExplorerClient: CostExplorerClient;

  constructor() {
    this.costExplorerClient = new CostExplorerClient({
      region: "us-east-1", // Cost Explorer only works in us-east-1
    });
  }

  /**
   * Build Cost Explorer filter from options
   * @param options Filter options
   * @returns Cost Explorer filter object
   */
  static buildFilter(options: FilterOptions): GetCostAndUsageRequest["Filter"] {
    const filters: any[] = [];

    if (options.excludeServices && options.excludeServices.length > 0) {
      filters.push({
        Not: {
          Dimensions: {
            Key: "SERVICE",
            Values: options.excludeServices,
          },
        },
      });
    }

    if (options.includeServices && options.includeServices.length > 0) {
      filters.push({
        Dimensions: {
          Key: "SERVICE",
          Values: options.includeServices,
        },
      });
    }

    if (options.excludeAccounts && options.excludeAccounts.length > 0) {
      filters.push({
        Not: {
          Dimensions: {
            Key: "LINKED_ACCOUNT",
            Values: options.excludeAccounts,
          },
        },
      });
    }

    if (options.excludeChargeTypes && options.excludeChargeTypes.length > 0) {
      filters.push({
        Not: {
          Dimensions: {
            Key: "RECORD_TYPE",
            Values: options.excludeChargeTypes,
          },
        },
      });
    }

    if (options.includeAccounts && options.includeAccounts.length > 0) {
      filters.push({
        Dimensions: {
          Key: "LINKED_ACCOUNT",
          Values: options.includeAccounts,
        },
      });
    }

    if (options.includeRegions && options.includeRegions.length > 0) {
      filters.push({
        Dimensions: {
          Key: "REGION",
          Values: options.includeRegions,
        },
      });
    }

    if (options.excludeRegions && options.excludeRegions.length > 0) {
      filters.push({
        Not: {
          Dimensions: {
            Key: "REGION",
            Values: options.excludeRegions,
          },
        },
      });
    }

    if (filters.length === 0) {
      return undefined;
    }

    if (filters.length === 1) {
      return filters[0];
    }

    return {
      And: filters,
    };
  }

  /**
   * Extract cost value from Cost Explorer group
   */
  static extractCostValue(group: CostExplorerGroup | undefined): number {
    if (!group || !group.Metrics) {
      return 0;
    }

    // Try BlendedCost first, then UnblendedCost
    const blendedCost = group.Metrics.BlendedCost?.Amount;
    if (blendedCost) {
      return parseFloat(blendedCost) || 0;
    }

    const unblendedCost = group.Metrics.UnblendedCost?.Amount;
    if (unblendedCost) {
      return parseFloat(unblendedCost) || 0;
    }

    return 0;
  }

  /**
   * Normalize Cost Explorer tag group keys (e.g. "project$foo" -> "foo").
   */
  static normalizeTagValue(rawKey: string | undefined): string {
    if (!rawKey) {
      return "untagged";
    }

    const parts = rawKey.split("$");
    if (parts.length === 1) {
      return rawKey || "untagged";
    }

    const value = parts.slice(1).join("$").trim();
    return value.length > 0 ? value : "untagged";
  }

  /**
   * Extract group keys from Cost Explorer group
   */
  static extractGroupKeys(group: CostExplorerGroup | undefined): string[] {
    if (!group || !group.Keys) {
      return [];
    }

    return group.Keys || [];
  }

  /**
   * Get costs by dimension with optional filtering
   * @param dimensionType Type of dimension (TAG or DIMENSION)
   * @param dimensionKey Dimension key to group by
   * @param startDate Start date
   * @param endDate End date
   * @param filter Optional filter
   * @returns Cost data grouped by dimension
   */
  async getCostsByDimension(
    dimensionType: "TAG" | "DIMENSION",
    dimensionKey: string,
    startDate: Date,
    endDate: Date,
    filter?: GetCostAndUsageRequest["Filter"]
  ): Promise<CostExplorerResult> {
    try {
      const groupBy: GroupDefinition[] = [];

      if (dimensionType === "TAG") {
        groupBy.push({
          Type: "TAG",
          Key: dimensionKey,
        });
      } else {
        groupBy.push({
          Type: "DIMENSION",
          Key: dimensionKey as Dimension,
        });
      }

      const command = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split("T")[0],
          End: endDate.toISOString().split("T")[0],
        },
        Granularity: "MONTHLY",
        Metrics: ["BlendedCost", "UnblendedCost", "UsageQuantity"],
        GroupBy: groupBy,
        Filter: filter,
      });

      return (await this.costExplorerClient.send(command)) as GetCostAndUsageCommandOutput;
    } catch (error) {
      logger.error("Failed to get costs by dimension", error as Error, {
        dimensionType,
        dimensionKey,
      });
      throw error;
    }
  }

  /**
   * Get costs by service and tag
   * @param tagKey Tag key to group by
   * @param startDate Start date
   * @param endDate End date
   * @param filter Optional additional filter
   * @returns Cost data grouped by service and tag
   */
  async getCostsByServiceAndTag(
    tagKey: string,
    startDate: Date,
    endDate: Date,
    filter?: GetCostAndUsageRequest["Filter"]
  ): Promise<CostExplorerResult> {
    try {
      const command = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split("T")[0],
          End: endDate.toISOString().split("T")[0],
        },
        Granularity: "MONTHLY",
        Metrics: ["BlendedCost", "UnblendedCost"],
        GroupBy: [
          {
            Type: "TAG",
            Key: tagKey,
          },
          {
            Type: "DIMENSION",
            Key: "SERVICE",
          },
        ],
        Filter: filter,
      });

      return (await this.costExplorerClient.send(command)) as GetCostAndUsageCommandOutput;
    } catch (error) {
      logger.error("Failed to get costs by service and tag", error as Error, { tagKey });
      throw error;
    }
  }

  /**
   * Get costs grouped by Region AND Service in a single call to optimize costs.
   * This reduces 2 calls to 1.
   * from the result you can calculate:
   * - Total Cost (sum all)
   * - Cost by Region (sum by region)
   * - Cost by Service (sum by service)
   */
  async getCombinedRegionAndServiceBreakdown(
    startDate: Date,
    endDate: Date,
    filter?: GetCostAndUsageRequest["Filter"]
  ): Promise<CostExplorerResult> {
    try {
      const command = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split("T")[0],
          End: endDate.toISOString().split("T")[0],
        },
        Granularity: "MONTHLY",
        Metrics: ["BlendedCost", "UnblendedCost"],
        GroupBy: [
          { Type: "DIMENSION", Key: "REGION" },
          { Type: "DIMENSION", Key: "SERVICE" },
        ],
        Filter: filter,
      });

      return (await this.costExplorerClient.send(command)) as GetCostAndUsageCommandOutput;
    } catch (error) {
      logger.error("Failed to get combined breakdown", error as Error);
      throw error;
    }
  }
}
