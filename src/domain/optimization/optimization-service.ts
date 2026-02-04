import {
  CostOptimizationHubClient,
  ListRecommendationsCommand,
} from "@aws-sdk/client-cost-optimization-hub";
import {
  SupportClient,
  DescribeTrustedAdvisorChecksCommand,
  DescribeTrustedAdvisorCheckResultCommand,
} from "@aws-sdk/client-support";
import { ComputeOptimizerClient } from "@aws-sdk/client-compute-optimizer";
import { SimpleFinOpsConfig } from "../../types/finops-config";
import { logger } from "../../core/logger";
import { AwsServiceChecker, ServiceAvailabilityReport } from "./aws-service-checker";
import {
  RecommendationConsolidator,
  ConsolidatedRecommendation,
} from "./recommendation-consolidator";

export interface OptimizationInsightsReport {
  reportDate: Date;
  accountId: string;
  accountAlias?: string;
  executiveSummary: {
    totalPotentialSavings: number;
    recommendationCount: number;
    topOpportunity: ConsolidatedRecommendation | null;
    serviceAvailability: ServiceAvailabilityReport;
  };
  recommendations: ConsolidatedRecommendation[];
  unavailableServices: string[];
}

export class OptimizationService {
  private costOptimizationHubClient: CostOptimizationHubClient;
  private supportClient: SupportClient;
  private computeOptimizerClient: ComputeOptimizerClient;
  private config: SimpleFinOpsConfig;
  private awsServiceChecker: AwsServiceChecker;
  private consolidator: RecommendationConsolidator;

  constructor(config: SimpleFinOpsConfig) {
    this.costOptimizationHubClient = new CostOptimizationHubClient({ region: "us-east-1" });
    this.supportClient = new SupportClient({ region: "us-east-1" });
    this.computeOptimizerClient = new ComputeOptimizerClient({ region: "us-east-1" });
    this.config = config;
    this.awsServiceChecker = new AwsServiceChecker();
    this.consolidator = new RecommendationConsolidator();
  }

  /**
   * Run optimization analysis
   */
  async runAnalysis(): Promise<OptimizationInsightsReport> {
    // Check service availability
    const serviceAvailability = await this.awsServiceChecker.checkAllServices();

    // Collect recommendations from all sources
    const [cohRecommendations, taRecommendations, coRecommendations] = await Promise.all([
      this.getCostOptimizationHubRecommendations(),
      this.getTrustedAdvisorRecommendations(),
      this.getComputeOptimizerRecommendations(),
    ]);

    // Consolidate and prioritize
    const consolidated = this.consolidator.consolidateRecommendations(
      cohRecommendations,
      taRecommendations,
      coRecommendations
    );
    const prioritized = this.consolidator.prioritizeRecommendations(consolidated);

    // Calculate executive summary
    const totalPotentialSavings = prioritized.reduce(
      (sum, rec) => sum + rec.estimatedMonthlySavings,
      0
    );
    const topOpportunity = prioritized.length > 0 ? prioritized[0] : null;

    const unavailableServices = Object.entries(serviceAvailability.services)
      .filter(([_, status]) => !status.available)
      .map(([name, _]) => name);

    return {
      reportDate: new Date(),
      accountId: process.env.AWS_ACCOUNT_ID || this.config.account_id || "unknown",
      accountAlias: this.config.account_alias,
      executiveSummary: {
        totalPotentialSavings,
        recommendationCount: prioritized.length,
        topOpportunity,
        serviceAvailability,
      },
      recommendations: prioritized,
      unavailableServices,
    };
  }

  private async getCostOptimizationHubRecommendations(): Promise<ConsolidatedRecommendation[]> {
    const recommendations: ConsolidatedRecommendation[] = [];
    try {
      const availability = await this.awsServiceChecker.checkCostOptimizationHub();
      if (!availability.available) return recommendations;

      const command = new ListRecommendationsCommand({ maxResults: 100 });
      const response = await (this.costOptimizationHubClient as any).send(command);

      if (response.items) {
        for (const rec of response.items) {
          const recommendation = this.normalizeCOHRecommendation(rec);
          if (recommendation) recommendations.push(recommendation);
        }
      }
      return recommendations;
    } catch (error) {
      logger.error("Error getting COH recommendations:", error as Error);
      return recommendations;
    }
  }

  private async getTrustedAdvisorRecommendations(): Promise<ConsolidatedRecommendation[]> {
    const recommendations: ConsolidatedRecommendation[] = [];
    try {
      const availability = await this.awsServiceChecker.checkTrustedAdvisor();
      if (!availability.available) return recommendations;

      const checks = await this.getTrustedAdvisorCostChecks();
      for (const check of checks) {
        await this.processTrustedAdvisorCheck(check, recommendations);
      }
      return recommendations;
    } catch (error) {
      logger.error("Error getting TA recommendations:", error as Error);
      return recommendations;
    }
  }

  private async getComputeOptimizerRecommendations(): Promise<ConsolidatedRecommendation[]> {
    return [];
  }

  // --- Helper methods for COH ---

  private normalizeCOHRecommendation(rec: any): ConsolidatedRecommendation | null {
    if (!rec.resourceId || !rec.estimatedMonthlySavings) return null;
    const savings = parseFloat(rec.estimatedMonthlySavings) || 0;
    if (savings < 0.01) return null;

    const actionType = rec.actionType || "Optimize";
    return {
      id: `coh-${actionType.toLowerCase().replace(/\s+/g, "-")}-${rec.resourceId}`,
      source: "COH",
      actionType,
      resourceId: rec.resourceId,
      resourceType: rec.currentResourceType || rec.recommendedResourceType || "Unknown",
      region: rec.region || "unknown",
      currentConfiguration: {
        resourceSummary: rec.currentResourceSummary,
        resourceType: rec.currentResourceType,
        monthlyCost: rec.estimatedMonthlyCost,
      },
      recommendedConfiguration: {
        resourceSummary: rec.recommendedResourceSummary,
        resourceType: rec.recommendedResourceType,
        actionType: rec.actionType,
        implementationEffort: rec.implementationEffort,
      },
      estimatedMonthlySavings: savings,
      implementationEffort: rec.implementationEffort || "low",
      priority: "medium", // Will be updated by prioritizeRecommendations
      roi: 0, // Will be updated by prioritizeRecommendations
      description: `${actionType}: ${rec.currentResourceType || "resource"} ${rec.resourceId}`,
      consoleLink: this.generateConsoleLink(rec.resourceId, rec.currentResourceType, rec.region),
    };
  }

  // --- Helper methods for TA ---

  private async getTrustedAdvisorCostChecks(): Promise<any[]> {
    try {
      const command = new DescribeTrustedAdvisorChecksCommand({ language: "en" });
      const response = await (this.supportClient as any).send(command);
      return response.checks?.filter((check: any) => check.category === "cost_optimizing") || [];
    } catch (error) {
      return [];
    }
  }

  private async processTrustedAdvisorCheck(
    check: any,
    recommendations: ConsolidatedRecommendation[]
  ): Promise<void> {
    try {
      const command = new DescribeTrustedAdvisorCheckResultCommand({
        checkId: check.id,
        language: "en",
      });
      const response = await (this.supportClient as any).send(command);
      const result = response.result;
      if (!result || result.status === "ok") return;

      if (result.flaggedResources) {
        for (const resource of result.flaggedResources) {
          const rec = this.normalizeTARecommendation(check, resource);
          if (rec) recommendations.push(rec);
        }
      }
    } catch (error) {
      // Ignore individual check errors
    }
  }

  private normalizeTARecommendation(check: any, resource: any): ConsolidatedRecommendation | null {
    if (!resource.resourceId) return null;
    const savings = 0.01; // Placeholder
    return {
      id: `ta-${check.id}-${resource.resourceId}`,
      source: "TA",
      actionType: check.name || "Optimize",
      resourceId: resource.resourceId,
      resourceType: "Unknown",
      region: "unknown",
      currentConfiguration: {},
      recommendedConfiguration: {},
      estimatedMonthlySavings: savings,
      implementationEffort: "medium",
      priority: "medium",
      roi: 0,
      description: `${check.name}: ${resource.resourceId}`,
      consoleLink: this.generateConsoleLink(resource.resourceId, "unknown", "unknown"),
    };
  }

  // --- Generic utilities ---

  private generateConsoleLink(resourceId: string, resourceType: string, region: string): string {
    const targetRegion = region || "us-east-1";
    switch (resourceType?.toLowerCase()) {
      case "ec2":
        return `https://console.aws.amazon.com/ec2/v2/home?region=${targetRegion}#Instances:instanceId=${resourceId}`;
      case "lambda":
        return `https://console.aws.amazon.com/lambda/home?region=${targetRegion}#/functions/${resourceId}`;
      case "ebs":
        return `https://console.aws.amazon.com/ec2/v2/home?region=${targetRegion}#Volumes:volumeId=${resourceId}`;
      case "rds":
        return `https://console.aws.amazon.com/rds/home?region=${targetRegion}#database:id=${resourceId}`;
      default:
        return `https://console.aws.amazon.com/console/home?region=${targetRegion}`;
    }
  }
}
