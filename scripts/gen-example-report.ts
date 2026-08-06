/* Generates an example cost-report email HTML with OBFUSCATED data,
   using the real report builder, for the public README. No AWS calls. */
import { writeFileSync } from "fs";

// Minimal fake config (constructor does not hit AWS)
const config: any = {
  account_id: "111122223333",
  regions: ["us-east-1", "eu-west-1", "eu-central-1"],
  cost_analysis: { group_by_tag: "project", total_monthly_threshold: 20 },
  required_tags: ["project"],
  schedules: { cost_analysis: "monthly", compliance_check: "weekly" },
  organization: { enabled: "auto", show_account_breakdown: true },
  email_config: { from: "noreply@example.com", to: ["you@example.com"], display_name: "aws-finops-toolkit" },
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CostAnalysisService } = require("../src/domain/costs/cost-analysis-service");

const now = new Date("2026-08-01T09:00:00Z");
const periodStart = new Date("2026-07-01T00:00:00Z");
const periodEnd = new Date("2026-08-01T00:00:00Z");

const report: any = {
  reportDate: now,
  accountId: "111122223333",
  accountAlias: "management",
  periodStart,
  periodEnd,
  periodEndExclusive: true,
  totalCost: 842.17,
  previousTotalCost: 610.44,
  netCost: 512.9,
  creditsApplied: 329.27,
  groupedCosts: [
    { groupValue: "web-platform", cost: 410.22, previousCost: 300.1, threshold: 20, isOverThreshold: true, tagName: "project", topServices: [] },
    { groupValue: "data-pipeline", cost: 268.5, previousCost: 190.0, threshold: 20, isOverThreshold: true, tagName: "project", topServices: [] },
    { groupValue: "mobile-api", cost: 96.45, previousCost: 90.34, threshold: 20, isOverThreshold: true, tagName: "project", topServices: [] },
    { groupValue: "untagged", cost: 67.0, previousCost: 30.0, threshold: 20, isOverThreshold: true, tagName: "project", topServices: [] },
  ],
  tagBreakdowns: [
    {
      tagName: "project",
      costAllocationTagEnabled: true,
      zeroCostGroupValues: ["internal-tools", "sandbox-old", "archived-2024"],
      groupedCosts: [
        { groupValue: "web-platform", cost: 410.22, previousCost: 300.1, threshold: 20, isOverThreshold: true, tagName: "project", topServices: [ { service: "Amazon EC2", cost: 210.0 }, { service: "Amazon RDS", cost: 120.2 }, { service: "Amazon S3", cost: 80.02 } ] },
        { groupValue: "data-pipeline", cost: 268.5, previousCost: 190.0, threshold: 20, isOverThreshold: true, tagName: "project", topServices: [ { service: "AWS Glue", cost: 140.0 }, { service: "Amazon Athena", cost: 78.5 }, { service: "Amazon S3", cost: 50.0 } ] },
        { groupValue: "mobile-api", cost: 96.45, previousCost: 90.34, threshold: 20, isOverThreshold: true, tagName: "project", topServices: [ { service: "AWS Lambda", cost: 60.0 }, { service: "Amazon API Gateway", cost: 36.45 } ] },
        { groupValue: "untagged", cost: 67.0, previousCost: 30.0, threshold: 20, isOverThreshold: true, tagName: "project", topServices: [ { service: "AmazonCloudWatch", cost: 40.0 }, { service: "Amazon Route 53", cost: 27.0 } ] },
      ],
    },
  ],
  anomalies: [
    { groupValue: "data-pipeline", tagName: "project", currentCost: 268.5, previousCost: 190.0, percentageChange: 41.3 },
  ],
  regionalBreakdown: [
    { region: "us-east-1", cost: 520.0, previousCost: 360.0, percentage: 61.7 },
    { region: "eu-west-1", cost: 220.17, previousCost: 180.44, percentage: 26.1 },
    { region: "eu-central-1", cost: 102.0, previousCost: 70.0, percentage: 12.1 },
  ],
  serviceBreakdown: [
    { service: "Amazon EC2", cost: 260.0, previousCost: 180.0, percentage: 30.9 },
    { service: "Amazon RDS", cost: 150.2, previousCost: 120.0, percentage: 17.8 },
    { service: "AWS Glue", cost: 140.0, previousCost: 60.0, percentage: 16.6 },
    { service: "Amazon S3", cost: 130.02, previousCost: 110.0, percentage: 15.4 },
    { service: "AWS Lambda", cost: 60.0, previousCost: 58.0, percentage: 7.1 },
    { service: "AmazonCloudWatch", cost: 40.0, previousCost: 20.0, percentage: 4.7 },
  ],
  organizationMode: true,
  organizationInfo: { id: "o-exampleorg12", masterAccountId: "111122223333", accountCount: 6 },
  accountBreakdown: [
    { accountId: "111122223333", accountName: "Management", cost: 410.22, previousCost: 250.0, percentage: 48.7 },
    { accountId: "222233334444", accountName: "Production", cost: 268.5, previousCost: 210.0, percentage: 31.9 },
    { accountId: "333344445555", accountName: "Staging", cost: 96.45, previousCost: 90.0, percentage: 11.5 },
    { accountId: "444455556666", accountName: "Data", cost: 45.0, previousCost: 40.44, percentage: 5.3 },
    { accountId: "555566667777", accountName: "Sandbox", cost: 18.0, previousCost: 17.0, percentage: 2.1 },
    { accountId: "666677778888", accountName: "Audit", cost: 4.0, previousCost: 3.0, percentage: 0.5 },
  ],
};

// Reuse the lambda's generateHtmlReport (constructor makes no AWS calls)
const { CostAnalyzer } = require("../src/lambdas/cost-analyzer/index");
void CostAnalysisService;

const html = new CostAnalyzer(config).generateHtmlReport(report, {
  jsonS3Url: "s3://finops-toolkit-reports-111122223333/reports/cost-analysis/2026/08/01/cost-analysis.json",
  jsonConsoleUrl: "https://s3.console.aws.amazon.com/s3/object/finops-toolkit-reports-111122223333",
  jsonDirectUrl: "https://finops-toolkit-reports-111122223333.s3.us-east-1.amazonaws.com/reports/cost-analysis/2026/08/01/cost-analysis.json",
});
writeFileSync("/tmp/report-example.html", html);
console.log("WROTE /tmp/report-example.html", html.length);
