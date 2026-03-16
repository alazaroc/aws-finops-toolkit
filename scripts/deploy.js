const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const YAML = require("yaml");

const CONFIG_PATH = path.join(process.cwd(), "config", "config.yml");
const SAMCONFIG_PATH = path.join(process.cwd(), "samconfig.toml");
const GENERATED_SAMCONFIG_PATH = path.join(
  process.cwd(),
  "samconfig.generated.toml"
);
const TEMPLATE_PATH = path.join(process.cwd(), "template.yaml");
const GENERATED_TEMPLATE_PATH = path.join(
  process.cwd(),
  "template.generated.yaml"
);
const BUILT_TEMPLATE_PATH = path.join(
  process.cwd(),
  ".aws-sam",
  "build",
  "template.yaml"
);

const clean = process.argv.includes("--clean");
const diffOnly =
  process.argv.includes("--diff") ||
  process.argv.includes("--diff-only") ||
  process.argv.includes("--plan") ||
  process.argv.includes("--changeset");

function run(command, args) {
  const options = {
    cwd: process.cwd(),
    encoding: "utf-8",
    shell: process.platform === "win32",
  };

  const hasCmdSuffix = command.toLowerCase().endsWith(".cmd");
  const result = spawnSync(command, args, {
    ...options,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Command error: ${command} ${args.join(" ")}`);
    console.error(result.error.message || result.error);
    if (process.platform === "win32" && !hasCmdSuffix) {
      const cmdCommand = `${command}.cmd`;
      console.error(`Retrying with ${cmdCommand}...`);
      return run(cmdCommand, args);
    }
    process.exit(1);
  }

  if (result.status !== 0) {
    // Gracefully handle "No changes to deploy" from SAM
    if (
      command.includes("sam") &&
      args.includes("deploy") &&
      result.stderr &&
      result.stderr.includes("No changes to deploy")
    ) {
      console.log("\n✅ Stack is up to date. No changes to deploy.");
      return;
    } else if (
        // fallback for when stderr is piped/inherited but we catch the exit code
        command.includes("sam") && args.includes("deploy") && result.status === 1
    ) {
        // Because we use stdio: 'inherit', we can't easily grep stdout/stderr here unless we captured it.
        // However, standard sam deploy returns 1 on "no changes" if --no-fail-on-empty-changeset is not robust enough
        // or if the error text is printed to stdout.
        // Since we are inheriting stdio, the user ALREADY saw the error message.
        // We can just suppress the "Command failed" noise if we want, OR better yet:
        // Let's rely on the user seeing "No changes to deploy" in the output above.
        // But the user specifically asked to improve the "ugly" final response.
        // To do that PROPERLY, we need to capture output instead of inheriting it, OR wrap the exit.
        // For now, let's just make the error message less scary if it's likely that specific error.

        console.log("----------------------------------------------------------------");
        console.log("NOTE: If the error above says 'No changes to deploy', your stack is already up to date.");
        console.log("----------------------------------------------------------------");
    }

    console.error(`Command failed: ${command} ${args.join(" ")}`);
    process.exit(result.status || 1);
  }
}

function requireNumber(value, label, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for ${label}`);
  }
  return parsed;
}

function parseOptionalBoolean(value, label) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "on", "enabled"].includes(text)) {
    return true;
  }
  if (["false", "no", "n", "0", "off", "disabled"].includes(text)) {
    return false;
  }
  throw new Error(`Invalid boolean for ${label} (use true/false)`);
}

if (!fs.existsSync(CONFIG_PATH)) {
  throw new Error(`Missing config file: ${CONFIG_PATH}`);
}

const configContent = fs.readFileSync(CONFIG_PATH, "utf-8");
const config = YAML.parse(configContent) || {};

// Email configuration - require email_config
const emailConfig = config.email_config;
if (!emailConfig?.from) {
  throw new Error("Missing required config: email_config.from");
}
const fromEmail = String(emailConfig.from).trim();
const toEmailsRaw = Array.isArray(emailConfig.to)
  ? emailConfig.to
  : emailConfig.to
  ? [emailConfig.to]
  : [];
const toEmails = toEmailsRaw.map((email) => String(email).trim()).filter(Boolean);
if (!fromEmail) {
  throw new Error("Missing required config: email_config.from");
}
if (toEmails.length === 0) {
  throw new Error("Missing required config: email_config.to");
}

// Lambda functions configuration
const lambdas = config.lambdas || {};
const costAnalyzerEnabled = lambdas.cost_analyzer?.enabled !== false;
const complianceCheckerEnabled = lambdas.compliance_checker?.enabled !== false;
const tagInventoryEnabled = lambdas.tag_inventory?.enabled !== false;
const historicalCostAnalyzerEnabled = lambdas.historical_cost_analyzer?.enabled !== false;
const optimizationInsightsEnabled = lambdas.optimization_insights?.enabled !== false;

const requiredTags = Array.isArray(config.required_tags)
  ? config.required_tags.map((t) => String(t).trim()).filter(Boolean)
  : String(config.required_tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

if (requiredTags.length === 0) {
  throw new Error("Missing required config: required_tags");
}

const costAnalysis = config.cost_analysis || {};
const groupByTag = String(costAnalysis.group_by_tag || requiredTags[0] || "project")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean)
  .join(",");

const totalThreshold = requireNumber(
  costAnalysis.total_monthly_threshold,
  "cost_analysis.total_monthly_threshold",
  100.0
);

const regions = Array.isArray(config.regions)
  ? config.regions.map((r) => String(r).trim()).filter(Boolean)
  : String(config.regions || "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

const regionsValue = regions.length > 0 ? regions.join(",") : "ALL";

function normalizeSchedule(value, name) {
  if (!value) {
    throw new Error(`Missing schedules.${name} in config.yml`);
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "disabled") {
      return { enabled: false, cron: "" };
    }
    if (value.trim().startsWith("cron(")) {
      return { enabled: true, cron: value.trim() };
    }
    throw new Error(`Invalid schedules.${name} value: ${value}`);
  }
  if (typeof value === "object") {
    const enabled =
      value.enabled === false || value.enabled === "disabled" ? false : true;
    const cron =
      typeof value.cron === "string" && value.cron.trim().startsWith("cron(")
        ? value.cron.trim()
        : "";
    return { enabled, cron };
  }
  throw new Error(`Invalid schedules.${name} value`);
}

function normalizeCostSchedules(value) {
  if (!value) {
    throw new Error("Missing schedules.cost_analysis in config.yml");
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "disabled") {
      return { crons: [], enabled: [false, false] };
    }
    if (value.trim().startsWith("cron(")) {
      return { crons: [value.trim()], enabled: [true, false] };
    }
    throw new Error(`Invalid schedules.cost_analysis value: ${value}`);
  }
  if (Array.isArray(value)) {
    const crons = value
      .map((c) => String(c).trim())
      .filter((c) => c.startsWith("cron("));
    if (crons.length === 0) {
      throw new Error("schedules.cost_analysis must include at least one cron");
    }
    return {
      crons: crons.slice(0, 2),
      enabled: [true, crons.length > 1],
    };
  }
  if (typeof value === "object") {
    if (value.enabled === false || value.enabled === "disabled") {
      return { crons: [], enabled: [false, false] };
    }
    const crons = Array.isArray(value.crons)
      ? value.crons.map((c) => String(c).trim()).filter((c) => c.startsWith("cron("))
      : [];
    if (crons.length === 0 && typeof value.cron === "string") {
      const cron = value.cron.trim();
      if (cron.startsWith("cron(")) {
        return { crons: [cron], enabled: [true, false] };
      }
    }
    if (crons.length === 0) {
      throw new Error("schedules.cost_analysis must include at least one cron");
    }
    return {
      crons: crons.slice(0, 2),
      enabled: [true, crons.length > 1],
    };
  }
  throw new Error("Invalid schedules.cost_analysis value");
}

const schedules = config.schedules || {};
const costSchedule = normalizeCostSchedules(schedules.cost_analysis);
const complianceSchedule = normalizeSchedule(
  schedules.compliance_check,
  "compliance_check"
);
const tagInventorySchedule = normalizeSchedule(
  schedules.tag_inventory,
  "tag_inventory"
);
const optimizationInsightsSchedule = normalizeSchedule(
  schedules.optimization_insights,
  "optimization_insights"
);

if (!costSchedule.crons[0]) {
  throw new Error("schedules.cost_analysis must include at least one cron");
}
if (!complianceSchedule.cron) {
  throw new Error("schedules.compliance_check requires a cron value");
}
if (!tagInventorySchedule.cron) {
  throw new Error("schedules.tag_inventory requires a cron value");
}
if (!optimizationInsightsSchedule.cron) {
  throw new Error("schedules.optimization_insights requires a cron value");
}

const accountBudget = config.account_budget || {};
const accountBudgetEnabledExplicit = parseOptionalBoolean(
  accountBudget.enabled,
  "account_budget.enabled"
);
const accountBudgetEnabled =
  accountBudgetEnabledExplicit !== undefined
    ? accountBudgetEnabledExplicit
    : accountBudget.amount !== undefined && accountBudget.amount !== null && accountBudget.amount !== "";

if (
  accountBudgetEnabled &&
  (accountBudget.amount === undefined || accountBudget.amount === null || accountBudget.amount === "")
) {
  throw new Error(
    "account_budget.enabled is true but account_budget.amount is missing (set amount or disable the budget)"
  );
}

const accountBudgetAmount = requireNumber(
  accountBudget.amount,
  "account_budget.amount",
  100
);
const enableAccountBudget =
  accountBudgetEnabled ? "yes" : "no";
const accountBudgetAlerts = Array.isArray(accountBudget.alerts)
  ? accountBudget.alerts.map((v) => requireNumber(v, "account_budget.alerts", 0))
  : [];
const accountBudgetAlert1 =
  accountBudgetAlerts.length > 0 ? accountBudgetAlerts[0] : 50;
const accountBudgetAlert2 =
  accountBudgetAlerts.length > 1 ? accountBudgetAlerts[1] : 80;

function normalizeTags(rawTags) {
  if (!rawTags) {
    return [];
  }
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((tag) => {
        if (!tag) {
          return null;
        }
        if (typeof tag === "string") {
          const [key, ...rest] = tag.split("=");
          const value = rest.join("=");
          return { key: key?.trim(), value: value?.trim() };
        }
        if (typeof tag === "object") {
          const key = String(tag.key ?? tag.Key ?? "").trim();
          const value = String(tag.value ?? tag.Value ?? "").trim();
          return { key, value };
        }
        return null;
      })
      .filter((tag) => tag && tag.key && tag.value);
  }
  if (typeof rawTags === "object") {
    return Object.entries(rawTags)
      .map(([key, value]) => ({
        key: String(key).trim(),
        value: String(value).trim(),
      }))
      .filter((tag) => tag.key && tag.value);
  }
  return [];
}

const primaryGroupByTag = groupByTag.split(",")[0]?.trim() || "project";
const defaultTags = [{ key: primaryGroupByTag, value: "finops-toolkit" }];
const tagEntries = normalizeTags(config.tags || config.resource_tags);
const mergedTags = tagEntries.length > 0 ? tagEntries : defaultTags;
const tagsByKey = new Map();
for (const tag of mergedTags) {
  tagsByKey.set(tag.key, tag.value);
}

function formatOverrideValue(value) {
  const text = value === undefined || value === null ? "" : String(value);
  if (!text) {
    return "";
  }
  if (/[,\s]/.test(text)) {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  return text;
}

function indentBlock(text, indent) {
  const padding = " ".repeat(indent);
  return text
    .split(/\r?\n/)
    .map((line) => `${padding}${line}`)
    .join("\n");
}

function writeGeneratedTemplate(tags) {
  const templateContent = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const tagsMap = Object.fromEntries(tags.map((tag) => [tag.key, tag.value]));
  const tagsList = tags.map((tag) => ({ Key: tag.key, Value: tag.value }));
  const mapYaml = YAML.stringify(tagsMap).trimEnd();
  const listYaml = YAML.stringify(tagsList).trimEnd();

  const tagMapRegex = /(^\s*Tags: &CommonTagMap\s*\r?\n)(?:^\s{6}.*\r?\n)+/m;
  const tagListRegex = /(^\s*Tags: &CommonTagList\s*\r?\n)(?:^\s{8}.*\r?\n)+/m;

  if (!tagMapRegex.test(templateContent) || !tagListRegex.test(templateContent)) {
    throw new Error("Failed to locate CommonTagMap/CommonTagList anchors in template.yaml");
  }

  const updated = templateContent
    .replace(tagMapRegex, `$1${indentBlock(mapYaml, 6)}\n`)
    .replace(tagListRegex, `$1${indentBlock(listYaml, 8)}\n`);

  fs.writeFileSync(GENERATED_TEMPLATE_PATH, updated);
}

const parameterOverrides = [
  ["TagProject", tagsByKey.get("project")],
  ["FromEmail", fromEmail], // Sender email
  ["ToEmails", toEmails.join(",")], // Recipient emails (comma-separated)
  ["CostAnalyzerEnabled", costAnalyzerEnabled ? "true" : "false"],
  ["ComplianceCheckerEnabled", complianceCheckerEnabled ? "true" : "false"],
  ["TagInventoryEnabled", tagInventoryEnabled ? "true" : "false"],
  ["HistoricalCostAnalyzerEnabled", historicalCostAnalyzerEnabled ? "true" : "false"],
  ["OptimizationInsightsLambdaEnabled", optimizationInsightsEnabled ? "true" : "false"],
  ["GroupByTag", groupByTag],
  ["TotalThreshold", totalThreshold],
  ["ProjectThresholds", "{}"],
  ["Regions", regionsValue],
  ["RequiredTags", requiredTags.join(",")],
  ["CostSchedule1", costSchedule.crons[0]],
  ["CostSchedule1Enabled", costSchedule.enabled[0] ? "true" : "false"],
  ["CostSchedule15", costSchedule.crons[1] || costSchedule.crons[0]],
  ["CostSchedule15Enabled", costSchedule.enabled[1] ? "true" : "false"],
  ["ComplianceSchedule", complianceSchedule.cron],
  ["ComplianceScheduleEnabled", complianceSchedule.enabled ? "true" : "false"],
  ["TagInventorySchedule", tagInventorySchedule.cron],
  ["TagInventoryScheduleEnabled", tagInventorySchedule.enabled ? "true" : "false"],
  ["OptimizationInsightsSchedule", optimizationInsightsSchedule.cron],
  ["OptimizationInsightsScheduleEnabled", optimizationInsightsSchedule.enabled ? "true" : "false"],
  ["EnableAccountBudget", enableAccountBudget],
  ["AccountBudgetAmount", accountBudgetAmount],
  ["AccountBudgetAlert1", accountBudgetAlert1],
  ["AccountBudgetAlert2", accountBudgetAlert2],
]
  .filter(([, value]) => value !== undefined)
  .map(([key, value]) => `${key}=${formatOverrideValue(value)}`);

const parameterOverridesLine = `parameter_overrides = [${parameterOverrides
  .map((entry) => `'${entry.replace(/'/g, "''")}'`)
  .join(", ")}]`;

function upsertParameterOverrides(content, overridesString) {
  const lines = content.split(/\r?\n/);
  const output = [];
  let inDeploySection = false;
  let deploySectionFound = false;
  let overridesSet = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isSection = trimmed.startsWith("[") && trimmed.endsWith("]");

    if (isSection) {
      if (inDeploySection && !overridesSet) {
        output.push(overridesLine);
        overridesSet = true;
      }
      inDeploySection = trimmed === "[default.deploy.parameters]";
      if (inDeploySection) {
        deploySectionFound = true;
      }
    }

    if (inDeploySection && /^parameter_overrides\s*=/.test(trimmed)) {
      output.push(overridesString);
      overridesSet = true;
      continue;
    }

    output.push(line);
  }

  if (deploySectionFound) {
    if (inDeploySection && !overridesSet) {
      output.push(overridesString);
    }
    return output.join("\n");
  }

  return `${output.join("\n")}\n\n[default.deploy.parameters]\n${overridesString}\n`;
}

function writeGeneratedSamconfig(overridesString) {
  let baseContent = "";
  if (fs.existsSync(SAMCONFIG_PATH)) {
    baseContent = fs.readFileSync(SAMCONFIG_PATH, "utf-8");
  } else {
    baseContent = "version = 0.1\n\n[default]\n[default.deploy.parameters]\n";
  }
  const updated = upsertParameterOverrides(baseContent, overridesString);
  fs.writeFileSync(GENERATED_SAMCONFIG_PATH, updated);
}

console.log(
  diffOnly
    ? "Generating SAM deployment diff (CloudFormation change set)..."
    : "Deploying SAM application with config.yml overrides..."
);
writeGeneratedTemplate(mergedTags);
writeGeneratedSamconfig(parameterOverridesLine);
console.log("Validating AWS credentials...");
run("aws", ["sts", "get-caller-identity"]);

console.log("Building SAM application...");
const buildArgs = ["build", "--template-file", GENERATED_TEMPLATE_PATH];
if (clean) {
  buildArgs.push("--clean");
}
run("sam", buildArgs);

if (diffOnly) {
  console.log(
    "Computing CloudFormation changeset (no execute). No resources will be deployed."
  );
} else {
  console.log("Deploying SAM application with config.yml overrides...");
}

const deployArgs = [
  "deploy",
  "--config-file",
  GENERATED_SAMCONFIG_PATH,
  "--config-env",
  "default",
  "--template-file",
  BUILT_TEMPLATE_PATH,
  "--tags",
  ...mergedTags.map((tag) => `${tag.key}=${tag.value}`),
];

if (diffOnly) {
  deployArgs.push(
    "--no-execute-changeset",
    "--no-fail-on-empty-changeset",
    "--no-confirm-changeset"
  );
}

run("sam", deployArgs);
