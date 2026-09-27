import type { Item } from "../shared/types";

type Sort = Generator<[Item, Item], Item[], string>;

function* mergeSort(list: Item[]): Sort {
  if (list.length < 2) return list;
  const middle = Math.floor(list.length / 2);
  const left = yield* mergeSort(list.slice(0, middle));
  const right = yield* mergeSort(list.slice(middle));
  const output: Item[] = [];
  let a = 0;
  let b = 0;
  while (a < left.length && b < right.length) {
    const winner = yield [left[a], right[b]];
    output.push(winner === left[a].id ? left[a++] : right[b++]);
  }
  return output.concat(left.slice(a), right.slice(b));
}

/** Replay saved choices, stopping at the next unanswered comparison. */
export function rank(
  items: Item[],
  decisions: string[],
): { pair: [Item, Item] | null; results: Item[] | null } {
  const sorter = mergeSort(items);
  let state = sorter.next();
  for (const winner of decisions) {
    if (state.done) throw new Error("Unexpected extra choices.");
    if (!state.value.some((item) => item.id === winner))
      throw new Error("The choice does not match the current pair.");
    state = sorter.next(winner);
  }
  return state.done
    ? { pair: null, results: state.value }
    : { pair: state.value, results: null };
}

/** Order known preferences without inventing or saving unanswered choices. */
export function provisionalRanking(
  items: Item[],
  decisions: string[],
): Item[] {
  const sorter = mergeSort(items);
  const edges = new Map(items.map((item) => [item.id, new Set<string>()]));
  const incoming = new Map(items.map((item) => [item.id, 0]));
  let state = sorter.next();
  for (const winner of decisions) {
    if (state.done) throw new Error("Unexpected extra choices.");
    if (!state.value.some((item) => item.id === winner))
      throw new Error("The choice does not match the current pair.");
    const loser = state.value.find((item) => item.id !== winner)!.id;
    if (!edges.get(winner)!.has(loser)) {
      edges.get(winner)!.add(loser);
      incoming.set(loser, incoming.get(loser)! + 1);
    }
    state = sorter.next(winner);
  }
  if (state.done) return state.value;
  const remaining = [...items];
  const ordered: Item[] = [];
  while (remaining.length) {
    let index = remaining.findIndex((item) => incoming.get(item.id) === 0);
    // Contradictory preferences can form cycles. Break ties deterministically
    // by the fewest unmet preferences, then the original session order.
    if (index < 0) {
      index = 0;
      for (let i = 1; i < remaining.length; i++)
        if (incoming.get(remaining[i].id)! < incoming.get(remaining[index].id)!) index = i;
    }
    const [item] = remaining.splice(index, 1);
    ordered.push(item);
    for (const loser of edges.get(item.id)!)
      incoming.set(loser, incoming.get(loser)! - 1);
  }
  return ordered;
}

export function maxComparisons(count: number): number {
  if (count < 2) return 0;
  return maxComparisons(Math.floor(count / 2)) + maxComparisons(Math.ceil(count / 2)) + count - 1;
}
