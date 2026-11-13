# Versions et mises à jour

Le dépôt est un **modèle** partagé par plusieurs associations. Tout ce qui
appartient à une association reste chez elle et n'est jamais remplacé par une
mise à jour :

| Appartient à l'association | Appartient au modèle (mis à jour) |
| --- | --- |
| `src/content/` (pages, actualités, `*.yaml`, `images/`) | tout le reste : code, composants, dépendances |
| `data/` (comptes, journal) | |
| `.env` (`SITE_URL`, clés Grist…) | |

Le contenu d'une association n'est **pas dans le dépôt** (`.gitignore`) : un
nouveau site part du **contenu de démonstration** de `src/modeles/association/`
(« Mon association », logo neutre, une actualité, deux activités, pages
légales génériques), copié dans `src/content/` tant que celui-ci n'a pas
d'`association.yaml` — par `npm install` / `npm ci` (`postinstall`) et par
`scripts/start.mjs` au démarrage (`scripts/contenu-initial.mjs`, aussi
`npm run contenu:init`). Un site déjà en place n'est jamais touché.

> ⚠️ **Site installé avec `git clone`** (premier VPS) : depuis la 0.5.3, le
> contenu n'est plus suivi par git. Un `git pull` dans le dossier du site
> **supprimerait** les fichiers de `src/content/` qui étaient suivis. Les
> mises à jour passent par `./update.sh` (jamais de `git pull`) ; par
> précaution, sauvegarder `src/content/` avant toute commande git sur le
> serveur (`./sauvegarde.sh`, [sauvegarde.md](sauvegarde.md), ou
> `tar czf contenu-$(date +%F).tgz src/content`).

## Construction au démarrage

Le site n'est construit ni dans le dépôt ni dans l'image Docker : il l'est
**sur chaque serveur**, avec le contenu et le `.env` de l'association, par
`scripts/start.mjs` (`npm start`, ou `CMD` de l'image).

Au démarrage, le script calcule une **empreinte** (version du modèle dans
`package.json` + `SITE_URL` + contenu de `src/content/` octet par octet,
`scripts/releases.mjs`) et la compare à celle du site en place
(`dist/build-info.json`, écrit par chaque `npm run build` via
`src/integrations/build-info.ts`) :

- **identiques** → le serveur démarre tout de suite ;
- **différentes** → `npm run build` dans `.releases/<horodatage>/`, `dist`
  pointe dessus, puis démarrage. Le journal indique la raison : « aucun site
  construit », « nouvelle version du modèle (1.0.0 → 1.1.0) », « adresse du
  site changée », « contenu modifié ». Pendant la construction (quelques
  secondes à quelques minutes selon le serveur), le site ne répond pas ;
- **construction en échec** → l'ancien site reste servi, l'erreur est dans
  le journal ; sans ancien site, arrêt (code 1).

Les publications depuis l'Espace Admin construisent elles-mêmes
(`src/lib/site-build.ts`, mêmes fonctions) : au redémarrage qui suit,
l'empreinte correspond, rien n'est reconstruit.

Conséquence pratique : après un changement de `SITE_URL` ou une modification
de `src/content/` à la main, **redémarrer suffit**.

## Publier une version du modèle (mainteneur)

Sur `master`, après la fusion de DEV (`git merge --no-ff DEV` : flux des
branches dans [developpement.md](developpement.md#branches-et-versions-flux-git)),
une fois la CI au vert ([ci.md](ci.md)), arbre de travail propre :

```bash
npm version minor        # 1.0.0 → 1.1.0 : met à jour package.json, commit + tag v1.1.0
git push --follow-tags   # envoie le commit ET le tag
```

(`npm version patch` pour une correction, `major` pour un changement qui
demande une action des associations — à décrire dans le message de commit.)

Le tag déclenche `.github/workflows/release.yml` :

1. vérifie que le tag correspond à `package.json` et à un commit de `master` ;
2. relance la CI complète (`ci.yml`) ;
3. publie l'image Docker `ghcr.io/openpixl/zerucms` (propriétaire/nom du dépôt) avec les
   étiquettes `X.Y.Z`, `X.Y` et `latest` ;
4. crée la **Release** GitHub : notes = consignes de mise à jour + liste des
   commits depuis la version précédente ; GitHub y joint l'archive des
   sources (installations Node seul).

Suivi : onglet **Actions** du dépôt ; résultat : onglet **Releases** et
**Packages**.

> **Première publication** : vérifier dans GitHub (organisation → Packages →
> `zerucms` → Package settings) que le paquet est **public**, sinon les
> serveurs ne pourront pas télécharger l'image sans identifiants.

## Mettre à jour un site (association)

> Assistant d'installation et type de structure (association /
> auto-entrepreneur) : **rien à faire** pour un site déjà en service. Il
> garde ses comptes, reste une association (pas de `structure:` dans
> `reglages.yaml`) et ses plugins gardent leur état ; l'assistant ne
> s'ouvre que sur un site neuf ([installation.md](installation.md)).

Le bureau est prévenu dans l'Espace Admin : badge **Mise à jour X.Y.Z**
dans la barre dès qu'une version plus récente est publiée
(`src/lib/model-version.ts`, vérifié au plus toutes les 6 h).

Dans le dossier du site, sur le serveur :

```bash
./update.sh            # dernière version publiée
./update.sh v1.2.0     # version précise — sert aussi à revenir en arrière
```

**Sauvegarde automatique** : avant tout changement, `update.sh` sauvegarde
le contenu, les comptes et le journal (`data/sauvegardes/…-avant-mise-a-jour.zip`,
les 5 dernières sont gardées, [sauvegarde.md](sauvegarde.md)). Si elle
échoue, rien n'est mis à jour (`--sans-sauvegarde` pour passer outre). En
cas de souci après la mise à jour : `./restauration.sh <cette archive>`.
Docker : après une mise à jour réussie, `update.sh`, `sauvegarde.sh`,
`restauration.sh` et `auth-user.sh` sont recopiés depuis la nouvelle image.

Le mode est détecté (Docker si `docker-compose.yml` et la commande `docker`
sont présents, sinon Node seul) ; `--docker` / `--node` pour l'imposer.
`SITE_URL` doit être dans le `.env`.

⚠️ **Plugins** (volets activables, [src/plugins/README.md](../src/plugins/README.md)) :
ils sont inactifs par défaut (sauf l'adhésion et l'inscription). Quand une version transforme en plugin un volet
que le site utilise déjà, ajouter **avant** la mise à jour dans
`src/content/reglages.yaml` :

```yaml
plugins:
  <id>: true
```

Sinon le volet disparaît du site après la mise à jour. Les notes de version
le signalent.

**Adhésion et inscription (plugins `adhesion` et `inscription`, version qui
suit la 0.5.1)** : actifs par défaut, rien à faire — adhésion, inscription,
présence et planning Grist restent en place. Une association qui n'en veut
pas écrit `adhesion: false` (retire aussi l'inscription) ou
`inscription: false` sous `plugins:`, ou les désactive dans le module
« Plugins ».

**Prise de RDV devenue extension (0.5.20)** : le code de la prise de RDV
n'est plus livré avec le CMS ; c'est l'extension `rdv` (dépôt
`OpenPixl/zerucms-rdv`). Un site qui l'utilise l'installe dans
`extensions/rdv/` — **avant** la mise à jour pour ne pas la couper (archive
décompressée dans `extensions/`), ou après, depuis le module « Extensions ».
`rdv.yaml` et le reste de `src/content/` ne changent pas ; `./update.sh`
ajoute le volume `./extensions` au `docker-compose.yml`. Détail :
[extensions.md](extensions.md#passage-de-la-prise-de-rdv-en-extension-0520).

**Prise de RDV (plugin `rdv`, version qui suit la 0.4.9 — historique)** — en plus de la
ligne ci-dessus, dans `src/content/` :

1. créer `rdv.yaml` (modèle commenté : `rdv.exemple.yaml` de l'extension) et
   y reprendre les permanences de `conseiller-numerique.yaml` et les zones de
   `zones-geographiques.yaml`, puis supprimer ces deux fichiers ;
2. retirer `forms.rdvConseillerNumerique` de `reglages.yaml` (l'ouverture se
   règle par `ouvert:` dans `rdv.yaml`) ;
3. logo de l'encart éventuel : le copier dans `images/` et l'indiquer dans
   `encart.logo` ;
4. `adresse: /rdv-conseiller-numerique` pour garder l'ancienne adresse de la page.

Oubli (clé inconnue, `rdv.yaml` absent, logo introuvable) : la nouvelle
version ne se construit pas, avec un message qui dit quoi corriger ; le site
en ligne reste sur l'ancienne.

Le principe est le même dans les deux modes :

1. **la nouvelle version est construite à côté**, avec le contenu et le
   `.env` de l'association, pendant que le site en ligne continue sur
   l'ancienne. Si elle ne se construit pas (bug, contenu devenu invalide),
   **rien n'est changé** et le message dit pourquoi ;
2. **bascule** : au redémarrage, `scripts/start.mjs` trouve la version déjà
   construite (même empreinte) — coupure d'environ une seconde ;
3. Docker : **vérification** que le site répond, sinon **retour automatique**
   à la version précédente.

### Docker

- l'image vient de `ghcr.io/openpixl/zerucms`, version choisie par
  `NUMERIK_VERSION` dans le `.env` (écrite par `update.sh`) ;
- la construction à côté se fait dans un conteneur temporaire
  (`docker compose run`), dans le volume `./.releases` partagé avec le
  conteneur en ligne ;
- bascule : `docker compose up -d` (nouveau conteneur), puis le site doit
  répondre en 3 minutes, sinon `NUMERIK_VERSION` reprend son ancienne valeur ;
- **ménage des images** : avant le téléchargement, les images
  `ghcr.io/openpixl/zerucms` autres que la version en ligne (gardée
  pour le retour arrière) et la version visée sont supprimées, ainsi que les
  couches orphelines (`docker image prune`). Une image pèse près de 1 Go :
  sans ce ménage, le disque finit plein (`no space left on device` au
  téléchargement, cas rencontré en 0.5.1). Disque plein malgré tout :
  `update.sh` le dit, le site reste sur sa version ; libérer de la place
  (`df -h /`, `docker system df`, `docker builder prune -f`) puis relancer.
  Pas de ménage avec `--no-pull` (images gérées à la main) ;
- `update.sh` lui-même est recopié depuis l'image après chaque mise à jour
  réussie (avec `sauvegarde.sh`, `restauration.sh`, `auth-user.sh`) : la
  version suivante utilise donc le script de la version en ligne ;
- **nouvelle adresse du dépôt** (0.5.9 et après, voir plus bas) : si
  `docker-compose.yml` désigne encore `ghcr.io/numerik-co/numerik2026`,
  `update.sh` le passe sur `ghcr.io/openpixl/zerucms` (original gardé dans
  `docker-compose.yml.avant-<version>`) et ré-étiquette l'image en ligne
  pour garder le retour arrière ; les étiquettes de l'ancienne adresse sont
  ensuite supprimées.

Testé par la CI à chaque envoi (tâche « Mise à jour Docker ») : 0.0.1 →
0.0.2 en sondant le site (0.0.1 lancée sous l'ancienne adresse de l'image,
migration vérifiée), puis une 0.0.3 cassée qui doit être refusée.

### Node seul (sans Docker ni git)

`./update.sh` lance `scripts/update.mjs` (`node`, `npm` et `tar` suffisent) :

1. télécharge l'archive des sources de la version (Release GitHub) ;
2. met le code actuel de côté (`.update/sauvegarde-<version>.tar.gz`) ;
3. remplace le code du modèle — `src/` (sauf `src/content/`), `scripts/`,
   `docs/`, `.github/` remplacés, fichiers de la racine écrasés ; jamais
   touchés : `src/content/`, `data/`, `.env`, `.releases/`, `dist`, fichiers
   ajoutés à la racine ;
4. `npm ci` puis construction à côté ; en cas d'échec, l'ancien code est
   remis (`npm ci` compris) et le site, jamais arrêté, reste tel quel ;
5. redémarrage par la commande `UPDATE_RESTART` du `.env` (ex.
   `systemctl restart monsite`), sinon consigne affichée.

Installation par `git clone` (cas courant sans Docker) : `update.sh` refuse
et renvoie à `git pull` + `npm install` + redémarrage, `npm start`
reconstruisant le site sur la nouvelle version.

Pendant l'étape 4, `node_modules` change sous le serveur en marche : choisir
un moment calme (aucune publication en cours).

### Passer à ce système (site déjà installé)

- **Docker, installé avec `git clone` + l'ancien `./deploy.sh`** (cas du
  premier site ; script retiré du modèle) : ajouter `SITE_URL` au `.env`,
  sauvegarder `src/content/` (voir l'avertissement plus haut), `git pull`,
  puis `./update.sh` une fois une version publiée. Ensuite, plus jamais de
  `git pull` ni de `docker compose up --build`.
- **Node seul** : ajouter `SITE_URL` au `.env`, remplacer `npm run build &&
  npm start` par `npm start` dans le gestionnaire de process.

## Changement d'adresse du dépôt (Numerik-Co/numerik2026 → OpenPixl/zerucms)

Le dépôt du modèle a été transféré de l'organisation Numerik-Co à OpenPixl
et renommé `zerucms`. La **0.5.8** est la version de transition :

1. **0.5.8, publiée depuis l'ancien dépôt** (image
   `ghcr.io/numerik-co/numerik2026:0.5.8`) : son code vise déjà
   `OpenPixl/zerucms` (badge de mise à jour, `update.sh`,
   `scripts/update.mjs`, `docker-compose.yml` du modèle). Un site en 0.5.7
   ou avant s'y met à jour normalement (`./update.sh`) et récupère ainsi le
   nouveau `update.sh`.
2. **Transfert puis renommage** sur GitHub (mainteneur) ; GitHub redirige
   les anciennes adresses du dépôt, mais **pas celles des images** : les
   versions suivantes ne sont publiées que sous `ghcr.io/openpixl/zerucms`
   (nom tiré du dépôt par `release.yml`). Paquet à passer en **public** à
   la première publication.
3. **0.5.9 et après** : `./update.sh` (celui de la 0.5.8) migre
   `docker-compose.yml` vers la nouvelle image (voir « Docker » plus haut).
   Node seul : rien à faire.

Un site resté en 0.5.7 ou avant doit passer par la 0.5.8
(`./update.sh v0.5.8`) : son `update.sh` cherche encore les images à
l'ancienne adresse. Le dossier du serveur (`/opt/numerik2026`) et le nom du
conteneur (`numerik2026`) ne changent pas.
