import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchImdbList, ImdbListError, parseImdbListUrl } from "../src/server/imdb-lists";

const link = "https://www.imdb.com/list/ls4154733176/?ref_=share";
const edge = (id: string, title: string, year: number, type = "movie") => ({
  title: { id, titleText: { text: title }, titleType: { id: type }, releaseYear: { year } },
});
const page = (edges: unknown[], hasNextPage = false, endCursor: string | null = null, total = 3) =>
  Response.json({ data: { list: {
    name: { originalText: "Weekend films" },
    titleListItemSearch: { total, edges, pageInfo: { hasNextPage, endCursor } },
  } } });

test("only HTTPS IMDb list links are accepted", () => {
  assert.equal(parseImdbListUrl(link), "ls4154733176");
  assert.equal(parseImdbListUrl("https://m.imdb.com/list/ls123/"), "ls123");
  assert.equal(parseImdbListUrl("https://www.imdb.com/de/list/ls026871230/"), "ls026871230");
  assert.equal(parseImdbListUrl("https://www.imdb.com/en-US/list/ls123/?ref_=share"), "ls123");
  for (const value of [
    "https://evil.example/list/ls123/",
    "https://www.imdb.com.evil.example/list/ls123/",
    "http://www.imdb.com/list/ls123/",
    "https://www.imdb.com/title/tt123/",
    "https://www.imdb.com/list/ls123/extra",
    "not a URL",
  ]) assert.throws(() => parseImdbListUrl(value), ImdbListError);
});

test("IMDb list import fetches every page and keeps film titles and years", async () => {
  const calls: unknown[] = [];
  const responses = [
    page([edge("tt1", "First", 1999), edge("tt2", "Series", 2000, "tvSeries")], true, "page-two"),
    page([edge("tt3", "Second", 2021, "tvMovie"), edge("tt4", "Short", 2024, "short")]),
  ];
  const transport = (async (url: string, init?: RequestInit) => {
    assert.equal(url, "https://api.graphql.imdb.com/");
    assert.equal(init?.method, "POST");
    calls.push(JSON.parse(String(init?.body)).variables);
    return responses.shift()!;
  }) as typeof fetch;
  const result = await fetchImdbList(link, transport);
  assert.deepEqual(calls, [
    { id: "ls4154733176", first: 250, after: null },
    { id: "ls4154733176", first: 250, after: "page-two" },
  ]);
  assert.deepEqual(result, {
    name: "Weekend films",
    items: [
      { id: "0", name: "First", details: { Year: "1999" } },
      { id: "1", name: "Second", details: { Year: "2021" } },
      { id: "2", name: "Short", details: { Year: "2024" } },
    ],
  });
});

test("unavailable, oversized, and non-film lists fail without partial imports", async () => {
  const cases: Array<[Response, number]> = [
    [Response.json({ data: { list: null } }), 404],
    [new Response("", { status: 429 }), 502],
    [page([edge("tt1", "First", 1999)], false, null, 1001), 400],
    [page([edge("tt1", "First", 1999)]), 400],
  ];
  for (const [reply, status] of cases) {
    await assert.rejects(
      fetchImdbList(link, (async () => reply) as typeof fetch),
      (error: unknown) => error instanceof ImdbListError && error.status === status,
    );
  }
});
