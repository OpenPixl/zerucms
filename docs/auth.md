# Espace Admin — authentification à plat

Connexion du bureau et des animateur·rice·s, **sans base de données**, sur le
modèle de Grav CMS : un fichier YAML par compte, des groupes, et un `access:`
dans le frontmatter des pages à réserver.

**Aucune page d'administration** : tout se fait par-dessus le site. Le lien
« Espace Admin » du pied de page ouvre une **modale de connexion** ; une
fois connecté·e, une **barre fixe en haut** donne accès aux **modules**, qui
s'ouvrent en **panneau latéral** au-dessus de la page en cours.

Mise en service et mode d'emploi pour les bénévoles :
[guide-espace-benevoles.md](guide-espace-benevoles.md).

## En bref

| Grav | Ici |
| :--- | :--- |
| `user/accounts/<login>.yaml` | `data/accounts/<login>.yaml` (`DATA_DIR`) |
| `user/config/groups.yaml` | `AUTH_GROUPS` dans `src/lib/auth/groups.ts` |
| `bin/plugin login newuser` | `npm run auth:user -- add …` (`scripts/auth-user.ts`) |
| Admin plugin > Utilisateurs | module « Comptes » de la barre admin (groupe `admin`) |
| `access: site.login: true` | `access: true` / `access: animateur` dans le frontmatter |
| Session PHP | cookie signé HMAC (`AUTH_SECRET`), aucun stockage serveur |

## Fichier de compte

```yaml
# data/accounts/marie.f.yaml — le nom du fichier est l'identifiant
fullname: Marie Fruit
email: marie@exemple.fr        # facultatif
groups:
  - animateur
state: enabled                 # disabled = connexion refusée
hashed_password: scrypt$16384$8$1$<sel>$<empreinte>
created: 2026-10-06T10:00:00.000Z
updated: 2026-10-06T10:00:00.000Z
```

- Identifiant : 2 à 32 caractères `a-z 0-9 . - _` (`LOGIN_PATTERN`), validé
  avant tout accès disque.
- Mot de passe haché avec **scrypt** (`node:crypto`, paramètres stockés avec
  l'empreinte). 10 caractères minimum pour un mot de passe choisi ; les mots
  de passe provisoires générés ont la forme `k7mp-q3zt-h9wx`.
- Écriture atomique (fichier temporaire + renommage), fichiers en `0600`,
  dossier en `0700`. Le dossier `data/` est ignoré par git et par Docker.

## Groupes et droits

| Groupe | Droits |
| :--- | :--- |
| `superadmin` | Tout ce que peut `admin` + module « Journal » (seul à le voir). Créé à la première visite d'un site neuf (écran « Bienvenue », `scripts/bienvenue.mjs`, `POST /api/auth/premier-compte`) ou par `auth-user init`, jamais attribué ni visible dans le module « Comptes » (les routes `/api/admin/comptes/<login>` répondent 404 pour ce compte) |
| `admin` | Tout : toutes les pages réservées + tous les modules (dont « Comptes »), sauf « Journal » |
| `animateur` | Pages réservées dont l'`access:` cite `animateur` (ou `true`) |
| `redacteur` | Module « Actualités » (publication des actualités, cf. [publication.md](publication.md)) |

Ajouter un groupe = une entrée dans `AUTH_GROUPS` (`src/lib/auth/groups.ts`).

### Mot de passe provisoire imposé

`must_change_password: true` dans le YAML du compte (posé par `auth-user init`,
et par `auth-user reset` sur un super admin) : à la connexion, une modale non
refermable impose de choisir un mot de passe personnel ; tant que ce n'est pas
fait, toute route `/api/admin/*` autre que `mot-de-passe` répond 403. Le
drapeau est retiré par `POST /api/admin/mot-de-passe`.

## Journal des modifications

`src/lib/journal.ts` — `logEvent()` ajoute une ligne JSON à
`<DATA_DIR>/journal/<AAAA>.jsonl` (jamais réécrit depuis le site) :
connexions, changements de mot de passe, actualités ajoutées / modifiées /
supprimées, résultat de chaque publication (réussie ou en échec, avec le
message), message de publication fermé, comptes créés / modifiés (détail des
changements) / réinitialisés / supprimés. Lu par le module « Journal »
(`GET /api/admin/journal?annee=AAAA`, `superadmin` seul : garde `noAdmin`
dans `GUARDS`, module `exclusive` dans `modules.ts`). Nouvelle action
d'administration = un `logEvent()` dans sa route + son libellé dans
`JournalModule.vue`.

L'encadré du dernier résultat de publication (module « Actualités ») se ferme
**pour tout le monde et définitivement** (`DELETE /api/admin/publication` →
`dismissStatus()` remet `status.json` à `idle`) ; le résultat reste dans le
journal.

Toutes les routes qui modifient le contenu acceptent `?publier=non` :
la modification est écrite dans les sources sans reconstruire le site et
rejoint le lot en attente (réponse `200 { ok, href, deferred: true }` au
lieu de `202`), voir [publication.md](publication.md#enregistrer-sans-publier-lot-de-modifications).

## Réserver une page de contenu

Les pages réservées se rangent dans **`src/content/pages/espace-benevoles/`**
(URL `/espace-benevoles/<…>`). Ce dossier est le seul servi **à la demande**
(`src/pages/espace-benevoles/[...slug].astro`, Node requis) : toutes les autres
pages sont prérendues, donc publiques par nature. Frontmatter :

```yaml
# (absent)                   # toute personne connectée (défaut dans ce dossier)
access: true                 # idem, explicite
access: animateur            # un groupe
access: [animateur, admin]   # l'un de ces groupes
```

- Personne non connectée → **401**, encart « Page réservée » avec un bouton
  « Se connecter » (ouvre la modale ; la page se recharge après connexion).
- Connectée sans le bon groupe → **403** « Accès réservé ».
- Une page réservée n'apparaît **jamais dans le menu** (calculé au build) ;
  elle est listée dans le module « Pages réservées » des personnes autorisées
  (masqué pour qui a le module « Pages », qui la liste déjà : `replacedBy`
  dans `src/components/admin/modules.ts`).
- Pas d'outils de partage, `noindex`, en-tête `Cache-Control: private, no-store`.
- Le build **échoue** si `access:` cite un groupe inconnu, ou s'il est posé sur
  une page hors de `espace-benevoles/` (elle serait prérendue, donc lisible par
  tous). Une faute de frappe ne doit jamais ouvrir une page.
- Le contenu de ces pages n'est jamais écrit dans `dist/client/` (vérifié) : il
  n'existe que dans le serveur Node.

## Interface : modale, barre, modules

| Fichier | Rôle |
| :--- | :--- |
| `src/components/admin/AdminLoader.astro` | Inclus par `Layout.astro` et `ArticleLayout.astro` (~2 Ko). Ne charge l'îlot Vue que si le cookie indicateur `numerik_connecte` existe, au clic sur un `[data-auth-open]` ou sur une URL `#connexion`. Un visiteur ne télécharge ni Vue ni l'admin. |
| `src/components/admin/mount.ts` | Monte `AdminRoot.vue` dans `<div id="espace-benevoles">` à la fin du `<body>`. |
| `src/components/admin/AdminRoot.vue` | Interroge `/api/auth/me`, affiche la barre (classe `has-admin-bar` sur `<html>` : décale le `body` et le header collant via `--admin-bar-h`), la modale de connexion et le module ouvert. Connexion/déconnexion → rechargement de la page. |
| `src/components/admin/AdminOverlay.vue` | Calque générique : `variant="drawer"` (panneau à droite, plein écran sur mobile) ou `"modal"`. Échap / clic sur le fond ferment, focus piégé puis rendu, défilement de la page bloqué. |
| `src/components/admin/LoginForm.vue` | Formulaire de la modale de connexion. |
| `src/components/admin/modules.ts` | **Registre des modules** (`id`, `label`, icône, `groups`, composant chargé à la demande). |
| `src/components/admin/modules/*.vue` | `PagesModule` (pages réservées), `NewsModule` (actualités, `redacteur`), `SitePagesModule` (pages et menus déroulants, `redacteur`), `ActivitiesModule` (fiches d'activité, `redacteur`), `JournalModule` (`superadmin`), `AccountsModule` (comptes, `admin`), `PasswordModule` (mot de passe : intégré à « Mon compte » = `AccountsModule` prop `self`, et modale du mot de passe provisoire). |
| `src/components/admin/client.ts` | Appels typés aux routes ; `ApiError.status === 401` = session expirée (`sessionExpired()` du contexte rouvre la connexion). |
| `src/components/admin/context.ts` | `provide/inject` (`user`, `pages`, `sessionExpired`, `onCloseRequest` : un module peut intercepter ✕/Échap, ex. retour à sa liste depuis un formulaire) + classes des champs. |

N'importe quel élément peut ouvrir la connexion : `<button type="button" data-auth-open>…</button>`
(une fois connecté·e, il ouvre le premier module).

### Ajouter un module

1. Un composant `src/components/admin/modules/MonModule.vue` (contexte via
   `inject(ADMIN_CONTEXT)`, appels via des fonctions ajoutées à `client.ts`).
2. Une entrée dans `ADMIN_MODULES` (`modules.ts`) — `groups: []` = toute
   personne connectée ; `admin` voit tout.
3. Ses routes JSON sous `src/pages/api/admin/<…>` : connexion déjà exigée
   par le middleware ; si elles sont réservées à un groupe, ajouter une
   entrée à `GUARDS` dans `src/middleware.ts` (comme `/api/admin/comptes`). **Le contrôle
   d'accès réel est toujours côté serveur.**

## Routes API

| Route | Rôle |
| :--- | :--- |
| `POST /api/auth/login` | `{ login, password }` → `{ user }` + cookies |
| `POST /api/auth/logout` | Ferme la session |
| `GET /api/auth/me` | `{ user, pages, lot }` (pages réservées ouvertes ; modifications en attente de publication pour `redacteur` / `admin`, sinon `[]`) ou 401 |
| `POST /api/admin/mot-de-passe` | `{ current, next }` — ferme les autres sessions |
| `GET/POST /api/admin/comptes` | Liste / création (`password` provisoire renvoyé une fois) — `admin` |
| `GET/POST /api/admin/actualites` | Liste lue dans les sources (brouillons et actualités en attente compris) + état de publication / dépôt `{ markdown, cover?: { type, data } }` → écrit `src/content/news/…` et reconstruit le site — `redacteur` |
| `GET/PUT /api/admin/actualites/<slug>` | Lecture des sources (formulaire) / modification `{ fields, body, cover: { action: keep\|remove\|replace } }` : même dossier (URL inchangée), sauvegarde restaurée si le build échoue — `redacteur` |
| `DELETE /api/admin/actualites/<slug>` | Suppression `{ confirm: <slug> }` : dossier mis de côté, site reconstruit, dossier effacé (ou remis en place si échec) — `redacteur` |
| `GET/DELETE /api/admin/publication` | État de la dernière publication / fermeture définitive de son encadré (journalisée) — `redacteur` |
| `GET/POST/DELETE /api/admin/publication/lot` | Modifications enregistrées sans publier : liste / publication de tout le lot en une reconstruction / annulation `{ confirm: true }` (sources remises en l'état, journalisée), cf. [publication.md](publication.md#enregistrer-sans-publier-lot-de-modifications) — `redacteur` |
| `GET /api/admin/journal` | Journal des modifications, `?annee=AAAA` — `superadmin` seul |
| `GET/POST /api/admin/annonces`, `PUT/DELETE /api/admin/annonces/<id>`, `PUT /api/admin/annonces/ordre` | Annonces de la bannière (`src/content/annonces.yaml`), ordre de défilement, cf. [annonces.md](annonces.md) — `redacteur` |
| `GET/POST /api/admin/activites`, `GET/PUT/DELETE /api/admin/activites/<slug>`, `PUT /api/admin/activites/ordre`, `POST /api/admin/activites/categories`, `PUT/DELETE /api/admin/activites/categories/<slug>` | Fiches d'activité et catégories (sources), ordre des catégories et des fiches, cf. [activites.md](activites.md#module-activités-espace-admin) — `redacteur` |
| `GET/POST /api/admin/pages`, `GET/PUT/DELETE /api/admin/pages/<chemin>` | Pages de contenu (sources), cf. [pages.md](pages.md#module-pages-espace-admin) — `redacteur` |
| `POST /api/admin/menus-deroulants`, `PUT/DELETE /api/admin/menus-deroulants/<dossier>` | Menus déroulants (`_group.md`) — `redacteur` |
| `GET /api/admin/liens` | Pages vers lesquelles pointer depuis un texte (bloc « Insérer un lien », `src/lib/site-links.ts`, lu dans les sources) — `redacteur` |
| `GET /api/admin/version` | Version du site et dernière version publiée (badge « mise à jour disponible », cache 6 h) — `admin` |
| `PATCH/POST/DELETE /api/admin/comptes/<login>` | Modification / réinitialisation du mot de passe / suppression (`{ confirm: <login> }`) — `admin` |

Garde : `src/middleware.ts` — `/api/auth/*` et `/api/admin/*` n'acceptent
que les requêtes du site lui-même (`Sec-Fetch-Site`, à défaut `Origin`),
`/api/admin/*` exige une connexion (401), et les préfixes de `GUARDS` un
groupe (403) : `/api/admin/comptes*`, `/api/admin/version`, `/api/admin/association` et `/api/admin/charte` → `admin` ;
`/api/admin/actualites*`, `/api/admin/publication`, `/api/admin/activites*`,
`/api/admin/pages*`, `/api/admin/menus-deroulants*`, `/api/admin/liens`,
`/api/admin/pages-du-site*` et `/api/admin/ordre-menu` → `redacteur`
(`admin` passe toujours) ; `/api/admin/journal` → `superadmin` seul. `Astro.locals.user` est renseigné sur chaque requête rendue à
la demande.

Garde-fous des comptes : impossible de se retirer ses propres droits admin,
de se désactiver ou de se supprimer, et de supprimer ou dégrader le
**dernier admin actif**. Suppression confirmée en recopiant l'identifiant
(pas de boîte de dialogue JavaScript).

## Sessions

Cookie `numerik_session` = `<données base64url>.<HMAC-SHA256>` contenant le
login, une empreinte du mot de passe et l'échéance (14 jours, renouvelée au
plus une fois par jour). `HttpOnly`, `SameSite=Lax`, `Secure` en production.

Cookie compagnon `numerik_connecte=1`, lisible en JavaScript et sans aucune
donnée : il dit seulement aux pages statiques de charger la barre. Il est
posé et effacé avec la session (et effacé si la session est refusée).

Le compte est relu à chaque requête, donc :

- désactiver ou supprimer un compte coupe ses sessions immédiatement ;
- changer / réinitialiser un mot de passe déconnecte ses autres appareils ;
- changer `AUTH_SECRET` déconnecte tout le monde.

Sans `AUTH_SECRET` (ou s'il fait moins de 32 caractères), la connexion est
impossible et la modale l'indique. En production, `scripts/start.mjs` en
**génère un** au démarrage s'il manque (gardé dans
`<DATA_DIR>/installation/secrets.env`, cf. [installation.md](installation.md)).

Première connexion du super admin sur un site neuf : après le changement de
mot de passe, l'**assistant d'installation** s'ouvre
(`/api/admin/installation`, super admin seul) — voir
[installation.md](installation.md).

## Sécurité

- **CSRF** : cookie `SameSite=Lax`, contrôle `Sec-Fetch-Site`/`Origin` du
  middleware sur les routes JSON, et protection native d'Astro
  (`security.checkOrigin`). Derrière le reverse proxy HTTPS, `security.allowedDomains`
  (`astro.config.mjs`) autorise `X-Forwarded-Host`/`-Proto` pour le domaine
  de `SITE_URL` (`.env`) uniquement. **Le proxy doit transmettre ces
  deux en-têtes**, sinon les requêtes de l'Espace Admin risquent d'être refusées (403). Si le site
  répond aussi sur un autre domaine (sans `www`…), le rediriger vers
  `SITE_URL` dans nginx.
- **Force brute** : 5 échecs en 15 min par identifiant et par adresse IP →
  blocage temporaire (`src/lib/auth/rate-limit.ts`, en mémoire, remis à zéro
  au redémarrage). Un identifiant inconnu coûte le même temps de calcul
  qu'un mauvais mot de passe.

## Mise en route

### En local

```sh
# .env : AUTH_SECRET=<chaîne aléatoire ≥ 32 caractères>
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

npm run auth:user -- add xavier "Xavier Burke" admin   # affiche le mot de passe provisoire
npm run auth:user -- list
npm run auth:user -- reset xavier                       # nouveau mot de passe provisoire (et réactive)
```

### En production (Docker)

1. Ajouter `AUTH_SECRET=…` au `.env` du VPS.
2. Le `docker-compose.yml` monte `./data` sur `/app/data` (`DATA_DIR`) :
   les comptes survivent aux redéploiements. Sauvegarder ce dossier.
3. Ouvrir le site : l'écran « Bienvenue » crée le super admin (mot de
   passe choisi). Ou bien, en ligne de commande, créer le super admin (mot de passe à changer à la première connexion ;
   relançable sans risque, ne fait rien s'il existe déjà), puis le premier
   admin ; ensuite tout se fait depuis le module « Comptes » :

   ```sh
   ./auth-user.sh init                              # login « superadmin », mot de passe provisoire affiché
   SUPERADMIN_PASSWORD='…' ./auth-user.sh init      # ou mot de passe provisoire imposé (script de déploiement)
   ./auth-user.sh add xavier "Xavier Burke" admin   # = docker compose exec web node dist/cli/auth-user.mjs …
   ```

Le CLI est compilé par esbuild pendant `npm run build` (`build:cli` →
`dist/cli/auth-user.mjs`) : le Node de certains environnements n'exécute pas
le TypeScript directement. Le fichier est autonome (`yaml` inclus, `require`
recréé par une bannière esbuild) : il ne dépend d'aucun `node_modules`.

## Fichiers

- `src/lib/auth/accounts.ts` — lecture/écriture des YAML
- `src/lib/auth/password.ts` — scrypt, mots de passe provisoires ; `password-rules.ts` — longueur minimale (partagée avec le navigateur)
- `src/lib/auth/groups.ts` — groupes
- `src/lib/auth/session.ts` — cookie signé, `readSession()` / `openSession()` / `closeSession()`
- `src/lib/auth/access.ts` — `parseAccess()` / `canAccess()` / `isAdmin()`
- `src/lib/auth/api.ts` — réponses JSON, contrôle d'origine
- `src/lib/auth/rate-limit.ts` — anti force brute
- `src/lib/auth/admin-forms.ts` — validation des comptes, `accountView()`
- `src/middleware.ts`, `src/pages/api/auth/*`, `src/pages/api/admin/**`
- `src/components/admin/**` — interface (voir plus haut)
- `scripts/auth-user.ts` — CLI

`accounts.ts`, `password.ts` et `groups.ts` n'importent rien d'Astro (imports
relatifs en `.ts`) : ils sont partagés avec le CLI.
