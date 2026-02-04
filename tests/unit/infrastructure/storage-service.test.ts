import { ReportStorage } from "../../../src/infrastructure/storage-service";

describe("ReportStorage - CRITICAL", () => {
  it("should generate S3 key with date hierarchy", () => {
    const date = new Date("2025-01-31");
    const key = ReportStorage.buildReportKey("cost", date, "json");

    expect(key).toContain("2025");
    expect(key).toContain("01");
    expect(key).toContain("31");
    expect(key.endsWith(".json")).toBe(true);
  });

  it("should handle HTML and JSON formats", () => {
    const date = new Date("2025-01-31");
    const jsonKey = ReportStorage.buildReportKey("test", date, "json");
    const htmlKey = ReportStorage.buildReportKey("test", date, "html");

    expect(jsonKey.endsWith(".json")).toBe(true);
    expect(htmlKey.endsWith(".html")).toBe(true);
  });

  it("should compress JSON data", () => {
    const data = { test: "data" };
    const result = ReportStorage.compressJsonData(data);

    expect(result.compressed).toBeTruthy();
    expect(result.originalSize).toBeGreaterThan(0);
  });

  it("should preserve data through compression", () => {
    const data = { cost: 100, account: "123" };
    const result = ReportStorage.compressJsonData(data);
    const restored = JSON.parse(result.compressed);

    expect(restored).toEqual(data);
  });

  it("should generate S3 console URL", () => {
    const storage = new ReportStorage("my-bucket");
    const url = storage.generateConsoleUrl("reports/test.json");

    expect(url).toContain("s3.console.aws.amazon.com");
    expect(url).toContain("my-bucket");
  });
});
