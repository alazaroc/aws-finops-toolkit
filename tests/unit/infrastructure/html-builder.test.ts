import { HtmlReportBuilder } from "../../../src/infrastructure/html-builder";

describe("HtmlReportBuilder - CRITICAL", () => {
  it("should create valid HTML document", () => {
    const html = HtmlReportBuilder.buildHtmlDocument("Test", "<p>Body</p>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("<title>Test</title>");
  });

  it("should build executive summary", () => {
    const summary = HtmlReportBuilder.buildExecutiveSummary({ totalSavings: 100 });
    expect(summary).toContain("executive-summary");
  });
});
