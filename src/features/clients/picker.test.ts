import { describe, expect, it } from "vitest";
import { contactSummary, filterClientOptions } from "./picker";

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

describe("contato na lista de clientes", () => {
  it("não repete o nome do cliente", () => {
    expect(contactSummary({ name: "Academia Corpo em Ação", primary_contact_name: "Academia Corpo em Ação", primary_contact_phone: "(14) 3524-1212" })).toBe("(14) 3524-1212");
    expect(contactSummary({ name: "Condomínio Ipê", primary_contact_name: "Osvaldo", primary_contact_phone: "(14) 3522-3030" })).toBe("Osvaldo · (14) 3522-3030");
    expect(contactSummary({ name: "Sebastião", primary_contact_name: null, primary_contact_phone: null })).toBeNull();
  });
});
