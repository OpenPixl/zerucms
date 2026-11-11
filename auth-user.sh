#!/usr/bin/env bash
# Comptes de l'Espace Admin, sur le VPS (à côté de update.sh).
# Lance le CLI DANS le conteneur : le dist/ du VPS n'est pas celui de l'image.
#
# Usage (depuis le dossier du projet, sur le serveur) :
#   ./auth-user.sh list
#   ./auth-user.sh add <login> "<Prénom Nom>" [groupe…]   (défaut : admin)
#   ./auth-user.sh reset <login>
#   ./auth-user.sh init [login] ["<Nom>"]   (super admin, au déploiement)
set -euo pipefail
cd "$(dirname "$0")"

# Même contournement que update.sh : /root peut être en lecture seule sur le
# VPS, le CLI Docker a besoin d'un dossier de config inscriptible.
export DOCKER_CONFIG="$(pwd)/.dockercfg"
mkdir -p "$DOCKER_CONFIG"

# SUPERADMIN_PASSWORD (init) est transmis au conteneur s'il est défini.
exec docker compose exec ${SUPERADMIN_PASSWORD:+-e SUPERADMIN_PASSWORD} web node dist/cli/auth-user.mjs "$@"
