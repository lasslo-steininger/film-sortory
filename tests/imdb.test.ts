import { test } from "node:test";
import assert from "node:assert/strict";
import { createImdbLookup, matchFilm } from "../src/server/imdb";
import { filmQuery } from "../src/shared/films";
import { parseItems } from "../src/server/csv";

const film = {
  id: "tt1160419",
  l: "Dune",
  qid: "movie",
  y: 2021,
  i: { imageUrl: "https://m.media-amazon.com/images/M/poster._V1_.jpg" },
};

test("IMDb matching filters people, series, and partial title matches", () => {
  const result = matchFilm(
    {
      d: [
        { ...film, id: "nm123" },
        { ...film, id: "tt123", qid: "tvSeries" },
        { ...film, id: "tt456", l: "Dune: Part Two" },
        film,
      ],
    },
    "Dune",
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") {
    assert.equal(result.imdbId, film.id);
    assert.equal(
      result.posterUrl,
      "https://m.media-amazon.com/images/M/poster._V1_QL75_UX400_.jpg",
    );
  }
});
test("ambiguous titles choose the first match while respecting the year", () => {
  const data = { d: [film, { ...film, id: "tt0087182", y: 1984 }] };
  assert.deepEqual(matchFilm(data, "Dune"), matchFilm({ d: [film] }, "Dune"));
  const sameYear = { d: [{ ...film, id: "tt1234567" }, film] };
  const first = matchFilm(sameYear, "Dune", "2021");
  assert.equal(first.status, "matched");
  if (first.status === "matched") assert.equal(first.imdbId, "tt1234567");
  const result = matchFilm(data, "Dune", "1984");
  assert.equal(result.status, "matched");
  if (result.status === "matched") assert.equal(result.imdbId, "tt0087182");
  assert.equal(matchFilm(data, "Dune", "1999").status, "not-found");
});
test("Unicode titles and punctuation match; untrusted poster hosts are rejected", () => {
  const result = matchFilm(
    {
      d: [
        {
          ...film,
          l: "Amélie",
          i: { imageUrl: "https://evil.example/poster.jpg" },
        },
      ],
    },
    "Amelie!",
  );
  assert.equal(result.status, "matched");
  if (result.status === "matched") assert.equal(result.posterUrl, null);
  const missing = matchFilm({ d: [{ ...film, i: null }] }, "Dune");
  assert.equal(missing.status, "matched");
  if (missing.status === "matched") assert.equal(missing.posterUrl, null);
  assert.equal(matchFilm({ d: [] }, "Dune").status, "not-found");
  assert.equal(matchFilm({ d: "bad schema" }, "Dune").status, "unavailable");
});
test("film CSV context supports optional Year columns and title suffixes", () => {
  assert.deepEqual(filmQuery("Dune (1984)", {}), {
    title: "Dune",
    year: "1984",
  });
  assert.deepEqual(filmQuery("Dune", { "Release Year": "2021" }), {
    title: "Dune",
    year: "2021",
  });
  assert.deepEqual(filmQuery("Dune", {}), { title: "Dune", year: undefined });
});
test("lookup deduplicates, caches, and bounds upstream concurrency", async () => {
  let calls = 0;
  let active = 0;
  let maximum = 0;
  const lookup = createImdbLookup((async (_input, init) => {
    assert.ok(init?.signal);
    calls++;
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return Response.json({ d: [film] });
  }) as typeof fetch);
  await Promise.all([lookup("Dune"), lookup("Dune"), lookup("Dune")]);
  assert.equal(calls, 1);
  await lookup("Dune");
  assert.equal(calls, 1);
  await Promise.all(Array.from({ length: 12 }, (_, i) => lookup(`Film ${i}`)));
  assert.ok(maximum <= 4);
});
test("CSV year and jahr columns drive the IMDb search and release match", async () => {
  for (const heading of ["year", "jahr", "YEAR", "Jahr"]) {
    const [item] = parseItems(`Title,${heading}\nDune,1984\nDune,2021`, true);
    const query = filmQuery(item.name, item.details);
    assert.equal(query.year, "1984");
    const lookup = createImdbLookup((async (input) => {
      assert.equal(
        String(input),
        "https://v3.sg.media-imdb.com/suggestion/x/Dune%201984.json",
      );
      return Response.json({
        d: [film, { ...film, id: "tt0087182", y: 1984 }],
      });
    }) as typeof fetch);
    const result = await lookup(query.title, query.year);
    assert.equal(result.status, "matched");
    if (result.status === "matched") assert.equal(result.imdbId, "tt0087182");
  }
  assert.deepEqual(filmQuery("Dune (2021)", { year: "", " JAHR ": " 1984 " }), {
    title: "Dune",
    year: "1984",
  });
});
test("network errors, provider errors, and invalid JSON never block ranking", async () => {
  for (const transport of [
    async () => {
      throw new Error("Network unavailable");
    },
    async () => new Response("", { status: 429 }),
    async () => new Response("invalid json"),
  ]) {
    assert.deepEqual(
      await createImdbLookup(transport as typeof fetch)("Dune"),
      { status: "unavailable" },
    );
  }
});
