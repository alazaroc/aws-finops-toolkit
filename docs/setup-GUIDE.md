# Setup Script Guide

`scripts/setup.js` installs all project dependencies — root and each Lambda function — in one command.

## Usage

```bash
npm run setup
```

Run this after cloning or whenever new dependencies are added.

## What it does

1. Runs `npm install` in the project root
2. Scans `src/lambdas/` for subdirectories containing a `package.json`
3. Runs `npm install` in each of them

## Requirements

- Node.js 22+ — `node --version`
- npm — `npm --version`

## When to run

- After cloning the repository
- After pulling changes that add new dependencies
- After deleting `node_modules/` folders

## Troubleshooting

**`[setup] Failed to run npm install in: /path/to/directory`**
- Verify that `package.json` exists in that directory
- Check write permissions (`ls -la`)
- Check npm registry connectivity (`npm ping`)

**Node.js version issues**
```bash
node --version  # must be >= 22
# upgrade via nvm or fnm
```
