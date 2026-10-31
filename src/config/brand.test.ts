import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "./brand";

const SRC_DIR = path.resolve(__dirname, "..");
const BRAND_FILE = path.resolve(__dirname, "brand.ts");
const TEXT_FILE = /\.(ts|tsx|css|json|html|md|webmanifest)$/;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(fullPath) : [fullPath];
  });
}

describe("brand", () => {
  it("o nome do produto só aparece literal em brand.ts", () => {
    const name = normalize(brand.name);
    const offenders = filesIn(SRC_DIR)
      .filter((file) => TEXT_FILE.test(file) && file !== BRAND_FILE)
      .filter((file) => normalize(readFileSync(file, "utf8")).includes(name))
      .map((file) => path.relative(SRC_DIR, file));

    expect(offenders).toEqual([]);
  });
});
