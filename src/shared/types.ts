export const sortingAlgorithms = ["merge", "quick", "heap"] as const;
export type SortingAlgorithm = (typeof sortingAlgorithms)[number];
export function isSortingAlgorithm(value: unknown): value is SortingAlgorithm {
  return sortingAlgorithms.some((algorithm) => algorithm === value);
}

export type Item = {
  id: string;
  name: string;
  details: Record<string, string>;
};
export type SessionView = {
  algorithm: SortingAlgorithm;
  id: string;
  name: string;
  items: Item[];
  comparisons: number;
  maxComparisons: number;
  revision: number;
  progress: number;
  pair: [Item, Item] | null;
  results: Item[] | null;
  currentRanking: Item[];
};
