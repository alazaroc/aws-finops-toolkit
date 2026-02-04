# AWS Lambda Log Review Guide

This guide explains how to use `scripts/check-lambda-logs.sh` to inspect CloudWatch logs for Lambda functions.  
The script is designed to be **robust, fast, and cross-platform**, running natively on macOS, Linux, and Windows (WSL/Git Bash) without external dependencies like Python or Node.js.

## Key Features

- **✅ Robust Error Detection**: Detects `ERROR`, `Failed`, `Exception`, `Timeout`, `❌`, and `⚠️` ignoring case.
- **✅ Smart Filtering**:
  - Automatically filters out cold start noise (`INIT_START`).
  - Groups logs by **Request ID** into clean, readable blocks.
  - Hides empty requests when looking for errors.
- **✅ Cross-Platform**: Optimized for macOS (Bash 3.2+) and modern Linux distributions.
- **✅ Credential Aware**: Detects expired AWS credentials and suggests fixes (e.g., `aws sso login`).
- **✅ Export Capability**: Can save log outputs to a file for sharing or detailed analysis.

---

## Quick Start

```bash
# Check errors for last 30 mins (default)
./scripts/check-lambda-logs.sh
```

## Usage

```bash
./scripts/check-lambda-logs.sh [minutes] [log_type] [environment] [profile] [save]
```

### Parameters

| # | Parameter | Description | Allowed Values | Default |
|---|-----------|-------------|----------------|---------|
| 1 | `minutes` | Time window | Integer (e.g., `30`, `60`, `1440`) | `30` |
| 2 | `log_type` | Filter mode | `errors` (only issues) or `all` (full logs) | `errors` |
| 3 | `environment` | Target env | `test`, `prod`, or `auto` (infers from profile) | `auto` |
| 4 | `profile` | AWS profile | Profile name, `default` or `""` (empty string) | `""` |
| 5 | `save` | Export logs | `save` (exports to .log file) or `no` | `no` |

### Help

```bash
./scripts/check-lambda-logs.sh --help
```

---

## Examples

### 1. Basic Checks
```bash
# Last hour, errors only
./scripts/check-lambda-logs.sh 60

# Full logs for the last 2 hours
./scripts/check-lambda-logs.sh 120 all
```

### 2. Targeting Environments
```bash
# Check PROD explicitly
./scripts/check-lambda-logs.sh 30 errors prod

# Check TEST with a specific AWS profile
./scripts/check-lambda-logs.sh 30 errors test my-profile
```

### 3. Saving Logs to File
To save logs, you must provide the 4th argument (profile). If using default credentials, use `""`:

```bash
# Save last 60 mins of errors to a file
./scripts/check-lambda-logs.sh 60 errors auto "" save
```
*Output: `Export complete: logs_test_20241025_143015.log`*

---

## Output Interpretation

The script uses color-coding for instant visibility:

- **🔴 RED**: Critical errors (`ERROR`, `Failed`, `Exception`, `❌`).
- **🟡 YELLOW**: Warnings (`WARN`, `Warning`, `⚠️`).
- **🔵 BLUE**: Request headers and IDs.
- **🟣 PURPLE**: System events (`START`, `END`, `REPORT`).

### Example Output (Errors Found)

```text
=== AWS Lambda Log Review ===
Config: 60 min | Region: us-east-1 | Env: test | Type: errors

🔍 Checking: finops-cost-analyzer (us-east-1)...

------------------------------------------------------------
🚀 [ID] 4699ba64-1f10-4f78-b09f-27e4365a7f2a
------------------------------------------------------------
[08:31:36] 🔵 2026-02-04T07:31:36.878Z INFO ❌ [ERROR] API Connection Failed
[08:31:36] 🟣 END RequestId: 4699ba64-1f10-4f78-b09f-27e4365a7f2a
[08:31:36] 🟣 REPORT RequestId: 4699ba64... Duration: 1341.57 ms
```

### Example Output (Clean)

```text
🔍 Checking: finops-tag-inventory (us-east-1)...
   ✅ No errors or warnings found.
```

---

## Troubleshooting

### "AWS credentials are invalid or expired"
The script validates your session. If expired, it will suggest:
```text
💡 Tip: Your AWS credentials may be expired. Try running:
   aws sso login
```

### "Permission denied"
Make the script executable:
```bash
chmod +x scripts/check-lambda-logs.sh
```

### "No logs found"
1. Verify you are in the correct **Region** (defined in script config).
2. Check if the **Lambda name** matches the configuration array.
3. Ensure the time window (`minutes`) is large enough.

---

## Configuration (for reuse)

Edit the top section of `scripts/check-lambda-logs.sh` to adapt it to other projects:

```bash
SCRIPT_TITLE="My Project Log Review"
REGION_TEST="us-east-1"
REGION_PROD="us-west-2"
LAMBDAS=(
    "my-lambda-1"
    "my-lambda-2"
)
```

**Requirements:**
- AWS CLI v2 installed
- `jq` (optional but recommended for faster JSON parsing)
