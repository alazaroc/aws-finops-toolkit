import { CostExplorerService } from "../../../../src/domain/costs/cost-explorer-client";

describe("CostExplorerService helpers", () => {
  it("should normalize tag values returned by Cost Explorer", () => {
    expect(CostExplorerService.normalizeTagValue("project$FinOps")).toBe("FinOps");
    expect(CostExplorerService.normalizeTagValue("")).toBe("untagged");
    expect(CostExplorerService.normalizeTagValue(undefined)).toBe("untagged");
  });
});
