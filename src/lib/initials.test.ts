import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it.each([
    ["Carlos Eduardo Ferreira", "CF"],
    ["Academia Corpo em Ação Ltda", "AA"],
    ["Padaria Pão & Cia Ltda", "PP"],
    ["Mercadinho São José ME", "MJ"],
    ["Clínica Odontológica Sorriso Pleno S/S", "CP"],
    ["Ana", "A"],
    ["  ", "?"],
    ["Ltda", "L"],
  ])("%j → %s", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
