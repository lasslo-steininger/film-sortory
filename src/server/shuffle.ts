import { randomInt } from "node:crypto";

/** Fisher–Yates: preserve every film and leave the supplied list untouched. */
export function shuffle<T>(items: readonly T[], pickIndex = randomInt): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = pickIndex(index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}
