# Tag Inventory Lambda

Builds a catalog of tag keys and usage patterns so teams can understand their tagging footprint and spot likely typos in tag **keys** (via similarity detection).

## Key responsibilities

- Enumerate every tagged resource via `resourcegroupstaggingapi:GetResources`.
- Produce JSON and HTML inventories that highlight the most used tag keys, low-usage (unusual) tag keys, and a per-region resource breakdown.
- Detect tag keys that are similar to your configured `required_tags` (to surface probable typos like `projcet` vs `project`).
- Persist reports in S3 for later reference.

## APIs used

- `resourcegroupstaggingapi:GetResources`
- `ec2:DescribeRegions`
- `ses:SendEmail`
- `s3:PutObject`

## Triggering and schedule

- EventBridge follows `schedules.tag_inventory.cron` from `config/config.yml` (repository default: `cron(0 9 1 * ? *)`).
- The lambda runs once per cron job and scans all enabled regions.

## Configuration knobs

- `config/config.yml:required_tags` – Used for similarity detection (detect tag keys that look like required tags).
- `config/config.yml:regions` – Optional explicit list of regions to scan.
- `config/config.yml:tag_inventory.include_regions|exclude_regions` – Optional include/exclude filters (applied on top of `regions` when present).
- `config/config.yml:email_config` – SES `from`/`to` addresses for the inventory report.

## Execution flow

1. Scheduled EventBridge invocation loads the environment.
2. All resources reachable via `resourcegroupstaggingapi:GetResources` are listed.
3. Tag usage statistics and required-tag similarity results are computed.
4. The inventory is saved to S3 and sent via email (HTML), with JSON stored for history.

## Reports & storage

- Inventory snapshots land inside `s3://finops-toolkit-reports-{account}/year/month/` with a `tag-inventory-YYYY-MM-DD.json.gz` naming pattern.
- Files are gzip-compressed and adhere to the 365-day retention defined in `template.yaml`.

## Observability

- Logs stream through `/aws/lambda/finops-tag-inventory`.
- Use `aws logs tail /aws/lambda/finops-tag-inventory --follow` when debugging.

## Local verification

- `npm install --prefix src/lambdas/tag-inventory`
- `npm run build --prefix src/lambdas/tag-inventory`
- (No direct lambda invocation is published in docs, but the handler can be invoked with `aws lambda invoke --function-name finops-tag-inventory --payload '{}' response-tag-inventory.json --region us-east-1`.)
