# Optimization Insights Lambda

Unifies recommendations from Cost Optimization Hub, Trusted Advisor, and Compute Optimizer into a prioritized, actions-ready report with cost-saving context.

## Key responsibilities

- Collect optimization insights from Cost Optimization Hub, Trusted Advisor, and Compute Optimizer.
- Validate service availability (enrollment status) before ingesting recommendations.
- Deduplicate results by resource ID so savings are not inflated.
- Prioritize opportunities by real AWS action types and potential monthly savings.
- Generate consolidated HTML/JSON reports and push them to S3, then notify via SES.

## APIs used

- `cost-optimization-hub:ListRecommendations`
- `cost-optimization-hub:ListEnrollmentStatuses`
- `support:DescribeTrustedAdvisorChecks`
- `support:DescribeTrustedAdvisorCheckResult`
- `compute-optimizer:GetEC2InstanceRecommendations`
- `compute-optimizer:GetLambdaFunctionRecommendations`
- `compute-optimizer:GetEBSVolumeRecommendations`
- `compute-optimizer:GetEnrollmentStatus`
- `ses:SendEmail`
- `s3:PutObject`

## Triggering and schedule

- EventBridge uses `config/config.yml:schedules.optimization_insights` (default: cron(0 11 1 * ? *)).
- The lambda respects `config/config.yml:lambdas.optimization_insights.enabled` and only runs when the flag is true.

## Configuration knobs

- `config/config.yml:email_config` - SES addresses for the optimization report.

## Execution flow

1. Scheduled EventBridge trigger loads configuration and validates service enrollment (Compute Optimizer + Cost Optimization Hub).
2. Each AWS service is queried for recommendations, filtering out duplicates by resource ID.
3. Recommendations are categorized by source (COH, TA, CO) and opportunities are ranked by potential savings and effort.
4. Final report is saved to S3 and summarized via email.

## Reports & storage

- Output files live under `s3://finops-toolkit-reports-{account}/year/month/` (ex: `optimization-insights-2025-01-15.json.gz`).
- Gzip compression and 365-day retention are controlled by `template.yaml`.

## Observability

- Logs stream to `/aws/lambda/finops-optimization-insights`.
- Inspect runtime details with `aws logs tail /aws/lambda/finops-optimization-insights --follow`.

## Local verification

- `npm install --prefix src/lambdas/optimization-insights`
- `npm run build --prefix src/lambdas/optimization-insights`
- `aws lambda invoke --function-name finops-optimization-insights --payload '{}' response-optimization-insights.json --region us-east-1`
