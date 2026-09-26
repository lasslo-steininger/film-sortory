import type { Item, SortingAlgorithm } from "../shared/types";

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

function* quickSort(list: Item[]): Sort {
  if (list.length < 2) return list;
  // A fixed pivot keeps replay and undo deterministic.
  const middle = Math.floor(list.length / 2);
  const pivot = list[middle];
  const before: Item[] = [];
  const after: Item[] = [];
  for (let i = 0; i < list.length; i++) {
    if (i === middle) continue;
    const item = list[i];
    const winner = yield [item, pivot];
    (winner === item.id ? before : after).push(item);
  }
  const left = yield* quickSort(before);
  const right = yield* quickSort(after);
  return [...left, pivot, ...right];
}

function* heapSort(items: Item[]): Sort {
  const heap = [...items];
  function* siftDown(root: number, size: number): Generator<[Item, Item], void, string> {
    while (2 * root + 1 < size) {
      let child = 2 * root + 1;
      if (child + 1 < size) {
        const winner = yield [heap[child], heap[child + 1]];
        if (winner === heap[child + 1].id) child++;
      }
      const winner = yield [heap[root], heap[child]];
      if (winner === heap[root].id) return;
      [heap[root], heap[child]] = [heap[child], heap[root]];
      root = child;
    }
  }
  for (let root = Math.floor(heap.length / 2) - 1; root >= 0; root--) {
    yield* siftDown(root, heap.length);
  }
  // Move each preferred root to the end, then reverse to best-first order.
  for (let end = heap.length - 1; end > 0; end--) {
    [heap[0], heap[end]] = [heap[end], heap[0]];
    yield* siftDown(0, end);
  }
  return heap.reverse();
}

/** Replay saved choices, stopping at the next unanswered comparison. */
export function rank(
  items: Item[],
  decisions: string[],
  algorithm: SortingAlgorithm = "merge",
): { pair: [Item, Item] | null; results: Item[] | null } {
  const sorter = { merge: mergeSort, quick: quickSort, heap: heapSort }[algorithm](items);
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
  algorithm: SortingAlgorithm = "merge",
): Item[] {
  const sorter = { merge: mergeSort, quick: quickSort, heap: heapSort }[algorithm](items);
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

export function maxComparisons(count: number, algorithm: SortingAlgorithm = "merge"): number {
  if (count < 2) return 0;
  if (algorithm === "quick") return (count * (count - 1)) / 2;
  if (algorithm === "heap") {
    // Each sift compares at most twice per level, in construction and extraction.
    let maximum = 0;
    for (let root = 1; root <= Math.floor(count / 2); root++)
      maximum += 2 * Math.floor(Math.log2(count / root));
    for (let size = count - 1; size > 1; size--)
      maximum += 2 * Math.floor(Math.log2(size));
    return maximum;
  }
  return maxComparisons(Math.floor(count / 2)) + maxComparisons(Math.ceil(count / 2)) + count - 1;
}
