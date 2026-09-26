import type { FilmCover } from "../shared/films";

type Candidate = {
  id?: unknown;
  l?: unknown;
  qid?: unknown;
  y?: unknown;
  i?: { imageUrl?: unknown };
};
function normalize(title: string) {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}
function posterUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "m.media-amazon.com" ||
      !url.pathname.startsWith("/images/")
    )
      return null;
    // IMDb's image service supports resized variants; avoid multi-megabyte originals.
    return url.href.replace(/\._V1_.*\.(jpg|png)$/i, "._V1_QL75_UX400_.$1");
  } catch {
    return null;
  }
}

export function matchFilm(
  data: unknown,
  title: string,
  year?: string,
): FilmCover {
  if (!data || typeof data !== "object") return { status: "unavailable" };
  const suggestions = (data as { d?: unknown }).d;
  if (suggestions === undefined) return { status: "not-found" };
  if (!Array.isArray(suggestions)) return { status: "unavailable" };
  const film = suggestions.find((candidate): candidate is Candidate => {
    if (!candidate || typeof candidate !== "object") return false;
    const film = candidate as Candidate;
    return (
      typeof film.id === "string" &&
      /^tt\d+$/.test(film.id) &&
      ["movie", "tvMovie", "short"].includes(String(film.qid)) &&
      typeof film.l === "string" &&
      normalize(film.l) === normalize(title) &&
      (!year || film.y === Number(year))
    );
  });
  // Preserve IMDb's result order after applying title, type, and year filters.
  if (!film) return { status: "not-found" };
  return {
    status: "matched",
    imdbId: film.id as string,
    title: film.l as string,
    year: typeof film.y === "number" ? film.y : null,
    posterUrl: posterUrl(film.i?.imageUrl),
  };
}

/** Injectable transport keeps provider tests deterministic and offline. */
export function createImdbLookup(transport: typeof fetch = fetch) {
  const cache = new Map<string, { expires: number; result: FilmCover }>();
  const pending = new Map<string, Promise<FilmCover>>();
  let active = 0;
  const queue: Array<() => void> = [];
  async function acquire() {
    if (active < 4) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  function release() {
    const next = queue.shift();
    if (next) next();
    else active--;
  }
  return async function lookup(
    title: string,
    year?: string,
  ): Promise<FilmCover> {
    const key = JSON.stringify([title.toLowerCase(), year ?? ""]);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.result;
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= 100) return { status: "unavailable" };
    const task = (async (): Promise<FilmCover> => {
      await acquire();
      let result: FilmCover;
      try {
        const searchTerm = year ? `${title} ${year}` : title;
        const response = await transport(
          `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(searchTerm)}.json`,
          {
            signal: AbortSignal.timeout(5000),
            headers: { Accept: "application/json" },
            cache: "no-store",
          },
        );
        result = response.ok
          ? matchFilm(await response.json(), title, year)
          : { status: "unavailable" };
      } catch {
        result = { status: "unavailable" };
      } finally {
        release();
      }
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(key, {
        result,
        expires:
          Date.now() + (result.status === "unavailable" ? 30_000 : 86_400_000),
      });
      return result;
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  };
}
