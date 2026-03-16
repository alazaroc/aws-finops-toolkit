import {
  ResourceGroupsTaggingAPIClient,
  GetResourcesCommand,
} from "@aws-sdk/client-resource-groups-tagging-api";
import { logger } from "../../core/logger";

export interface ResourceTagMapping {
  ResourceARN: string;
  Tags?: Array<{ Key: string; Value: string }>;
  Region: string;
}

/**
 * Service for discovering and retrieving AWS resources and their tags
 * Centralizes Resource Groups Tagging API interactions to avoid duplication and inconsistencies
 */
export class ResourceService {
  /**
   * Get all resources in a specific region with pagination
   */
  async getResourcesInRegion(region: string): Promise<ResourceTagMapping[]> {
    const regionalTaggingAPI = new ResourceGroupsTaggingAPIClient({ region });
    const regionResources: ResourceTagMapping[] = [];

    try {
      let paginationToken: string | undefined;

      do {
        const command = new GetResourcesCommand({
          ResourcesPerPage: 100,
          PaginationToken: paginationToken,
        });

        const response = await (regionalTaggingAPI as any).send(command);

        if (response.ResourceTagMappingList) {
          const mappedResources = response.ResourceTagMappingList.map((resource: any) => ({
            ResourceARN: resource.ResourceARN!,
            Tags: resource.Tags,
            Region: region,
          }));
          regionResources.push(...mappedResources);
        }

        paginationToken = response.PaginationToken;
      } while (paginationToken);

      return regionResources;
    } catch (error) {
      logger.error("Failed to get resources in region", error as Error, { region });
      return [];
    }
  }

  /**
   * Collect all resources from multiple regions
   */
  async collectResourcesFromRegions(regions: string[]): Promise<ResourceTagMapping[]> {
    const regionResults = await Promise.all(
      regions.map((region) => this.getResourcesInRegion(region))
    );

    const allResources = regionResults.flat();

    return allResources;
  }
}
