#!/usr/bin/env bash
# Sauvegarde de ce qui appartient à l'association (docs/sauvegarde.md) :
# archive ZIP de src/content/, extensions/ + comptes et journal de l'Espace Admin (data/),
# rangée dans data/sauvegardes/. Le .env n'y est jamais.
#
#   ./sauvegarde.sh                 nouvelle sauvegarde
#   ./sauvegarde.sh "avant migration"   … avec un motif (dans le nom du fichier)
#   ./sauvegarde.sh --liste         sauvegardes existantes
#
# Options : --docker / --node (mode, détecté sinon, comme ./update.sh).
set -euo pipefail
cd "$(dirname "$0")"

mode=""; args=(creer)
while [ $# -gt 0 ]; do
  case "$1" in
    --docker) mode=docker ;;
    --node) mode=node ;;
    --liste) args=(liste) ;;
    *) args+=("$1") ;;
  esac
  shift
done
if [ -z "$mode" ]; then
  if [ -f docker-compose.yml ] && command -v docker >/dev/null 2>&1; then mode=docker; else mode=node; fi
fi

if [ "$mode" = node ]; then
  exec node --env-file-if-exists=.env scripts/sauvegarde.mjs "${args[@]}"
fi

export DOCKER_CONFIG="$(pwd)/.dockercfg"
mkdir -p "$DOCKER_CONFIG"
if [ -n "$(docker compose ps -q web 2>/dev/null)" ]; then
  exec docker compose exec -T web node scripts/sauvegarde.mjs "${args[@]}"
fi
# Site arrêté : conteneur ponctuel avec les mêmes volumes.
exec docker compose run --rm --no-deps -T web node scripts/sauvegarde.mjs "${args[@]}"
