# AWS FinOps Toolkit - Roadmap

## Philosophy

This toolkit complements existing AWS services.  
It doesn't attempt to replace Cost Explorer, Budgets, Trusted Advisor, or Compute Optimizer.

## Current status

Implemented and in use:

- Automated cost analysis (configurable cron)
- Cost anomaly detection
- Automated tag compliance
- Tag inventory with similarity detection
- HTML email reports (SES) and JSON in S3
- Manual lambda invocation for historical cost analysis (stores JSON/HTML in S3)
- **Optimization insights with consolidated recommendations from:**
  - Cost Optimization Hub (rightsizing and purchasing recommendations)
  - Trusted Advisor (cost optimization checks)
  - Compute Optimizer (EC2, Lambda, EBS recommendations)

## Recommended features to implement

### 1. Enhanced email reports (Low effort, High value)

- Add month-to-month cost comparison
- Include top 3 optimization opportunities in cost emails
- Add cost trend indicators (↑↓) in subject lines

### 2. Slack/Teams notifications (Medium effort, High value)

- Simple webhook integration
- Send summary notifications to team channels
- Alert on significant cost increases

### 3. Tag remediation suggestions (Medium effort, Medium value)

- Generate CSV with suggested tag fixes
- Provide AWS CLI commands for bulk tag updates
- Focus on case normalization and typo fixes

### 4. Multi-account support (High effort, High value)

- Cross-account report consolidation

## What we won't do

- Budget management and forecasting (use AWS Budgets / Cost Explorer)
- PDF reports (HTML emails are sufficient)
- Team-specific compliance reports (already covered by tag filtering)
- Proactive budget alerts (duplicates AWS Budgets functionality)

## Implementation priority

**High Priority** (implement next):

1. Enhanced email reports with trends
2. Slack/Teams integration

**Medium Priority** (consider later):

1. Tag remediation suggestions
2. Multi-account support
