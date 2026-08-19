.PHONY: help install build test lint lint-fix format quality-check validate aws-credentials

help:
	@echo "aws-finops-toolkit — available commands:"
	@grep -E '^## ' $(MAKEFILE_LIST) | sed -E 's/^## /  /'

## install: install dependencies
install:
	npm install

## build: compile TypeScript
build:
	npm run build

## test: run tests
test:
	npm test

## lint: run ESLint
lint:
	npm run lint

## lint-fix: auto-fix lint problems
lint-fix:
	npm run lint:fix

## format: format code with Prettier
format:
	npm run format

## quality-check: lint + format check (sin tests)
quality-check:
	npm run quality:check

## validate: quality:check + tests
validate:
	npm run validate

## aws-credentials: propagates AWS_ACCESS_KEY_ID/SECRET/TOKEN from env to the given profile
aws-credentials: ## Propagate AWS credentials to a profile (Usage: make aws-credentials [name])
	@if [ -z "$$AWS_ACCESS_KEY_ID" ] || [ -z "$$AWS_SECRET_ACCESS_KEY" ]; then \
		echo "❌ Export the variables first:"; \
		echo "  export AWS_ACCESS_KEY_ID=\"...\""; \
		echo "  export AWS_SECRET_ACCESS_KEY=\"...\""; \
		echo "  export AWS_SESSION_TOKEN=\"...\""; \
		exit 1; \
	fi
	@mkdir -p ~/.aws
	@PROF="$(word 2,$(MAKECMDGOALS))"; PROF=$${PROF:-default}; \
	aws configure set aws_access_key_id "$$AWS_ACCESS_KEY_ID" --profile "$$PROF"; \
	aws configure set aws_secret_access_key "$$AWS_SECRET_ACCESS_KEY" --profile "$$PROF"; \
	if [ -n "$$AWS_SESSION_TOKEN" ]; then \
		aws configure set aws_session_token "$$AWS_SESSION_TOKEN" --profile "$$PROF"; \
	fi; \
	echo "✅ Credentials saved to ~/.aws/credentials (profile $$PROF)"


# Catch-all: allows positional arguments for targets like aws-credentials
ifneq ($(filter aws-credentials,$(MAKECMDGOALS)),)
%:
	@:
endif
