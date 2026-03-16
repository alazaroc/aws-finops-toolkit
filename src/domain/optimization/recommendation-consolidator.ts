import { logger } from "../../core/logger";
import { ArrayUtils } from "../../core/array-utils";

export interface ConsolidatedRecommendation {
  id: string;
  source: string; // 'COH', 'TA', 'CO'
  actionType: string;
  resourceId: string;
  resourceType: string;
  region?: string;
  currentConfiguration: object;
  recommendedConfiguration: object;
  estimatedMonthlySavings: number;
  implementationEffort: string; // 'low', 'medium', 'high'
  priority: string; // 'high', 'medium', 'low'
  roi: number;
  consoleLink: string;
  description: string;
}

/**
 * Recommendation Consolidator
 * Consolidates and prioritizes recommendations from multiple AWS services
 */
export class RecommendationConsolidator {
  /**
   * Consolidate recommendations from multiple sources
   * Removes duplicates and normalizes data
   */
  consolidateRecommendations(
    cohRecommendations: ConsolidatedRecommendation[],
    taRecommendations: ConsolidatedRecommendation[],
    coRecommendations: ConsolidatedRecommendation[]
  ): ConsolidatedRecommendation[] {
    // Combine all recommendations
    const allRecommendations = [...cohRecommendations, ...taRecommendations, ...coRecommendations];

    // Remove duplicates by resourceId, keeping the best recommendation
    const consolidated = this.removeDuplicates(allRecommendations);

    // Normalize all recommendations
    const normalized = consolidated.map((rec) => this.normalizeRecommendation(rec));

    // Filter out invalid recommendations
    const valid = normalized.filter((rec) => rec && rec.estimatedMonthlySavings > 0);

    return valid;
  }

  /**
   * Remove duplicate recommendations, keeping the best one for each resource
   */
  private removeDuplicates(
    recommendations: ConsolidatedRecommendation[]
  ): ConsolidatedRecommendation[] {
    const resourceMap = new Map<string, ConsolidatedRecommendation>();

    for (const recommendation of recommendations) {
      const key = recommendation.resourceId;
      const existing = resourceMap.get(key);

      if (!existing) {
        resourceMap.set(key, recommendation);
      } else {
        const shouldReplace = this.shouldReplaceRecommendation(existing, recommendation);
        if (shouldReplace) {
          resourceMap.set(key, recommendation);
        }
      }
    }

    return Array.from(resourceMap.values());
  }

  /**
   * Determine if a new recommendation should replace an existing one
   */
  private shouldReplaceRecommendation(
    existing: ConsolidatedRecommendation,
    candidate: ConsolidatedRecommendation
  ): boolean {
    // Source priority: COH > CO > TA
    const sourcePriority = { COH: 3, CO: 2, TA: 1 };

    const existingPriority = sourcePriority[existing.source as keyof typeof sourcePriority] || 0;
    const candidatePriority = sourcePriority[candidate.source as keyof typeof sourcePriority] || 0;

    // Higher source priority wins
    if (candidatePriority > existingPriority) {
      return true;
    }

    // Same priority - higher savings wins
    if (
      candidatePriority === existingPriority &&
      candidate.estimatedMonthlySavings > existing.estimatedMonthlySavings
    ) {
      return true;
    }

    return false;
  }

  /**
   * Normalize recommendation data to ensure consistency
   */
  private normalizeRecommendation(
    recommendation: ConsolidatedRecommendation
  ): ConsolidatedRecommendation {
    const normalized = { ...recommendation };

    // Ensure actionType is present
    if (!normalized.actionType) {
      normalized.actionType = "Optimize";
    }

    // Ensure savings is positive
    normalized.estimatedMonthlySavings = Math.max(0, normalized.estimatedMonthlySavings || 0);

    // Validate and normalize priority
    normalized.priority = this.validatePriority(normalized.priority);

    // Validate and normalize implementation effort
    normalized.implementationEffort = this.validateImplementationEffort(
      normalized.implementationEffort
    );

    // Recalculate ROI for consistency
    normalized.roi = this.calculateROI(normalized.estimatedMonthlySavings, normalized.actionType);

    return normalized;
  }

  /**
   * Prioritize recommendations by impact and ROI
   */
  prioritizeRecommendations(
    recommendations: ConsolidatedRecommendation[]
  ): ConsolidatedRecommendation[] {
    if (recommendations.length === 0) {
      return [];
    }

    // Enhance recommendations with calculated metrics
    const enhanced = recommendations.map((rec) => {
      const enhanced = { ...rec };
      enhanced.priority = this.calculatePriorityByImpact(enhanced.estimatedMonthlySavings);
      enhanced.roi = this.calculateEnhancedROI(enhanced);
      return enhanced;
    });

    // Sort by priority, then ROI, then savings
    const prioritized = ArrayUtils.sortBy(
      enhanced,
      // Primary: Priority (high > medium > low)
      (a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return (
          priorityOrder[b.priority as keyof typeof priorityOrder] -
          priorityOrder[a.priority as keyof typeof priorityOrder]
        );
      },
      // Secondary: ROI (higher is better)
      (a, b) => b.roi - a.roi,
      // Tertiary: Savings (higher is better)
      (a, b) => b.estimatedMonthlySavings - a.estimatedMonthlySavings
    );

    return prioritized;
  }

  /**
   * Calculate priority based on monthly savings impact
   */
  private calculatePriorityByImpact(savings: number): string {
    if (savings >= 100) {
      return "high";
    }
    if (savings >= 20) {
      return "medium";
    }
    return "low";
  }

  /**
   * Calculate enhanced ROI considering multiple factors
   */
  private calculateEnhancedROI(recommendation: ConsolidatedRecommendation): number {
    const savings = recommendation.estimatedMonthlySavings;

    // Implementation effort multipliers
    const effortMultipliers = {
      low: 1.0,
      medium: 0.7,
      high: 0.4,
    };

    // Action type multipliers
    const actionTypeLower = recommendation.actionType.toLowerCase();
    let typeMultiplier = 1.0;

    if (actionTypeLower.includes("optimize") || actionTypeLower.includes("configuration")) {
      typeMultiplier = 1.2; // Quick wins
    } else if (actionTypeLower.includes("purchase") || actionTypeLower.includes("reserved")) {
      typeMultiplier = 0.8; // Requires commitment
    }

    const effortMultiplier =
      effortMultipliers[recommendation.implementationEffort as keyof typeof effortMultipliers] ||
      0.7;
    const annualSavings = savings * 12;
    const roi = annualSavings * effortMultiplier * typeMultiplier;

    return Math.round(roi * 100) / 100;
  }

  /**
   * Validate and normalize priority value
   */
  private validatePriority(priority: string): string {
    const validPriorities = ["high", "medium", "low"];
    const normalized = priority?.toLowerCase();

    return validPriorities.includes(normalized) ? normalized : "medium";
  }

  /**
   * Validate and normalize implementation effort value
   */
  private validateImplementationEffort(effort: string): string {
    const validEfforts = ["low", "medium", "high"];
    const normalized = effort?.toLowerCase();

    return validEfforts.includes(normalized) ? normalized : "medium";
  }

  /**
   * Calculate ROI based on savings and action type
   */
  private calculateROI(savings: number, actionType: string): number {
    const annualSavings = savings * 12;

    // Simple ROI calculation based on action type complexity
    const actionTypeLower = actionType.toLowerCase();
    let effortMultiplier = 2; // Default medium effort

    if (actionTypeLower.includes("optimize") || actionTypeLower.includes("configuration")) {
      effortMultiplier = 1; // Low effort
    } else if (actionTypeLower.includes("rightsize") || actionTypeLower.includes("purchase")) {
      effortMultiplier = 3; // High effort
    }

    return annualSavings / effortMultiplier;
  }

  /**
   * Log prioritization summary
   */
  private logPrioritizationSummary(recommendations: ConsolidatedRecommendation[]): void {
    const summary = {
      total: recommendations.length,
      byPriority: ArrayUtils.groupByProperty(recommendations, "priority"),
      bySource: ArrayUtils.groupByProperty(recommendations, "source"),
      totalSavings: ArrayUtils.sumBy(recommendations, (r) => r.estimatedMonthlySavings),
      topOpportunity: ArrayUtils.maxBy(recommendations, (r) => r.estimatedMonthlySavings),
    };

    logger.info("Prioritization summary", {
      total: summary.total,
      priorities: Object.keys(summary.byPriority).reduce(
        (acc, key) => {
          acc[key] = summary.byPriority[key].length;
          return acc;
        },
        {} as Record<string, number>
      ),
      sources: Object.keys(summary.bySource).reduce(
        (acc, key) => {
          acc[key] = summary.bySource[key].length;
          return acc;
        },
        {} as Record<string, number>
      ),
      totalMonthlySavings: summary.totalSavings.toFixed(2),
      annualSavingsPotential: (summary.totalSavings * 12).toFixed(2),
      topOpportunity: summary.topOpportunity
        ? {
            id: summary.topOpportunity.id,
            actionType: summary.topOpportunity.actionType,
            savings: summary.topOpportunity.estimatedMonthlySavings.toFixed(2),
          }
        : null,
    });
  }
}
