import { describe, expect, it } from "vitest";
import { filterClientOptions } from "./picker";

const options = [
  { id: "1", name: "Ana Beatriz Gonçalves", document: "296.003.843-63", locations: [] },
  { id: "2", name: "Padaria Pão & Cia Ltda", document: null, locations: [] },
  { id: "3", name: "Sebastião Gonçalves Júnior", document: "839.955.058-21", locations: [] },
];
const ids = (list: { id: string }[]) => list.map((option) => option.id);

describe("filtro do seletor de cliente", () => {
  it("acha pelo nome sem acento e pelos números do documento", () => {
    expect(ids(filterClientOptions(options, "goncalves", null))).toEqual(["1", "3"]);
    expect(ids(filterClientOptions(options, "PÃO", null))).toEqual(["2"]);
    expect(ids(filterClientOptions(options, "296.003", null))).toEqual(["1"]);
  });

  it("vazio mostra todos e o escolhido nunca some", () => {
    expect(ids(filterClientOptions(options, "  ", null))).toEqual(["1", "2", "3"]);
    expect(ids(filterClientOptions(options, "padaria", "1"))).toEqual(["1", "2"]);
  });
});
