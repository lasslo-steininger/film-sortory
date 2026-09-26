import assert from "node:assert/strict";

async function main() {
  const base = process.env.TEST_BASE_URL || "http://localhost:3000";
  const response = await fetch(
    `${base}/api/films?title=Interstellar&year=2014`,
  );
  assert.equal(response.status, 200);
  const cover = await response.json();
  assert.equal(cover.status, "matched");
  assert.equal(cover.imdbId, "tt0816692");
  assert.ok(cover.posterUrl.startsWith("https://m.media-amazon.com/images/"));
  const poster = await fetch(cover.posterUrl, { method: "HEAD" });
  assert.equal(poster.status, 200);
  assert.ok(poster.headers.get("content-type")?.startsWith("image/"));
  assert.equal((await fetch(`${base}/api/films`)).status, 400);
  assert.equal(
    (await fetch(`${base}/api/films?title=Dune&year=wrong`)).status,
    400,
  );
  console.log(
    "Live IMDb integration passed: title/year match, resized poster image, and API validation.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
