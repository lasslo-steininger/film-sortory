import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Item, type SessionView } from "../shared/types";
import { maxComparisons, provisionalRanking, rank } from "./sort";
import { shuffle } from "./shuffle";

type Session = {
  id: string;
  name: string;
  items: Item[];
  decisions: string[];
  revision: number;
};
const directory = path.resolve(
  process.env.SESSION_DATA_DIR || ".data/sessions",
);
const globalStore = globalThis as unknown as {
  sessionLocks?: Map<string, Promise<unknown>>;
};
const locks = (globalStore.sessionLocks ??= new Map());
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function file(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(id))
    throw new HttpError("Ranking not found.", 404);
  return path.join(directory, `${id}.json`);
}
async function save(session: Session) {
  await mkdir(directory, { recursive: true });
  const target = file(session.id);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(session), { mode: 0o600 });
  await rename(temporary, target);
}
async function read(id: string): Promise<Session> {
  try {
    return JSON.parse(await readFile(file(id), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new HttpError(
        "This ranking is no longer available. Upload your CSV to start again.",
        404,
      );
    throw error;
  }
}
function view(session: Session): SessionView {
  const state = rank(session.items, session.decisions);
  const maximum = maxComparisons(session.items.length);
  return {
    id: session.id,
    name: session.name,
    items: session.items,
    revision: session.revision,
    comparisons: session.decisions.length,
    maxComparisons: maximum,
    progress: state.results
      ? 100
      : Math.min(99, Math.round((session.decisions.length / maximum) * 100)),
    ...state,
    currentRanking: state.results ?? provisionalRanking(session.items, session.decisions),
  };
}
export async function createSession(name: string, items: Item[]) {
  const session: Session = {
    id: randomUUID(),
    name: name.slice(0, 150),
    items: shuffle(items),
    decisions: [],
    revision: 0,
  };
  await save(session);
  return view(session);
}
export async function getSession(id: string) {
  return view(await read(id));
}
export async function updateSession(
  id: string,
  revision: number,
  action: "choose" | "undo" | "restart",
  winner?: string,
) {
  const previous = locks.get(id) ?? Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      const session = await read(id);
      if (session.revision !== revision)
        throw new HttpError(
          "This ranking changed in another tab. Reload to continue with the latest choices.",
          409,
        );
      if (action === "restart") {
        session.decisions = [];
        session.items = shuffle(session.items);
      } else if (action === "undo") {
        if (!session.decisions.length)
          throw new HttpError("There are no choices to undo.");
        session.decisions.pop();
      } else {
        const { pair } = rank(session.items, session.decisions);
        if (!pair || !pair.some((item) => item.id === winner))
          throw new HttpError("Choose one of the two current films.");
        session.decisions.push(winner!);
      }
      session.revision++;
      await save(session);
      return view(session);
    });
  locks.set(id, task);
  try {
    return await task;
  } finally {
    if (locks.get(id) === task) locks.delete(id);
  }
}
