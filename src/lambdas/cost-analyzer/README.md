# Cost Analyzer Lambda

The Cost Analyzer Lambda performs the monthly project-level FinOps analysis that powers the alerts and reports you receive. It runs automatically on a scheduled EventBridge rule and turns Cost Explorer data into consumable summaries per tag.

## Key responsibilities

- Query `ce:GetCostAndUsage` once per run to fetch the configured granularity of usage.
- Group costs by the tag(s) defined in `config/config.yml` (default: `group_by_tag`).
- Build HTML and JSON reports (by project, service, and region) and push them to S3.
- Send an HTML email via SES that links to the latest report in S3.

## APIs used

- `ce:GetCostAndUsage`
- `ses:SendEmail`
- `s3:PutObject`

## Triggering and schedule

- EventBridge follows the `schedules.cost_analysis` cron entries from `config/config.yml`.
- The lambda detects whether it should analyze the previous closed month (when today ≤5th) or the current month-to-date, and it adjusts the Cost Explorer time window accordingly.

## Configuration knobs

- `config/config.yml:cost_analysis.group_by_tag` - tag(s) used to group rows in the report.
- `config/config.yml:cost_analysis.total_monthly_threshold` - monthly cost threshold used for over/under evaluation.
- `config/config.yml:email_config` - `from`/`to` addresses that SES uses for reports.

## Execution flow

1. EventBridge cron invokes the handler.
2. The lambda loads configuration & environment variables via `SimpleEnvLoader`.
3. Cost Explorer is queried once per dimension (region/service/tag combination) to keep API usage low.
4. Aggregated costs and project lists are packaged into structured payloads.
5. Reports are written as HTML/JSON in S3 and a summary email is sent via SES.

## Reports & storage

- Report files land in `s3://finops-toolkit-reports-{account}/` under `year/month/` (e.g., `2025/01/cost-analysis-2025-01-15.json.gz`).
- Every artifact is GZIP-compressed and retained for 365 days (per `template.yaml` lifecycle rules).

## Observability

- CloudWatch Logs capture the step-by-step progress and include metrics such as total cost and projects analyzed.
- Use `aws logs tail /aws/lambda/finops-cost-analyzer --follow` to stream live logs.

## Local verification

- `npm install --prefix src/lambdas/cost-analyzer`
- `npm run build --prefix src/lambdas/cost-analyzer`
- `aws lambda invoke --function-name finops-cost-analyzer --payload '{}' response-cost.json --region us-east-1`

## Performance notes

- Cost Explorer calls are grouped per tag/region/service combination so that only the necessary APIs are hit.
- Monthly granularity minimizes data volume while giving a complete project view.
