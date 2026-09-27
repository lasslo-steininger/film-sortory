import { test } from "node:test";
import assert from "node:assert/strict";
import { provisionalRanking, rank } from "../src/server/sort";

test("provisional order preserves known preferences and can resume", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Film ${i}`, details: {} }));
    const original = structuredClone(items);
    const decisions: string[] = [];
    const preferences: [string, string][] = [];
    assert.deepEqual(provisionalRanking(items, decisions), items);
    let state = rank(items, decisions);
    while (state.pair) {
      const [winner, loser] = [...state.pair].sort((a, b) => Number(b.id) - Number(a.id));
      decisions.push(winner.id);
      preferences.push([winner.id, loser.id]);
      const before = rank(items, decisions);
      const savedDecisions = [...decisions];
      const current = provisionalRanking(items, decisions);
      assert.equal(current.length, items.length);
      assert.equal(new Set(current.map((item) => item.id)).size, items.length);
      const positions = new Map(current.map((item, index) => [item.id, index]));
      for (const [preferred, other] of preferences)
        assert.ok(positions.get(preferred)! < positions.get(other)!);
      assert.deepEqual(rank(items, decisions), before);
      assert.deepEqual(decisions, savedDecisions);
      assert.deepEqual(items, original);
      assert.deepEqual(provisionalRanking(items, decisions), current);
      state = before;
    }
    assert.deepEqual(provisionalRanking(items, decisions), state.results);
  });

test("arbitrary choices produce a complete provisional list", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: "Same title", details: {} }));
    const decisions: string[] = [];
    let state = rank(items, decisions);
    while (state.pair) {
      decisions.push(state.pair[decisions.length % 2].id);
      const current = provisionalRanking(items, decisions);
      assert.deepEqual(current.map((item) => item.id).sort(), items.map((item) => item.id));
      state = rank(items, decisions);
    }
  });
