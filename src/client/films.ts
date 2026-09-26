import type { FilmCover } from "@/shared/films";

const requests = new Map<string, Promise<FilmCover>>();
export function fetchFilmCover(
  title: string,
  year?: string,
): Promise<FilmCover> {
  // Bypass cached responses from the previous ambiguous-match policy.
  const query = new URLSearchParams({ title, v: "2" });
  if (year) query.set("year", year);
  const key = query.toString();
  const cached = requests.get(key);
  if (cached) return cached;
  const result = fetch(`/api/films?${query}`)
    .then(async (response) => {
      if (!response.ok) throw new Error("Cover unavailable");
      return (await response.json()) as FilmCover;
    })
    .catch((): FilmCover => ({ status: "unavailable" }))
    .then((cover) => {
      if (cover.status === "unavailable") requests.delete(key);
      return cover;
    });
  if (requests.size >= 1000) requests.delete(requests.keys().next().value!);
  requests.set(key, result);
  return result;
}
