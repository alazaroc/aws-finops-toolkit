# AWS FinOps Toolkit

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![AWS](https://img.shields.io/badge/AWS-FinOps-orange)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

FinOps toolkit for AWS that automates cost visibility, tag governance, and reporting.
Designed to **complement** Cost Explorer and Budgets, not replace them.

The idea is simple: AWS provides the pieces; this toolkit turns them into **operations** (automation, reporting, tag control, and optimization backlog).

## Table of Contents

- [Features & Capabilities](#features--capabilities)
- [Why use this toolkit?](#why-use-this-toolkit)
- [Coverage matrix](#coverage-matrix-what-it-covers-and-what-it-doesnt)
- [Architecture](#architecture-high-level)
- [Quick deployment](#quick-deployment)
- [Try it out](#try-it-out-manual-execution)
- [Useful Commands](#useful-commands)
- [Documentation](#documentation)
- [Maintainer](#maintainer)
- [License](#license)

## Features & Capabilities

<details>
<summary><strong>1. Cost Analysis Report</strong></summary>

> Monthly cost breakdown by tag/grouping with anomaly detection.
> Available on Amazon S3 and via email.

![Cost Analysis Report 1](docs/images/screenshot-email-cost-analysis-1.png)
![Cost Analysis Report 2](docs/images/screenshot-email-cost-analysis-2.png)

**Multi-account (AWS Organizations)**

> When deployed in the management account (or a Cost Explorer delegated administrator),
> the report auto-detects AWS Organizations and consolidates the whole org: a
> per-account breakdown, plus net cost after AWS credits. Single-account setups keep
> working unchanged — no configuration needed (`organization.enabled: auto`).

![Cost Analysis Report - Organization / multi-account](docs/images/screenshot-email-cost-report-multiaccount.png)

</details>

<details>
<summary><strong>2. Compliance Report</strong></summary>

> Validation of required tags across all regions.
> Available on Amazon S3 and via email.

![Compliance Report 1](docs/images/screenshot-email-compliance-1.png)
![Compliance Report 2](docs/images/screenshot-email-compliance-2.png)

</details>

<details>
<summary><strong>3. Tag Inventory Report</strong></summary>

> Tag key usage inventory + similarity detection (to spot likely typos).
> Available on Amazon S3 and via email.

![Tag Inventory Report 1](docs/images/screenshot-email-inventory-1.png)
![Tag Inventory Report 2](docs/images/screenshot-email-inventory-2.png)

</details>

<details>
<summary><strong>4. Optimization Insights</strong></summary>

> Consolidated savings and optimization recommendations.
> Available on Amazon S3 and via email.

![Optimization Insights Report 1](docs/images/screenshot-email-optimization-insights-1.png)
![Optimization Insights Report 2](docs/images/screenshot-email-optimization-insights-2.png)
![Optimization Insights Report 3](docs/images/screenshot-email-optimization-insights-3.png)

</details>

<details>
<summary><strong>5. Historical Cost Analysis (On Demand)</strong></summary>

> Manual deep-dive report (HTML/JSON) generated on-demand.
> Available only on Amazon S3.

![Historical Cost Report - on Amazon S3](docs/images/screenshot-email-historical-cost-analysis-0.png)
![Historical Cost Report - 1](docs/images/screenshot-email-historical-cost-analysis-1.png)
![Historical Cost Report - 2](docs/images/screenshot-email-historical-cost-analysis-2.png)

</details>

### Components

- **AWS Budget**: account-level monthly budget + email alerts
- **Automated reports** in S3 + email notifications (SES)
- **Centralized configuration** via YAML
- **EventBridge schedules**: automates frequency and "ritual" (weekly/monthly)

## Why use this toolkit?

**The key difference**: AWS gives you the pieces, but this toolkit turns them into a complete operation.

|                | Native AWS                                                                | AWS FinOps Toolkit                                                       |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Approach**   | **Pull (Console-first)**: You have to log in and look for data.           | **Push (Operations-first)**: Insights and reports come to you via email. |
| **Simplicity** | Requires navigating multiple services (Cost Explorer, Config, Optimizer). | Consolidated view configured via a single YAML file.                     |
| **Governance** | Tag Editor allows changes but doesn't track "typos" easily.               | **Tag Inventory** detects similarity and validates required keys.        |
| **Cost**       | Deep dashboards (CID/QuickSight) cost $100-200+/month.                    | **Lightweight**: Uses Lambda free tier/low cost + S3.                    |

> [!WARNING]
> **AWS Cost Explorer API Pricing**: This toolkit relies on the AWS Cost Explorer API, which charges **$0.01 per request**.
>
> While we have optimized this toolkit to send as few requests as possible (only ~2 requests per execution), running this frequently (e.g. real-time dashboards) or for many different custom periods can accumulate costs.
>
> **Recommendation**: Run these reports on a schedule (e.g., weekly or monthly) rather than via frequent manual triggers.

## Coverage matrix (what it covers and what it doesn't)

This toolkit implements FinOps as an operational practice covering the three typical phases:

| Phase        | Component                          | What it delivers                                     | What it does NOT do                 |
| ------------ | ---------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| **Inform**   | finops-cost-analyzer               | Top services by tag value, anomalies, HTML reports   | Advanced BI / complete dashboards   |
| **Inform**   | compliance-checker + tag-inventory | Required tag control + management                    | Doesn't "fix tags" automatically    |
| **Inform**   | finops-historical-cost-analyzer    | Direct lambda invocation that stores JSON/HTML in S3 | Doesn't generate emails/reports     |
| **Optimize** | finops-optimization-insights       | Consolidated and prioritized recommendations         | Doesn't apply changes automatically |
| **Operate**  | compliance-checker + schedules     | Recurring execution + reports                        | Doesn't block deployments           |

## Architecture (high level)

![aws-finops-toolkit architecture](docs/images/architecture_diagram.png)

## Quick deployment

### Requirements

- Node.js 22+ and npm
- AWS CLI configured
- AWS SAM CLI installed

### Install & Deploy

```bash
git clone https://github.com/alazaroc/aws-finops-toolkit
cd aws-finops-toolkit
npm run setup
```

1. Create your configuration file:

   ```bash
   cp config/config.example.yml config/config.yml
   ```

2. Edit `config/config.yml` with your parameters (emails, budget amount, etc).

3. Deploy:

   ```bash
   npm run deploy
   ```

> **Note**: Always use `npm run deploy` instead of `sam deploy` directly. See [docs/deploy-GUIDE.md](docs/deploy-GUIDE.md) for details.

### Post-deployment verification

After first deployment, verify your email in Amazon SES:

```bash
aws ses verify-email-identity --email-address your-email@domain.com
```

## Try it out (Manual Execution)

You can trigger any analysis on-demand via CLI:

```bash
# 1. Cost Analysis
aws lambda invoke --function-name finops-cost-analyzer --payload '{}' response-cost-analysis.json --region us-east-1

# 2. Compliance Check
aws lambda invoke --function-name finops-compliance-checker --payload '{}' response-compliance-check.json --region us-east-1

# 3. Tag Inventory
aws lambda invoke --function-name finops-tag-inventory --payload '{}' response-tag-inventory.json --region us-east-1

# 4. Optimization Insights
aws lambda invoke --function-name finops-optimization-insights --payload '{}' response-optimization-insights.json --region us-east-1

# 5. Historical Analysis (e.g., last 6 months)
aws lambda invoke --function-name finops-historical-cost-analyzer --payload '{\"monthsBack\":0,\"periodLength\":6,\"groupBy\":\"project\"}' response-historical.json --cli-binary-format-raw-in-base64-out --region us-east-1
# If you are executing this command on aws-cli v1, remove the "--cli-binary-format-raw-in-base64-out"
```

## Useful Commands

### Check Logs

Use the included script to scan for errors across all functions:

```bash
./scripts/check-lambda-logs.sh 60 errors
```

See [docs/check-lambda-logs-GUIDE.md](docs/check-lambda-logs-GUIDE.md) for full usage and examples.

### Clean up

To remove the stack (except S3 bucket if it has files):

```bash
aws cloudformation delete-stack --stack-name finops-toolkit
```

## Documentation

- [docs/deploy-GUIDE.md](docs/deploy-GUIDE.md) — deployment script reference
- [docs/setup-GUIDE.md](docs/setup-GUIDE.md) — dependency installation script reference
- [docs/check-lambda-logs-GUIDE.md](docs/check-lambda-logs-GUIDE.md) — Lambda log review script reference
- [docs/finops-framework.md](docs/finops-framework.md) — FinOps framework coverage

## Maintainer

- Alejandro Lazaro Chueca (`@alazaroc` on GitHub) – open GitHub issues/PRs for questions.

## License

MIT License
