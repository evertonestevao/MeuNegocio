import { describe, expect, it } from "vitest";
import { centsToMoneyInput, parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it.each([
    ["149", 14900],
    ["149,9", 14990],
    ["149,90", 14990],
    ["1.234,56", 123456],
    ["0", 0],
  ])("%s vira %i", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-1", "1,234", "12.34", "1.23,00"])("recusa %s", (input) => {
    expect(parseMoneyToCents(input)).toBeNull();
  });
});

describe("centsToMoneyInput", () => {
  it("volta ao formato do campo", () => {
    expect(parseMoneyToCents(centsToMoneyInput(123456))).toBe(123456);
  });
});
