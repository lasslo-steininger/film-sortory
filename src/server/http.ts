import { HttpError } from "./sessions";
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json(
    {
      error:
        "Something went wrong while saving your ranking. Please try again.",
    },
    { status: 500 },
  );
}
