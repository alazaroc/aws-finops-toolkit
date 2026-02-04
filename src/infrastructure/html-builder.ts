import type { ServiceAvailabilityReport } from "../domain/optimization/aws-service-checker";

/**
 * HTML Report Builder
 * Centralizes HTML report generation to eliminate duplication
 */
export class HtmlReportBuilder {
  private static readonly CSS_STYLES = `
    body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f7fb; color: #1f2937; }
    h1 { margin: 0 0 8px; font-size: 1.6rem; }
    h2 { margin: 0 0 10px; font-size: 1.25rem; }
    h3 { margin: 18px 0 8px; font-size: 1.1rem; }
    .header { background-color: #f7f9fc; padding: 14px 18px; border-radius: 8px; border: 1px solid #e3e8ef; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .meta-list { margin: 10px 0 0 18px; padding: 0; list-style-type: disc; }
    .meta-list li { margin: 6px 0; }
    .summary { margin: 20px 0; padding: 16px 18px; background-color: #f7f7f7; border-radius: 8px; border: 1px solid #e3e8ef; }
    .executive-summary { margin: 20px 0; padding: 20px; background-color: #e8f5e8; border-radius: 8px; border-left: 4px solid #2e7d32; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    .summary-list { margin: 10px 0 0 18px; padding: 0; list-style-type: disc; }
    .summary-list li { margin: 6px 0; }
    .note { margin: 8px 0 0; font-size: 0.9em; color: #4b5563; }
    .section-divider { border: 0; border-top: 1px solid #dfe3ea; margin: 22px 0; }
    .service-status { margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-radius: 5px; }
    .service-item { margin: 10px 0; padding: 10px; border-radius: 3px; }
    .service-available { background-color: #e8f5e8; border-left: 4px solid #2e7d32; }
    .service-unavailable { background-color: #ffebee; border-left: 4px solid #d32f2f; }
    .service-limited { background-color: #fff3cd; border-left: 4px solid #ff9800; }
    .recommendations-section { margin: 20px 0; }
    .recommendation-category { margin: 18px 0; padding: 16px; background-color: #eef2f7; border-radius: 8px; border: 1px solid #dfe7f1; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
    .recommendations-list { margin: 12px 0; }
    .recommendation-card { margin: 14px 0; padding: 16px; background-color: #ffffff; border-radius: 12px; border: 1px solid #d7dee8; border-left: 6px solid #007cba; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
    .recommendation-card + .recommendation-card { margin-top: 16px; }
    .recommendation-card h4 { margin: 8px 0 6px; }
    .recommendation-card p { margin: 6px 0; }
    .recommendation-card.priority-high { border-left-color: #d32f2f; }
    .recommendation-card.priority-medium { border-left-color: #ff9800; }
    .recommendation-card.priority-low { border-left-color: #2e7d32; }
    .recommendation-card.priority-high { background-color: #ffebee; }
    .recommendation-card.priority-medium { background-color: #fff8e1; }
    .recommendation-card.priority-low { background-color: #e8f5e8; }
    .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; padding-bottom: 6px; border-bottom: 1px dashed #d7dee8; }
    .action-text { margin-left: auto; font-size: 0.9em; color: #4b5563; }
    .resource-type { background-color: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: 500; }
    .action-type { background-color: #f3e5f5; color: #7b1fa2; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: 500; }
    .resource-id { margin: 8px 0; }
    .resource-id code { background-color: #f1f3f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; color: #1a73e8; }
    .tagging-command { margin: 10px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; overflow-x: auto; }
    .tagging-command code { font-family: monospace; color: #0f172a; }
    .savings { margin: 8px 0; font-size: 1.1em; }
    .details { display: flex; gap: 20px; margin: 8px 0; font-size: 0.9em; flex-wrap: wrap; }
    .effort-low { color: #2e7d32; font-weight: 500; }
    .effort-medium { color: #ff9800; font-weight: 500; }
    .effort-high { color: #d32f2f; font-weight: 500; }
    .console-button { display: inline-block; background-color: #007cba; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 0.9em; font-weight: 500; }
    .console-button:hover { background-color: #005a8b; }
    .priority-badge { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 0.8em; font-weight: bold; color: white; }
    .badge-high { background-color: #d32f2f; }
    .badge-medium { background-color: #ff9800; }
    .badge-low { background-color: #2e7d32; }
    .type-badge { display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 0.75em; font-weight: 600; color: #1f2937; background-color: #e0e7ff; }
    .type-coh { background-color: #e3f2fd; color: #0d47a1; }
    .type-ta { background-color: #ede7f6; color: #4527a0; }
    .type-co { background-color: #e8f5e8; color: #1b5e20; }
    .console-link { display: inline-block; background-color: #007cba; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 0.9em; font-weight: 500; }
    .console-link:hover { background-color: #005a8b; }
    .savings-highlight { font-size: 1.2em; font-weight: bold; color: #2e7d32; }
    .no-recommendations { text-align: left; color: #666; font-style: italic; }
    .table-container { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 12px 0; }
    table { border-collapse: collapse; width: 100%; margin: 0; min-width: 520px; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
    th { background-color: #f2f2f2; font-size: 1rem; font-weight: 700; }
    .table-note { margin: 6px 0 0; font-size: 0.9em; color: #4b5563; }
    .breakdown-section { margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px; }
    .footer-info { margin: 20px 0; }
    .plain-list { margin-left: 18px; }
    @media (max-width: 640px) {
      body { margin: 14px; }
      th, td { padding: 6px 8px; font-size: 0.95rem; }
      table { min-width: 440px; }
    }
  `;

  /**
   * Build complete HTML document
   */
  static buildHtmlDocument(title: string, body: string): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${title}</title>
        <style>${this.CSS_STYLES}</style>
    </head>
    <body>
        ${body}
    </body>
    </html>
    `;
  }

  /**
   * Format regions consistently across reports.
   * Example: "3 (global, us-east-1, eu-south-2)"
   */
  static formatRegionsAnalyzed(
    regions: Array<string | undefined | null>,
    options: { maxList?: number } = {}
  ): string {
    const maxList = options.maxList;
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const region of regions) {
      const trimmed = (region ?? "").trim();
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(trimmed);
    }

    const globalIndex = unique.findIndex((r) => r.toLowerCase() === "global");
    if (globalIndex > 0) {
      const [globalRegion] = unique.splice(globalIndex, 1);
      unique.unshift(globalRegion);
    }

    const count = unique.length;
    if (count === 0) {
      return "0";
    }

    const displayed =
      typeof maxList === "number" && Number.isFinite(maxList) && count > maxList
        ? `${unique.slice(0, maxList).join(", ")} (+${count - maxList} more)`
        : unique.join(", ");

    return `${count} (${displayed})`;
  }

  /**
   * Build report header section
   */
  static buildHeader(config: {
    date: Date;
    accountId: string;
    additionalInfo?: Record<string, any>;
  }): string {
    const { date, accountId, additionalInfo = {} } = config;

    let html = `
        <div class="header">
            <ul class="meta-list">
                <li><strong>📅 Date:</strong> ${this.formatDate(date)}</li>
                <li><strong>🏢 Account:</strong> ${accountId}</li>
    `;

    // Add additional info
    for (const [key, value] of Object.entries(additionalInfo)) {
      html += `<li><strong>${key}:</strong> ${value}</li>\n`;
    }

    html += `</ul></div>\n`;

    return html;
  }

  /**
   * Build executive summary section
   */
  static buildExecutiveSummary(config: {
    date?: Date;
    accountId?: string;
    totalSavings?: number;
    itemCount?: number | string;
    itemLabel?: string;
    topItem?: any;
    additionalMetrics?: Record<string, any>;
    title?: string;
    description?: string;
  }): string {
    const {
      date,
      accountId,
      totalSavings,
      itemCount,
      itemLabel = "📋 Total Items",
      topItem,
      additionalMetrics = {},
      title = "📊 Executive Summary",
      description,
    } = config;

    let html = `
        <div class="executive-summary">
            <h2>${title}</h2>
            ${description ? `<p class="note">${description}</p>` : ""}
            <ul class="summary-list">
    `;

    if (date) {
      html += `<li><strong>📅 Date:</strong> ${this.formatDateLong(date)}</li>\n`;
    }

    if (accountId) {
      html += `<li><strong>🏢 Account:</strong> ${accountId}</li>\n`;
    }

    if (totalSavings !== undefined) {
      html += `
            <li><strong>💵 Total Monthly Cost:</strong> <span class="savings-highlight">$${totalSavings.toFixed(2)}</span></li>
      `;
    }

    if (itemCount !== undefined) {
      html += `<li><strong>${itemLabel}:</strong> ${itemCount}</li>\n`;
    }

    if (topItem) {
      const label = topItem.label || "🏆 Top Opportunity";
      const value = topItem.value || topItem.description || topItem.name || "N/A";
      html += `<li><strong>${label}:</strong> ${value}</li>\n`;
    }

    // Add additional metrics
    for (const [key, value] of Object.entries(additionalMetrics)) {
      html += `<li><strong>${key}:</strong> ${value}</li>\n`;
    }

    html += `</ul></div>\n`;

    return html;
  }

  /**
   * Build a generic metrics section (no savings wording)
   */
  static buildMetricsSection(config: {
    title: string;
    metrics: Record<string, any>;
    className?: string;
  }): string {
    const { title, metrics, className = "executive-summary" } = config;

    let html = `
        <div class="${className}">
            <h2>${title}</h2>
            <ul class="summary-list">
    `;

    for (const [key, value] of Object.entries(metrics)) {
      html += `<li><strong>${key}:</strong> ${value}</li>\n`;
    }

    html += `</ul></div>\n`;

    return html;
  }

  /**
   * Build recommendations section
   */
  static buildRecommendationsSection(
    recommendations: any[],
    config: {
      title?: string;
      groupBy?: string;
      maxPerGroup?: number;
      showConsoleLinks?: boolean;
      showSavings?: boolean;
      showGroupSavings?: boolean;
    } = {}
  ): string {
    const {
      title = "🎯 Recommendations",
      groupBy,
      maxPerGroup = 10,
      showConsoleLinks = true,
      showSavings = true,
      showGroupSavings = true,
    } = config;

    if (recommendations.length === 0) {
      return `
        <div class="recommendations-section">
            <h2>${title}</h2>
            <div class="no-recommendations">
                <p>🎉 No issues found at this time.</p>
                <p>Your AWS resources appear to be well-optimized!</p>
            </div>
        </div>
      `;
    }

    let html = `
        <div class="recommendations-section">
            <h2>${title}</h2>
    `;

    if (groupBy) {
      // Group recommendations
      const groups = this.groupRecommendations(recommendations, groupBy);

      for (const [groupName, groupRecs] of Object.entries(groups)) {
        const displayRecs = groupRecs.slice(0, maxPerGroup);
        const totalSavings = groupRecs.reduce(
          (sum: number, rec: any) => sum + (rec.estimatedMonthlySavings || rec.savings || 0),
          0
        );

        html += `
            <div class="recommendation-category">
                <h3>${this.getGroupIcon(groupName)} ${groupName}</h3>
                ${showGroupSavings ? `<p><strong>Group Savings:</strong> <span class="savings-highlight">$${totalSavings.toFixed(2)}/month</span> | <strong>Count:</strong> ${groupRecs.length}</p>` : `<p><strong>Count:</strong> ${groupRecs.length}</p>`}
                
                <div class="recommendations-list">
        `;

        for (const rec of displayRecs) {
          html += this.buildRecommendationCard(rec, showConsoleLinks, showSavings);
        }

        if (groupRecs.length > maxPerGroup) {
          html += `
                    <div class="more-recommendations">
                        <p><em>... and ${groupRecs.length - maxPerGroup} more recommendations in this category</em></p>
                    </div>
          `;
        }

        html += `
                </div>
            </div>
        `;
      }
    } else {
      // Show all recommendations without grouping
      html += `<div class="recommendations-list">`;

      for (const rec of recommendations.slice(0, maxPerGroup)) {
        html += this.buildRecommendationCard(rec, showConsoleLinks, showSavings);
      }

      if (recommendations.length > maxPerGroup) {
        html += `
            <div class="more-recommendations">
                <p><em>... and ${recommendations.length - maxPerGroup} more recommendations</em></p>
            </div>
        `;
      }

      html += `</div>`;
    }

    html += `</div>\n`;

    return html;
  }

  /**
   * Build individual recommendation card
   */
  private static buildRecommendationCard(
    rec: any,
    showConsoleLinks: boolean,
    showSavings: boolean
  ): string {
    const priority = rec.priority || "medium";
    const priorityClass = `priority-${priority}`;
    const priorityBadgeClass = `badge-${priority}`;
    const savings = rec.estimatedMonthlySavings || rec.savings || 0;
    const resourceType = rec.resourceType || "Resource";
    const actionType = rec.actionType || "Optimize";
    const description =
      rec.description || `${actionType} ${resourceType} ${rec.resourceId || rec.id}`;

    let html = `
        <div class="recommendation-card ${priorityClass}">
            <div class="card-header">
                <span class="priority-badge ${priorityBadgeClass}">${priority.toUpperCase()}</span>
                <span class="resource-type">${resourceType}</span>
                <span class="action-text">Action: ${actionType}</span>
            </div>
            <h4>${description}</h4>
            ${showSavings ? `<p class="savings"><strong>💵 Monthly Savings:</strong> <span class="savings-highlight">$${savings.toFixed(2)}</span></p>` : ""}
    `;

    if (rec.resourceId) {
      html += `
            <div class="resource-id">
                <strong>🔗 Resource:</strong> <code>${rec.resourceId}</code>
            </div>
      `;
    }

    if (rec.taggingCommand) {
      html += `
            <div class="tagging-command">
                <strong>🏷️ Tagging command:</strong>
                <pre><code>${rec.taggingCommand}</code></pre>
            </div>
      `;
    }

    if (rec.implementationEffort) {
      const effortClass = `effort-${rec.implementationEffort}`;
      html += `
            <div class="details">
                <span><strong>⚡ Effort:</strong> <span class="${effortClass}">${rec.implementationEffort}</span></span>
            </div>
      `;
    }

    if (showConsoleLinks && rec.consoleLink) {
      html += `
            <div class="actions">
                <a href="${rec.consoleLink}" class="console-button" target="_blank">View in AWS Console</a>
            </div>
      `;
    }

    html += `</div>\n`;

    return html;
  }

  /**
   * Build summary table
   */
  static buildSummaryTable(
    data: Record<string, any>[],
    config: {
      title?: string;
      note?: string;
      columns: { key: string; label: string; format?: (value: any, row: any) => string }[];
    }
  ): string {
    const { title, columns, note } = config;

    let html = "";

    if (title) {
      html += `<h3>${title}</h3>\n`;
    }

    if (note) {
      html += `<p class="table-note">${note}</p>\n`;
    }

    html += `
        <div class="table-container">
        <table>
            <tr>
    `;

    for (const col of columns) {
      html += `<th>${col.label}</th>`;
    }

    html += `
            </tr>
    `;

    for (const row of data) {
      html += `<tr>`;

      for (const col of columns) {
        const value = row[col.key];
        const formattedValue = col.format ? col.format(value, row) : value;
        html += `<td>${formattedValue}</td>`;
      }

      html += `</tr>\n`;
    }

    html += `</table>\n</div>\n`;

    return html;
  }

  /**
   * Build a simple bullet list
   */
  static buildList(items: string[], title?: string): string {
    if (items.length === 0) {
      return "";
    }

    let html = "";
    if (title) {
      html += `<h3>${title}</h3>\n`;
    }

    html += `<ul class="summary-list">\n`;
    for (const item of items) {
      html += `  <li>${item}</li>\n`;
    }
    html += `</ul>\n`;

    return html;
  }

  /**
   * Build footer section
   */
  static buildFooter(
    config: {
      s3Url?: string; // s3://...
      consoleUrl?: string; // console https link
      directUrl?: string; // direct s3 https link
      additionalInfo?: string[];
    } = {}
  ): string {
    const { s3Url, consoleUrl, directUrl, additionalInfo = [] } = config;

    let html = `
        <div class="footer-info">
            <h2>📋 Additional Information</h2>
            <ul class="summary-list plain-list">
    `;

    if (s3Url) {
      const displayUrl = directUrl || consoleUrl || s3Url;
      html += `<li><strong>JSON report (Direct):</strong> <a href="${displayUrl}">${directUrl || s3Url}</a></li>\n`;
      if (s3Url.startsWith("s3://")) {
        html += `<li><strong>JSON report (S3):</strong> <code>${s3Url}</code></li>\n`;
      }
    }

    for (const info of additionalInfo) {
      html += `<li>${info}</li>\n`;
    }

    html += `
            <li><em>This report was generated automatically by the AWS FinOps Toolkit.</em></li>
            </ul>
        </div>
    `;

    return html;
  }

  /**
   * Build AWS service availability status section
   */
  static buildServiceAvailabilitySection(serviceAvailability: ServiceAvailabilityReport): string {
    const cohStatus = serviceAvailability.services.costOptimizationHub;
    const taStatus = serviceAvailability.services.trustedAdvisor;
    const coStatus = serviceAvailability.services.computeOptimizer;

    const cohClass = cohStatus.available ? "service-available" : "service-unavailable";
    const cohIcon = cohStatus.available ? "✅" : "❌";

    const taClass = taStatus.available
      ? "service-available"
      : taStatus.status === "Limited"
        ? "service-limited"
        : "service-unavailable";
    const taIcon = taStatus.available ? "✅" : taStatus.status === "Limited" ? "⚠️" : "❌";

    const coClass = coStatus.available
      ? "service-available"
      : coStatus.status.includes("No Data")
        ? "service-limited"
        : "service-unavailable";
    const coIcon = coStatus.available ? "✅" : coStatus.status.includes("No Data") ? "⚠️" : "❌";

    return `
        <div class="service-status">
            <h2>🔍 Service Availability Status</h2>
            <div class="service-item ${cohClass}">
                <p><strong>${cohIcon} Cost Optimization Hub:</strong> ${cohStatus.message}</p>
            </div>
            <div class="service-item ${taClass}">
                <p><strong>${taIcon} Trusted Advisor:</strong> ${taStatus.message}</p>
            </div>
            <div class="service-item ${coClass}">
                <p><strong>${coIcon} Compute Optimizer:</strong> ${coStatus.message}</p>
            </div>
        </div>
    `;
  }

  /**
   * Build optimization recommendations section grouped by source
   */
  static buildOptimizationRecommendationsSection(recommendations: any[]): string {
    if (recommendations.length === 0) {
      return `
        <div class="recommendations-section">
            <h2>🎯 Cost Optimization Recommendations</h2>
            <div class="no-recommendations">
                <p>🎉 No optimization opportunities found at this time.</p>
                <p>Your AWS resources appear to be well-optimized!</p>
            </div>
        </div>
      `;
    }

    const groupedRecommendations = {
      COH: recommendations.filter((rec) => rec.source === "COH"),
      TA: recommendations.filter((rec) => rec.source === "TA"),
      CO: recommendations.filter((rec) => rec.source === "CO"),
    };

    let html = `
        <div class="recommendations-section">
            <h2>🎯 Cost Optimization Recommendations</h2>
    `;

    for (const [source, recs] of Object.entries(groupedRecommendations)) {
      if (recs.length === 0) {
        continue;
      }

      const sourceIcon = source === "COH" ? "🎯" : source === "TA" ? "🔍" : "⚡";
      const sourceTitle =
        source === "COH"
          ? "Cost Optimization Hub"
          : source === "TA"
            ? "Trusted Advisor"
            : "Compute Optimizer";
      const totalSavings = recs.reduce(
        (sum, rec: any) => sum + (rec.estimatedMonthlySavings || 0),
        0
      );

      const sortedRecs = recs.slice().sort((a: any, b: any) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff =
          priorityOrder[b.priority as keyof typeof priorityOrder] -
          priorityOrder[a.priority as keyof typeof priorityOrder];
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return (b.estimatedMonthlySavings || 0) - (a.estimatedMonthlySavings || 0);
      });

      const displayRecs = sortedRecs.slice(0, 10);

      html += `
            <div class="recommendation-category">
                <h3>${sourceIcon} ${sourceTitle} Recommendations</h3>
                <p><strong>Source Savings:</strong> <span class="savings-highlight">$${totalSavings.toFixed(2)}/month</span> | <strong>Count:</strong> ${recs.length}</p>
                <div class="recommendations-list">
      `;

      for (const rec of displayRecs) {
        html += this.buildOptimizationRecommendationCard(rec);
      }

      if (sortedRecs.length > 10) {
        html += `<p class="more-recommendations"><em>Showing top 10 of ${sortedRecs.length} ${sourceTitle} recommendations. See full JSON report for all recommendations.</em></p>`;
      }

      html += `
                </div>
            </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Build a visual divider between sections
   */
  static buildSectionDivider(): string {
    return `<hr class="section-divider" />\n`;
  }

  /**
   * Build a historical cost table with months as columns
   */
  static buildHistoricalCostTable(
    data: Array<{ [key: string]: any; monthlyCosts: Record<string, number>; totalCost: number }>,
    keyLabel: string
  ): string {
    if (data.length === 0) {
      return "";
    }

    // Extract all months from the first item
    const months = Object.keys(data[0].monthlyCosts).sort();
    const keyField = keyLabel.toLowerCase();

    let html = `<h3>Monthly breakdown by ${keyLabel}</h3>\n`;
    html += `
        <div class="table-container">
        <table>
            <tr>
                <th>${keyLabel}</th>
    `;

    for (const month of months) {
      html += `<th>${month.slice(0, 7)}</th>`;
    }
    html += `<th>Total</th></tr>`;

    for (const item of data) {
      html += `<tr>`;
      html += `<td><strong>${item[keyField] || item.key || "Unknown"}</strong></td>`;
      for (const month of months) {
        const cost = item.monthlyCosts[month] || 0;
        html += `<td>$${cost.toFixed(2)}</td>`;
      }
      html += `<td><strong>$${item.totalCost.toFixed(2)}</strong></td>`;
      html += `</tr>`;
    }

    html += `</table>\n</div>\n`;
    return html;
  }

  /**
   * Build optimization recommendation card using shared recommendation styles
   */
  private static buildOptimizationRecommendationCard(rec: any): string {
    const priority = rec.priority || "medium";
    const priorityClass = `priority-${priority}`;
    const priorityBadgeClass = `badge-${priority}`;
    const resourceType = rec.resourceType || "Resource";
    const actionType = rec.actionType || "Optimize";
    const description = rec.description || "Recommendation";
    const savings = rec.estimatedMonthlySavings || 0;
    const resourceId = rec.resourceId || rec.id || "unknown";
    const region = this.extractRecommendationRegion(rec);
    const effort = rec.implementationEffort;
    const effortClass = effort ? `effort-${effort}` : "";
    const roi = typeof rec.roi === "number" ? rec.roi.toFixed(1) : null;

    let html = `
                <div class="recommendation-card ${priorityClass}">
                    <div class="card-header">
                        <span class="priority-badge ${priorityBadgeClass}">${priority.toUpperCase()}</span>
                        <span class="resource-type">${resourceType}</span>
                        <span class="action-text">Action: ${actionType}</span>
                    </div>
                    <h4>${description}</h4>
                    <p class="savings"><strong>💵 Monthly Savings:</strong> <span class="savings-highlight">$${savings.toFixed(2)}</span></p>
    `;

    if (effort || roi || region) {
      html += `
                    <div class="details">
                        ${effort ? `<span><strong>⚡ Effort:</strong> <span class="${effortClass}">${effort}</span></span>` : ""}
                        ${roi ? `<span><strong>📊 ROI Score:</strong> ${roi}</span>` : ""}
                        ${region ? `<span><strong>🌍 Region:</strong> ${region}</span>` : ""}
                    </div>
      `;
    }

    html += `
                    <div class="resource-id">
                        <strong>🔗 Resource:</strong> <code>${resourceId}</code>
                    </div>
    `;

    if (rec.consoleLink) {
      html += `
                    <div class="actions">
                        <a href="${rec.consoleLink}" class="console-button" target="_blank">View in AWS Console</a>
                    </div>
      `;
    }

    html += `</ul></div>\n`;

    return html;
  }

  /**
   * Extract region from recommendation details if available
   */
  private static extractRecommendationRegion(rec: any): string | null {
    const region =
      rec?.region ||
      rec?.currentConfiguration?.region ||
      rec?.recommendedConfiguration?.region ||
      rec?.resourceRegion;

    if (!region || region === "unknown" || region === "undefined") {
      return null;
    }

    return region;
  }

  /**
   * Group recommendations by a property
   */
  private static groupRecommendations(
    recommendations: any[],
    groupBy: string
  ): Record<string, any[]> {
    const groups: Record<string, any[]> = {};

    for (const rec of recommendations) {
      const key = rec[groupBy] || "Other";

      if (groups[key]) {
        groups[key].push(rec);
      } else {
        groups[key] = [rec];
      }
    }

    return groups;
  }

  /**
   * Get icon for group name
   */
  private static getGroupIcon(groupName: string): string {
    const iconMap: Record<string, string> = {
      COH: "🎯",
      TA: "🔍",
      CO: "⚡",
      EC2: "🖥️",
      Lambda: "⚡",
      EBS: "💾",
      RDS: "🗄️",
      high: "🔴",
      medium: "🟡",
      low: "🟢",
    };

    return iconMap[groupName] || "📋";
  }

  /**
   * Build cost breakdown table with top services
   */
  static buildCostBreakdownTable(data: any[], tagName: string): string {
    if (data.length === 0) {
      return "";
    }

    let html = `<h3>Cost Breakdown by Tag: ${tagName}</h3>\n`;
    html += `
        <div class="table-container">
        <table>
            <tr>
                <th>${tagName}</th>
                <th>Cost</th>
                <th>Prev. Mo</th>
                <th>Δ %</th>
                <th>Threshold</th>
                <th>Status</th>
                <th>Top Services</th>
            </tr>
    `;

    for (const item of data) {
      const status = item.isOverThreshold ? "🔴 Over" : "🟢 OK";
      const topServicesHtml = item.topServices
        ? item.topServices.map((s: any) => `${s.service} ($${s.cost.toFixed(2)})`).join("<br/>")
        : "N/A";

      const prevCost = item.previousCost || 0;
      const diff = item.cost - prevCost;
      const percentageChange = prevCost > 0 ? (diff / prevCost) * 100 : 100;
      const changeColor =
        percentageChange > 5 ? "#ef4444" : percentageChange < -5 ? "#10b981" : "#6b7280";
      const changeIcon = percentageChange > 5 ? "↗️" : percentageChange < -5 ? "↘️" : "→";

      html += `
            <tr>
                <td><strong>${item.project || "Unknown"}</strong></td>
                <td style="font-weight: 600;">$${item.cost.toFixed(2)}</td>
                <td style="color: #6b7280;">$${prevCost.toFixed(2)}</td>
                <td style="color: ${changeColor}; font-weight: 500;">
                    ${changeIcon} ${percentageChange > 0 ? "+" : ""}${percentageChange.toFixed(1)}%
                </td>
                <td>$${item.threshold}</td>
                <td>${status}</td>
                <td style="font-size: 0.85em; color: #4b5563;">${topServicesHtml}</td>
            </tr>
      `;
    }

    html += `</table>\n</div>\n`;
    return html;
  }

  /**
   * Format date for display (Long format)
   */
  static formatDateLong(date: Date): string {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  /**
   * Format date range
   */
  static formatDateRange(start: Date, end: Date, isExclusive: boolean = false): string {
    const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };

    // If exclusive, go back one day for the display label
    const displayEnd = new Date(end);
    if (isExclusive) {
      displayEnd.setDate(displayEnd.getDate() - 1);
    }

    // Check if this is a full calendar month
    const isFullMonth =
      start.getDate() === 1 &&
      displayEnd.getMonth() === start.getMonth() &&
      displayEnd.getDate() === new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();

    if (isFullMonth) {
      const monthYear: Intl.DateTimeFormatOptions = { year: "numeric", month: "long" };
      return start.toLocaleDateString("en-US", monthYear);
    }

    return `${start.toLocaleDateString("en-US", options)} - ${displayEnd.toLocaleDateString("en-US", options)}`;
  }

  /**
   * Format date for display
   */
  private static formatDate(date: Date): string {
    return this.formatDateLong(date);
  }
}
