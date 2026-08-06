# Deployment Script Guide

`scripts/deploy.js` wraps `sam build` + `sam deploy` using the values from `config/config.yml`.
Always use `npm run deploy` instead of running `sam deploy` directly.

## Requirements

- Node.js 22+, AWS CLI, AWS SAM CLI
- `config/config.yml` configured (see `config/config.example.yml`)
- Valid AWS credentials

```bash
node --version && aws --version && sam --version
```

### AWS credentials

Any of these options work:

- AWS SSO: `aws sso login --profile your-profile`
- Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- Default profile: `~/.aws/credentials`

## Commands

| Command | Description |
| --- | --- |
| `npm run deploy` | Build and deploy |
| `npm run deploy -- --clean` | Clean build artifacts first, then deploy |
| `npm run diff` | Preview changes (CloudFormation changeset, no deploy) |
| `npm run diff:clean` | Same with clean build |

## What the script does

1. Reads and validates `config/config.yml`
2. Generates `template.generated.yaml` and `samconfig.generated.toml`
3. Validates AWS credentials (`aws sts get-caller-identity`)
4. Runs `sam build`
5. Runs `sam deploy` (or `--no-execute-changeset` when using `diff`)

> The generated files (`*.generated.*`) are temporary and can be deleted after deployment.

## Troubleshooting

| Error | Fix |
| --- | --- |
| `Missing config file: config/config.yml` | Copy `config.example.yml` and fill in your values |
| `Missing required config: email_config` | Add `email_config.from` and `email_config.to` to `config.yml` |
| `Command failed: aws sts get-caller-identity` | Configure or refresh AWS credentials |
| `No changes to deploy` | Stack is already up to date — no action needed |

### SAM CLI not found

```bash
pip install aws-sam-cli
```
