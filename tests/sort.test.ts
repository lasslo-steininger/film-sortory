import { test } from "node:test";
import assert from "node:assert/strict";
import { rank, maxComparisons } from "../src/server/sort";
import { parseItems } from "../src/server/csv";
import { sortingAlgorithms } from "../src/shared/types";

for (const algorithm of sortingAlgorithms) {
test(`${algorithm} sort produces the chosen preference order for different list sizes`, () => {
  for (let size = 2; size <= 100; size++) {
    const items = Array.from({ length: size }, (_, i) => ({
      id: String(i),
      name: String(i),
      details: {},
    }));
    // A deterministic shuffled preference order, independent of the input order.
    const preference = [...items].sort(
      (a, b) => ((Number(a.id) * 37) % 101) - ((Number(b.id) * 37) % 101),
    );
    const priority = new Map(preference.map((item, i) => [item.id, i]));
    const choices: string[] = [];
    const original = structuredClone(items);
    let state = rank(items, choices, algorithm);
    while (state.pair) {
      const [a, b] = state.pair;
      choices.push(priority.get(a.id)! < priority.get(b.id)! ? a.id : b.id);
      state = rank(items, choices, algorithm);
    }
    assert.deepEqual(state.results, preference);
    assert.deepEqual(items, original, "Sorting does not mutate the input");
    assert.ok(choices.length <= maxComparisons(size, algorithm));
    choices.pop();
    assert.ok(rank(items, choices, algorithm).pair, "Undo reopens the last comparison");
  }
});
test(`${algorithm}: invalid and extra decisions are rejected`, () => {
  const items = parseItems("Name\nOne\nTwo", true);
  assert.throws(() => rank(items, ["unknown"], algorithm));
  assert.throws(() => rank(items, ["0", "1"], algorithm));
});

test(`${algorithm}: empty and single-item lists need no choices`, () => {
  for (const items of [[], [{ id: "0", name: "One", details: {} }]]) {
    assert.deepEqual(rank(items, [], algorithm), { pair: null, results: items });
    assert.equal(maxComparisons(items.length, algorithm), 0);
  }
});

test(`${algorithm}: every comparison branch finishes within its bound`, () => {
  for (let size = 2; size <= 6; size++) {
    const items = Array.from({ length: size }, (_, i) => ({ id: String(i), name: String(i), details: {} }));
    function visit(choices: string[]) {
      const state = rank(items, choices, algorithm);
      assert.ok(choices.length <= maxComparisons(size, algorithm));
      if (state.pair) {
        assert.notEqual(state.pair[0].id, state.pair[1].id);
        for (const item of state.pair) visit([...choices, item.id]);
      } else {
        assert.deepEqual(state.results!.map((item) => item.id).sort(), items.map((item) => item.id));
      }
    }
    visit([]);
  }
});
}
test("CSV preserves quoted commas, multiline fields, BOM, and duplicate names", () => {
  const items = parseItems(
    '\uFEFFName,Notes\r\n"A, B","Line one\nLine two"\r\n"A, B","He said ""hello"""\r\n',
    true,
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "A, B");
  assert.equal(items[0].details.Notes, "Line one\nLine two");
  assert.equal(items[1].details.Notes, 'He said "hello"');
  assert.notEqual(items[0].id, items[1].id);
});
test("CSV handles headerless and semicolon-separated lists", () => {
  assert.equal(parseItems("One\nTwo\n", false)[0].name, "One");
  assert.equal(
    parseItems("Title;Year\nOne;2001\nTwo;2002", true)[1].details.Year,
    "2002",
  );
});
test("duplicate metadata headings retain every column", () => {
  const items = parseItems("Name,Tag,Tag,Tag (2)\nOne,A,B,C\nTwo,D,E,F", true);
  assert.deepEqual(Object.values(items[0].details), ["A", "B", "C"]);
});
test("CSV rejects malformed, oversized, empty, or inconsistent data", () => {
  for (const csv of [
    "",
    "Name\nOne",
    "Name,Year\n,2001\nTwo,2002",
    'Name\n"One\nTwo',
    "Name,Year\nOne,2001,extra\nTwo,2002",
    "Name\n" + "a".repeat(2001) + "\nTwo",
    "Name\n" + Array(501).fill("Item").join("\n"),
    "a".repeat(1024 * 1024 + 1),
  ]) {
    assert.throws(() => parseItems(csv, true));
  }
});
