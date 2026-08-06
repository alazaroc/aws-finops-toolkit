# Lambda Log Review Guide

`scripts/check-lambda-logs.sh` scans CloudWatch logs for all Lambda functions, grouping results by Request ID with color-coded output.

**Features:** detects `ERROR`, `Failed`, `Exception`, `Timeout`, `❌`, `⚠️` (case-insensitive) · filters cold-start noise · cross-platform (macOS/Linux/WSL) · detects expired credentials.

## Quick start

```bash
# Errors from last 30 minutes (default)
./scripts/check-lambda-logs.sh
```

## Usage

```bash
./scripts/check-lambda-logs.sh [minutes] [log_type] [environment] [profile] [save]
```

### Parameters

| # | Parameter | Description | Allowed values | Default |
| --- | --- | --- | --- | --- |
| 1 | `minutes` | Time window | Integer (e.g. `30`, `60`, `1440`) | `30` |
| 2 | `log_type` | Filter mode | `errors` · `all` | `errors` |
| 3 | `environment` | Target env | `test` · `prod` · `auto` | `auto` |
| 4 | `profile` | AWS profile | Profile name or `""` for default | `""` |
| 5 | `save` | Export to file | `save` · `no` | `no` |

```bash
./scripts/check-lambda-logs.sh --help
```

## Examples

```bash
# Last hour, errors only
./scripts/check-lambda-logs.sh 60

# Full logs for last 2 hours
./scripts/check-lambda-logs.sh 120 all

# Check prod explicitly
./scripts/check-lambda-logs.sh 30 errors prod

# Check test with a specific AWS profile
./scripts/check-lambda-logs.sh 30 errors test my-profile

# Save last 60 min of errors to file (use "" for default credentials)
./scripts/check-lambda-logs.sh 60 errors auto "" save
# → Export complete: logs_test_20241025_143015.log
```

## Output color coding

| Color | Meaning |
| --- | --- |
| 🔴 Red | Errors (`ERROR`, `Failed`, `Exception`, `❌`) |
| 🟡 Yellow | Warnings (`WARN`, `⚠️`) |
| 🔵 Blue | Request headers and IDs |
| 🟣 Purple | System events (`START`, `END`, `REPORT`) |

## Requirements

- AWS CLI v2
- `jq` (optional — faster JSON parsing)

## Troubleshooting

### "AWS credentials are invalid or expired"

Run `aws sso login`

### "Permission denied"

```bash
chmod +x scripts/check-lambda-logs.sh
```

### "No logs found"

- Verify the region matches your deployment region
- Increase the time window (first argument)
