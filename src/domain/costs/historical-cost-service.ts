import { logger } from "../../core/logger";
import { ArrayUtils } from "../../core/array-utils";
import { SimpleFinOpsConfig } from "../../types/finops-config";
import { BaseCostService } from "./base-cost-service";
import { CostExplorerGroup, CostExplorerResult, CostExplorerService } from "./cost-explorer-client";

export type HistoricalCostOutputFormat = "json" | "html";

export interface HistoricalCostRequest {
  monthsBack?: number; // 0 = current month, 1 = last month, etc.
  periodLength?: number; // 1 = single month, 3 = quarterly, 12 = yearly
  groupBy?: string; // tag to group by
  outputFormat?: HistoricalCostOutputFormat; // API Gateway only (default: json)
  includeHtml?: boolean; // direct invocation only (default: false)
}

export interface MonthlyCostData {
  month: string;
  totalCost: number;
  groupBreakdown: Record<string, number>;
  serviceBreakdown: Record<string, number>;
}

export interface HistoricalCostReport {
  reportDate: Date;
  accountId: string;
  accountAlias?: string;
  groupByTag: string;
  period: {
    startDate: string;
    endDate: string;
    monthsAnalyzed: number;
  };
  monthlyCosts: MonthlyCostData[];
  groupedMonthlyCosts: Array<{
    groupValue: string;
    monthlyCosts: Record<string, number>;
    totalCost: number;
  }>;
  serviceMonthlyCosts: Array<{
    service: string;
    monthlyCosts: Record<string, number>;
    totalCost: number;
  }>;
  regionMonthlyCosts: Array<{
    region: string;
    monthlyCosts: Record<string, number>;
    totalCost: number;
  }>;
  totalCost: number;
  averageMonthlyCost: number;
  trends: {
    monthOverMonth: number;
    quarterOverQuarter?: number;
  };
  topGroupValues: Array<{ groupValue: string; cost: number; percentage: number }>;
  topServices: Array<{ service: string; cost: number; percentage: number }>;
}

export class HistoricalCostService extends BaseCostService {
  constructor(config: SimpleFinOpsConfig) {
    super(config);
  }

  /**
   * Analyze historical costs
   */
  async analyzeHistoricalCosts(request: HistoricalCostRequest): Promise<HistoricalCostReport> {
    try {
      const { startDate, endDate } = this.calculateDateRange(request);
      const groupByTag = request.groupBy || this.getDefaultGroupByTag();

      // Fetch historical cost data
      const costData = await this.fetchHistoricalCostData(startDate, endDate, groupByTag);

      // Process data into report
      const report = this.processHistoricalData(costData, startDate, endDate, groupByTag);

      return report;
    } catch (error) {
      logger.error("Historical cost analysis service failed", error as Error);
      throw error;
    }
  }

  /**
   * Calculate date range for analysis
   */
  private calculateDateRange(request: HistoricalCostRequest): { startDate: Date; endDate: Date } {
    const monthsBack = request.monthsBack || 0;
    const periodLength = request.periodLength || 6;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    // End date is 1st of (current month - monthsBack)
    // Use Date.UTC to ensure "YYYY-MM-01" exactly
    const endDate = new Date(Date.UTC(year, month - monthsBack, 1));

    // Start date is periodLength months before endDate
    const startDate = new Date(
      Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - periodLength + 1, 1)
    );

    // If monthsBack is 0 (current month), we typically want to see month-to-date data.
    // However, for historical analysis, full months are better.
    // Logic here assumes we are looking at *completed* months or *start of months*.

    return { startDate, endDate };
  }

  /**
   * Get default group by tag from configuration
   */
  private getDefaultGroupByTag(): string {
    const groupByTag = this.config.cost_analysis?.group_by_tag;
    if (Array.isArray(groupByTag)) {
      return groupByTag[0] || "project";
    }
    return groupByTag || "project";
  }

  /**
   * Fetch historical cost data using CostExplorerService
   */
  private async fetchHistoricalCostData(
    startDate: Date,
    endDate: Date,
    groupByTag: string
  ): Promise<{ byTag: CostExplorerResult; combined: CostExplorerResult }> {
    const filter = this.getCommonFilters();

    // Fetch data by tag (for grouped breakdown) and combined region+service (for everything else)
    const [tagData, combinedData] = await Promise.all([
      this.costExplorer.getCostsByDimension("TAG", groupByTag, startDate, endDate, filter),
      this.costExplorer.getCombinedRegionAndServiceBreakdown(startDate, endDate, filter),
    ]);

    return {
      byTag: tagData,
      combined: combinedData,
    };
  }

  /**
   * Process historical data into report format
   */
  private processHistoricalData(
    costData: { byTag: CostExplorerResult; combined: CostExplorerResult },
    startDate: Date,
    endDate: Date,
    groupByTag: string
  ): HistoricalCostReport {
    // Process combined data (calculates monthly totals, service stats, and region stats)
    // We pass undefined for months initially to let the data dictate the months found
    const { monthlyCosts, serviceMonthlyCosts, regionMonthlyCosts } = this.processCombinedData(
      costData.combined,
      []
    );

    const months = monthlyCosts.map((m) => m.month);

    const groupedMonthlyCosts = this.processMonthlyCostGroups(costData.byTag, months, (group) =>
      CostExplorerService.normalizeTagValue(CostExplorerService.extractGroupKeys(group)[0])
    ).map(({ key, monthlyCosts, totalCost }) => ({ groupValue: key, monthlyCosts, totalCost }));

    // Calculate totals and averages
    const totalCost = ArrayUtils.sumBy(monthlyCosts, (m) => m.totalCost);
    const averageMonthlyCost = monthlyCosts.length > 0 ? totalCost / monthlyCosts.length : 0;

    // Calculate trends
    const trends = this.calculateTrends(monthlyCosts);

    // Get top grouped values and services
    const topGroupValues = this.getTopGroupValues(groupedMonthlyCosts, totalCost);
    const topServices = this.getTopServices(serviceMonthlyCosts, totalCost);

    return {
      reportDate: new Date(),
      accountId: this.getAccountId(),
      accountAlias: this.config.account_alias,
      groupByTag,
      period: {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        monthsAnalyzed: monthlyCosts.length,
      },
      monthlyCosts,
      groupedMonthlyCosts,
      serviceMonthlyCosts,
      regionMonthlyCosts,
      totalCost,
      averageMonthlyCost,
      trends,
      topGroupValues,
      topServices,
    };
  }

  /**
   * Process combined Region+Service data to extract Monthly totals, Region stats, and Service stats.
   * This allows us to use 1 API call instead of 3.
   */
  private processCombinedData(
    combinedData: CostExplorerResult,
    months: string[]
  ): {
    monthlyCosts: MonthlyCostData[];
    serviceMonthlyCosts: Array<{
      service: string;
      monthlyCosts: Record<string, number>;
      totalCost: number;
    }>;
    regionMonthlyCosts: Array<{
      region: string;
      monthlyCosts: Record<string, number>;
      totalCost: number;
    }>;
  } {
    const monthlyTotalMap = new Map<string, number>();
    const serviceMap = new Map<string, Record<string, number>>();
    const regionMap = new Map<string, Record<string, number>>();
    const uniqueMonths = new Set<string>();

    if (combinedData?.ResultsByTime) {
      for (const timeResult of combinedData.ResultsByTime) {
        const month = timeResult.TimePeriod?.Start;
        if (!month) {
          continue;
        }
        uniqueMonths.add(month);

        const groups = timeResult.Groups || [];
        let monthTotal = 0;

        for (const group of groups) {
          const keys = CostExplorerService.extractGroupKeys(group);
          const region = keys[0] || "Unknown";
          const service = keys[1] || "Unknown";
          const cost = CostExplorerService.extractCostValue(group);

          monthTotal += cost;

          // Aggregations
          if (!serviceMap.has(service)) {
            serviceMap.set(service, {});
          }
          const sEntry = serviceMap.get(service)!;
          sEntry[month] = (sEntry[month] || 0) + cost;

          if (!regionMap.has(region)) {
            regionMap.set(region, {});
          }
          const rEntry = regionMap.get(region)!;
          rEntry[month] = (rEntry[month] || 0) + cost;
        }

        monthlyTotalMap.set(month, monthTotal);
      }
    }

    // Sort months strictly
    const sortedMonths = Array.from(uniqueMonths).sort();
    const finalMonths = months && months.length > 0 ? months : sortedMonths;

    // Build MonthlyCostData[]
    const monthlyCosts: MonthlyCostData[] = finalMonths.map((month) => ({
      month,
      totalCost: monthlyTotalMap.get(month) || 0,
      groupBreakdown: {}, // Not populated here
      serviceBreakdown: {}, // Not populated here
    }));

    // Helper to format map to array
    const formatMap = (map: Map<string, Record<string, number>>, keyName: string) => {
      const result = [];
      for (const [key, costs] of map.entries()) {
        let hasSignificantCost = false;
        let totalCost = 0;

        for (const month of finalMonths) {
          costs[month] = costs[month] || 0;
          totalCost += costs[month];
          if (Math.abs(costs[month]) >= 0.01) {
            hasSignificantCost = true;
          }
        }

        if (hasSignificantCost) {
          result.push({ [keyName]: key, monthlyCosts: costs, totalCost } as any);
        }
      }
      return ArrayUtils.sortBy(result, (a: any, b: any) => b.totalCost - a.totalCost);
    };

    return {
      monthlyCosts,
      serviceMonthlyCosts: formatMap(serviceMap, "service"),
      regionMonthlyCosts: formatMap(regionMap, "region"),
    };
  }

  /**
   * Calculate cost trends
   */
  private calculateTrends(monthlyCosts: MonthlyCostData[]): {
    monthOverMonth: number;
    quarterOverQuarter?: number;
  } {
    if (monthlyCosts.length < 2) {
      return { monthOverMonth: 0 };
    }

    // Calculate month-over-month change
    const lastMonth = monthlyCosts[monthlyCosts.length - 1];
    const previousMonth = monthlyCosts[monthlyCosts.length - 2];

    const monthOverMonth =
      previousMonth.totalCost > 0
        ? ((lastMonth.totalCost - previousMonth.totalCost) / previousMonth.totalCost) * 100
        : 0;

    // Calculate quarter-over-quarter if we have enough data
    let quarterOverQuarter: number | undefined;
    if (monthlyCosts.length >= 6) {
      const lastQuarter = monthlyCosts.slice(-3).reduce((sum, m) => sum + m.totalCost, 0);
      const previousQuarter = monthlyCosts.slice(-6, -3).reduce((sum, m) => sum + m.totalCost, 0);

      quarterOverQuarter =
        previousQuarter > 0 ? ((lastQuarter - previousQuarter) / previousQuarter) * 100 : 0;
    }

    return {
      monthOverMonth,
      quarterOverQuarter,
    };
  }

  /**
   * Build a normalized monthly breakdown per key from Cost Explorer ResultsByTime.
   */
  private processMonthlyCostGroups(
    data: CostExplorerResult,
    months: string[],
    getKey: (group: CostExplorerGroup) => string
  ): Array<{ key: string; monthlyCosts: Record<string, number>; totalCost: number }> {
    const map = new Map<string, Record<string, number>>();

    if (!data?.ResultsByTime) {
      return [];
    }

    for (const timeResult of data.ResultsByTime) {
      const month = timeResult.TimePeriod?.Start;
      if (!month) {
        continue;
      }
      const groups = timeResult.Groups || [];
      for (const group of groups) {
        const key = getKey(group) || "Unknown";
        const cost = CostExplorerService.extractCostValue(group);
        const existing = map.get(key) || {};
        existing[month] = (existing[month] || 0) + cost;
        map.set(key, existing);
      }
    }

    const result: Array<{ key: string; monthlyCosts: Record<string, number>; totalCost: number }> =
      [];
    for (const [key, monthlyCosts] of map.entries()) {
      let hasSignificantCost = false;
      let totalCost = 0;
      for (const month of months) {
        monthlyCosts[month] = monthlyCosts[month] || 0;
        totalCost += monthlyCosts[month];
        if (monthlyCosts[month] >= 0.01) {
          hasSignificantCost = true;
        }
      }

      if (hasSignificantCost) {
        result.push({ key, monthlyCosts, totalCost });
      }
    }

    return ArrayUtils.sortBy(result, (a, b) => b.totalCost - a.totalCost);
  }

  private getTopGroupValues(
    groupedCosts: Array<{ groupValue: string; cost?: number; totalCost: number }>,
    totalCost: number
  ): Array<{ groupValue: string; cost: number; percentage: number }> {
    return groupedCosts.slice(0, 10).map((groupedCost) => ({
      groupValue: groupedCost.groupValue,
      cost: groupedCost.totalCost,
      percentage: totalCost > 0 ? (groupedCost.totalCost / totalCost) * 100 : 0,
    }));
  }

  private getTopServices(
    services: Array<{ service: string; totalCost: number }>,
    totalCost: number
  ): Array<{ service: string; cost: number; percentage: number }> {
    return services.slice(0, 10).map((s) => ({
      service: s.service,
      cost: s.totalCost,
      percentage: totalCost > 0 ? (s.totalCost / totalCost) * 100 : 0,
    }));
  }
}
