.DEFAULT_GOAL := help
.PHONY: help install build test lint lint-fix fix format quality-check validate aws-credentials release

# release (empty BUMP → interactive; BUMP=patch|minor|major → non-interactive)
BUMP ?=

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

## fix: lint:fix + format (auto-fix everything)
fix:
	npm run fix

## format: format code with Prettier
format:
	npm run format

## quality-check: lint + format check (sin tests)
quality-check:
	npm run quality:check

## validate: quality:check + tests
validate:
	npm run validate

## aws-credentials: propagate AWS_ACCESS_KEY_ID/SECRET/TOKEN from env to a profile (Usage: make aws-credentials [profile])
aws-credentials:
	@echo "💡 Recommended: use AWS SSO instead of static keys:"
	@echo "     aws sso login --sso-session personal"
	@echo "   and run with the associated profile (webs | management | blog | audit | logarchive), e.g.:"
	@echo "     AWS_PROFILE=webs make deploy"
	@echo "   Use this target ONLY if you need to dump temporary credentials to a profile."
	@echo ""
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

## release: validate + bump version + commit + tag + push (+ draft GitHub Release if the repo is public). No BUMP → interactive 1/2/3 (default minor); BUMP=patch|minor|major → non-interactive
release:
	@git diff --quiet && git diff --cached --quiet || \
	  (echo "❌ Uncommitted changes. Commit or stash before release." && exit 1)
	@BUMP="$(BUMP)"; \
	if [ -z "$$BUMP" ]; then \
	  echo "Which version bump do you want?"; \
	  echo "  1) major  (x.0.0 — big / breaking change)"; \
	  echo "  2) minor  (0.x.0 — new feature)  [default]"; \
	  echo "  3) patch  (0.0.x — small fix)"; \
	  printf "Option [1/2/3] (Enter = 2): "; \
	  read OPT; \
	  case "$$OPT" in \
	    1) BUMP=major ;; \
	    3) BUMP=patch ;; \
	    *) BUMP=minor ;; \
	  esac; \
	fi; \
	echo "→ Bumping version: $$BUMP"; \
	npm run validate && \
	npm version $$BUMP -m "Release v%s" && \
	git push --follow-tags && \
	TAG=v$$(node -p "require('./package.json').version"); \
	if gh repo view --json visibility -q .visibility 2>/dev/null | grep -q PUBLIC; then \
	  PREV=$$(git describe --tags --abbrev=0 "$$TAG^" 2>/dev/null); \
	  if [ -n "$$PREV" ]; then RANGE="$$PREV..$$TAG"; else RANGE="$$TAG"; fi; \
	  NOTES=$$(git log --no-merges --pretty='- %s' "$$RANGE" | grep -vE '^- Release v' || true); \
	  if [ -z "$$NOTES" ]; then NOTES="- No notable changes."; fi; \
	  BODY=$$(printf '## What'"'"'s Changed\n\n%s\n' "$$NOTES"); \
	  if [ -n "$$PREV" ]; then \
	    REPO=$$(gh repo view --json nameWithOwner -q .nameWithOwner); \
	    BODY=$$(printf '%s\n\n**Full Changelog**: https://github.com/%s/compare/%s...%s\n' "$$BODY" "$$REPO" "$$PREV" "$$TAG"); \
	  fi; \
	  URL=$$(gh release create "$$TAG" --notes "$$BODY" --draft --title "$$TAG") && \
	  echo "" && \
	  echo "📝 Draft GitHub Release created for public repo: $$TAG" && \
	  echo "   Review and publish it manually at:" && \
	  echo "   $$URL"; \
	else \
	  echo "✅ Private release (tag only): $$TAG"; \
	fi


# Catch-all: allows positional arguments for targets like aws-credentials
ifneq ($(filter aws-credentials,$(MAKECMDGOALS)),)
%:
	@:
endif
