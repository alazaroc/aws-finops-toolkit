/**
 * Unit Tests - ArrayUtils
 * Tests array utility functions
 */

import { ArrayUtils } from "../../../src/core/array-utils";

interface TestItem {
  id: number;
  category: string;
  name: string;
}

describe("ArrayUtils", () => {
  describe("groupBy", () => {
    it("should group items by key function", () => {
      const items: TestItem[] = [
        { id: 1, category: "A", name: "Item1" },
        { id: 2, category: "B", name: "Item2" },
        { id: 3, category: "A", name: "Item3" },
      ];

      const grouped = ArrayUtils.groupBy(items, (item) => item.category);

      expect(grouped.get("A")).toHaveLength(2);
      expect(grouped.get("B")).toHaveLength(1);
      expect(grouped.get("A")?.[0].id).toBe(1);
    });

    it("should handle empty array", () => {
      const grouped = ArrayUtils.groupBy([], (item: any) => item.category);
      expect(grouped.size).toBe(0);
    });

    it("should group by numeric keys", () => {
      const items = [
        { value: 10, type: 1 },
        { value: 20, type: 2 },
        { value: 30, type: 1 },
      ];

      const grouped = ArrayUtils.groupBy(items, (item) => item.type);

      expect(grouped.get(1)).toHaveLength(2);
      expect(grouped.get(2)).toHaveLength(1);
    });
  });

  describe("groupByProperty", () => {
    it("should group items by property name", () => {
      const items: TestItem[] = [
        { id: 1, category: "A", name: "Item1" },
        { id: 2, category: "B", name: "Item2" },
        { id: 3, category: "A", name: "Item3" },
      ];

      const grouped = ArrayUtils.groupByProperty(items, "category");

      expect(grouped["A"]).toHaveLength(2);
      expect(grouped["B"]).toHaveLength(1);
    });

    it("should create object keys", () => {
      const items: TestItem[] = [
        { id: 1, category: "Development", name: "Item1" },
        { id: 2, category: "Testing", name: "Item2" },
      ];

      const grouped = ArrayUtils.groupByProperty(items, "category");

      expect(Object.keys(grouped)).toContain("Development");
      expect(Object.keys(grouped)).toContain("Testing");
    });
  });

  describe("uniqueBy", () => {
    it("should remove duplicates by key function", () => {
      const items: TestItem[] = [
        { id: 1, category: "A", name: "Item1" },
        { id: 2, category: "B", name: "Item2" },
        { id: 1, category: "A", name: "Item1Dup" },
      ];

      const unique = ArrayUtils.uniqueBy(items, (item) => item.id);

      expect(unique).toHaveLength(2);
      expect(unique[0].id).toBe(1);
      expect(unique[1].id).toBe(2);
    });

    it("should preserve order of first occurrence", () => {
      const items = [
        { id: 3, name: "C" },
        { id: 1, name: "A" },
        { id: 3, name: "C-dup" },
      ];

      const unique = ArrayUtils.uniqueBy(items, (item) => item.id);

      expect(unique[0].id).toBe(3);
      expect(unique[1].id).toBe(1);
    });

    it("should handle empty array", () => {
      const unique = ArrayUtils.uniqueBy([], (item: any) => item.id);
      expect(unique).toHaveLength(0);
    });
  });

  describe("uniqueByProperty", () => {
    it("should remove duplicates by property", () => {
      const items: TestItem[] = [
        { id: 1, category: "A", name: "Item1" },
        { id: 2, category: "B", name: "Item2" },
        { id: 3, category: "A", name: "Item3" },
      ];

      const unique = ArrayUtils.uniqueByProperty(items, "category");

      expect(unique).toHaveLength(2);
      expect(unique[0].category).toBe("A");
      expect(unique[1].category).toBe("B");
    });
  });

  describe("sortBy", () => {
    it("should sort by single criteria", () => {
      const items: TestItem[] = [
        { id: 3, category: "A", name: "Item3" },
        { id: 1, category: "B", name: "Item1" },
        { id: 2, category: "A", name: "Item2" },
      ];

      const sorted = ArrayUtils.sortBy(items, (a, b) => a.id - b.id);

      expect(sorted[0].id).toBe(1);
      expect(sorted[1].id).toBe(2);
      expect(sorted[2].id).toBe(3);
    });

    it("should sort by multiple criteria", () => {
      const items: TestItem[] = [
        { id: 1, category: "B", name: "Item1" },
        { id: 2, category: "A", name: "Item2" },
        { id: 1, category: "A", name: "Item1A" },
      ];

      const sorted = ArrayUtils.sortBy(
        items,
        (a, b) => a.id - b.id,
        (a, b) => a.category.localeCompare(b.category)
      );

      expect(sorted[0].id).toBe(1);
      expect(sorted[0].category).toBe("A");
      expect(sorted[1].id).toBe(1);
      expect(sorted[1].category).toBe("B");
    });

    it("should not modify original array", () => {
      const items: TestItem[] = [
        { id: 3, category: "A", name: "Item3" },
        { id: 1, category: "A", name: "Item1" },
      ];

      const original = [...items];
      ArrayUtils.sortBy(items, (a, b) => a.id - b.id);

      expect(items).toEqual(original);
    });
  });

  describe("flatten", () => {
    it("should flatten nested arrays", () => {
      const nested = [[1, 2], [3, 4], [5]];
      const flat = ArrayUtils.flatten(nested);
      expect(flat).toEqual([1, 2, 3, 4, 5]);
    });

    it("should handle empty nested array", () => {
      const nested: any[] = [[], [], []];
      const flat = ArrayUtils.flatten(nested);
      expect(flat).toEqual([]);
    });
  });

  describe("chunk", () => {
    it("should split array into chunks", () => {
      const array = [1, 2, 3, 4, 5];
      const chunks = ArrayUtils.chunk(array, 2);

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual([1, 2]);
      expect(chunks[1]).toEqual([3, 4]);
      expect(chunks[2]).toEqual([5]);
    });

    it("should handle arrays smaller than chunk size", () => {
      const array = [1, 2];
      const chunks = ArrayUtils.chunk(array, 5);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual([1, 2]);
    });
  });

  describe("sum", () => {
    it("should calculate sum of array", () => {
      const array = [1, 2, 3, 4, 5];
      const sum = ArrayUtils.sum(array);
      expect(sum).toBe(15);
    });

    it("should handle empty array", () => {
      const sum = ArrayUtils.sum([]);
      expect(sum).toBe(0);
    });
  });
});
