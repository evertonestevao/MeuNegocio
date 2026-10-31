import type { RoleCode } from "@/types/database";

/**
 * Permissões por papel (plano §5), em estrutura extensível por produto.
 *
 * No BANCO o papel já é aberto: company_members.role é text com FK para
 * roles.code — papel novo = INSERT em public.roles (migration). Aqui, cada
 * papel declara um conjunto de CAPABILITIES + um LEVEL hierárquico:
 *
 *  - capabilities: o que o papel pode fazer (checadas por hasCapability).
 *  - level: resolve ações sobre OUTRO membro (mudar papel/remover): o ator
 *    precisa da capability E de level estritamente maior que o do alvo.
 *
 * Papel desconhecido (ex.: linha antiga de um papel removido) não tem
 * capability nenhuma e level 0 — negar por padrão é o comportamento seguro.
 *
 * PARA CRIAR UM PAPEL CUSTOMIZADO num produto derivado:
 *  1. Migration: insert into public.roles (code, name, description).
 *  2. Aqui: defineRole("financeiro", { level: 2, capabilities: [...] }).
 *  3. Se policies de RLS citarem papéis (ex.: is_company_admin), avalie se o
 *     papel novo entra nelas — RLS continua sendo a barreira final.
 */

export type Capability =
  | "members.manage" // convidar, revogar convite, mudar papel, remover
  | "company.edit"
  | "audit.view"
  | "billing.manage"
  | "clients.manage" // ver, criar e editar clientes
  | "records.delete" // apagar registros de negócio
  | "catalog.manage" // editar o catálogo, com custo e margem
  | "quotes.manage" // ver catálogo; criar, editar e enviar orçamentos
  | "quotes.close" // fechar orçamento e desfazer o fechamento
  | "team.view" // ver nome, função e situação da equipe
  | "team.manage" // cadastrar equipe, com contrato e pagamento
  | "schedule.manage"; // ver e alterar toda a agenda

export interface RoleDefinition {
  /** Hierarquia: ações sobre outro membro exigem level maior que o do alvo. */
  level: number;
  capabilities: ReadonlySet<Capability>;
}

const roleRegistry = new Map<string, RoleDefinition>([
  [
    "owner",
    {
      level: 3,
      capabilities: new Set<Capability>([
        "members.manage",
        "company.edit",
        "audit.view",
        "billing.manage",
        "clients.manage",
        "records.delete",
        "catalog.manage",
        "quotes.manage",
        "quotes.close",
        "team.view",
        "team.manage",
        "schedule.manage",
      ]),
    },
  ],
  [
    "admin",
    {
      level: 2,
      capabilities: new Set<Capability>([
        "members.manage",
        "company.edit",
        "audit.view",
        "clients.manage",
        "records.delete",
        "catalog.manage",
        "quotes.manage",
        "quotes.close",
        "team.view",
        "team.manage",
        "schedule.manage",
      ]),
    },
  ],
  ["member", { level: 1, capabilities: new Set<Capability>(["clients.manage", "quotes.manage", "team.view", "schedule.manage"]) }],
  // Campo: as próprias visitas e ordens de serviço, decididas por dono do registro.
  ["technician", { level: 1, capabilities: new Set<Capability>() }],
]);

/** Registra (ou sobrescreve) um papel — ponto de extensão por produto. */
export function defineRole(code: string, definition: RoleDefinition): void {
  roleRegistry.set(code, { ...definition, capabilities: new Set(definition.capabilities) });
}

function definitionOf(role: string): RoleDefinition {
  // Papel fora do registro: nega tudo (level 0, sem capabilities).
  return roleRegistry.get(role) ?? { level: 0, capabilities: new Set() };
}

export function hasCapability(role: string, capability: Capability): boolean {
  return definitionOf(role).capabilities.has(capability);
}

/**
 * API estável consumida por services/páginas. Assinaturas aceitam string
 * (qualquer papel registrado), mas RoleCode continua válido em todo lugar.
 */
export const permissionService = {
  hasCapability,

  /** Gerenciar membros e convites. */
  canManageMembers(role: RoleCode | string): boolean {
    return hasCapability(role, "members.manage");
  },

  /** Editar dados da empresa (nome, slug). */
  canEditCompany(role: RoleCode | string): boolean {
    return hasCapability(role, "company.edit");
  },

  /** Ver auditoria (espelha a policy de audit_logs). */
  canViewAudit(role: RoleCode | string): boolean {
    return hasCapability(role, "audit.view");
  },

  /** Decisões de billing (assinar, cancelar): só owner por default. */
  canManageBilling(role: RoleCode | string): boolean {
    return hasCapability(role, "billing.manage");
  },

  /** Ver, criar e editar clientes, contatos e locais. */
  canManageClients(role: RoleCode | string): boolean {
    return hasCapability(role, "clients.manage");
  },

  /** Apagar registros de negócio: só owner e admin. */
  canDeleteRecords(role: RoleCode | string): boolean {
    return hasCapability(role, "records.delete");
  },

  /** Editar o catálogo e ver custo e margem. */
  canManageCatalog(role: RoleCode | string): boolean {
    return hasCapability(role, "catalog.manage");
  },

  /** Ver o catálogo e criar, editar e enviar orçamentos. */
  canManageQuotes(role: RoleCode | string): boolean {
    return hasCapability(role, "quotes.manage");
  },

  /** Fechar orçamento e desfazer o fechamento. */
  canCloseQuotes(role: RoleCode | string): boolean {
    return hasCapability(role, "quotes.close");
  },

  /** Ver nome, função e situação da equipe. */
  canViewTeam(role: RoleCode | string): boolean {
    return hasCapability(role, "team.view");
  },

  /** Cadastrar a equipe e ver contrato e pagamento. */
  canManageTeam(role: RoleCode | string): boolean {
    return hasCapability(role, "team.manage");
  },

  /** Ver e alterar toda a agenda. */
  canManageSchedule(role: RoleCode | string): boolean {
    return hasCapability(role, "schedule.manage");
  },

  /** Alterar papel de um membro: capability + hierarquia sobre o alvo. */
  canChangeRole(actorRole: RoleCode | string, targetCurrentRole: RoleCode | string): boolean {
    return (
      hasCapability(actorRole, "members.manage") &&
      definitionOf(actorRole).level > definitionOf(targetCurrentRole).level
    );
  },

  /** Remover um membro: mesma regra. Owner (nível máximo) nunca é removível. */
  canRemoveMember(actorRole: RoleCode | string, targetRole: RoleCode | string): boolean {
    return (
      hasCapability(actorRole, "members.manage") &&
      definitionOf(actorRole).level > definitionOf(targetRole).level
    );
  },
};

export type PermissionService = typeof permissionService;
