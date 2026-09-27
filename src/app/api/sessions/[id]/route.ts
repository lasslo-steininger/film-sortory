import { getSession, updateSession, HttpError } from "@/server/sessions";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    return Response.json(await getSession((await context.params).id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => {
      throw new HttpError("Invalid request.");
    });
    if (
      !body ||
      !Number.isInteger(body.revision) ||
      !["choose", "undo", "restart"].includes(body.action) ||
      (body.action === "choose" && typeof body.winner !== "string")
    )
      throw new HttpError("Invalid choice.");
    return Response.json(
      await updateSession(
        (await context.params).id,
        body.revision,
        body.action,
        body.winner,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
