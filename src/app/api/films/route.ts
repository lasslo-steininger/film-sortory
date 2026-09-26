import { lookupFilmCover } from "@/server/film-covers";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const title = query.get("title")?.trim();
  const year = query.get("year") ?? undefined;
  if (
    !title ||
    title.length > 300 ||
    (year !== undefined && !/^\d{4}$/.test(year))
  ) {
    return Response.json(
      {
        error:
          "Provide a film title (up to 300 characters) and an optional four-digit year.",
      },
      { status: 400 },
    );
  }
  const cover = await lookupFilmCover(title, year);
  return Response.json(cover, {
    headers: {
      "Cache-Control":
        cover.status === "unavailable" ? "no-store" : "public, max-age=86400",
    },
  });
}
