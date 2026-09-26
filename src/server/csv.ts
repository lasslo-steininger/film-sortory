import Papa from "papaparse";
import type { Item } from "../shared/types";

export const MAX_BYTES = 1024 * 1024;
export function parseItems(csv: string, hasHeader: boolean): Item[] {
  if (Buffer.byteLength(csv, "utf8") > MAX_BYTES)
    throw new Error("Choose a CSV smaller than 1 MB.");
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.some((error) => error.code !== "UndetectableDelimiter")) {
    throw new Error(
      "This CSV could not be read. Check its quotation marks and separators.",
    );
  }
  const rows = parsed.data;
  const headings = hasHeader
    ? rows.shift()?.map((value) => value.trim())
    : undefined;
  if (rows.length < 2) throw new Error("Add at least 2 films to your CSV.");
  if (rows.length > 1000)
    throw new Error("Please use 1000 films or fewer per ranking.");
  const width = headings?.length ?? rows[0].length;
  const usedHeadings = new Set<string>();
  const detailHeadings = Array.from({ length: width - 1 }, (_, column) => {
    const base = headings?.[column + 1] || `Column ${column + 2}`;
    let heading = base;
    let suffix = 2;
    while (usedHeadings.has(heading)) heading = `${base} (${suffix++})`;
    usedHeadings.add(heading);
    return heading;
  });
  return rows.map((row, index) => {
    if (row.length !== width)
      throw new Error(
        `Row ${index + (hasHeader ? 2 : 1)} has a different number of columns.`,
      );
    const name = row[0]?.trim();
    if (!name)
      throw new Error(
        `Row ${index + (hasHeader ? 2 : 1)} needs a name in the first column.`,
      );
    if (row.some((value) => value.length > 2000))
      throw new Error("Each cell must contain at most 2,000 characters.");
    return {
      id: String(index),
      name,
      details: Object.fromEntries(
        row
          .slice(1)
          .map((value, column) => [detailHeadings[column], value.trim()]),
      ),
    };
  });
}
