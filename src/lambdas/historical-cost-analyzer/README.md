# Historical Cost Analyzer Lambda

`finops-historical-cost-analyzer` runs on demand (manual CLI/SDK calls or scheduled EventBridge cron rules) so you can capture flexible historical Cost Explorer snapshots and keep the artifacts in S3.

## Key responsibilities

- Accept structured payloads that describe the time range (`monthsBack`, `periodLength`) and grouping/tag options (`groupBy`).
- Query `ce:GetCostAndUsage`, `ce:GetDimensionValues`, and `ce:GetCostAndUsageWithResources` as needed to build run summaries.
- Store the analysis output as both JSON and HTML documents in the configured `REPORTS_BUCKET`.
- Return metadata (`jsonReportPath`, `htmlReportPath`, `htmlReportConsoleUrl`) so callers can download the files immediately.
- No email notifications are sent by this lambda to avoid exposing sensitive cost data.

## Triggering and schedule

- Set `historical_cost_analyzer.enabled` to `true` in `config/config.yml` to deploy the lambda.
- There is no HTTP endpoint/MOCK API exposed anymore; invoke the function directly using the AWS CLI/SDK to run an ad-hoc query.
- Sample AWS CLI invocation:

```bash
aws lambda invoke \
  --function-name finops-historical-cost-analyzer \
  --payload '{"monthsBack":1,"periodLength":6,"groupBy":"project"}' \
  response-historical-cost.json \
  --region us-east-1
```

- The function can still be invoked by EventBridge schedules defined in `template.yaml` when you want automated runs.

## Request schema

Direct Lambda invocation payload:

```jsonc
{
  "monthsBack": 0,
  "periodLength": 6,
  "groupBy": "project",
  "includeHtml": false
}
```

- `monthsBack` (number, default `0`): 0=current month, 1=previous month, etc.
- `periodLength` (number, default `6`): number of months to analyze (e.g. 1, 3, 6, 12).
- `groupBy` (string, optional): tag key to group by (defaults to `cost_analysis.group_by_tag` or `"Project"`).
- `includeHtml` (boolean, default `false`): if `true`, the response includes the full HTML document in-line (usually prefer the S3 links).

If API Gateway endpoints are re-enabled in `template.yaml`, you can also pass `outputFormat: "json" | "html"` (or `Accept: text/html`) to return HTML directly from the HTTP response.

## Response schema

The lambda always stores the generated report in S3 and returns a JSON payload similar to:

```jsonc
{
  "summary": { ... },
  "htmlReportPath": "s3://<reports-bucket>/historical-cost/YYYY-MM-DD/historical-cost.html",
  "htmlReportConsoleUrl": "https://s3.console.aws.amazon.com/s3/object/<reports-bucket>?prefix=... ",
  "jsonReportPath": "s3://<reports-bucket>/historical-cost/YYYY-MM-DD/historical-cost.json",
  "jsonReportConsoleUrl": "https://s3.console.aws.amazon.com/s3/object/<reports-bucket>?prefix=... "
}
```

Use `htmlReportPath` or `jsonReportPath` to fetch the files.

## Execution flow

1. The handler normalizes payload values and calculates the requested date range.
2. Cost Explorer data is fetched per month, per tag, and per service.
3. `ReportStorage` writes both JSON and HTML bodies to S3 using structured keys.
4. HTML content is stored in S3 and made available through the response payload; no automatic emails are sent.
5. The response payload always contains the S3 URIs for downstream automation.

## Observability

- Lambda logs live in `/aws/lambda/finops-historical-cost-analyzer`.
- `aws logs tail /aws/lambda/finops-historical-cost-analyzer --follow` can help debug quick invocations.
- S3 object metadata includes timestamps and `reportType` for filtering in the console.

## Local verification

- Install dependencies:

```bash
npm install --prefix src/lambdas/historical-cost-analyzer
```

- Build the lambda:

```bash
npm run build --prefix src/lambdas/historical-cost-analyzer
```

- Invoke locally using the AWS CLI (matching the deployed function name) and inspect the `htmlReportPath` provided in the output to confirm the report landed in S3:

```bash
aws lambda invoke \
  --function-name finops-historical-cost-analyzer \
  --payload '{"monthsBack":1,"periodLength":6,"groupBy":"project"}' \
  response-historical-cost.json \
  --region us-east-1
cat response-historical-cost.json
```
