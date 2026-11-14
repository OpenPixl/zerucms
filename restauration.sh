#!/usr/bin/env bash
# Restauration d'une sauvegarde (docs/sauvegarde.md) : REMPLACE src/content/,
# extensions/ et les comptes + journal de l'Espace Admin par ceux de l'archive, puis
# redémarre le site pour le reconstruire. L'état courant est d'abord
# sauvegardé (data/sauvegardes/…-avant-restauration.zip).
#
#   ./restauration.sh sauvegarde-2026-11-05-10h30.zip   archive de data/sauvegardes/
#   ./restauration.sh ~/mon-site.zip                     archive ailleurs sur le serveur
#                                                        (copiée d'abord dans data/sauvegardes/)
#   ./restauration.sh … --oui                            sans demander de confirmation
#
# Options : --docker / --node (mode, détecté sinon, comme ./update.sh).
# Node seul : redémarrage par UPDATE_RESTART du .env (ex. « systemctl restart
# monsite »), sinon consigne affichée.
set -euo pipefail
cd "$(dirname "$0")"

mode=""; cible=""; oui=""
while [ $# -gt 0 ]; do
  case "$1" in
    --docker) mode=docker ;;
    --node) mode=node ;;
    --oui) oui="--oui" ;;
    *) cible="$1" ;;
  esac
  shift
done
[ -n "$cible" ] || { echo "Usage : ./restauration.sh <sauvegarde.zip> [--oui]   (liste : ./sauvegarde.sh --liste)"; exit 2; }
if [ -z "$mode" ]; then
  if [ -f docker-compose.yml ] && command -v docker >/dev/null 2>&1; then mode=docker; else mode=node; fi
fi

# Archive donnée par un chemin : rangée dans data/sauvegardes/ (seul dossier
# visible du conteneur), puis désignée par son nom.
if [ -f "$cible" ]; then
  mkdir -p data/sauvegardes
  nom="$(basename "$cible")"
  if [ "$(cd "$(dirname "$cible")" && pwd)" != "$(pwd)/data/sauvegardes" ]; then
    cp "$cible" "data/sauvegardes/$nom"
    echo "→ Archive copiée dans data/sauvegardes/$nom"
  fi
  cible="$nom"
fi

set +e
if [ "$mode" = node ]; then
  node --env-file-if-exists=.env scripts/sauvegarde.mjs restaurer "$cible" $oui
else
  export DOCKER_CONFIG="$(pwd)/.dockercfg"
  mkdir -p "$DOCKER_CONFIG"
  if [ -n "$(docker compose ps -q web 2>/dev/null)" ]; then
    docker compose exec web node scripts/sauvegarde.mjs restaurer "$cible" $oui
  else
    docker compose run --rm --no-deps web node scripts/sauvegarde.mjs restaurer "$cible" $oui
  fi
fi
code=$?
set -e
[ $code -eq 3 ] && exit 0   # abandon : rien n'a changé
[ $code -eq 0 ] || exit $code

echo "→ Redémarrage du site (reconstruction avec le contenu restauré, environ une minute)"
if [ "$mode" = docker ]; then
  if [ -n "$(docker compose ps -q web 2>/dev/null)" ]; then docker compose restart web; else docker compose up -d --no-build web; fi
else
  restart="$( { sed -nE 's/^UPDATE_RESTART=["'\'']?([^"'\'']*)["'\'']?$/\1/p' .env 2>/dev/null || true; } | tail -1)"
  if [ -n "$restart" ]; then
    eval "$restart"
  else
    echo "  Redémarrez le site (Ctrl+C puis « npm start », ou « systemctl restart monsite ») pour le reconstruire."
  fi
fi
echo "✓ Terminé."
