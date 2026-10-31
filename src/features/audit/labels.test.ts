import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_LABEL, AUDIT_ENTITY_LABEL, auditActionLabel, auditEntityLabel } from "./labels";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("rótulos da auditoria", () => {
  const code = sourceFiles("src").map((path) => readFileSync(path, "utf8")).join("\n");

  it("toda ação escrita no código tem texto em português", () => {
    const actions = [...code.matchAll(/action: (?:[^"\n`]*\? )?"([a-z_]+\.[a-z_]+)"(?: : "([a-z_]+\.[a-z_]+)")?/g)]
      .flatMap((match) => [match[1], match[2]])
      .filter(Boolean);
    expect(actions.length).toBeGreaterThan(20);
    expect(actions.filter((action) => !AUDIT_ACTION_LABEL[action])).toEqual([]);
  });

  it("toda entidade escrita no código tem texto em português", () => {
    const entities = [...code.matchAll(/entityType: "([a-z_]+)"/g)].map((match) => match[1]);
    expect(entities.filter((entity) => !AUDIT_ENTITY_LABEL[entity])).toEqual([]);
  });

  it("código desconhecido nunca chega à tela", () => {
    expect(auditActionLabel("novo.evento")).toBe("Outra ação");
    expect(auditEntityLabel("nova_entidade")).toBe("Outro registro");
    expect(auditEntityLabel(null)).toBe("—");
  });
});
