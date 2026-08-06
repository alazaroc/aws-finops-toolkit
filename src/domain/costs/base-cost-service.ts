import { SimpleFinOpsConfig } from "../../types/finops-config";
import { CostExplorerService } from "./cost-explorer-client";
import { GetCostAndUsageRequest } from "@aws-sdk/client-cost-explorer";
import { BaseFinOpsService } from "../../core/base-service";

/**
 * Base class for cost-related analysis services
 */
export abstract class BaseCostService extends BaseFinOpsService {
  protected costExplorer: CostExplorerService;

  constructor(config: SimpleFinOpsConfig) {
    super(config);
    this.costExplorer = new CostExplorerService();
  }

  /**
   * Get common filters that should be applied to almost all FinOps queries
   */
  protected getCommonFilters(): GetCostAndUsageRequest["Filter"] {
    const excludeChargeTypes = [
      "Credit",
      "Refund",
      "Tax",
      "SavingsPlanNegation",
      "RiVolumeDiscount",
    ];

    const includeRegions =
      this.config.regions && this.config.regions.length > 0
        ? [...new Set([...this.config.regions, "Global"])]
        : undefined;

    return CostExplorerService.buildFilter({
      excludeChargeTypes,
      excludeAccounts: this.config.cost_analysis?.exclude_accounts,
      excludeServices: this.config.cost_analysis?.exclude_services,
      includeRegions,
    });
  }

  /**
   * Filters WITHOUT charge-type exclusion, so Credit/Refund records are visible.
   * Used to compute net cost (what is actually billed after AWS credits).
   */
  protected getFiltersWithCredits(): GetCostAndUsageRequest["Filter"] {
    const includeRegions =
      this.config.regions && this.config.regions.length > 0
        ? [...new Set([...this.config.regions, "Global"])]
        : undefined;

    return CostExplorerService.buildFilter({
      excludeAccounts: this.config.cost_analysis?.exclude_accounts,
      excludeServices: this.config.cost_analysis?.exclude_services,
      includeRegions,
    });
  }
}
