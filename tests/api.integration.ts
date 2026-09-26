import assert from "node:assert/strict";
import { sortingAlgorithms, type SortingAlgorithm } from "../src/shared/types";

async function main(algorithm: SortingAlgorithm) {
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const form = new FormData();
  form.set(
    "file",
    new File(
      ["Name,Context\nCharlie,Third\nAlpha,First\nBravo,Second"],
      "API test.csv",
      { type: "text/csv" },
    ),
  );
  form.set("hasHeader", "true");
  // Omission remains compatible with clients that predate algorithm selection.
  if (algorithm !== "merge") form.set("algorithm", algorithm);
  let response = await fetch(`${base}/api/sessions`, {
    method: "POST",
    body: form,
  });
  assert.equal(response.status, 201);
  let session = await response.json();
  assert.equal(session.algorithm, algorithm);
  const endpoint = `${base}/api/sessions/${session.id}`;
  const post = (body: unknown) =>
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  response = await post({ revision: session.revision, action: "algorithm", algorithm: "invalid" });
  assert.equal(response.status, 400);
  for (const selection of ["heap", "quick", algorithm]) {
    response = await post({ revision: session.revision, action: "algorithm", algorithm: selection });
    assert.equal(response.status, 200);
    session = await response.json();
    assert.equal(session.algorithm, selection);
    assert.equal(session.comparisons, 0);
  }
  assert.deepEqual(await (await fetch(endpoint)).json(), session);
  const originalPair = session.pair;
  const initial = session;
  async function restartRanking() {
    const oldRevision = session.revision;
    assert.equal((await post({ revision: oldRevision - 1, action: "restart" })).status, 409);
    assert.deepEqual(await (await fetch(endpoint)).json(), session);
    const restarted = await post({ revision: oldRevision, action: "restart" });
    assert.equal(restarted.status, 200);
    session = await restarted.json();
    assert.equal(session.id, initial.id);
    assert.equal(session.name, initial.name);
    assert.equal(session.algorithm, initial.algorithm);
    assert.equal(session.revision, oldRevision + 1);
    assert.equal(session.comparisons, 0);
    assert.equal(session.progress, 0);
    assert.equal(session.results, null);
    assert.ok(session.pair);
    // A valid random shuffle may repeat the previous order. Check preservation,
    // not a probabilistic assertion that the order must always change.
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    assert.deepEqual([...session.items].sort(byId), [...initial.items].sort(byId));
    assert.deepEqual(await (await fetch(endpoint)).json(), session);
    assert.equal((await post({ revision: session.revision, action: "undo" })).status, 400);
    assert.equal((await post({ revision: oldRevision, action: "choose", winner: originalPair[0].id })).status, 409);
  }
  response = await post({
    revision: session.revision,
    action: "choose",
    winner: "invalid",
  });
  assert.equal(response.status, 400);
  const valid = {
    revision: session.revision,
    action: "choose",
    winner: session.pair[0].id,
  };
  const simultaneous = await Promise.all([post(valid), post(valid)]);
  assert.deepEqual(
    simultaneous.map((result) => result.status).sort(),
    [200, 409],
  );
  session = await (await fetch(endpoint)).json();
  assert.equal(session.comparisons, 1);
  assert.equal(session.results, null);
  assert.equal(session.currentRanking.length, session.items.length);
  const chosenPosition = session.currentRanking.findIndex((item: { id: string }) => item.id === valid.winner);
  const otherPosition = session.currentRanking.findIndex((item: { id: string }) => item.id === originalPair[1].id);
  assert.ok(chosenPosition < otherPosition);
  // Viewing/restoring the provisional order must leave the next comparison intact.
  assert.deepEqual(await (await fetch(endpoint)).json(), session);
  response = await post({ revision: session.revision, action: "algorithm", algorithm: "merge" });
  assert.equal(response.status, 400);
  response = await post({ revision: session.revision, action: "undo" });
  assert.equal(response.status, 200);
  session = await response.json();
  assert.deepEqual(session.pair, originalPair);
  response = await post({ revision: session.revision, action: "choose", winner: session.pair[0].id });
  assert.equal(response.status, 200);
  session = await response.json();
  await restartRanking();
  while (session.pair) {
    const winner =
      session.pair[0].name < session.pair[1].name
        ? session.pair[0].id
        : session.pair[1].id;
    response = await post({
      revision: session.revision,
      action: "choose",
      winner,
    });
    assert.equal(response.status, 200);
    session = await response.json();
  }
  assert.deepEqual(
    session.results.map((item: { name: string }) => item.name),
    ["Alpha", "Bravo", "Charlie"],
  );
  assert.equal(session.progress, 100);
  assert.deepEqual(session.currentRanking, session.results);
  assert.equal(session.algorithm, algorithm);
  assert.ok(session.comparisons <= session.maxComparisons);
  const restored = await (await fetch(endpoint)).json();
  assert.deepEqual(restored, session);
  response = await post({ revision: session.revision, action: "undo" });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).pair);
  // Restore the final choice, then restart a completed ranking as well.
  session = await (await fetch(endpoint)).json();
  const winner = session.pair[0].name < session.pair[1].name ? session.pair[0].id : session.pair[1].id;
  response = await post({ revision: session.revision, action: "choose", winner });
  assert.equal(response.status, 200);
  session = await response.json();
  assert.ok(session.results);
  await restartRanking();
  assert.equal((await fetch(`${base}/api/sessions/not-a-session`)).status, 404);
  const invalid = new FormData();
  form.set("algorithm", "invalid");
  assert.equal((await fetch(`${base}/api/sessions`, { method: "POST", body: form })).status, 400);
  invalid.set("file", new File(["Name\nOnly one"], "invalid.csv"));
  assert.equal(
    (await fetch(`${base}/api/sessions`, { method: "POST", body: invalid }))
      .status,
    400,
  );
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /A little clarity for/);
  console.log(
    `${algorithm}: API integration passed: algorithm selection, upload, validation, concurrent choices, undo, full ranking, restart, restoration, and page rendering.`,
  );
}
async function run() {
  for (const algorithm of sortingAlgorithms) await main(algorithm);
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
