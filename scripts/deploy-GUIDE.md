# AWS SAM Deployment Script Guide

This guide explains how to use `scripts/deploy.js` to deploy the AWS FinOps Toolkit.
It is designed to be reused in other projects with minimal changes.

## Quick start

```bash
npm run deploy
```

**Note**: This is the recommended way to run deployments.

## Requirements

- Node.js installed and available in `PATH`
- AWS CLI installed and configured
- AWS SAM CLI installed
- A correctly configured `config/config.yml`

### Verify requirements

```bash
node --version
aws --version
sam --version
```

### AWS credentials

You can use any of the following options:

- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`)
- AWS SSO (`aws sso login --profile your-profile`)
- Default AWS profile (`~/.aws/credentials`)

## Script location

```text
scripts/deploy.js
```

## Configuration (edit once per project)

The script reads configuration from `config/config.yml`. Required values include:

- `email_config`: Email configuration (`from`, `to`, and `display_name`)
- `required_tags`: Required tags for resources
- `schedules`: Lambda function schedules
- `cost_analysis`: Cost analysis configuration

### Minimal configuration example

```yaml
# Email configuration
email_config:
  from: "your-email@domain.com" # Sender email (must be verified in SES)
  to: ["your-email@domain.com"] # List of recipients
  display_name: "aws-finops-toolkit" # Optional sender display name

required_tags: ["project", "owner", "environment"]
schedules:
  cost_analysis: "cron(0 9 1 * ? *)"
  compliance_check: "cron(0 9 ? * MON *)"
  tag_inventory: "cron(0 10 1 * ? *)"
  optimization_insights: "cron(0 11 1 * ? *)"
```

## Usage

```bash
npm run deploy [-- --clean]
npm run diff
```

**Recommended**: Prefer `npm run deploy` instead of running the script directly.

Use `npm run diff` when you want to preview changes against the deployed CloudFormation stack without actually deploying.

### Direct execution (alternative)

```bash
node scripts/deploy.js [--clean] [--diff]
```

### Parameters

| Parameter | Description                    | Allowed values | Default     |
| -------- | ------------------------------ | -------------- | ----------- |
| `--clean` | Cleans previous build artifacts | optional flag  | not included |
| `--diff` | Creates a CloudFormation changeset and prints the diff (does not deploy) | optional flag | not included |

**Note**: When using `npm run deploy`, add `--` before script arguments: `npm run deploy -- --clean`

## Examples

```bash
# Standard deployment (RECOMMENDED)
npm run deploy

# Deployment with pre-clean (RECOMMENDED)
npm run deploy -- --clean

# Preview diff (no deployment)
npm run diff

# Preview diff with clean build
npm run diff:clean

# Direct execution (alternative)
node scripts/deploy.js

# Direct execution with clean (alternative)
node scripts/deploy.js --clean

# Direct diff (alternative)
node scripts/deploy.js --diff
```

## What the script does

1. **Validation**: Verifies that `config/config.yml` exists and contains required values
2. **Processing**: Converts YAML configuration into SAM parameters
3. **Generation**: Creates `template.generated.yaml` and `samconfig.generated.toml`
4. **Credentials**: Validates AWS credentials via `aws sts get-caller-identity`
5. **Build**: Runs `sam build` using the generated template
6. **Deploy/Diff**: Runs `sam deploy` with processed parameters (or `--no-execute-changeset` when `--diff` is used)

## Generated files

The script creates temporary files during deployment:

- `template.generated.yaml`: SAM template with processed tags and parameters
- `samconfig.generated.toml`: SAM configuration with values derived from `config/config.yml`

These files can be removed after deployment if needed.

## Output interpretation

### Successful output

```text
Deploying SAM application with config.yml overrides...
Validating AWS credentials...
Building SAM application...
Deploying SAM application with config.yml overrides...
```

### Common errors

```text
Missing config file: config/config.yml
→ Create the configuration file

Missing required config: email_config
→ Add email configuration to config.yml

Invalid number for cost_analysis.total_monthly_threshold
→ Verify that numeric values are valid

Command failed: aws sts get-caller-identity
→ Configure AWS credentials
```

## Automation

### CI/CD integration

```bash
# In CI/CD (RECOMMENDED)
npm install
npm run deploy

# Direct alternative
npm install
node scripts/deploy.js
```

### Full deployment script

```bash
#!/bin/bash
npm run install
npm run build
npm run deploy  # RECOMMENDED
```

## Reuse in other projects

When copying this script to another project, change only:

- Configuration file paths (if needed)
- Project-specific SAM parameter names
- Domain-specific validation logic

Avoid editing the command-execution logic unless you are adding new features.

## Troubleshooting

### Permission issues

```bash
# Recommended option
npm run deploy

# Windows (direct alternative)
node scripts/deploy.js

# Unix/Linux/Mac (direct alternative)
chmod +x scripts/deploy.js
node scripts/deploy.js
```

### Dependency issues

```bash
npm install
npm run deploy  # RECOMMENDED
```

### SAM CLI issues

```bash
# Verify installation
sam --version

# Reinstall if needed
pip install aws-sam-cli
```
