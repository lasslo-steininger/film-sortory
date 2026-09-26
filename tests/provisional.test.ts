import { test } from "node:test";
import assert from "node:assert/strict";
import { provisionalRanking, rank } from "../src/server/sort";
import { sortingAlgorithms } from "../src/shared/types";

for (const algorithm of sortingAlgorithms) {
  test(`${algorithm}: provisional order preserves known preferences and can resume`, () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Film ${i}`, details: {} }));
    const original = structuredClone(items);
    const decisions: string[] = [];
    const preferences: [string, string][] = [];
    assert.deepEqual(provisionalRanking(items, decisions, algorithm), items);
    let state = rank(items, decisions, algorithm);
    while (state.pair) {
      const [winner, loser] = [...state.pair].sort((a, b) => Number(b.id) - Number(a.id));
      decisions.push(winner.id);
      preferences.push([winner.id, loser.id]);
      const before = rank(items, decisions, algorithm);
      const savedDecisions = [...decisions];
      const current = provisionalRanking(items, decisions, algorithm);
      assert.equal(current.length, items.length);
      assert.equal(new Set(current.map((item) => item.id)).size, items.length);
      const positions = new Map(current.map((item, index) => [item.id, index]));
      for (const [preferred, other] of preferences)
        assert.ok(positions.get(preferred)! < positions.get(other)!);
      assert.deepEqual(rank(items, decisions, algorithm), before);
      assert.deepEqual(decisions, savedDecisions);
      assert.deepEqual(items, original);
      assert.deepEqual(provisionalRanking(items, decisions, algorithm), current);
      state = before;
    }
    assert.deepEqual(provisionalRanking(items, decisions, algorithm), state.results);
  });

  test(`${algorithm}: arbitrary choices produce a complete provisional list`, () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: "Same title", details: {} }));
    const decisions: string[] = [];
    let state = rank(items, decisions, algorithm);
    while (state.pair) {
      decisions.push(state.pair[decisions.length % 2].id);
      const current = provisionalRanking(items, decisions, algorithm);
      assert.deepEqual(current.map((item) => item.id).sort(), items.map((item) => item.id));
      state = rank(items, decisions, algorithm);
    }
  });
}
