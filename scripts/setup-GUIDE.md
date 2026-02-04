# Dependency Installation - Script Guide

This guide explains how to use `scripts/setup.js` to install all AWS FinOps Toolkit dependencies.
It is designed to be reused in other projects with minimal changes.

## Quick start

```bash
node scripts/setup.js
```

## Requirements

- Node.js installed and available in `PATH`
- npm installed (bundled with Node.js)

### Verify requirements

```bash
node --version
npm --version
```

## Script location

```text
scripts/setup.js
```

## Configuration (edit once per project)

All hardcoded values are grouped near the top of the script. Update these when reusing the script in another project:

- `rootDir`: Project root directory
- `lambdasDir`: Directory that contains the Lambda functions
- `npmCmd`: npm command to use

### Recommended approach

1. Open `scripts/setup.js`
2. Change only the variables in the "Configuration" block
3. Keep the rest of the logic intact

## Usage

```bash
node scripts/setup.js
```

### Via npm (recommended)

```bash
npm run install
```

## What the script does

1. **Root install**: Runs `npm install` in the project root
2. **Discovery**: Finds subdirectories in `src/lambdas/` that contain a `package.json`
3. **Lambda installs**: Runs `npm install` in each discovered Lambda directory

## Expected project structure

```text
project/
├── package.json                    # ← npm install here
├── src/
│   └── lambdas/
│       ├── lambda1/
│       │   └── package.json        # ← npm install here
│       ├── lambda2/
│       │   └── package.json        # ← npm install here
│       └── lambda3/
│           └── package.json        # ← npm install here
└── scripts/
    └── setup.js
```

## Output interpretation

### Normal output

```text
[setup] npm install in: /path/to/project
[setup] npm install in: /path/to/project/src/lambdas/cost-analyzer
[setup] npm install in: /path/to/project/src/lambdas/compliance-checker
[setup] npm install in: /path/to/project/src/lambdas/tag-inventory
```

### Errors

```text
[setup] Failed to run npm install in: /path/to/directory
→ Verify that package.json exists in that directory
→ Verify write permissions
→ Verify connectivity to the npm registry
```

## Advantages over manual installation

### Without the script (manual)

```bash
npm install
npm install --prefix src/lambdas/cost-analyzer
npm install --prefix src/lambdas/compliance-checker
npm install --prefix src/lambdas/tag-inventory
npm install --prefix src/lambdas/optimization-insights
npm install --prefix src/lambdas/historical-cost-analyzer
```

### With the script (automatic)

```bash
node scripts/setup.js
```

## npm options used

The script uses these options to speed up installation:

- `--loglevel=warn`: Reduces log verbosity
- `--progress=false`: Disables the progress bar
- `--no-audit`: Skips security audit (faster)
- `--no-fund`: Skips funding messages

## Automation

### Local development

```bash
# After cloning the repository
git clone <repo>
cd <project>
node scripts/setup.js
```

### CI/CD

```bash
# In a CI/CD pipeline
node scripts/setup.js
npm run build
npm test
```

### Full setup script

```bash
#!/bin/bash
echo "Installing dependencies..."
node scripts/setup.js

echo "Building project..."
npm run build

echo "Running tests..."
npm test

echo "Setup complete!"
```

## Reuse in other projects

When copying this script to another project, change only:

- `lambdasDir`: If your Lambda functions are in a different location
- Expected directory structure
- npm options (if needed)

Avoid editing detection/execution logic unless you are adding new functionality.

## Troubleshooting

### Permission issues

```bash
# Verify directory permissions
ls -la

# On Windows, run as Administrator if needed
# On Unix/Linux/Mac
sudo node scripts/setup.js  # Only if absolutely necessary
```

### npm connectivity issues

```bash
# Verify connectivity
npm ping

# Configure proxy (if needed)
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
```

### Node.js version issues

```bash
# Check your Node.js version
node --version

# Upgrade Node.js if needed
# Use nvm, fnm, or the official installer
```

## When to use this script

- **Initial development**: After cloning the repository
- **After changes**: When new dependencies are added
- **CI/CD**: As part of a build pipeline
- **Cleanup**: After deleting `node_modules/`
- **New developers**: To set up the environment quickly

