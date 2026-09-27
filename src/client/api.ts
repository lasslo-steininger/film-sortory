import type { SessionView } from "@/shared/types";
async function response(request: Promise<Response>): Promise<SessionView> {
  const result = await request;
  const data = await result.json();
  if (!result.ok)
    throw new Error(
      data.error || "Unable to reach the server. Please try again.",
    );
  return data;
}
export function upload(file: File, hasHeader: boolean) {
  const form = new FormData();
  form.set("file", file);
  form.set("hasHeader", String(hasHeader));
  return response(fetch("/api/sessions", { method: "POST", body: form }));
}
export function importImdbList(url: string) {
  return response(fetch("/api/imdb-lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }));
}
export function restore(id: string) {
  return response(
    fetch(`/api/sessions/${encodeURIComponent(id)}`, { cache: "no-store" }),
  );
}
export function decide(
  session: SessionView,
  action: "choose" | "undo" | "restart",
  winner?: string,
) {
  return response(
    fetch(`/api/sessions/${session.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: session.revision, action, winner }),
    }),
  );
}
