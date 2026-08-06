# Product Overview

AWS FinOps Toolkit — Serverless cost visibility and governance automation for AWS.

## Purpose

Transforms AWS cost and governance data into actionable reports delivered via email. Complements (not replaces) AWS Cost Explorer and Budgets.

## Core Capabilities

| Lambda                     | Domain       | What it does                                                                                    |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `cost-analyzer`            | costs        | Monthly cost breakdown by tag/project, anomaly detection, multi-account via Organizations       |
| `compliance-checker`       | governance   | Required tag validation across all configured regions                                           |
| `tag-inventory`            | governance   | Tag usage analysis with similarity detection (typo spotting)                                    |
| `optimization-insights`    | optimization | Consolidated recommendations from Compute Optimizer, Cost Optimization Hub, and Trusted Advisor |
| `historical-cost-analyzer` | costs        | On-demand deep-dive cost analysis (manual or scheduled invocation)                              |

## Multi-Account Support

- Auto-detects if the account belongs to an AWS Organization (`organization.enabled: auto`)
- In Organization mode: aggregates costs from all member accounts with individual breakdown
- Only applies to `costs` domain lambdas; compliance/tag_inventory operate single-account

## Key Differentiator

**Push-based** (insights come to you via email) vs AWS's pull-based console approach. Lightweight Lambda-based solution vs expensive QuickSight dashboards.

## Cost Awareness

- Cost Explorer API: $0.01/request. Optimized to ~2 requests per execution
- Scheduled execution (weekly/monthly), never real-time
- When adding new features, always consider the cost of AWS APIs being consumed
- Avoid redundant calls: cache/reuse data within the same execution

## Design Principles

- **Config-driven**: All behavior controlled via `config/config.yml`, never hardcoded
- **Fail gracefully**: If an AWS service doesn't respond, report partially instead of failing entirely
- **Idempotent**: Each execution produces the same result regardless of previous state
- **Minimal permissions**: Each lambda has only the IAM permissions it needs (least privilege in template.yaml)
