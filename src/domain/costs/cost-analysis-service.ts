import { SimpleFinOpsConfig } from "../../types/finops-config";
import { logger } from "../../core/logger";
import { ArrayUtils } from "../../core/array-utils";
import { OrganizationService, OrganizationInfo } from "../../core/organization-service";
import { BaseCostService } from "./base-cost-service";
import { CostExplorerResult, CostExplorerService } from "./cost-explorer-client";

export interface CostData {
  groupValue: string;
  cost: number;
  previousCost: number;
  threshold: number;
  isOverThreshold: boolean;
  topServices: Array<{ service: string; cost: number }>;
  tagName: string;
}

export interface AnomalyData {
  groupValue: string;
  tagName: string;
  currentCost: number;
  previousCost: number;
  percentageChange: number;
}

export interface TagBreakdown {
  tagName: string;
  groupedCosts: CostData[];
  zeroCostGroupValues: string[];
  costAllocationTagEnabled: boolean;
  errorMessage?: string;
}

export interface AccountBreakdown {
  accountId: string;
  accountName: string;
  cost: number;
  previousCost: number;
  percentage: number;
}

export interface CostAnalysisReport {
  reportDate: Date;
  accountId: string;
  accountAlias?: string;
  periodStart: Date;
  periodEnd: Date;
  periodEndExclusive: boolean;
  totalCost: number;
  previousTotalCost: number;
  netCost?: number;
  creditsApplied?: number;
  groupedCosts: CostData[];
  tagBreakdowns: TagBreakdown[];
  anomalies: AnomalyData[];
  regionalBreakdown: Array<{
    region: string;
    cost: number;
    previousCost: number;
    percentage: number;
  }>;
  serviceBreakdown: Array<{
    service: string;
    cost: number;
    previousCost: number;
    percentage: number;
  }>;
  organizationMode: boolean;
  organizationInfo?: {
    id: string;
    masterAccountId: string;
    accountCount: number;
  };
  accountBreakdown?: AccountBreakdown[];
}

/**
 * Service for analyzing AWS costs
 * Handles data fetching, processing, and anomaly detection
 */
export class CostAnalysisService extends BaseCostService {
  private static readonly MIN_DISPLAY_COST = 0.01;
  private static readonly UNTAGGED_VALUE = "untagged";

  constructor(config: SimpleFinOpsConfig) {
    super(config);
  }

  /**
   * Main analysis method
   */
  async analyzeCosts(): Promise<CostAnalysisReport> {
    try {
      const { startDate, endDate, endExclusive } = this.calculateDateRange();

      // Calculate previous period for anomaly detection
      const prevPeriod = this.calculatePreviousPeriod(startDate, endDate);

      // Support multiple tags for grouping
      const groupByTags = Array.isArray(this.config.cost_analysis.group_by_tag)
        ? this.config.cost_analysis.group_by_tag
        : [this.config.cost_analysis.group_by_tag];

      // Detect organization mode
      const orgInfo = await this.detectOrganization();
      const isOrgMode = orgInfo !== null;

      // Fetch all cost data in parallel (include account breakdown if org mode)
      const fetchPromises: [
        Promise<Record<string, CostExplorerResult>>,
        Promise<CostExplorerResult>,
        Promise<Record<string, Record<string, number>>>,
        Promise<CostExplorerResult>,
        Promise<CostExplorerResult | null>,
        Promise<CostExplorerResult | null>,
        Promise<CostExplorerResult>,
      ] = [
        this.fetchServicesByTags(groupByTags, startDate, endDate),
        this.getCombinedCostBreakdown(startDate, endDate),
        this.fetchSummaryByTags(groupByTags, prevPeriod.startDate, prevPeriod.endDate),
        this.getCombinedCostBreakdown(prevPeriod.startDate, prevPeriod.endDate),
        isOrgMode ? this.getAccountBreakdown(startDate, endDate) : Promise.resolve(null),
        isOrgMode
          ? this.getAccountBreakdown(prevPeriod.startDate, prevPeriod.endDate)
          : Promise.resolve(null),
        this.costExplorer.getCostsByRecordType(startDate, endDate, this.getFiltersWithCredits()),
      ];

      const [
        serviceByTagData,
        combinedGlobalData,
        previousTagData,
        previousGlobalData,
        accountData,
        prevAccountData,
        recordTypeData,
      ] = await Promise.all(fetchPromises);

      const report = this.processCostData(
        {
          serviceByTagData,
          combinedGlobalData,
          previousTagData,
          previousGlobalData,
        },
        endDate,
        groupByTags,
        startDate,
        endDate,
        endExclusive
      );

      // Enrich with net cost (after AWS credits)
      const { netCost, creditsApplied } = this.computeNetCost(recordTypeData);
      report.netCost = netCost;
      report.creditsApplied = creditsApplied;

      // Enrich with organization data
      report.organizationMode = isOrgMode;
      if (isOrgMode && orgInfo) {
        report.organizationInfo = {
          id: orgInfo.id,
          masterAccountId: orgInfo.masterAccountId,
          accountCount: orgInfo.accounts.length,
        };
        report.accountBreakdown = this.buildAccountBreakdown(
          accountData,
          prevAccountData,
          orgInfo,
          report.totalCost
        );
      }

      this.logTagCoverageWarnings(report);
      return report;
    } catch (error) {
      logger.error("Cost analysis service failed", error as Error);
      throw error;
    }
  }

  /**
   * Compute net cost (what is actually billed after AWS credits are applied)
   * from a RECORD_TYPE-grouped Cost Explorer result.
   *
   * netCost = sum of all record types except Tax (Usage + Credit + Refund + ...).
   * creditsApplied = the (negative) Credit amount, reported as a positive number.
   */
  private computeNetCost(recordTypeData: CostExplorerResult): {
    netCost: number;
    creditsApplied: number;
  } {
    let netCost = 0;
    let credits = 0;

    const groups = recordTypeData?.ResultsByTime?.[0]?.Groups;
    if (groups) {
      for (const group of groups) {
        const recordType = CostExplorerService.extractGroupKeys(group)[0] || "";
        const amount = CostExplorerService.extractCostValue(group);

        // Exclude Tax from "net cost" (not part of resource spend after credits)
        if (recordType.toLowerCase() === "tax") {
          continue;
        }
        netCost += amount;

        if (recordType.toLowerCase() === "credit") {
          credits += amount; // negative
        }
      }
    }

    return { netCost, creditsApplied: Math.abs(credits) };
  }

  /**
   * Detect if running in Organizations context (auto, true, false from config)
   */
  private async detectOrganization(): Promise<OrganizationInfo | null> {
    const orgConfig = this.config.organization;
    const enabled = orgConfig?.enabled ?? "auto";

    if (enabled === false) {
      return null;
    }

    const orgService = new OrganizationService();

    if (enabled === true) {
      return await orgService.getOrganizationInfo();
    }

    // "auto" mode: try and fallback gracefully
    const mode = await orgService.detectMode();
    if (mode === "single-account") {
      return null;
    }
    return await orgService.getOrganizationInfo();
  }

  /**
   * Get cost breakdown by linked account
   */
  private async getAccountBreakdown(
    startDate: Date,
    endDate: Date
  ): Promise<CostExplorerResult> {
    const filter = this.getCommonFilters();
    return await this.costExplorer.getCostsByAccount(startDate, endDate, filter);
  }

  /**
   * Build account breakdown array from Cost Explorer results
   */
  private buildAccountBreakdown(
    accountData: CostExplorerResult | null,
    prevAccountData: CostExplorerResult | null,
    orgInfo: OrganizationInfo,
    totalCost: number
  ): AccountBreakdown[] {
    if (!accountData) {
      return [];
    }

    // Build current period map
    const currentMap = new Map<string, number>();
    if (accountData.ResultsByTime) {
      for (const timeResult of accountData.ResultsByTime) {
        for (const group of timeResult.Groups || []) {
          const accountId = CostExplorerService.extractGroupKeys(group)[0] || "Unknown";
          const cost = CostExplorerService.extractCostValue(group);
          currentMap.set(accountId, (currentMap.get(accountId) || 0) + cost);
        }
      }
    }

    // Build previous period map
    const prevMap = new Map<string, number>();
    if (prevAccountData?.ResultsByTime) {
      for (const timeResult of prevAccountData.ResultsByTime) {
        for (const group of timeResult.Groups || []) {
          const accountId = CostExplorerService.extractGroupKeys(group)[0] || "Unknown";
          const cost = CostExplorerService.extractCostValue(group);
          prevMap.set(accountId, (prevMap.get(accountId) || 0) + cost);
        }
      }
    }

    // Resolve account names from org info
    const nameMap = new Map(orgInfo.accounts.map((a) => [a.id, a.name]));

    // Exclude configured accounts
    const excluded = new Set(this.config.organization?.excluded_accounts || []);

    const breakdown: AccountBreakdown[] = [];
    for (const [accountId, cost] of currentMap.entries()) {
      if (excluded.has(accountId) || cost < 0.01) {
        continue;
      }
      breakdown.push({
        accountId,
        accountName: nameMap.get(accountId) || accountId,
        cost,
        previousCost: prevMap.get(accountId) || 0,
        percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      });
    }

    return ArrayUtils.sortBy(breakdown, (a, b) => b.cost - a.cost);
  }

  /**
   * Calculate date range based on current day
   */
  private calculateDateRange(): { startDate: Date; endDate: Date; endExclusive: boolean } {
    const today = new Date();
    const currentDay = today.getDate();

    let startDate: Date;
    let endDate: Date;
    let endExclusive = false;

    const year = today.getFullYear();
    const month = today.getMonth();

    if (currentDay <= 5) {
      // Analyze previous complete month
      // Use Date.UTC to ensure we get YYYY-MM-01T00:00:00.000Z exactly
      // This prevents timezone shifts when converting to ISO string (e.g. Dec 31st issue)
      startDate = new Date(Date.UTC(year, month - 1, 1));
      endDate = new Date(Date.UTC(year, month, 1)); // 1st of current month (exclusive)

      // We set this to true so the presentation layer knows to subtract 1 day
      // and display "Jan 1 - Jan 31" instead of "Jan 1 - Feb 1"
      endExclusive = true;
    } else {
      // Analyze current month up to yesterday
      startDate = new Date(Date.UTC(year, month, 1));
      // End date: today + 1 day (because Cost Explorer end is exclusive)
      // We use UTC for consistency
      endDate = new Date(Date.UTC(year, month, currentDay + 1));
      endExclusive = true;
    }

    return { startDate, endDate, endExclusive };
  }

  /**
   * Calculate previous period for comparison
   */
  private calculatePreviousPeriod(
    startDate: Date,
    endDate: Date
  ): { startDate: Date; endDate: Date } {
    const prevStart = new Date(startDate);
    const prevEnd = new Date(endDate);

    // Use UTC methods to match the UTC construction above
    prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
    prevEnd.setUTCMonth(prevEnd.getUTCMonth() - 1);

    return { startDate: prevStart, endDate: prevEnd };
  }

  /**
   * Fetch service costs by multiple tags
   */
  private async fetchServicesByTags(
    groupByTags: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, CostExplorerResult>> {
    // Use the shared internal method to ensure consistency
    return this.fetchServicesByTagsInternal(groupByTags, startDate, endDate);
  }

  /**
   * Get filtered costs by region and service using a single combined call
   */
  private async getCombinedCostBreakdown(
    startDate: Date,
    endDate: Date
  ): Promise<CostExplorerResult> {
    const filter = this.getCommonFilters();
    return await this.costExplorer.getCombinedRegionAndServiceBreakdown(startDate, endDate, filter);
  }

  /**
   * Fetch costs by service and tag - used for BOTH current and previous periods
   * This ensures identical data structure and processing
   */
  private async fetchServicesByTagsInternal(
    groupByTags: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, CostExplorerResult>> {
    const filter = this.getCommonFilters();
    const serviceByTagData: Record<string, CostExplorerResult> = {};

    await Promise.all(
      groupByTags.map(async (tag) => {
        serviceByTagData[tag] = await this.costExplorer.getCostsByServiceAndTag(
          tag,
          startDate,
          endDate,
          filter
        );
      })
    );

    return serviceByTagData;
  }

  /**
   * Process raw AWS data into grouped cost summaries
   */
  private extractGroupedCostsFromServiceData(
    serviceData: CostExplorerResult | undefined
  ): Record<string, number> {
    const groupedCosts: Record<string, number> = {};

    if (serviceData?.ResultsByTime) {
      for (const timeResult of serviceData.ResultsByTime) {
        if (!timeResult.Groups) {
          continue;
        }
        for (const group of timeResult.Groups) {
          const keys = CostExplorerService.extractGroupKeys(group);
          const groupValue = CostExplorerService.normalizeTagValue(keys[0]);
          const cost = CostExplorerService.extractCostValue(group);
          groupedCosts[groupValue] = (groupedCosts[groupValue] || 0) + cost;
        }
      }
    }

    return groupedCosts;
  }

  private async fetchSummaryByTags(
    groupByTags: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, Record<string, number>>> {
    // Fetch raw data using the SAME method as current period
    const rawData = await this.fetchServicesByTagsInternal(groupByTags, startDate, endDate);

    // Process it into the summary format
    const results: Record<string, Record<string, number>> = {};
    for (const tag of groupByTags) {
      results[tag] = this.extractGroupedCostsFromServiceData(rawData[tag]);
    }

    return results;
  }

  /**
   * Process cost data into report format
   */
  private processCostData(
    data: {
      serviceByTagData: Record<string, CostExplorerResult>;
      combinedGlobalData: CostExplorerResult;
      previousTagData: Record<string, Record<string, number>>;
      previousGlobalData: CostExplorerResult;
    },
    endDate: Date,
    groupByTags: string[],
    periodStart: Date,
    periodEnd: Date,
    periodEndExclusive: boolean
  ): CostAnalysisReport {
    const { serviceByTagData, combinedGlobalData, previousTagData, previousGlobalData } = data;

    // Process tag breakdowns
    const tagBreakdowns: TagBreakdown[] = [];
    let allGroupedCosts: CostData[] = [];

    for (const tagName of groupByTags) {
      const prevCosts = previousTagData[tagName] || {};
      const { groupedCosts, zeroCostGroupValues } = this.processTagCostsFromServiceData(
        serviceByTagData[tagName],
        tagName,
        prevCosts
      );

      const costAllocationTagEnabled = this.isCostAllocationTagEnabled(groupedCosts);
      tagBreakdowns.push({
        tagName,
        groupedCosts,
        zeroCostGroupValues,
        costAllocationTagEnabled,
        errorMessage: costAllocationTagEnabled
          ? undefined
          : this.buildCostAllocationTagWarning(tagName),
      });
      allGroupedCosts = allGroupedCosts.concat(groupedCosts);
    }

    // Process global breakdowns from combined data
    const { regionalBreakdown, serviceBreakdown, totalCost, previousTotalCost } =
      this.processGlobalBreakdowns(combinedGlobalData, previousGlobalData);

    // Detect anomalies
    const anomalies = this.detectAnomalies(allGroupedCosts, data.previousTagData);

    return {
      reportDate: new Date(),
      accountId: this.getAccountId(),
      accountAlias: this.config.account_alias,
      periodStart,
      periodEnd,
      periodEndExclusive,
      totalCost,
      previousTotalCost,
      groupedCosts: allGroupedCosts,
      tagBreakdowns,
      anomalies,
      regionalBreakdown,
      serviceBreakdown,
      organizationMode: false,
    };
  }

  /**
   * Process costs for a specific tag using only Service breakdown data
   */
  private processTagCostsFromServiceData(
    serviceCosts: CostExplorerResult,
    tagName: string,
    previousCosts: Record<string, number> = {}
  ): { groupedCosts: CostData[]; zeroCostGroupValues: string[] } {
    const groupedCostMap = new Map<string, { cost: number; services: Map<string, number> }>();
    const zeroCostGroupValues = new Set<string>();

    if (serviceCosts?.ResultsByTime) {
      for (const timeResult of serviceCosts.ResultsByTime) {
        if (!timeResult.Groups) {
          continue;
        }

        for (const group of timeResult.Groups) {
          const keys = CostExplorerService.extractGroupKeys(group);
          const groupValue = CostExplorerService.normalizeTagValue(keys[0]);
          const serviceName = keys[1] || "Unknown";
          const cost = CostExplorerService.extractCostValue(group);

          if (!groupedCostMap.has(groupValue)) {
            groupedCostMap.set(groupValue, { cost: 0, services: new Map() });
          }

          const entry = groupedCostMap.get(groupValue)!;
          entry.cost += cost;
          if (cost >= CostAnalysisService.MIN_DISPLAY_COST) {
            entry.services.set(serviceName, (entry.services.get(serviceName) || 0) + cost);
          }
        }
      }
    }

    // Second pass: Build CostData objects
    const groupedCosts: CostData[] = [];
    for (const [groupValue, data] of groupedCostMap.entries()) {
      if (data.cost >= CostAnalysisService.MIN_DISPLAY_COST) {
        const topServices = Array.from(data.services.entries())
          .map(([service, cost]) => ({ service, cost }))
          .sort((a, b) => b.cost - a.cost)
          .slice(0, 5);

        const threshold = this.getThresholdForGroupValue(groupValue, tagName);
        groupedCosts.push({
          groupValue,
          cost: data.cost,
          previousCost: previousCosts[groupValue] || 0,
          threshold: threshold,
          isOverThreshold: data.cost > threshold,
          topServices,
          tagName,
        });
      } else if (groupValue) {
        zeroCostGroupValues.add(groupValue);
      }
    }

    return {
      groupedCosts: ArrayUtils.sortBy(groupedCosts, (a, b) => b.cost - a.cost),
      zeroCostGroupValues: Array.from(zeroCostGroupValues).sort((a, b) => a.localeCompare(b)),
    };
  }

  private processGlobalBreakdowns(
    combinedData: CostExplorerResult,
    previousGlobalData: CostExplorerResult
  ): {
    regionalBreakdown: Array<{
      region: string;
      cost: number;
      previousCost: number;
      percentage: number;
    }>;
    serviceBreakdown: Array<{
      service: string;
      cost: number;
      previousCost: number;
      percentage: number;
    }>;
    totalCost: number;
    previousTotalCost: number;
  } {
    const regionMap = new Map<string, number>();
    const serviceMap = new Map<string, number>();
    let totalCost = 0;

    const currentGroups = combinedData.ResultsByTime?.[0]?.Groups;
    if (currentGroups) {
      for (const group of currentGroups) {
        const keys = CostExplorerService.extractGroupKeys(group);
        const region = keys[0] || "Unknown";
        const service = keys[1] || "Unknown";
        const cost = CostExplorerService.extractCostValue(group);

        totalCost += cost;
        regionMap.set(region, (regionMap.get(region) || 0) + cost);
        serviceMap.set(service, (serviceMap.get(service) || 0) + cost);
      }
    }

    // Process previous data
    const prevRegionMap = new Map<string, number>();
    const prevServiceMap = new Map<string, number>();
    let previousTotalCost = 0;

    const previousGroups = previousGlobalData.ResultsByTime?.[0]?.Groups;
    if (previousGroups) {
      for (const group of previousGroups) {
        const keys = CostExplorerService.extractGroupKeys(group);
        const region = keys[0] || "Unknown";
        const service = keys[1] || "Unknown";
        const cost = CostExplorerService.extractCostValue(group);

        previousTotalCost += cost;
        prevRegionMap.set(region, (prevRegionMap.get(region) || 0) + cost);
        prevServiceMap.set(service, (prevServiceMap.get(service) || 0) + cost);
      }
    }

    const regionalBreakdown = Array.from(regionMap.entries())
      .map(([region, cost]) => ({
        region,
        cost,
        previousCost: prevRegionMap.get(region) || 0,
        percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      }))
      .filter(
        (item) =>
          item.cost >= CostAnalysisService.MIN_DISPLAY_COST ||
          item.previousCost >= CostAnalysisService.MIN_DISPLAY_COST
      )
      .sort((a, b) => b.cost - a.cost);

    const serviceBreakdown = Array.from(serviceMap.entries())
      .map(([service, cost]) => ({
        service,
        cost,
        previousCost: prevServiceMap.get(service) || 0,
        percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      }))
      .filter(
        (item) =>
          item.cost >= CostAnalysisService.MIN_DISPLAY_COST ||
          item.previousCost >= CostAnalysisService.MIN_DISPLAY_COST
      )
      .sort((a, b) => b.cost - a.cost);

    return {
      regionalBreakdown,
      serviceBreakdown,
      totalCost,
      previousTotalCost,
    };
  }

  private detectAnomalies(
    groupedCosts: CostData[],
    previousTagData: Record<string, Record<string, number>>
  ): AnomalyData[] {
    const anomalies: AnomalyData[] = [];
    const INCREASE_THRESHOLD = 0.25; // 25% increase
    const MIN_DOLLAR_DIFF = 5.0; // At least $5 difference to avoid noise

    for (const groupedCost of groupedCosts) {
      const prevCosts = previousTagData[groupedCost.tagName] || {};
      const prevCost = prevCosts[groupedCost.groupValue] || 0;

      if (prevCost > 0) {
        const diff = groupedCost.cost - prevCost;
        const percentageChange = diff / prevCost;

        if (percentageChange > INCREASE_THRESHOLD && diff > MIN_DOLLAR_DIFF) {
          anomalies.push({
            groupValue: groupedCost.groupValue,
            tagName: groupedCost.tagName,
            currentCost: groupedCost.cost,
            previousCost: prevCost,
            percentageChange: percentageChange * 100,
          });
        }
      } else if (groupedCost.cost > MIN_DOLLAR_DIFF * 2) {
        // New group value with significant cost
        anomalies.push({
          groupValue: groupedCost.groupValue,
          tagName: groupedCost.tagName,
          currentCost: groupedCost.cost,
          previousCost: 0,
          percentageChange: 100, // 100% since it's new
        });
      }
    }

    return anomalies.sort((a, b) => b.percentageChange - a.percentageChange);
  }

  private getThresholdForGroupValue(groupValue: string, tagName: string): number {
    const tagThresholds =
      this.config.cost_analysis?.group_value_thresholds ||
      this.config.cost_analysis?.project_thresholds;
    const overrides = tagThresholds?.[tagName];
    const overrideValue = overrides ? this.findMatchingThreshold(overrides, groupValue) : undefined;
    if (typeof overrideValue === "number") {
      return overrideValue;
    }
    return this.config.cost_analysis?.total_monthly_threshold ?? 20;
  }

  private findMatchingThreshold(
    overrides: Record<string, number>,
    groupValue: string
  ): number | undefined {
    if (Object.prototype.hasOwnProperty.call(overrides, groupValue)) {
      return overrides[groupValue];
    }

    const normalizedGroupValue = groupValue.toLowerCase();
    for (const key of Object.keys(overrides)) {
      if (normalizedGroupValue.includes(key.toLowerCase())) {
        return overrides[key];
      }
    }
    return undefined;
  }

  private logTagCoverageWarnings(report: CostAnalysisReport): void {
    for (const breakdown of report.tagBreakdowns) {
      if (breakdown.groupedCosts.length === 0) {
        logger.warn("Cost analysis returned no grouped tag values", {
          tagName: breakdown.tagName,
        });
        continue;
      }

      if (!breakdown.costAllocationTagEnabled) {
        logger.warn("All costs were grouped as untagged for the configured tag", {
          tagName: breakdown.tagName,
          hint: "Verify the tag key is activated as a Cost Allocation Tag in AWS Billing and that cost data has had time to refresh.",
        });
      }
    }
  }

  private isCostAllocationTagEnabled(groupedCosts: CostData[]): boolean {
    if (groupedCosts.length === 0) {
      return true;
    }

    return groupedCosts.some(
      (groupedCost) => groupedCost.groupValue.toLowerCase() !== CostAnalysisService.UNTAGGED_VALUE
    );
  }

  private buildCostAllocationTagWarning(tagName: string): string {
    return `Cost Allocation Tag may not be enabled for tag ${tagName}. AWS Cost Explorer returned only ${CostAnalysisService.UNTAGGED_VALUE} costs for this grouping.`;
  }
}
