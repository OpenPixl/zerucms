#!/usr/bin/env bash
# Mise à jour du site vers une version publiée du modèle (docs/mise-a-jour.md).
#
#   ./update.sh            dernière version publiée
#   ./update.sh v1.2.0     version précise (aussi pour revenir en arrière)
#
# Options : --docker / --node (mode, détecté sinon), --no-pull (Docker : image
# déjà présente localement, tests ; pas de nettoyage des images), --archive
# <fichier.tar.gz> (Node : archive locale au lieu du téléchargement, tests),
# --sans-sauvegarde (pas de sauvegarde automatique du contenu).
#
# Avant tout changement, le contenu, les comptes et le journal sont
# sauvegardés (data/sauvegardes/…-avant-mise-a-jour.zip, 5 dernières gardées,
# docs/sauvegarde.md) ; si la sauvegarde échoue, rien n'est mis à jour.
#
# Le contenu de l'association (src/content/, data/, .env) n'est jamais touché.
# Principe : la nouvelle version est construite À CÔTÉ pendant que l'ancienne
# tourne ; en cas d'échec, rien ne change. Puis bascule (quelques secondes),
# vérification que le site répond, et retour à la version précédente sinon.
# Docker : avant le téléchargement, les images du modèle autres que la version
# en ligne (retour arrière) et la version visée sont supprimées ; après une
# bascule réussie, sauvegarde.sh, restauration.sh, auth-user.sh et ce script
# sont recopiés depuis l'image (commandes du serveur à jour).
set -euo pipefail
cd "$(dirname "$0")"

REPO="${UPDATE_REPO:-OpenPixl/zerucms}"
IMAGE="ghcr.io/${REPO,,}"
# Adresse de l'image jusqu'à la 0.5.8 (dépôt Numerik-Co/numerik2026, devenu
# OpenPixl/zerucms) : migrée dans docker-compose.yml par migrer_image().
ANCIENNE_IMAGE="ghcr.io/numerik-co/numerik2026"
PORT="${UPDATE_PORT:-4321}"

mode=""; version=""; pull=1; archive=""; sauvegarde=1
while [ $# -gt 0 ]; do
  case "$1" in
    --docker) mode=docker ;;
    --node) mode=node ;;
    --no-pull) pull=0 ;;
    --archive) archive="$2"; shift ;;
    --sans-sauvegarde) sauvegarde=0 ;;
    v[0-9]*) version="$1" ;;
    *) echo "Option inconnue : $1 (voir l'en-tête de ce fichier)"; exit 2 ;;
  esac
  shift
done

etape() { echo "→ $*"; }
echec() { echo "✗ $*" >&2; exit 1; }

# ── Prérequis communs ────────────────────────────────────────────────────────
grep -qE '^SITE_URL=https?://' .env 2>/dev/null \
  || echec "SITE_URL manquant dans .env (ex. SITE_URL=https://www.mon-asso.fr)."

if [ -z "$version" ]; then
  etape "Recherche de la dernière version publiée ($REPO)"
  version=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -nE 's/.*"tag_name": *"([^"]+)".*/\1/p' | head -1) || true
  [ -n "$version" ] || echec "impossible de connaître la dernière version (réseau ? aucune version publiée ?)."
fi
echo "  version visée : $version"

if [ -z "$mode" ]; then
  if [ -f docker-compose.yml ] && command -v docker >/dev/null 2>&1; then mode=docker; else mode=node; fi
fi

# ── Node seul : délégué à scripts/update.mjs ────────────────────────────────
if [ "$mode" = node ]; then
  exec node scripts/update.mjs "$version" ${archive:+--archive "$archive"} $([ "$sauvegarde" = 0 ] && echo --sans-sauvegarde)
fi

# ── Docker ───────────────────────────────────────────────────────────────────
# Certains VPS montent /root en lecture seule : le CLI Docker a besoin d'un
# dossier de config inscriptible (aussi dans auth-user.sh, sauvegarde.sh…).
export DOCKER_CONFIG="${DOCKER_CONFIG:-$(pwd)/.dockercfg}"
mkdir -p "$DOCKER_CONFIG" .releases

cible="${version#v}"
actuelle=$(sed -nE 's/^NUMERIK_VERSION=(.*)$/\1/p' .env | tail -1)
actuelle="${actuelle:-latest}"
if [ "$cible" = "$actuelle" ] && [ "$(docker compose ps -q web 2>/dev/null)" != "" ]; then
  echo "✓ Déjà en version $cible."
  exit 0
fi

# Sauvegarde du contenu avant tout changement : par le site en ligne s'il a
# l'outil (0.5.3 et après), sinon par l'image visée une fois téléchargée.
MOTIF_SAUVEGARDE="avant mise à jour"
sauvegarde_faite=0
if [ "$sauvegarde" = 1 ] && [ -n "$(docker compose ps -q web 2>/dev/null)" ] \
  && docker compose exec -T web grep -q -- '--garder' scripts/sauvegarde.mjs 2>/dev/null; then
  # Outil du conteneur en ligne (≥ 0.5.4 : connaît --garder ; celui de la
  # 0.5.3 prendrait « --garder 5 » pour le motif) ; sinon : par l'image visée.
  etape "Sauvegarde du contenu, des comptes et du journal (data/sauvegardes/)"
  docker compose exec -T web node scripts/sauvegarde.mjs creer "$MOTIF_SAUVEGARDE" --garder 5 \
    || echec "sauvegarde impossible : rien n'a été mis à jour (--sans-sauvegarde pour passer outre)."
  sauvegarde_faite=1
fi

# Anciennes versions du modèle : une image par version, jamais réutilisée
# (on ne revient en arrière que sur la version en ligne, gardée). Sans ce
# ménage, le disque finit plein (« no space left on device » au téléchargement).
nettoyer_images() {
  local tag
  docker image ls "$IMAGE" --format '{{.Tag}}' | while read -r tag; do
    case "$tag" in "$actuelle" | "$cible" | "<none>" | "") continue ;; esac
    docker image rm "$IMAGE:$tag" >/dev/null 2>&1 && echo "  image supprimée : $IMAGE:$tag" || true
  done
  # Couches orphelines (versions remplacées sous la même étiquette).
  docker image prune -f >/dev/null 2>&1 || true
}

# Dépôt renommé : docker-compose.yml du serveur (jamais mis à jour par git)
# encore sur l'ancienne adresse de l'image → passé sur la nouvelle (copie de
# l'original gardée), et l'image en ligne ré-étiquetée sous la nouvelle
# adresse pour que le retour arrière reste possible.
migrer_image() {
  [ "$IMAGE" != "$ANCIENNE_IMAGE" ] || return 0
  grep -qE "^[[:space:]]*image:[[:space:]]*$ANCIENNE_IMAGE:" docker-compose.yml || return 0
  etape "Nouvelle adresse de l'image : $IMAGE (avant : $ANCIENNE_IMAGE)"
  cp docker-compose.yml "docker-compose.yml.avant-$cible"
  sed -i -E "s#^([[:space:]]*image:[[:space:]]*)$ANCIENNE_IMAGE:#\1$IMAGE:#" docker-compose.yml
  echo "  docker-compose.yml modifié (original : docker-compose.yml.avant-$cible)"
  if docker image inspect "$ANCIENNE_IMAGE:$actuelle" >/dev/null 2>&1; then
    docker tag "$ANCIENNE_IMAGE:$actuelle" "$IMAGE:$actuelle"
    echo "  image en ligne ré-étiquetée : $IMAGE:$actuelle"
  fi
}
migrer_image

if [ "$pull" = 1 ]; then
  # Étiquettes de l'ancienne adresse : inutiles une fois migrées (les couches
  # de la version en ligne restent, sous la nouvelle étiquette).
  if [ "$IMAGE" != "$ANCIENNE_IMAGE" ] && ! grep -q "$ANCIENNE_IMAGE" docker-compose.yml; then
    docker image ls "$ANCIENNE_IMAGE" --format '{{.Tag}}' | while read -r tag; do
      case "$tag" in "<none>" | "") continue ;; esac
      docker image rm "$ANCIENNE_IMAGE:$tag" >/dev/null 2>&1 && echo "  image supprimée : $ANCIENNE_IMAGE:$tag" || true
    done
  fi
  etape "Nettoyage des anciennes images (gardées : $actuelle, $cible)"
  nettoyer_images
  etape "Téléchargement de l'image $IMAGE:$cible"
  journal_pull=$(mktemp)
  if ! docker pull "$IMAGE:$cible" 2>&1 | tee "$journal_pull"; then
    if grep -q "no space left" "$journal_pull"; then
      rm -f "$journal_pull"
      echec "disque plein : libérer de la place (df -h /, docker system df, docker builder prune -f) puis relancer. Le site reste en version $actuelle."
    fi
    rm -f "$journal_pull"
    echec "image introuvable : $IMAGE:$cible (version publiée ? paquet public ?)."
  fi
  rm -f "$journal_pull"
fi
docker image inspect "$IMAGE:$cible" >/dev/null 2>&1 \
  || echec "image absente localement : $IMAGE:$cible (relancer sans --no-pull)."

# 1. Construction à côté, avec le contenu et le .env de l'association, dans
#    le volume .releases — le site en ligne n'est pas touché.
release=$(date -u +%Y%m%dT%H%M%SZ)
etape "Construction de la version $cible à côté du site en ligne (.releases/$release)"
# `compose run` reprend la configuration du service (.env, volumes), avec
# l'image visée ; pas de ports publiés, le conteneur en ligne continue.
# (`run` n'a pas d'option --no-build : --pull never + image vérifiée ci-dessus.)
compose_run() {
  NUMERIK_VERSION="$cible" docker compose run --rm --no-deps -T --pull never "$@"
}
if [ "$sauvegarde" = 1 ] && [ "$sauvegarde_faite" = 0 ]; then
  etape "Sauvegarde du contenu, des comptes et du journal (data/sauvegardes/, par l'image $cible)"
  compose_run web node scripts/sauvegarde.mjs creer "$MOTIF_SAUVEGARDE" --garder 5 \
    || echec "sauvegarde impossible : rien n'a été mis à jour, le site reste en version $actuelle (--sans-sauvegarde pour passer outre)."
fi
if ! compose_run -e "ASTRO_OUT_DIR=.releases/$release" web npm run -s build; then
  # Fichiers écrits par le conteneur (root) : effacés depuis le conteneur.
  compose_run --entrypoint rm web -rf ".releases/$release" >/dev/null 2>&1 \
    || rm -rf ".releases/$release" 2>/dev/null || true
  echec "la version $cible ne se construit pas (messages ci-dessus) : rien n'a été changé, le site reste en version $actuelle."
fi

# 2. Bascule : nouveau conteneur, qui trouve la version déjà construite.
choisir_version() {
  if grep -q '^NUMERIK_VERSION=' .env; then
    sed -i.bak -E "s/^NUMERIK_VERSION=.*/NUMERIK_VERSION=$1/" .env && rm -f .env.bak
  else
    printf '\n# Version du modèle (écrite par ./update.sh)\nNUMERIK_VERSION=%s\n' "$1" >> .env
  fi
}
repond() {
  # Jusqu'à 3 minutes : 5 s sans version prête (simple bascule), plus si reconstruction.
  for _ in $(seq 1 36); do
    curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null && return 0
    sleep 5
  done
  return 1
}

etape "Bascule sur la version $cible"
choisir_version "$cible"
docker compose up -d --no-build web

etape "Vérification que le site répond"
if repond; then
  docker compose logs --tail 20 web 2>&1 | grep "\[démarrage\]" || true
  # Commandes du serveur livrées avec la version (sauvegarde, comptes) :
  # recopiées depuis l'image, le dossier du site n'étant jamais mis à jour par git.
  for f in sauvegarde.sh restauration.sh auth-user.sh; do
    docker compose cp "web:/app/$f" "./$f" >/dev/null 2>&1 && chmod +x "./$f" || true
  done
  # Ce script aussi, par renommage : le bash en cours garde l'ancien fichier ouvert.
  docker compose cp web:/app/update.sh ./update.sh.nouveau >/dev/null 2>&1 \
    && chmod +x ./update.sh.nouveau && mv -f ./update.sh.nouveau ./update.sh || rm -f ./update.sh.nouveau
  echo "✓ Site en version $cible."
  exit 0
fi

# 3. Échec : retour à la version précédente.
echo "✗ La version $cible ne répond pas. Journal :" >&2
docker compose logs --tail 40 web >&2 || true
etape "Retour à la version $actuelle"
choisir_version "$actuelle"
docker compose up -d --no-build web
if repond; then
  echec "mise à jour annulée : le site est revenu en version $actuelle."
fi
echec "le site ne répond plus, même en version $actuelle : voir « docker compose logs web »."
