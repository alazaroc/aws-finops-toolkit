# Project Structure

## Architecture Pattern

Domain-Driven Design with layered architecture:

- **Core**: Shared utilities and base classes (used by all lambdas)
- **Domain**: Business logic organized by capability (costs, governance, optimization)
- **Infrastructure**: External integrations (email, storage, HTML)
- **Lambdas**: Entry points — thin handlers that orchestrate domain services

## Directory Layout

```
src/
├── core/                           # Shared by all lambdas
│   ├── base-service.ts             # BaseFinOpsService — abstract base class
│   ├── config-loader.ts            # YAML config parsing from config/config.yml
│   ├── logger.ts                   # Centralized logging
│   ├── arn-parser.ts               # ARN parsing utilities
│   ├── array-utils.ts              # Collection helpers
│   └── organization-service.ts     # AWS Organizations detection and queries
│
├── domain/
│   ├── costs/                      # Domain: cost analysis
│   │   ├── base-cost-service.ts    # Shared base for cost services
│   │   ├── cost-analysis-service.ts
│   │   ├── cost-explorer-client.ts # Typed wrapper over Cost Explorer API
│   │   └── historical-cost-service.ts
│   ├── governance/                 # Domain: compliance and tags
│   │   ├── compliance-service.ts
│   │   ├── tag-inventory-service.ts
│   │   ├── resource-discovery-service.ts  # Discovery via Resource Groups Tagging API
│   │   └── region-service.ts       # Active region listing
│   └── optimization/               # Domain: savings recommendations
│       ├── optimization-service.ts  # Main orchestrator
│       ├── aws-service-checker.ts   # Queries Compute Optimizer, Cost Opt Hub, Trusted Advisor
│       └── recommendation-consolidator.ts  # Deduplicates and prioritizes recommendations
│
├── infrastructure/                 # External integrations
│   ├── email-service.ts            # SES wrapper
│   ├── html-builder.ts             # HTML report generation
│   ├── storage-service.ts          # S3 wrapper
│   └── report-delivery-service.ts  # Orchestrates: generate HTML → save S3 → send email
│
├── lambdas/                        # Entry points (one per function)
│   ├── cost-analyzer/
│   ├── compliance-checker/
│   ├── tag-inventory/
│   ├── optimization-insights/
│   └── historical-cost-analyzer/
│   # Each has: index.ts, package.json, tsconfig.json, dist/
│
└── types/
    └── finops-config.ts            # Config type definitions

config/
├── config.example.yml              # Template (versioned)
└── config.yml                      # Actual config (gitignored)

scripts/
├── setup.js                        # Initial project setup
├── deploy.js                       # Custom SAM deployment
└── check-lambda-logs.sh            # Log analysis

tests/unit/                         # Jest tests (mirrors src/ structure)
├── core/
├── domain/
├── infrastructure/
└── lambdas/
```

## Key Conventions

- **Inheritance**: All services extend `BaseFinOpsService` for shared config and `sendCommand<T>()`
- **AWS SDK v3**: Never call `.send()` directly — use `this.sendCommand<T>(client, command)` for type safety
- **Config-driven**: All configuration comes from `config/config.yml` — no hardcoded values
- **Self-contained lambdas**: Each lambda has its own `package.json` with only the dependencies it needs
- **Shared code**: Lambdas import from parent `src/` directories (core, domain, infrastructure)
- **Reports**: Stored in S3 bucket `finops-toolkit-reports-{accountId}`
- **Naming**: kebab-case for files, PascalCase for classes, camelCase for functions/variables

## Data Flow

1. EventBridge triggers Lambda on schedule defined in config
2. Lambda handler loads config via `ConfigLoader`
3. Handler instantiates the corresponding domain service
4. Service queries AWS APIs (Cost Explorer, Resource Groups, etc.)
5. Service processes and analyzes data
6. `ReportDeliveryService` generates HTML, saves to S3, and sends via SES

## Adding a New Lambda

1. Create directory `src/lambdas/<name>/` with `index.ts`, `package.json`, `tsconfig.json`
2. Create the domain service in `src/domain/<domain>/`
3. Add the function in `template.yaml` (copy pattern from an existing one)
4. Add entry in `config/config.example.yml` under `lambdas:` and `schedules:`
5. Update types in `src/types/finops-config.ts`
6. Register in `scripts/deploy.js` if it needs additional CloudFormation parameters
7. Create tests in `tests/unit/` mirroring the structure

## Patterns to Follow

- **Error handling**: Services must catch errors from individual APIs and continue (partial report > total failure)
- **Throttling**: Use exponential backoff if an API returns throttling (don't retry infinitely)
- **Regions**: Never hardcode regions; use `region-service.ts` or config
- **Circular imports**: core ← domain ← infrastructure ← lambdas (unidirectional dependency, never reversed)
