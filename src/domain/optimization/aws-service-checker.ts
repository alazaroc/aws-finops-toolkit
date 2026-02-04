import {
  CostOptimizationHubClient,
  ListEnrollmentStatusesCommand,
} from "@aws-sdk/client-cost-optimization-hub";
import { SupportClient, DescribeTrustedAdvisorChecksCommand } from "@aws-sdk/client-support";
import {
  ComputeOptimizerClient,
  GetEnrollmentStatusCommand,
  GetEC2InstanceRecommendationsCommand,
} from "@aws-sdk/client-compute-optimizer";
import { logger } from "../../core/logger";

interface ServiceAvailabilityStatus {
  available: boolean;
  status: string;
  message: string;
}

export interface ServiceAvailabilityReport {
  timestamp: Date;
  services: {
    costOptimizationHub: ServiceAvailabilityStatus;
    trustedAdvisor: ServiceAvailabilityStatus;
    computeOptimizer: ServiceAvailabilityStatus;
  };
}

export const TRUSTED_ADVISOR_SUBSCRIPTION_MESSAGE =
  "Trusted Advisor requires Business or Enterprise Support plan.";

/**
 * AWS Service Availability Checker
 * Centralizes service availability checks with proper error handling
 */
export class AwsServiceChecker {
  private cohClient: CostOptimizationHubClient;
  private supportClient: SupportClient;
  private computeOptimizerClient: ComputeOptimizerClient;
  private cachedChecks: Partial<
    Record<
      "costOptimizationHub" | "trustedAdvisor" | "computeOptimizer",
      Promise<ServiceAvailabilityStatus>
    >
  > = {};

  constructor() {
    // All optimization services work in us-east-1
    this.cohClient = new CostOptimizationHubClient({ region: "us-east-1" });
    this.supportClient = new SupportClient({ region: "us-east-1" });
    this.computeOptimizerClient = new ComputeOptimizerClient({ region: "us-east-1" });
  }

  private memoizeCheck(
    key: "costOptimizationHub" | "trustedAdvisor" | "computeOptimizer",
    factory: () => Promise<ServiceAvailabilityStatus>
  ): Promise<ServiceAvailabilityStatus> {
    const existing = this.cachedChecks[key];
    if (existing) return existing;

    const created = factory().catch((error) => {
      delete this.cachedChecks[key];
      throw error;
    });

    this.cachedChecks[key] = created;
    return created;
  }

  /**
   * Check all services availability
   */
  async checkAllServices(): Promise<ServiceAvailabilityReport> {
    const [costOptimizationHub, trustedAdvisor, computeOptimizer] = await Promise.all([
      this.checkCostOptimizationHub(),
      this.checkTrustedAdvisor(),
      this.checkComputeOptimizer(),
    ]);

    const report: ServiceAvailabilityReport = {
      timestamp: new Date(),
      services: {
        costOptimizationHub,
        trustedAdvisor,
        computeOptimizer,
      },
    };

    return report;

    return report;
  }

  /**
   * Check Cost Optimization Hub availability
   */
  async checkCostOptimizationHub(): Promise<ServiceAvailabilityStatus> {
    return this.memoizeCheck("costOptimizationHub", async () => {
      try {
        const command = new ListEnrollmentStatusesCommand({});
        const response = await (this.cohClient as any).send(command);

        const activeEnrollments =
          response.items?.filter((status: any) => status.status === "Active") || [];

        if (activeEnrollments.length > 0) {
          return {
            available: true,
            status: "Active",
            message: "Cost Optimization Hub is enabled and active",
          };
        } else {
          logger.warn("Cost Optimization Hub is not active");
          return {
            available: false,
            status: "Inactive",
            message:
              "Cost Optimization Hub is not enabled. Enable it in the AWS Console to get rightsizing and purchasing recommendations.",
          };
        }
      } catch (error) {
        const errorMessage = this.handleServiceError(
          "Cost Optimization Hub",
          error,
          "availability check"
        );
        logger.error("Cost Optimization Hub availability check failed", error as Error);
        return {
          available: false,
          status: "Error",
          message: errorMessage,
        };
      }
    });
  }

  /**
   * Check Trusted Advisor availability
   */
  async checkTrustedAdvisor(): Promise<ServiceAvailabilityStatus> {
    return this.memoizeCheck("trustedAdvisor", async () => {
      try {
        const command = new DescribeTrustedAdvisorChecksCommand({
          language: "en",
        });
        const response = await (this.supportClient as any).send(command);

        const costOptimizingChecks =
          response.checks?.filter((check: any) => check.category === "cost_optimizing") || [];

        if (costOptimizingChecks.length > 0) {
          return {
            available: true,
            status: "Available",
            message: `Trusted Advisor is available with ${costOptimizingChecks.length} cost optimization checks`,
          };
        } else {
          logger.warn("Trusted Advisor has no cost optimization checks");
          return {
            available: false,
            status: "Limited",
            message: "Trusted Advisor is available but no cost optimization checks found",
          };
        }
      } catch (error) {
        const errorMessage = this.handleServiceError(
          "Trusted Advisor",
          error,
          "availability check"
        );
        logger.error("Trusted Advisor availability check failed", error as Error);

        // Check for subscription error (most common case)
        if (error instanceof Error && error.message.includes("SubscriptionRequiredException")) {
          return {
            available: false,
            status: "Subscription Required",
            message: TRUSTED_ADVISOR_SUBSCRIPTION_MESSAGE,
          };
        }

        return {
          available: false,
          status: "Error",
          message: errorMessage,
        };
      }
    });
  }

  /**
   * Check Compute Optimizer availability
   */
  async checkComputeOptimizer(): Promise<ServiceAvailabilityStatus> {
    return this.memoizeCheck("computeOptimizer", async () => {
      try {
        const command = new GetEnrollmentStatusCommand({});
        const response = await (this.computeOptimizerClient as any).send(command);

        if (response.status === "Active") {
          // Check if we have any recommendations (indicates sufficient data)
          const hasData = await this.checkComputeOptimizerData();

          if (hasData === true) {
            return {
              available: true,
              status: "Active with Data",
              message: "Compute Optimizer is enabled and has recommendation data available",
            };
          } else if (hasData === false) {
            logger.warn("Compute Optimizer is active but has insufficient data");
            return {
              available: false,
              status: "Active but No Data",
              message:
                "Compute Optimizer is enabled but needs at least 14 days of metrics data to generate recommendations",
            };
          }

          logger.warn("Compute Optimizer is active but data availability check failed");
          return {
            available: true,
            status: "Active",
            message: "Compute Optimizer is enabled (data availability check inconclusive)",
          };
        } else {
          logger.warn("Compute Optimizer is not active", { status: response.status });
          return {
            available: false,
            status: response.status || "Inactive",
            message:
              "Compute Optimizer is not enabled. Enable it in the AWS Console to get EC2, Lambda, and EBS recommendations.",
          };
        }
      } catch (error) {
        const errorMessage = this.handleServiceError(
          "Compute Optimizer",
          error,
          "availability check"
        );
        logger.error("Compute Optimizer availability check failed", error as Error);
        return {
          available: false,
          status: "Error",
          message: errorMessage,
        };
      }
    });
  }

  /**
   * Check if Compute Optimizer has recommendation data
   */
  private async checkComputeOptimizerData(): Promise<boolean | null> {
    try {
      const ec2Command = new GetEC2InstanceRecommendationsCommand({
        maxResults: 1,
      });
      const ec2Response = await (this.computeOptimizerClient as any).send(ec2Command);

      return (ec2Response.instanceRecommendations?.length || 0) > 0;
    } catch (error) {
      logger.warn("Could not check Compute Optimizer data availability", { error });
      return null;
    }
  }

  /**
   * Handle service errors with user-friendly messages
   */
  private handleServiceError(serviceName: string, error: unknown, operation: string): string {
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const errorCode = (error as any).name || (error as any).code || "";

      // Access denied / permissions errors
      if (
        errorMessage.includes("access denied") ||
        errorMessage.includes("unauthorized") ||
        errorCode.includes("AccessDenied")
      ) {
        return `${serviceName} access denied. Please ensure the Lambda has the required IAM permissions for ${operation}.`;
      }

      // Service not available in region
      if (
        errorMessage.includes("not available") ||
        errorMessage.includes("not supported") ||
        errorCode.includes("UnsupportedOperation")
      ) {
        return `${serviceName} is not available in the current region. Some services require specific regions (e.g., us-east-1).`;
      }

      // Rate limiting / throttling
      if (
        errorMessage.includes("throttl") ||
        errorMessage.includes("rate limit") ||
        errorCode.includes("Throttling")
      ) {
        return `${serviceName} request was throttled. The service will retry automatically on the next execution.`;
      }

      // Service-specific errors
      if (
        serviceName === "Trusted Advisor" &&
        (errorMessage.includes("subscription") || errorCode.includes("SubscriptionRequired"))
      ) {
        return TRUSTED_ADVISOR_SUBSCRIPTION_MESSAGE;
      }

      if (
        serviceName === "Cost Optimization Hub" &&
        (errorMessage.includes("not enrolled") || errorMessage.includes("enrollment"))
      ) {
        return "Cost Optimization Hub is not enrolled. Enable it in the AWS Console to get rightsizing and purchasing recommendations.";
      }

      if (
        serviceName === "Compute Optimizer" &&
        (errorMessage.includes("not opted in") || errorMessage.includes("opt-in"))
      ) {
        return "Compute Optimizer is not enabled. Enable it in the AWS Console to get EC2, Lambda, and EBS recommendations.";
      }

      // Generic error with sanitized message
      const sanitizedMessage = error.message.replace(/['"]/g, "").substring(0, 200);
      return `${serviceName} ${operation} failed: ${sanitizedMessage}`;
    }

    return `${serviceName} ${operation} failed with unexpected error type.`;
  }
}
