import "server-only";
import { createImdbLookup } from "./imdb";

const state = globalThis as unknown as {
  imdbLookupV2?: ReturnType<typeof createImdbLookup>;
};
export const lookupFilmCover = (state.imdbLookupV2 ??= createImdbLookup());
