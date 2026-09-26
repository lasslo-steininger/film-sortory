import { test } from "node:test";
import assert from "node:assert/strict";
import { shuffle } from "../src/server/shuffle";

test("shuffle can reach every permutation without losing or mutating films", () => {
  const films = Object.freeze([
    { id: "a", name: "Dune", year: 1984 },
    { id: "b", name: "Dune", year: 2021 },
    { id: "c", name: "Arrival", year: 2016 },
  ]);
  const permutations = new Set<string>();
  for (let first = 0; first < 3; first++) {
    for (let second = 0; second < 2; second++) {
      const draws = [first, second];
      const result = shuffle(films, () => draws.shift()!);
      assert.notEqual(result, films);
      assert.deepEqual(new Set(result), new Set(films));
      permutations.add(result.map(film => film.id).join(""));
    }
  }
  assert.equal(permutations.size, 6);
  assert.deepEqual(films.map(film => film.id), ["a", "b", "c"]);
  assert.deepEqual(shuffle([]), []);
  assert.deepEqual(shuffle([films[0]]), [films[0]]);
});
