#!/usr/bin/env bash
# Atualiza o MeuNegócio do mini PC, que é o ambiente de STAGE (https://meunegocio.everapps.com.br).
#
# Faz, nesta ordem: aplica as migrations pendentes no banco local, refaz o build de produção e
# reinicia o app na porta 3000 (com o túnel de sempre, pelo ~/.cloudflared/meunegocio-start.sh).
# Só depois de o stage ser visto e aprovado é que o código vai para a master, que publica a produção.
#
# Uso: bash scripts/atualizar-minipc.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PORT=3000
LOCAL_URL="http://localhost:${PORT}/login"
PUBLIC_URL="https://meunegocio.everapps.com.br/login"
START_SCRIPT="$HOME/.cloudflared/meunegocio-start.sh"

say() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nERRO: %s\n' "$1" >&2; exit 1; }

[ -x "$(command -v npx)" ] || { source "$HOME/.nvm/nvm.sh" 2>/dev/null || true; }
[ -f "$START_SCRIPT" ] || fail "não achei $START_SCRIPT (script que sobe o app e o túnel)."

say "Versão: $(git rev-parse --short HEAD) na branch $(git branch --show-current)"
if [ -n "$(git status --porcelain -- . ':!AGENTS.md' ':!supabase/config.toml' ':!artefatos-teste')" ]; then
  echo "Aviso: há alterações ainda não commitadas. O stage usa a pasta como está agora."
fi

say "1/4 Migrations pendentes no banco local"
npx supabase migration up 2>&1 | grep -E "Applying|up to date|Migrations applied|rror" || true

say "2/4 Build de produção (se falhar, o app em execução não é derrubado)"
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}" npx next build >/tmp/atualizar-minipc-build.log 2>&1 \
  || { tail -25 /tmp/atualizar-minipc-build.log; fail "o build falhou: o app continua como estava. Log completo em /tmp/atualizar-minipc-build.log"; }
grep -E "Compiled" /tmp/atualizar-minipc-build.log | head -1

say "3/4 Reiniciando o app na porta ${PORT}"
PID="$(ss -ltnp 2>/dev/null | grep ":${PORT} " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true)"
if [ -n "${PID:-}" ]; then
  # Só encerra se for o app deste projeto: há outros projetos e containers nesta máquina.
  if [ "$(readlink "/proc/${PID}/cwd" 2>/dev/null)" = "$ROOT" ]; then
    kill "$PID"
    for _ in 1 2 3 4 5 6 7 8 9 10; do ss -ltn | grep -q ":${PORT} " || break; sleep 1; done
  else
    fail "a porta ${PORT} está em uso por outro processo (pid ${PID}); não encerrei."
  fi
fi
# O script de partida deixa o app como processo filho; sem desligar a saída dele, quem lê esta
# saída por um pipe (ex.: `| tail`) ficaria esperando para sempre.
bash "$START_SCRIPT" >/dev/null 2>&1 </dev/null

say "4/4 Conferindo"
for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$LOCAL_URL")" = "200" ] && break
  sleep 1
done
LOCAL_CODE="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$LOCAL_URL")"
PUBLIC_CODE="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$PUBLIC_URL")"
echo "local  (${LOCAL_URL}): ${LOCAL_CODE}"
echo "stage  (${PUBLIC_URL}): ${PUBLIC_CODE}"
[ "$LOCAL_CODE" = "200" ] && [ "$PUBLIC_CODE" = "200" ] || fail "o app não respondeu 200. Veja ~/.cloudflared/meunegocio-app.log"

say "Stage atualizado: $(git rev-parse --short HEAD). Confira no navegador e só então publique na master."
