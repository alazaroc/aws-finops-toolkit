/**
 * Simplified configuration loader
 * Priority: Environment variables > config/config.yml > defaults
 */

import { SimpleFinOpsConfig } from "../types/finops-config";
import { AccountClient, GetAccountInformationCommand } from "@aws-sdk/client-account";
import { IAMClient, ListAccountAliasesCommand } from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import { logger } from "./logger";

interface ConfigYaml {
  email_config?: {
    from?: string;
    to?: string[];
    display_name?: string;
  };
  cost_analysis?: {
    group_by_tag?: string;
    total_monthly_threshold?: number;
    group_value_thresholds?: Record<string, Record<string, number>>;
    project_thresholds?: Record<string, Record<string, number>>;
  };
  projects?: Record<
    string,
    {
      tags?: Record<string, string>;
      thresholds?: Record<string, number>;
      budget?: {
        amount?: number;
        alerts?: number[];
      };
    }
  >;
  required_tags?: string[];
  schedules?: {
    cost_analysis?: "monthly" | "weekly" | "daily";
    compliance_check?: "weekly" | "daily";
  };
  regions?: string[];
}

export interface SimpleEnvLoadOptions {
  requireEmailConfig?: boolean;
  loadAccountAlias?: boolean;
}

export class SimpleEnvLoader {
  /**
   * Get current AWS account ID dynamically
   */
  static async getCurrentAccountId(): Promise<string> {
    try {
      const stsClient = new STSClient({ region: process.env.AWS_REGION || "us-east-1" });
      const command = new GetCallerIdentityCommand({});
      const response = await (stsClient as any).send(command);
      return response.Account!;
    } catch (error) {
      logger.error("Error getting account ID:", error as Error);
      // Fallback to environment variable if STS fails
      const envAccountId = process.env.ACCOUNT_ID;
      if (envAccountId) {
        logger.warn("Using account ID from environment variable");
        return envAccountId;
      }
      throw new Error("Could not determine AWS account ID");
    }
  }

  /**
   * Get AWS account name
   */
  static async getAccountName(accountId?: string): Promise<string | undefined> {
    const envAlias =
      process.env.AWS_ACCOUNT_ALIAS?.trim() || process.env.ACCOUNT_ALIAS?.trim() || undefined;
    if (envAlias) {
      return envAlias;
    }

    // Prefer IAM account alias (most common + least permissions).
    try {
      const iamClient = new IAMClient({ region: process.env.AWS_REGION || "us-east-1" });
      const response = await (iamClient as any).send(new ListAccountAliasesCommand({}));
      const alias = response.AccountAliases?.find((a: string) => a && a.trim())?.trim();
      if (alias) {
        return alias;
      }
    } catch (error) {
      if (this.isAccessDeniedError(error)) {
        logger.warn(
          "Missing permission to list account aliases (iam:ListAccountAliases)",
          error as Error
        );
      }
      logger.warn("Could not load account alias from IAM", {
        error: error instanceof Error ? error : String(error),
      });
    }

    // Fallback: Account Management API (requires extra permissions).
    // We try this automatically because templates already include account:GetAccountInformation.
    try {
      const accountClient = new AccountClient({ region: process.env.AWS_REGION || "us-east-1" });
      const command = new GetAccountInformationCommand({});
      const response = await (accountClient as any).send(command);
      const accountName = response.AccountName?.trim();
      if (accountName) {
        return accountName;
      }
    } catch (error) {
      if (this.isAccessDeniedError(error)) {
        logger.warn(
          "Missing permission to get account information (account:GetAccountInformation)",
          error as Error
        );
      }
      logger.warn("Could not load account name from Account Management", {
        error: error instanceof Error ? error : String(error),
        accountId,
      });
    }

    return undefined;
  }

  private static isAccessDeniedError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }
    const err = error as { name?: string; message?: string; Code?: string; code?: string };
    const text = `${err.name || ""} ${err.code || ""} ${err.Code || ""} ${err.message || ""}`;
    return /accessdenied|unauthorized|not authorized|forbidden/i.test(text);
  }

  /**
   * Load configuration from config/config.yml file
   */
  static loadFromConfigFile(): ConfigYaml | null {
    try {
      // Try config/config.yml first
      const configPath = path.join(process.cwd(), "config", "config.yml");

      // If running in Lambda, try relative to /var/task
      const lambdaConfigPath = path.join("/var/task", "config", "config.yml");

      let configContent: string | null = null;

      if (fs.existsSync(configPath)) {
        configContent = fs.readFileSync(configPath, "utf-8");
      } else if (fs.existsSync(lambdaConfigPath)) {
        configContent = fs.readFileSync(lambdaConfigPath, "utf-8");
      } else {
        // Try root config.yml as fallback
        const rootConfigPath = path.join(process.cwd(), "config.yml");
        if (fs.existsSync(rootConfigPath)) {
          configContent = fs.readFileSync(rootConfigPath, "utf-8");
        }
      }

      if (!configContent) {
        return null;
      }

      const parsed = YAML.parse(configContent) as ConfigYaml;
      return parsed;
    } catch (error) {
      logger.warn("⚠️ Could not load config.yml", {
        error: error instanceof Error ? error : String(error),
      });
      return null;
    }
  }

  /**
   * Load simplified configuration
   * Priority: Environment variables > config/config.yml > defaults
   */
  static async loadFromEnv(options?: SimpleEnvLoadOptions): Promise<SimpleFinOpsConfig> {
    const requireEmailConfig = options?.requireEmailConfig ?? true;
    const loadAccountAlias = options?.loadAccountAlias ?? true;

    const accountId = await this.getCurrentAccountId();

    // Try to load from config file if env vars are not set
    const configFile = this.loadFromConfigFile();
    const accountAlias = loadAccountAlias ? await this.getAccountName(accountId) : undefined;

    // Email configuration - require new format
    type RawEmailConfig = {
      from?: string;
      to?: string[];
      display_name?: string;
    };
    let emailConfig: RawEmailConfig | undefined;

    // Check for new format first (FROM_EMAIL and TO_EMAILS env vars)
    const fromEmailEnv = process.env.FROM_EMAIL;
    const toEmailsEnv = process.env.TO_EMAILS;
    const displayNameEnv =
      process.env.EMAIL_DISPLAY_NAME?.trim() || process.env.EMAIL_SENDER_NAME?.trim();

    if (fromEmailEnv && toEmailsEnv) {
      // New format from environment variables
      emailConfig = {
        from: fromEmailEnv,
        to: toEmailsEnv
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean),
        display_name: displayNameEnv,
      };
    } else if (configFile?.email_config) {
      // New format from config file
      const configFrom = String(configFile.email_config.from || "").trim();
      const configTo = (configFile.email_config.to || [])
        .map((e) => String(e).trim())
        .filter(Boolean);
      const fallbackTo = configFrom ? [configFrom] : [];
      emailConfig = {
        from: configFrom || undefined,
        to: configTo.length > 0 ? configTo : fallbackTo,
        display_name:
          displayNameEnv ||
          configFile.email_config.display_name ||
          (configFile.email_config as any).displayName,
      };
    } else if (requireEmailConfig) {
      throw new Error(
        "Missing required email configuration: FROM_EMAIL/TO_EMAILS environment variables or email_config in config/config.yml"
      );
    }

    if (emailConfig) {
      const normalizedFrom = String(emailConfig.from || "").trim();
      const normalizedTo = (emailConfig.to || [])
        .map((email) => String(email).trim())
        .filter(Boolean);

      const normalizedDisplayName =
        (emailConfig.display_name && String(emailConfig.display_name).trim()) ||
        "aws-finops-toolkit";

      if (!normalizedFrom || normalizedTo.length === 0) {
        if (requireEmailConfig) {
          if (!normalizedFrom) {
            throw new Error("Missing required email configuration: email_config.from");
          }
          throw new Error("Missing required email configuration: email_config.to");
        }

        logger.warn("Email configuration is incomplete; disabling email features for this run", {
          fromConfigured: Boolean(normalizedFrom),
          toConfigured: normalizedTo.length > 0,
        });
        emailConfig = undefined;
      } else {
        emailConfig = {
          from: normalizedFrom,
          to: normalizedTo,
          display_name: normalizedDisplayName,
        };
      }
    }

    const configuredRequiredTags = configFile?.required_tags?.filter(Boolean) || [];

    // Get group_by_tag: env > config file > first required tag > default
    const groupByTagEnv =
      process.env.GROUP_BY_TAG ||
      configFile?.cost_analysis?.group_by_tag ||
      configuredRequiredTags[0] ||
      "project";
    const groupByTag = groupByTagEnv.includes(",")
      ? groupByTagEnv.split(",").map((t) => t.trim())
      : groupByTagEnv;

    // Get total_threshold: env > config file > default
    const totalThreshold = process.env.TOTAL_THRESHOLD
      ? parseFloat(process.env.TOTAL_THRESHOLD)
      : (configFile?.cost_analysis?.total_monthly_threshold ?? 20.0);

    const normalizeThresholds = (
      value: any
    ): Record<string, Record<string, number>> | undefined => {
      if (!value || typeof value !== "object") {
        return undefined;
      }

      const result: Record<string, Record<string, number>> = {};
      for (const [tag, projects] of Object.entries(value)) {
        if (!projects || typeof projects !== "object") {
          continue;
        }
        const normalizedProjects: Record<string, number> = {};
        for (const [project, thresholdValue] of Object.entries(projects)) {
          const parsed =
            typeof thresholdValue === "number"
              ? thresholdValue
              : parseFloat(String(thresholdValue));
          if (Number.isFinite(parsed)) {
            normalizedProjects[project] = parsed;
          }
        }
        if (Object.keys(normalizedProjects).length > 0) {
          result[tag] = normalizedProjects;
        }
      }

      return Object.keys(result).length > 0 ? result : undefined;
    };

    const thresholdsFromProjects = (
      projects: ConfigYaml["projects"]
    ): Record<string, Record<string, number>> | undefined => {
      if (!projects || typeof projects !== "object") {
        return undefined;
      }

      const result: Record<string, Record<string, number>> = {};
      for (const [projectName, definition] of Object.entries(projects)) {
        const thresholds = definition?.thresholds;
        if (!thresholds || typeof thresholds !== "object") {
          continue;
        }

        for (const [tagName, thresholdValue] of Object.entries(thresholds)) {
          const tagValue =
            definition?.tags?.[tagName] || (tagName === "project" ? projectName : undefined);
          if (!tagValue) {
            continue;
          }

          const parsed =
            typeof thresholdValue === "number"
              ? thresholdValue
              : parseFloat(String(thresholdValue));
          if (!Number.isFinite(parsed)) {
            continue;
          }

          if (!result[tagName]) {
            result[tagName] = {};
          }
          result[tagName][tagValue] = parsed;
        }
      }

      return Object.keys(result).length > 0 ? result : undefined;
    };

    let groupValueThresholds: Record<string, Record<string, number>> | undefined;
    if (process.env.PROJECT_THRESHOLDS) {
      try {
        const parsed = JSON.parse(process.env.PROJECT_THRESHOLDS);
        groupValueThresholds = normalizeThresholds(parsed);
      } catch (error) {
        logger.warn("Could not parse PROJECT_THRESHOLDS env var", {
          error: error instanceof Error ? error : String(error),
        });
      }
    }

    if (!groupValueThresholds) {
      groupValueThresholds = normalizeThresholds(configFile?.cost_analysis?.group_value_thresholds);
    }

    if (!groupValueThresholds) {
      groupValueThresholds = normalizeThresholds(configFile?.cost_analysis?.project_thresholds);
    }

    if (!groupValueThresholds) {
      groupValueThresholds = thresholdsFromProjects(configFile?.projects);
    }

    const regionsEnv = process.env.REGIONS;
    const regionsEnvNormalized = regionsEnv ? regionsEnv.trim() : "";
    const regions =
      regionsEnv !== undefined
        ? (() => {
            if (
              !regionsEnvNormalized ||
              regionsEnvNormalized === "ALL" ||
              regionsEnvNormalized === "*"
            ) {
              return undefined;
            }
            const parsed = regionsEnv
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean);
            return parsed.length > 0 ? parsed : undefined;
          })()
        : configFile?.regions;

    // Get required_tags: env > config file > default
    const requiredTags = process.env.REQUIRED_TAGS
      ? process.env.REQUIRED_TAGS.split(",").map((t) => t.trim())
      : configFile?.required_tags || [];

    // Get schedules: env > config file > default
    const costScheduleFromConfig =
      typeof configFile?.schedules?.cost_analysis === "string"
        ? configFile.schedules.cost_analysis
        : undefined;
    const complianceScheduleFromConfig =
      typeof configFile?.schedules?.compliance_check === "string"
        ? configFile.schedules.compliance_check
        : undefined;

    const costSchedule =
      (process.env.COST_SCHEDULE as "monthly" | "weekly" | "daily") ||
      costScheduleFromConfig ||
      "monthly";
    const complianceSchedule =
      (process.env.COMPLIANCE_SCHEDULE as "weekly" | "daily") ||
      complianceScheduleFromConfig ||
      "weekly";

    const normalizedEmailConfig = emailConfig
      ? {
          from: String(emailConfig.from),
          to: Array.isArray(emailConfig.to) ? emailConfig.to : [],
          display_name: emailConfig.display_name,
        }
      : undefined;

    const config: SimpleFinOpsConfig = {
      account_id: accountId,
      account_alias: accountAlias,
      email_config: normalizedEmailConfig,
      cost_analysis: {
        group_by_tag: groupByTag,
        total_monthly_threshold: totalThreshold,
        group_value_thresholds: groupValueThresholds,
        project_thresholds: groupValueThresholds,
      },
      required_tags: requiredTags,
      schedules: {
        cost_analysis: costSchedule,
        compliance_check: complianceSchedule,
      },
      regions,
    };

    // Configuration loaded successfully
    return config;
  }
}
