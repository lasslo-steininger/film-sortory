import type { Item } from "../shared/types";

const endpoint = "https://api.graphql.imdb.com/";
const pageSize = 250;
const maxItems = 1000;
const filmTypes = new Set(["movie", "tvMovie", "short"]);

const listQuery = `query SortoryList($id: ID!, $first: Int!, $after: String) {
  list(id: $id) {
    name { originalText }
    titleListItemSearch(first: $first, after: $after, sort: { by: LIST_ORDER, order: ASC }) {
      total
      pageInfo { hasNextPage endCursor }
      edges { title { id titleText { text } titleType { id } releaseYear { year } } }
    }
  }
}`;

export class ImdbListError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function parseImdbListUrl(value: string): string {
  if (value.length > 2048) throw new ImdbListError("Enter an IMDb list link.");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ImdbListError("Enter a full IMDb list link, such as https://www.imdb.com/list/ls123456789/.");
  }
  const match = url.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?list\/(ls\d+)\/?$/i);
  if (
    url.protocol !== "https:" ||
    !["imdb.com", "www.imdb.com", "m.imdb.com"].includes(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.port ||
    !match
  ) {
    throw new ImdbListError("Use a public IMDb link ending in /list/ls…/.");
  }
  return match[1].toLowerCase();
}

type ListEdge = {
  title?: {
    id?: unknown;
    titleText?: { text?: unknown };
    titleType?: { id?: unknown };
    releaseYear?: { year?: unknown };
  } | null;
};
type ListPayload = {
  errors?: Array<{ message?: unknown }>;
  data?: {
    list?: {
      name?: { originalText?: unknown };
      titleListItemSearch?: {
        total?: unknown;
        edges?: unknown;
        pageInfo?: { hasNextPage?: unknown; endCursor?: unknown };
      };
    } | null;
  };
};

export async function fetchImdbList(
  link: string,
  transport: typeof fetch = fetch,
): Promise<{ name: string; items: Item[] }> {
  const id = parseImdbListUrl(link);
  const items: Item[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  let name = id;

  for (let page = 0; page < 4; page++) {
    let response: Response;
    try {
      response = await transport(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-imdb-client-name": "imdb-web-next",
        },
        body: JSON.stringify({ query: listQuery, variables: { id, first: pageSize, after } }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ImdbListError("IMDb could not be reached. Try again in a moment or upload a CSV.", 502);
    }
    if (!response.ok)
      throw new ImdbListError("IMDb could not load this list. Try again in a moment or upload a CSV.", 502);

    let payload: ListPayload;
    try {
      payload = await response.json() as ListPayload;
    } catch {
      throw new ImdbListError("IMDb returned an unreadable list response.", 502);
    }
    const providerError = payload?.errors?.[0]?.message;
    if (typeof providerError === "string") {
      if (/RESOURCE_NOT_FOUND|not found/i.test(providerError))
        throw new ImdbListError("That IMDb list is unavailable. Check the link and make sure the list is public.", 404);
      throw new ImdbListError("IMDb could not load this list. Try again in a moment or upload a CSV.", 502);
    }
    const list = payload?.data?.list;
    if (!list)
      throw new ImdbListError("That IMDb list is unavailable. Check the link and make sure the list is public.", 404);
    if (typeof list.name?.originalText === "string" && list.name.originalText.trim())
      name = list.name.originalText.trim();
    const connection = list.titleListItemSearch;
    if (!connection || !Array.isArray(connection.edges) || !connection.pageInfo)
      throw new ImdbListError("IMDb returned an unreadable list response.", 502);
    if (typeof connection.total === "number" && connection.total > maxItems)
      throw new ImdbListError("This list has more than 1,000 entries. Use a smaller IMDb list or upload a CSV.");

    for (const edge of connection.edges as ListEdge[]) {
      const title = edge?.title;
      if (!title || !filmTypes.has(String(title.titleType?.id))) continue;
      if (typeof title.id !== "string" || !/^tt\d+$/.test(title.id)) continue;
      const text = title.titleText?.text;
      if (typeof text !== "string" || !text.trim() || text.length > 2000) continue;
      const year = title.releaseYear?.year;
      items.push({
        id: String(items.length),
        name: text.trim(),
        details: typeof year === "number" && Number.isInteger(year) && year >= 1870 && year <= 2100
          ? { Year: String(year) }
          : {},
      });
    }
    if (items.length > maxItems)
      throw new ImdbListError("This list has more than 1,000 films. Use a smaller list or upload a CSV.");
    if (!connection.pageInfo.hasNextPage) {
      if (items.length < 2)
        throw new ImdbListError("This IMDb list needs at least two films. Other title types are skipped.");
      return { name, items };
    }
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== "string" || !cursor || cursors.has(cursor) || !connection.edges.length)
      throw new ImdbListError("IMDb stopped returning the rest of this list. Try again later.", 502);
    cursors.add(cursor);
    after = cursor;
  }
  throw new ImdbListError("This list has more than 1,000 entries. Use a smaller IMDb list or upload a CSV.");
}
