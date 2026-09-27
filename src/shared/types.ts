export type Item = {
  id: string;
  name: string;
  details: Record<string, string>;
};
export type SessionView = {
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
