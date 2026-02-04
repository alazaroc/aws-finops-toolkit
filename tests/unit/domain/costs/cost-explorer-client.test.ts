import { mockClient } from "aws-sdk-client-mock";
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { CostExplorerService } from "../../../../src/domain/costs/cost-explorer-client";

describe("CostExplorerService.getMonthlyTotals", () => {
  const ceMock = mockClient(CostExplorerClient);

  beforeEach(() => {
    ceMock.reset();
  });

  it("should request MONTHLY granularity without GroupBy", async () => {
    ceMock.on(GetCostAndUsageCommand).resolves({
      ResultsByTime: [],
    });

    const svc = new CostExplorerService();
    await svc.getMonthlyTotals(new Date("2026-01-01"), new Date("2026-02-01"));

    const calls = ceMock.commandCalls(GetCostAndUsageCommand);
    expect(calls.length).toBe(1);
    const input = calls[0].args[0].input;

    expect(input.Granularity).toBe("MONTHLY");
    expect(input.GroupBy).toBeUndefined();
  });
});
