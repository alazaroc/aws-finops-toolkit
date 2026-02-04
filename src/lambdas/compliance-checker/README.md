# Compliance Checker Lambda

Validates that every resource in the configured regions carries the required tag **keys** and produces compliance reports (HTML + JSON) that get emailed and archived in S3.

## Key responsibilities

- Discover enabled regions (or honor the `config/config.yml:regions` whitelist).
- Scan all resources via `resourcegroupstaggingapi:GetResources`.
- Ensure configured `required_tags` exist on every resource and flag missing tag keys.
- Produce JSON/HTML reports, stash them in S3, and notify reviewers through SES.

## APIs used

- `resourcegroupstaggingapi:GetResources`
- `ec2:DescribeRegions`
- `ses:SendEmail`
- `s3:PutObject`

## Triggering and schedule

- EventBridge uses `schedules.compliance_check.cron` from `config/config.yml` (repository default: `cron(0 9 1 * ? *)`).
- The lambda is invoked once per cron execution and scans all regions before reporting.

## Configuration knobs

- `config/config.yml:required_tags` – List of tag keys that must be present on every resource.
- `config/config.yml:regions` – Optional explicit list of regions to scan.
- `config/config.yml:compliance.include_regions|exclude_regions` – Optional include/exclude filters (applied on top of `regions` when present).
- `config/config.yml:email_config` – SES `from`/`to` addresses for the compliance report.

## Execution flow

1. EventBridge triggers the lambda.
2. The lambda enumerates regions (EC2) and queries `resourcegroupstaggingapi:GetResources`.
3. Resources are validated against `required_tags` (presence of keys) and grouped by region/project/resource type.
4. Results are stored in S3 and a compliance summary email is sent through SES.

## Reports & storage

- Compliance artifacts appear under `s3://finops-toolkit-reports-{account}/year/month/` with names like `compliance-report-YYYY-MM-DD.json.gz`.
- Every report is gzip/compressed and expires after 365 days (per `template.yaml`).

## Observability

- Logs are written to `/aws/lambda/finops-compliance-checker`.
- Run `aws logs tail /aws/lambda/finops-compliance-checker --follow` for live output.

## Local verification

- `npm install --prefix src/lambdas/compliance-checker`
- `npm run build --prefix src/lambdas/compliance-checker`
- `aws lambda invoke --function-name finops-compliance-checker --payload '{}' response-compliance.json --region us-east-1`
