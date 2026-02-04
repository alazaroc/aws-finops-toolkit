/**
 * Simplified configuration types
 */

interface EmailConfig {
  from: string;
  to: string[];
  display_name?: string;
}

interface CostAnalysisConfig {
  group_by_tag: string | string[]; // Support single tag or multiple tags
  total_monthly_threshold: number;
  project_thresholds?: Record<string, Record<string, number>>;
  exclude_services?: string[];
  include_services?: string[];
  exclude_accounts?: string[];
  include_accounts?: string[];
}

interface ComplianceConfig {
  required_tags?: string[];
  include_regions?: string[];
  exclude_regions?: string[];
}

interface TagInventoryConfig {
  required_tags?: string[];
  include_regions?: string[];
  exclude_regions?: string[];
}

interface ScheduleConfig {
  cost_analysis: "monthly" | "weekly" | "daily";
  compliance_check: "weekly" | "daily";
}

export interface SimpleFinOpsConfig {
  account_id: string;
  account_alias?: string;
  email_config?: EmailConfig;
  cost_analysis: CostAnalysisConfig;
  required_tags: string[];
  schedules: ScheduleConfig;
  regions?: string[];
  compliance?: ComplianceConfig;
  tag_inventory?: TagInventoryConfig;
}
