# Sauvegarde et restauration

Comme Grav, le site sait **sauvegarder** tout ce qui appartient à
l'association dans une archive **ZIP**, et la **restaurer** plus tard (même
serveur, nouveau serveur, retour en arrière après une erreur).

## Ce que contient une sauvegarde

| Dans l'archive | Pas dans l'archive |
| --- | --- |
| `src/content/` : pages, actualités, activités, annonces, images, polices, réglages (`*.yaml`) | `.env` et `data/installation/secrets.env` (secrets : `AUTH_SECRET`, clés Grist…) — à garder à part |
| `extensions/` : extensions installées (docs/extensions.md), depuis la 0.5.22 | |
| `data/accounts/` : comptes de l'Espace Admin | `data/publication/` (état des publications), `data/installation/installation.json` ; les données rangées dans **Grist** (adhésions, RDV, devis et factures) : à sauvegarder côté Grist |
| `data/journal/` : journal des modifications | les sauvegardes elles-mêmes, le code du modèle (dont `src/content/README.md` et `extensions/README.md`, jamais remplacés par une restauration), les dossiers cachés d'`extensions/` (versions mises de côté par l'installeur) |

Chaque archive porte un fichier `sauvegarde.json` : date, version du modèle,
nom de l'association, motif, auteur·rice. Les archives sont rangées sur le
serveur dans **`data/sauvegardes/`** (volume Docker `./data` : elles
survivent aux mises à jour).

> Une sauvegarde qui ne quitte pas le serveur ne protège pas d'une panne du
> serveur : **téléchargez-la** (module, `scp`…) et gardez-la ailleurs.

## Depuis l'Espace Admin (module « Sauvegardes »)

Bureau (`admin`) et super admin :

- **Créer une sauvegarde** (motif facultatif, repris dans le nom du fichier) ;
- **Télécharger** une archive (icône ⬇) ;
- **Déposer** une archive venue d'ailleurs (autre serveur, ordinateur) : elle
  est contrôlée puis rangée avec les autres ; rien n'est restauré, sauf pour
  le super admin quand la case « Restaurer l'archive dès son dépôt » est
  cochée (par défaut : migration d'un site en un geste) ;
- **Supprimer** une archive du serveur.

Super admin seul :

- **Restaurer** (icône ↺, puis « Restaurer et publier » ; ou dépôt avec la
  case cochée) : le site passe en **mode maintenance**, `src/content/`, les
  extensions, les comptes et le journal sont **remplacés** par ceux de l'archive, puis le
  site est reconstruit. Pendant ce temps, toutes les pages affichent « Site
  en maintenance » avec une **barre de progression** (étapes du build, pages
  créées, images, redémarrage) qui se recharge seule quand le site revient ;
  vous y êtes conduit·e après le clic. L'état actuel est d'abord sauvegardé
  (`…-avant-restauration.zip`), **sauf** s'il l'est déjà (une archive du
  dossier a exactement le même contenu) ou si le site n'a encore que le
  contenu de démonstration (site neuf : migration) ; si la reconstruction
  échoue, l'état précédent (gardé en mémoire dans tous les cas) est remis
  automatiquement et la maintenance levée. Indisponible pendant une publication ou tant que des
  modifications « enregistrées sans publier » attendent (les publier ou les
  annuler avant). Les comptes devenant ceux de l'archive, vous êtes
  **déconnecté·e** si votre compte n'y existe pas ou si son mot de passe y
  est différent (cas typique : archive du serveur restaurée sur un poste de
  développement) : se reconnecter avec le mot de passe de l'archive. La
  sauvegarde `…-avant-restauration.zip` apparaît ensuite dans la liste : la
  supprimer une fois le résultat vérifié. Sur un **serveur de
  développement** (`astro dev`), rien n'est reconstruit et la relecture à
  chaud ne suit pas un remplacement complet : relancer le serveur de dev
  pour voir le contenu restauré (l'encadré de publication le rappelle).

Dépôt d'une grosse archive : derrière nginx, la limite d'envoi
(`client_max_body_size`) peut refuser le fichier (erreur 413). La relever,
ou restaurer en ligne de commande.

## Sur le serveur (ligne de commande)

Dans le dossier du site (Docker ou Node seul, détecté comme `./update.sh`) :

```bash
./sauvegarde.sh                      # nouvelle sauvegarde → data/sauvegardes/
./sauvegarde.sh "avant migration"    # avec un motif
./sauvegarde.sh --liste              # sauvegardes existantes

./restauration.sh sauvegarde-2026-11-05-10h30.zip   # archive de data/sauvegardes/
./restauration.sh ~/numerik-vps.zip                 # archive ailleurs (copiée dans data/sauvegardes/)
./restauration.sh … --oui                           # sans confirmation
```

La restauration demande de taper « oui », sauvegarde l'état courant
(`…-avant-restauration.zip`), remplace le contenu puis **redémarre le site**
pour le reconstruire (Docker : `docker compose restart web` ; Node seul :
`UPDATE_RESTART` du `.env`, sinon consigne affichée).

Sans les scripts (site Docker plus ancien) : les mêmes commandes existent
dans le conteneur :

```bash
docker compose exec web node scripts/sauvegarde.mjs creer "motif"
docker compose exec web node scripts/sauvegarde.mjs liste
docker compose exec web node scripts/sauvegarde.mjs restaurer <nom.zip>   # puis : docker compose restart web
```

Les scripts `sauvegarde.sh`, `restauration.sh` et `auth-user.sh` sont
recopiés depuis l'image par `./update.sh` après chaque mise à jour Docker
réussie. Pour les récupérer à la main :
`docker compose cp web:/app/sauvegarde.sh . && docker compose cp web:/app/restauration.sh .`

## Sauvegarde automatique avant chaque mise à jour

`./update.sh` (Docker ou Node seul) crée lui-même une sauvegarde avant de
changer quoi que ce soit : motif « avant mise à jour », **5 dernières
gardées** (les plus anciennes de ce motif sont supprimées ; vos sauvegardes
manuelles ne le sont jamais). Si la sauvegarde échoue, la mise à jour
s'arrête sans rien changer ; `./update.sh --sans-sauvegarde` pour passer
outre. Rien à faire de plus pour un·e novice : lancer `./update.sh` suffit.

En ligne de commande, la même rotation : `./sauvegarde.sh "motif" --garder 5`.

## Déménager un site

1. Ancien serveur : `./sauvegarde.sh "demenagement"`, puis récupérer
   l'archive (`scp serveur:/opt/numerik2026/data/sauvegardes/<nom>.zip .`) et
   le `.env`.
2. Nouveau serveur : installer le site ([deploiement.md](deploiement.md)),
   y copier le `.env`, puis `./restauration.sh ~/<nom>.zip` — ou, connecté·e
   en super admin, **glisser l'archive** dans le module « Sauvegardes » :
   elle est restaurée aussitôt (le contenu de démonstration n'est pas
   sauvegardé), le site passe en maintenance le temps de la reconstruction.

## Détails techniques

- Code : `scripts/sauvegarde.mjs` (création, liste, contrôle, restauration ;
  bibliothèque `fflate`, aucun outil système requis), utilisé par les
  commandes et par les routes `/api/admin/sauvegardes*`
  (`src/pages/api/admin/sauvegardes/`, gardes dans `src/middleware.ts` :
  bureau, restauration = super admin seul).
- Une archive n'est acceptée que si elle contient `sauvegarde.json` (format
  `numerik-sauvegarde`) et `src/content/association.yaml`, et seulement des
  fichiers sous `src/content/`, `extensions/<id>/…` (identifiant valide,
  aucun nom en « . » ; seulement si le manifeste porte `extensions: true`),
  `data/accounts/`, `data/journal/` (aucun chemin en `..`). Taille
  maximale : 500 Mo.
- Extensions : une archive créée depuis la 0.5.22 avec le dossier
  `extensions/` présent (`extensions: true` dans `sauvegarde.json` ; Docker :
  volume monté) remet `extensions/` dans son état — extension absente
  de l'archive = retirée ; une archive plus ancienne laisse `extensions/`
  tel quel. Le code d'une extension s'exécute sur le serveur : ne restaurer
  que des archives de confiance (restauration réservée au super admin).
- Archive déposée : nom d'origine gardé (motif compris), `-2`, `-3`… si
  le nom existe déjà.
- Restauration en place : seuls les fichiers différents sont réécrits, les
  fichiers absents de l'archive supprimés, les dossiers jamais vidés ni
  renommés (volumes sous Docker ; un serveur de développement continue de
  voir les changements).
- Mode maintenance : `scripts/maintenance.mjs`. Fichier
  `<DATA_DIR>/publication/maintenance.json` (étape, pourcentage) ; la porte
  est placée devant le serveur par `scripts/start.mjs` (serveur HTTP lancé
  par lui, `ASTRO_NODE_AUTOSTART=disabled` + `handler` de l'adaptateur :
  les pages prérendues sont servies avant tout middleware). Pages → 503 +
  page autonome ; `/api/*`, `/_astro/`, `/_image` passent ; état JSON sur
  `/__maintenance`. Progression écrite par `publish({ maintenance: true })`
  (`src/lib/site-build.ts`, lecture de la sortie du build). Fin : échec →
  retirée aussitôt ; succès → retirée par `start.mjs` quand le serveur
  redémarré écoute (ou à la fin si `PUBLISH_RESTART=false`). En dev : pas de
  maintenance pendant une restauration (rien n'est reconstruit).
  `./restauration.sh` (ligne de commande) n'en a pas besoin : il redémarre
  le site, qui se reconstruit avant d'écouter. Même mécanisme pour la
  **maintenance manuelle** du module « Site » (menu « Paramètres » :
  message libre, membres connectés admis, gardée au redémarrage) ; une
  restauration la remplace et la lève à sa fin.
- Empreinte (`empreinte` de `sauvegarde.json`, SHA-256 des chemins et
  contenus) : sert à reconnaître un état déjà sauvegardé (archives créées à
  partir de la 0.5.6).
- Journal : `sauvegarde.creation`, `sauvegarde.depot`,
  `sauvegarde.suppression`, `sauvegarde.restauration` (écrit après la
  restauration, le journal étant lui-même restauré).
