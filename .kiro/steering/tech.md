# Tech Stack

## Infrastructure

- **IaC**: AWS SAM (Serverless Application Model) with CloudFormation
- **Deployment**: Custom script `scripts/deploy.js` — always use `npm run deploy`, never `sam deploy` directly
- **Runtime**: Node.js 22.x on AWS Lambda
- **Language**: TypeScript strict mode (target ES2022, module CommonJS, moduleResolution node)
- **Output**: `dist/` (declarations + sourcemaps enabled)

## Architecture Decisions

| Decision          | Chosen                                          | Discarded alternative | Reason                                                                       |
| ----------------- | ----------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| IaC               | SAM                                             | CDK                   | Less complexity for pure lambdas, declarative template, faster deploys       |
| Module system     | CommonJS                                        | ESM                   | Direct compatibility with Lambda runtime without additional bundler          |
| Deploy            | Custom script                                   | sam deploy directly   | Generates dynamic template from config.yml, handles parameters automatically |
| Monorepo approach | Shared src/ with individual lambda package.json | Workspaces/Turborepo  | Simplicity — 5 lambdas don't justify monorepo tooling                        |

## AWS Services

**Data sources:**

- Cost Explorer API (costs, forecasts)
- Resource Groups Tagging API (resources and tags)
- Compute Optimizer, Cost Optimization Hub, Trusted Advisor (recommendations)
- Organizations, STS, IAM, Account (multi-account and metadata)

**Infrastructure:**

- Lambda (5 functions, 256MB, timeout 300s)
- S3 (report storage, 365-day lifecycle)
- SES (email delivery)
- EventBridge (scheduled execution)

## Dependencies

**Runtime** (in each lambda):

- `@aws-sdk/client-*` — Modular SDK v3 (only the clients needed per lambda)
- `yaml` — config.yml parsing

**Dev** (root only):

- TypeScript 5.x, Jest 29, ts-jest, ESLint 8, Prettier 3
- `aws-sdk-client-mock` — SDK mocking for unit tests
- `@types/aws-lambda` — Event handler types

## Build System

```bash
# Initial setup
npm run setup

# Build
npm run build              # Compile TypeScript → dist/
npm run build:watch        # Watch mode

# Testing
npm test                   # Jest (single run)
npm run test:watch         # Jest watch mode
npm run test:coverage      # With coverage report

# Quality
npm run lint               # ESLint check
npm run lint:fix           # ESLint autofix
npm run format             # Prettier write

# Deployment
npm run deploy             # Build + deploy SAM
npm run deploy:clean       # Clean build + deploy
npm run diff               # Preview changeset (dry run)
npm run diff:clean         # Preview with clean build

# Manual invocation
aws lambda invoke --function-name finops-cost-analyzer --payload '{}' response.json --region us-east-1

# Logs
./scripts/check-lambda-logs.sh 60 errors
```

## Configuration

- **Config file**: `config/config.yml` (copy from `config.example.yml`, gitignored)
- **Base template**: `template.yaml` (SAM/CloudFormation, versioned)
- **Generated template**: `template.generated.yaml` (created by deploy script, gitignored)
- **SAM config**: `samconfig.toml` (deploy parameters)
- The deploy script reads `config.yml` and generates CloudFormation parameters automatically

## Dependency Rules

- Each lambda declares its `@aws-sdk/client-*` in its own `package.json` — only what it uses
- Do not add runtime dependencies to root `package.json` (dev only)
- Shared dependencies (`yaml`) are declared in each lambda that needs them
- Use exact versions in lambdas for reproducible builds
- Before adding a new dependency, verify if the AWS SDK already covers it

## TypeScript Guidelines

- Strict mode always enabled — do not use `any` except in `sendCommand<T>()` (documented temporary workaround)
- Prefer interfaces over types for objects
- Export types from `src/types/finops-config.ts`
- Do not use enums; prefer union types or const objects
- Lambda handlers must explicitly type the event and return value

## Testing

- Framework: Jest with ts-jest
- Mocks: `aws-sdk-client-mock` to simulate SDK responses
- Structure: `tests/unit/` mirrors `src/` structure
- Scope: Only mock AWS SDK and filesystem; test business logic with real data
- Naming: `<filename>.test.ts`
