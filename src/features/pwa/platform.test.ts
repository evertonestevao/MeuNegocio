import { describe, expect, it } from "vitest";
import { isIosDevice } from "./platform";

describe("isIosDevice", () => {
  it("reconhece iPhone e iPad, inclusive o iPad que se apresenta como Mac", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", "iPhone", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X)", "MacIntel", 5)).toBe(true);
  });

  it("não confunde Mac e Android", () => {
    expect(isIosDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X)", "MacIntel", 0)).toBe(false);
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5)).toBe(false);
  });
});
