import { fetchImdbList, ImdbListError } from "@/server/imdb-lists";
import { createSession, HttpError } from "@/server/sessions";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4096)
      throw new HttpError("Enter an IMDb list link.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError("Enter an IMDb list link.");
    }
    if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string")
      throw new HttpError("Enter an IMDb list link.");
    const list = await fetchImdbList(body.url);
    return Response.json(await createSession(list.name, list.items), { status: 201 });
  } catch (error) {
    if (error instanceof ImdbListError)
      return Response.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
