/**
 * Array Utilities
 * Common array operations to eliminate code duplication
 */
export class ArrayUtils {
  /**
   * Group array items by a key function
   * @param array - Array to group
   * @param keyFn - Function to extract grouping key
   * @returns Map of grouped items
   */
  static groupBy<T, K>(array: T[], keyFn: (item: T) => K): Map<K, T[]> {
    const groups = new Map<K, T[]>();

    for (const item of array) {
      const key = keyFn(item);
      const existing = groups.get(key);

      if (existing) {
        existing.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    return groups;
  }

  /**
   * Group array items by a string property
   * @param array - Array to group
   * @param property - Property name to group by
   * @returns Object with grouped items
   */
  static groupByProperty<T>(array: T[], property: keyof T): Record<string, T[]> {
    const groups: Record<string, T[]> = {};

    for (const item of array) {
      const key = String(item[property]);

      if (groups[key]) {
        groups[key].push(item);
      } else {
        groups[key] = [item];
      }
    }

    return groups;
  }

  /**
   * Remove duplicates from array based on a key function
   * @param array - Array to deduplicate
   * @param keyFn - Function to extract unique key
   * @returns Array with duplicates removed
   */
  static uniqueBy<T, K>(array: T[], keyFn: (item: T) => K): T[] {
    const seen = new Set<K>();
    const result: T[] = [];

    for (const item of array) {
      const key = keyFn(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Remove duplicates from array based on a property
   * @param array - Array to deduplicate
   * @param property - Property name to check for uniqueness
   * @returns Array with duplicates removed
   */
  static uniqueByProperty<T>(array: T[], property: keyof T): T[] {
    return this.uniqueBy(array, (item) => item[property]);
  }

  /**
   * Sort array by multiple criteria
   * @param array - Array to sort
   * @param sortFns - Array of sort functions (first has highest priority)
   * @returns Sorted array
   */
  static sortBy<T>(array: T[], ...sortFns: Array<(a: T, b: T) => number>): T[] {
    return [...array].sort((a, b) => {
      for (const sortFn of sortFns) {
        const result = sortFn(a, b);
        if (result !== 0) {
          return result;
        }
      }
      return 0;
    });
  }

  /**
   * Find item with maximum value based on a key function
   * @param array - Array to search
   * @param keyFn - Function to extract comparison value
   * @returns Item with maximum value or undefined if array is empty
   */
  static maxBy<T>(array: T[], keyFn: (item: T) => number): T | undefined {
    if (array.length === 0) {
      return undefined;
    }

    let maxItem = array[0];
    let maxValue = keyFn(maxItem);

    for (let i = 1; i < array.length; i++) {
      const value = keyFn(array[i]);
      if (value > maxValue) {
        maxValue = value;
        maxItem = array[i];
      }
    }

    return maxItem;
  }

  /**
   * Find item with minimum value based on a key function
   * @param array - Array to search
   * @param keyFn - Function to extract comparison value
   * @returns Item with minimum value or undefined if array is empty
   */
  static minBy<T>(array: T[], keyFn: (item: T) => number): T | undefined {
    if (array.length === 0) {
      return undefined;
    }

    let minItem = array[0];
    let minValue = keyFn(minItem);

    for (let i = 1; i < array.length; i++) {
      const value = keyFn(array[i]);
      if (value < minValue) {
        minValue = value;
        minItem = array[i];
      }
    }

    return minItem;
  }

  /**
   * Sum array values based on a key function
   * @param array - Array to sum
   * @param keyFn - Function to extract numeric value
   * @returns Sum of all values
   */
  static sumBy<T>(array: T[], keyFn: (item: T) => number): number {
    return array.reduce((sum, item) => sum + keyFn(item), 0);
  }

  /**
   * Sum an array of numbers
   * @param array - Array of numbers
   * @returns Sum of values
   */
  static sum(array: number[]): number {
    return this.sumBy(array, (x) => x);
  }

  /**
   * Calculate average of array values based on a key function
   * @param array - Array to average
   * @param keyFn - Function to extract numeric value
   * @returns Average value or 0 if array is empty
   */
  static averageBy<T>(array: T[], keyFn: (item: T) => number): number {
    if (array.length === 0) {
      return 0;
    }
    return this.sumBy(array, keyFn) / array.length;
  }

  /**
   * Chunk array into smaller arrays of specified size
   * @param array - Array to chunk
   * @param size - Size of each chunk
   * @returns Array of chunks
   */
  static chunk<T>(array: T[], size: number): T[][] {
    if (size <= 0) {
      throw new Error("Chunk size must be positive");
    }

    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Flatten array of arrays into single array
   * @param arrays - Array of arrays to flatten
   * @returns Flattened array
   */
  static flatten<T>(arrays: T[][]): T[] {
    return arrays.reduce((flat, arr) => flat.concat(arr), []);
  }
}
