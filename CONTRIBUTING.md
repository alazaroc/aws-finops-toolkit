# Contributing to AWS FinOps Toolkit

Thanks for your interest in contributing. This guide describes how to get started.

## How to contribute

### Reporting issues

1. Search existing issues first to avoid duplicates
2. Provide detailed information:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node.js version, AWS CLI version)
   - Relevant logs

### Suggesting features

1. Open a request with:
   - Clear feature description
   - Use case and benefits
   - Proposed approach (if applicable)

### Code contributions

1. Fork the repository
2. Create a branch using a descriptive prefix: `git checkout -b feature/my-feature` (or `fix/`, `docs/`, `refactor/`).
3. Make changes following code standards
4. Add tests
5. Update documentation if applicable
6. Open Pull Request

## Development setup

### Prerequisites

- Node.js 22+
- AWS CLI configured
- AWS SAM CLI installed

### Getting started

```bash
git clone https://github.com/alazaroc/aws-finops-toolkit.git
cd aws-finops-toolkit
npm install
npm test
npm run build
npm run lint
```

## Code standards

### TypeScript/JavaScript

- Use TypeScript for new code
- Follow ESLint configuration
- Use meaningful names
- Prefer `const` over `let`

### Formatting

- Run `npm run format` to keep TypeScript/JSON/MD files aligned with the shared `.prettierrc` rules and the `.editorconfig` whitespace settings.
- Because Prettier enforces `LF` line endings, double quotes, trailing commas, and the configured print width, run the formatter before committing so diffs only show meaningful changes.
- If your editor supports format-on-save, point it to this workspace’s Prettier config so you get the same results on macOS and Windows.

### File organization

```
src/
  core/            # Shared core utilities (Config, Logger, etc.)
  domain/          # Business logic (Cost analysis, Compliance rules, etc.)
  infrastructure/  # Infrastructure services (HTML building, S3, SES, etc.)
  lambdas/         # Lambda entry points
    compliance-checker/
    cost-analyzer/
    historical-cost-analyzer/
    optimization-insights/
    tag-inventory/
  types/           # Shared type definitions
```

### Error handling

```typescript
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  console.error("Operation failed:", error);
  throw new Error(`Failed to perform operation: ${error.message}`);
}
```

### Logging

```typescript
console.log(
  JSON.stringify({
    level: "info",
    message: "Cost analysis completed",
    projectCount: projects.length,
    totalCost: totalCost,
  })
);
```

## Testing

```bash
npm test
npm run test:coverage
npm run test:watch
```

## Pull Request process

Before submitting:

1. `npm test`
2. `npm run lint`
3. `npm run build`
4. Update documentation if applicable

Description template:

```markdown
## What

Brief description of changes

## Why

Motivation and context

## How

Implementation approach

## Testing

How you tested the changes
```

## Maintainers

- Alejandro Lazaro Chueca (`@alazaroc` on GitHub) – please use GitHub issues/PRs or the profile contact information for follow-up questions.
