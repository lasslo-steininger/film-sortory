export type FilmCover =
  | {
      status: "matched";
      imdbId: string;
      title: string;
      year: number | null;
      posterUrl: string | null;
    }
  | { status: "not-found" | "unavailable" };

/** CSV context is optional; a parenthesized year in the name also works. */
export function filmQuery(name: string, details: Record<string, string>) {
  const suffix = name.match(/\s*\((\d{4})\)\s*$/);
  const column = Object.entries(details)
    .filter(([key]) => /^(year|jahr|release year)$/i.test(key.trim()))
    .map(([, value]) => value.trim())
    .find((value) => /^\d{4}$/.test(value));
  const year = column ?? suffix?.[1];
  return {
    title: suffix ? name.slice(0, suffix.index).trim() : name.trim(),
    year,
  };
}
