import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from "@aws-sdk/client-resource-groups-tagging-api";
import { logger } from "../../core/logger";
import { ArrayUtils } from "../../core/array-utils";
import { ArnParser } from "../../core/arn-parser";

export interface TagUsage {
  key: string;
  values: Set<string>;
  valueFrequencies: Record<string, number>;
  resourceCount: number;
  regions: Set<string>;
  resourceTypes: Set<string>;
  examples: string[]; // Example ARNs
}

export interface SimilarTag {
  original: string;
  similar: string[];
  levenshteinDistance: number;
}

export interface TagAnalysisResult {
  totalResourcesScanned: number;
  uniqueTagKeys: number;
  resourcesByRegion: Record<string, number>;
  tagUsageStats: TagUsage[];
  topTagsByUsage: TagUsage[];
  unusualTags: TagUsage[];
  requiredTagsAnalysis: {
    requiredTags: string[];
    similarTags: SimilarTag[];
  };
}

import { ResourceService } from "./resource-discovery-service";

/**
 * Tag Analyzer Service
 * Analyzes AWS resource tags across regions for inventory and similarity detection
 */
export class TagInventoryService {
  private requiredTags: string[];
  private resourceService: ResourceService;

  constructor(requiredTags: string[] = []) {
    this.requiredTags = requiredTags;
    this.resourceService = new ResourceService();
  }

  /**
   * Analyze tags across multiple regions
   */
  async analyzeTags(regions: string[]): Promise<TagAnalysisResult> {
    try {
      // Collect all resources from all regions using shared service
      const allResources = await this.resourceService.collectResourcesFromRegions(regions);

      // Analyze tag usage
      const tagUsageStats = this.analyzeTagUsage(allResources);

      const resourcesByRegion = this.computeResourcesByRegion(allResources);

      // Find similar tags to required tags
      const similarTags = this.findSimilarTags(tagUsageStats);

      // Identify top tags and unusual tags
      const topTagsByUsage = this.getTopTagsByUsage(tagUsageStats);
      const unusualTags = this.getUnusualTags(tagUsageStats);

      const result: TagAnalysisResult = {
        totalResourcesScanned: allResources.length,
        uniqueTagKeys: tagUsageStats.length,
        resourcesByRegion,
        tagUsageStats,
        topTagsByUsage,
        unusualTags,
        requiredTagsAnalysis: {
          requiredTags: this.requiredTags,
          similarTags,
        },
      };

      return result;
    } catch (error) {
      logger.error("Tag analysis failed", error as Error);
      throw error;
    }
  }

  /**
   * Analyze tag usage patterns
   */
  private analyzeTagUsage(resources: any[]): TagUsage[] {
    const tagMap = new Map<string, TagUsage>();

    for (const resource of resources) {
      if (!resource.Tags || !resource.ResourceARN) {
        continue;
      }

      const region = resource.Region || "unknown";
      const resourceType = this.extractResourceType(resource.ResourceARN);

      for (const tag of resource.Tags) {
        if (!tag.Key) {
          continue;
        }

        const tagKey = tag.Key;
        const tagValue = tag.Value || "";

        if (!tagMap.has(tagKey)) {
          tagMap.set(tagKey, {
            key: tagKey,
            values: new Set(),
            valueFrequencies: {},
            resourceCount: 0,
            regions: new Set(),
            resourceTypes: new Set(),
            examples: [],
          });
        }

        const tagUsage = tagMap.get(tagKey)!;
        tagUsage.values.add(tagValue);
        tagUsage.valueFrequencies[tagValue] = (tagUsage.valueFrequencies[tagValue] || 0) + 1;
        tagUsage.resourceCount++;
        tagUsage.regions.add(region);
        tagUsage.resourceTypes.add(resourceType);

        // Add example ARN (limit to 5 examples)
        if (tagUsage.examples.length < 5) {
          tagUsage.examples.push(resource.ResourceARN);
        }
      }
    }

    const tagUsageStats = Array.from(tagMap.values());

    return ArrayUtils.sortBy(tagUsageStats, (a, b) => b.resourceCount - a.resourceCount);
  }

  private computeResourcesByRegion(resources: any[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const resource of resources) {
      const region = resource?.Region || "unknown";
      counts[region] = (counts[region] || 0) + 1;
    }

    return counts;
  }

  /**
   * Find tags similar to required tags using Levenshtein distance
   */
  private findSimilarTags(tagUsageStats: TagUsage[]): SimilarTag[] {
    if (this.requiredTags.length === 0) {
      return [];
    }

    const similarTags: SimilarTag[] = [];
    const maxDistance = 3; // Maximum Levenshtein distance to consider

    for (const requiredTag of this.requiredTags) {
      const similar: string[] = [];

      for (const tagUsage of tagUsageStats) {
        if (tagUsage.key === requiredTag) {
          continue;
        } // Skip exact matches

        const distance = this.calculateLevenshteinDistance(
          requiredTag.toLowerCase(),
          tagUsage.key.toLowerCase()
        );

        if (distance <= maxDistance && distance > 0) {
          similar.push(tagUsage.key);
        }
      }

      if (similar.length > 0) {
        similarTags.push({
          original: requiredTag,
          similar: similar.slice(0, 10), // Limit to top 10 similar tags
          levenshteinDistance: maxDistance,
        });
      }
    }

    return similarTags;
  }

  /**
   * Get top tags by usage
   */
  private getTopTagsByUsage(tagUsageStats: TagUsage[], limit: number = 20): TagUsage[] {
    return tagUsageStats.slice(0, limit);
  }

  /**
   * Get unusual tags (used by very few resources)
   */
  private getUnusualTags(tagUsageStats: TagUsage[], maxUsage: number = 2): TagUsage[] {
    const unusualTags = tagUsageStats.filter((tag) => tag.resourceCount <= maxUsage);

    return ArrayUtils.sortBy(unusualTags, (a, b) => a.resourceCount - b.resourceCount).slice(0, 50); // Limit to top 50 unusual tags
  }

  /**
   * Extract resource type from ARN
   */
  private extractResourceType(arn: string): string {
    try {
      return ArnParser.extractResourceType(arn);
    } catch (error) {
      logger.warn("Failed to extract resource type from ARN", { arn });

      // Fallback: extract from ARN structure
      const parts = arn.split(":");
      if (parts.length >= 3) {
        return parts[2].toUpperCase();
      }

      return "Unknown";
    }
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Optimized version with early termination
   */
  private calculateLevenshteinDistance(str1: string, str2: string): number {
    // Early termination for identical strings
    if (str1 === str2) {
      return 0;
    }

    // Early termination for empty strings
    if (str1.length === 0) {
      return str2.length;
    }
    if (str2.length === 0) {
      return str1.length;
    }

    // Early termination if length difference is too large
    const lengthDiff = Math.abs(str1.length - str2.length);
    if (lengthDiff > 3) {
      return lengthDiff;
    } // Return early if difference is too large

    // Create matrix
    const matrix: number[][] = [];

    // Initialize first row and column
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Convert Sets to Arrays for JSON serialization
   */
  private static serializeTagUsage(tagUsage: TagUsage): any {
    return {
      ...tagUsage,
      values: Array.from(tagUsage.values).slice(0, 10), // Limit to 10 values for readability
      regions: Array.from(tagUsage.regions),
      resourceTypes: Array.from(tagUsage.resourceTypes),
    };
  }

  /**
   * Convert all TagUsage objects for serialization
   */
  static serializeTagUsageStats(tagUsageStats: TagUsage[]): any[] {
    return tagUsageStats.map((tag) => this.serializeTagUsage(tag));
  }
}
