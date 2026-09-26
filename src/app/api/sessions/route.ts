import { parseItems, MAX_BYTES } from "@/server/csv";
import { createSession, HttpError } from "@/server/sessions";
import { errorResponse } from "@/server/http";
import { isSortingAlgorithm } from "@/shared/types";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > MAX_BYTES + 16384)
      throw new HttpError("Choose a CSV smaller than 1 MB.", 413);
    const form = await request.formData();
    const algorithm = form.get("algorithm") ?? "merge";
    if (!isSortingAlgorithm(algorithm))
      throw new HttpError("Choose a valid sorting algorithm.");
    const file = form.get("file");
    if (!(file instanceof File))
      throw new HttpError("Please choose a CSV file.");
    if (file.size > MAX_BYTES)
      throw new HttpError("Choose a CSV smaller than 1 MB.", 413);
    if (!file.name.toLowerCase().endsWith(".csv"))
      throw new HttpError("Please choose a .csv file.");
    let items;
    try {
      items = parseItems(await file.text(), form.get("hasHeader") !== "false");
    } catch (error) {
      throw new HttpError((error as Error).message);
    }
    return Response.json(
      await createSession(file.name.replace(/\.csv$/i, ""), items, algorithm),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
