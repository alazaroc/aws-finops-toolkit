import { HtmlReportBuilder } from "../../../src/infrastructure/html-builder";

describe("HtmlReportBuilder - CRITICAL", () => {
  it("should create valid HTML document", () => {
    const html = HtmlReportBuilder.buildHtmlDocument("Test", "<p>Body</p>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<title>Test</title>");
  });

  it("should build header with account ID", () => {
    const header = HtmlReportBuilder.buildHeader({
      date: new Date(),
      accountId: "123456789012",
    });
    expect(header).toContain("123456789012");
  });

  it("should build executive summary", () => {
    const summary = HtmlReportBuilder.buildExecutiveSummary({ totalSavings: 100 });
    expect(summary).toContain("executive-summary");
  });

  it("should build metrics section", () => {
    const metrics = HtmlReportBuilder.buildMetricsSection({
      title: "Test",
      metrics: { Key: "Value" },
    });
    expect(metrics).toContain("Key");
    expect(metrics).toContain("Value");
  });
});
