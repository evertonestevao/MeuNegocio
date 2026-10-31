import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { centsToMoneyInput, formatCents } from "@/lib/money";

const ROOT = path.resolve(__dirname, "../..");
const SEED = path.join(ROOT, "supabase/migrations/20261031100000_seed_product_plans.sql");

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(fullPath) : [fullPath];
  });
}

/** Valores cobrados no seed. Só eles: limites são números pequenos demais para detectar. */
function seededPrices(): number[] {
  const seed = readFileSync(SEED, "utf8");
  const values = [...seed.matchAll(/price_cents = (\d+)/g)].map((match) => Number(match[1]));
  return [...new Set(values)].filter((cents) => cents > 0);
}

describe("preços dos planos", () => {
  it("o seed tem os preços que este teste procura", () => {
    expect(seededPrices().length).toBeGreaterThan(0);
  });

  it("nenhum preço de plano fica fixo em src/", () => {
    const needles = seededPrices().flatMap((cents) => [
      new RegExp(`\\b${cents}\\b`),
      new RegExp(formatCents(cents).replace(/\s/g, "\\s").replace("$", "\\$").replace(".", "\\.")),
      new RegExp(`\\b${centsToMoneyInput(cents)}\\b`),
    ]);
    const offenders = filesIn(path.join(ROOT, "src"))
      .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => needles.some((needle) => needle.test(readFileSync(file, "utf8"))))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
