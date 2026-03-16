import { logger } from "../../core/logger";
import { ArrayUtils } from "../../core/array-utils";
import { ArnParser } from "../../core/arn-parser";

interface ResourceTagMapping {
  ResourceARN: string;
  Tags?: Array<{ Key: string; Value: string }>;
  Region: string;
}

export interface ComplianceResource {
  resourceArn: string;
  resourceType: string;
  region: string;
  missingTags: string[];
  existingTags: string[];
  tags: Array<{ key: string; value: string }>;
  project: string;
  accountId?: string;
  accountName?: string;
}

export interface ComplianceAnalysisResult {
  totalResources: number;
  compliantResources: number;
  compliancePercentage: number;
  nonCompliantResources: ComplianceResource[];
  resourcesByRegion: Record<string, number>;
  nonCompliantByProject: Record<string, ComplianceResource[]>;
  nonCompliantByRegion: Record<string, ComplianceResource[]>;
}

import { ResourceService } from "./resource-discovery-service";

/**
 * Compliance Analyzer Service
 * Analyzes AWS resource tagging compliance across regions
 */
export class ComplianceService {
  private resourceService: ResourceService;
  private requiredTags: string[];

  constructor(requiredTags: string[]) {
    this.requiredTags = requiredTags;
    this.resourceService = new ResourceService();
  }

  /**
   * Analyze compliance across multiple regions
   */
  async analyzeCompliance(regions: string[]): Promise<ComplianceAnalysisResult> {
    try {
      // Collect resources using the shared service
      const allResources = await this.resourceService.collectResourcesFromRegions(regions);

      // Analyze resources
      const regionResults = regions.map((region) => ({
        region,
        resources: allResources.filter((r) => r.Region === region),
        nonCompliantResources: this.identifyNonCompliantResources(
          allResources.filter((r) => r.Region === region),
          region
        ),
      }));

      // Combine results from all regions
      const combinedResult = this.combineRegionResults(regionResults);

      return combinedResult;
    } catch (error) {
      logger.error("Compliance analysis failed", error as Error);
      throw error;
    }
  }

  /**
   * Identify non-compliant resources
   */
  private identifyNonCompliantResources(
    resources: ResourceTagMapping[],
    region: string
  ): ComplianceResource[] {
    const nonCompliantResources: ComplianceResource[] = [];

    for (const resource of resources) {
      if (!resource.ResourceARN) {
        continue;
      }

      const existingTags = resource.Tags?.map((tag) => tag.Key) || [];
      const missingTags = this.requiredTags.filter((tag) => !existingTags.includes(tag));

      if (missingTags.length > 0) {
        const resourceType = this.extractResourceType(resource.ResourceARN);
        const project = this.extractProject(resource.Tags || []);
        const tags = (resource.Tags || [])
          .filter((tag) => tag.Key)
          .map((tag) => ({ key: tag.Key, value: tag.Value ?? "" }));

        nonCompliantResources.push({
          resourceArn: resource.ResourceARN,
          resourceType,
          region,
          missingTags,
          existingTags,
          tags,
          project,
          accountId: this.extractAccountId(resource.ResourceARN),
        });
      }
    }

    return nonCompliantResources;
  }

  /**
   * Combine results from multiple regions
   */
  private combineRegionResults(
    regionResults: Array<{
      region: string;
      resources: ResourceTagMapping[];
      nonCompliantResources: ComplianceResource[];
    }>
  ): ComplianceAnalysisResult {
    // Flatten all resources and non-compliant resources
    const allResources = regionResults.flatMap((result) => result.resources);
    const allNonCompliantResources = regionResults.flatMap(
      (result) => result.nonCompliantResources
    );

    const totalResources = allResources.length;
    const compliantResources = totalResources - allNonCompliantResources.length;
    const compliancePercentage =
      totalResources > 0 ? (compliantResources / totalResources) * 100 : 100;

    // Group resources by region
    const resourcesByRegion: Record<string, number> = {};
    for (const result of regionResults) {
      resourcesByRegion[result.region] = result.resources.length;
    }

    // Group non-compliant resources by project and region
    const nonCompliantByProject = ArrayUtils.groupByProperty(allNonCompliantResources, "project");
    const nonCompliantByRegion = ArrayUtils.groupByProperty(allNonCompliantResources, "region");

    return {
      totalResources,
      compliantResources,
      compliancePercentage,
      nonCompliantResources: allNonCompliantResources,
      resourcesByRegion,
      nonCompliantByProject,
      nonCompliantByRegion,
    };
  }

  /**
   * Extract resource type from ARN
   */
  private extractResourceType(arn: string): string {
    try {
      return ArnParser.extractResourceType(arn);
    } catch {
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
   * Extract project from tags
   */
  private extractProject(tags: Array<{ Key: string; Value: string }>): string {
    // Look for common project tag names
    const projectTagNames = ["Project", "project", "PROJECT", "Team", "team", "Application", "app"];

    for (const tagName of projectTagNames) {
      const projectTag = tags.find((tag) => tag.Key === tagName);
      if (projectTag?.Value) {
        return projectTag.Value;
      }
    }

    return "Unknown";
  }

  /**
   * Extract account ID from ARN
   */
  private extractAccountId(arn: string): string {
    try {
      const parts = arn.split(":");
      if (parts.length >= 5 && parts[4]) {
        return parts[4];
      }
    } catch {
      logger.warn("Failed to extract account ID from ARN", { arn });
    }

    return "Unknown";
  }

  /**
   * Get compliance summary by resource type
   */
  getComplianceSummaryByResourceType(nonCompliantResources: ComplianceResource[]): Record<
    string,
    {
      count: number;
      percentage: number;
      resources: ComplianceResource[];
    }
  > {
    const grouped = ArrayUtils.groupByProperty(nonCompliantResources, "resourceType");
    const summary: Record<
      string,
      { count: number; percentage: number; resources: ComplianceResource[] }
    > = {};

    const total = nonCompliantResources.length;

    for (const [resourceType, resources] of Object.entries(grouped)) {
      summary[resourceType] = {
        count: resources.length,
        percentage: total > 0 ? (resources.length / total) * 100 : 0,
        resources,
      };
    }

    return summary;
  }

  /**
   * Get most common missing tags
   */
  getMostCommonMissingTags(nonCompliantResources: ComplianceResource[]): Array<{
    tag: string;
    count: number;
    percentage: number;
  }> {
    const tagCounts: Record<string, number> = {};

    for (const resource of nonCompliantResources) {
      for (const missingTag of resource.missingTags) {
        tagCounts[missingTag] = (tagCounts[missingTag] || 0) + 1;
      }
    }

    const total = nonCompliantResources.length;

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({
        tag,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get most common tag values among non-compliant resources
   */
  getMostCommonTagValues(nonCompliantResources: ComplianceResource[]): Array<{
    tag: string;
    value: string;
    count: number;
    percentage: number;
    region: string;
  }> {
    const tagValueCounts: Record<string, Record<string, number>> = {};
    const tagValueRegionCounts: Record<string, Record<string, Record<string, number>>> = {};

    for (const resource of nonCompliantResources) {
      for (const tag of resource.tags || []) {
        if (!tag.key) {
          continue;
        }
        const value = tag.value ?? "";
        if (!tagValueCounts[tag.key]) {
          tagValueCounts[tag.key] = {};
        }
        tagValueCounts[tag.key][value] = (tagValueCounts[tag.key][value] || 0) + 1;

        if (!tagValueRegionCounts[tag.key]) {
          tagValueRegionCounts[tag.key] = {};
        }
        if (!tagValueRegionCounts[tag.key][value]) {
          tagValueRegionCounts[tag.key][value] = {};
        }
        const region = resource.region || "Unknown";
        tagValueRegionCounts[tag.key][value][region] =
          (tagValueRegionCounts[tag.key][value][region] || 0) + 1;
      }
    }

    const total = nonCompliantResources.length;
    const summary: Array<{
      tag: string;
      value: string;
      count: number;
      percentage: number;
      region: string;
    }> = [];

    for (const [tagKey, values] of Object.entries(tagValueCounts)) {
      let topValue = "";
      let topCount = 0;

      for (const [value, count] of Object.entries(values)) {
        if (count > topCount) {
          topCount = count;
          topValue = value;
        }
      }

      let topRegion = "Unknown";
      const regionCounts = tagValueRegionCounts[tagKey]?.[topValue] || {};
      for (const [region, count] of Object.entries(regionCounts)) {
        if (count > (regionCounts[topRegion] || 0)) {
          topRegion = region;
        }
      }

      summary.push({
        tag: tagKey,
        value: topValue || "(empty)",
        count: topCount,
        percentage: total > 0 ? (topCount / total) * 100 : 0,
        region: topRegion,
      });
    }

    return summary.sort((a, b) => b.count - a.count);
  }

  /**
   * Build a shell command to tag a resource
   */
  public buildTaggingCommand(arn: string, tags: string[]): string {
    const tagPairs = tags.map((t) => `${t}=REPLACE_WITH_VALUE`).join(" ");

    // Handle S3 buckets specially as they don't support resourcegroupstaggingapi for tagging
    if (arn.includes(":s3:::")) {
      const bucket = arn.split(":::")[1];
      return `BUCKET="${bucket}"; tags=$(aws s3api get-bucket-tagging --bucket "$BUCKET" --query "TagSet" 2>/dev/null || echo "[]"); new_tags=$(echo "$tags" | jq '. + [${tags
        .map((t) => `{"Key":"${t}","Value":"REPLACE"}`)
        .join(
          ","
        )}]'); aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging "TagSet=$new_tags"`;
    }

    // Extract region from ARN if possible
    const regionMatch = arn.match(/arn:aws:[^:]+:([^:]+):/);
    const region = regionMatch && regionMatch[1] ? `--region ${regionMatch[1]}` : "";

    return `aws resourcegroupstaggingapi tag-resources --resource-arn-list "${arn}" --tags ${tagPairs} ${region}`.trim();
  }
}
