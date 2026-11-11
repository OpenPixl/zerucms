# Bulletin d'adhésion en PDF

> **État : implémenté.** Actif uniquement si `GOTENBERG_URL` **et**
> `BULLETIN_SECRET` sont lus par le serveur **de l'environnement concerné** (dev
> comme prod) ; sinon le lien n'apparaît pas et la route répond `501`. Voir
> [api.md](api.md) pour le reste de l'intégration Grist.

## Objectif

À la fin du parcours d'adhésion, proposer un lien qui **affiche / télécharge sur
le poste de l'usager le bulletin d'adhésion prêt à imprimer**, au format PDF.

Le PDF est produit à la demande, il n'est pas stocké.

## Principe : Grist fournit les données **et** le gabarit

Le gabarit du bulletin ne vit pas dans le dépôt. Il vit dans Grist, sous forme
d'une **colonne Formule de la table `Adhesions`** qui renvoie le **HTML complet**
du bulletin (document entier : `<!DOCTYPE html><html><head><style>…</style>
</head><body>…`), valeurs déjà interpolées.

- Le logo est une **URL absolue `https://`** dans le HTML — aucun encodage base64,
  aucun asset à joindre.
- Chaque association qui déploie le template personnalise **son** bulletin dans
  **son** document Grist, sans toucher au code.

La route Astro est un simple **relais** :

```
navigateur ──(GET /api/adhesion/bulletin?t=…)──▶ route Astro
                                                   │  1. vérifie le jeton
                                                   │  2. GET Adhesions/<id> dans Grist (clé serveur)
                                                   │  3. lit la colonne Formule = HTML
                                                   ▼
                                              Gotenberg  (POST /forms/chromium/convert/html)
                                                   │
                                                   ▼
navigateur ◀────────────(application/pdf)──────── route Astro
```

## Périmètre du bulletin

**Adhésion seule** : identité de l'adhérent·e, cotisation, et — si cotisation
« famille » (`Multiple = true`) — la liste des co-membres rattachés à
l'adhésion.

> **Pas de ligne d'inscription.** Le bulletin ne reflète jamais la table
> `Inscription` (activités). Il est donc complet dès que la ligne `Adhesions`
> existe, c.-à-d. dès le retour de `/api/adhesion/cotisation` — sans attendre
> l'étape activité ni le récapitulatif.

## Où c'est câblé

| Élément | Emplacement | Rôle |
| :--- | :--- | :--- |
| `GOTENBERG_URL` | `.env` / `.env.example` / `src/env.d.ts` | URL de l'instance Gotenberg, **serveur uniquement**. Ex. `http://gotenberg:3000`. |
| `GOTENBERG_USERNAME` / `GOTENBERG_PASSWORD` | idem | **Optionnel** : auth HTTP Basic si l'instance Gotenberg en exige une. Envoyées en en-tête `Authorization: Basic` seulement si les **deux** sont renseignées. |
| `BULLETIN_SECRET` | idem | Secret HMAC de signature du jeton d'accès (chaîne aléatoire longue). |
| `COLS.adhesion.bulletinHtml` | `src/plugins/adhesion/lib/grist.ts` | Pointe sur la colonne Formule `Formule` de la table `Adhesions` (HTML complet). |
| `src/plugins/adhesion/lib/bulletin.ts` | lib serveur | `isBulletinEnabled()`, `signBulletinToken()` / `verifyBulletinToken()` (HMAC-SHA256), `htmlToPdf()` (appel Gotenberg). |
| `src/plugins/adhesion/api/bulletin.ts` | route API `GET`, `prerender = false` | Le relais décrit plus haut. |
| `/api/adhesion/cotisation` | route API | Ajoute `bulletinToken` à sa réponse JSON (`AdhesionResult`) quand `isBulletinEnabled()`. |
| `AdhesionForm.vue` → `SectionRecap.vue` | îlot Vue | Le jeton descend via la prop `bulletinHref` ; le lien « Imprimer le bulletin » n'est rendu que si le jeton est présent. |

Jeton : chaîne opaque `<adhesionId>.<expEpoch>.<hmacBase64url>`, TTL **24 h**,
transmise dans `?t=`. Le `filename` du PDF est fixe (`bulletin-adhesion.pdf`) —
pas de donnée personnelle dans le nom, pas de second appel Grist.

## Appel à Gotenberg

- `POST {GOTENBERG_URL}/forms/chromium/convert/html`
- En-tête `Authorization: Basic base64(user:pass)` si `GOTENBERG_USERNAME` **et**
  `GOTENBERG_PASSWORD` sont définies (instance protégée), sinon aucun en-tête d'auth.
- `multipart/form-data`, une part **`files`** dont le **nom de fichier est
  `index.html`**, contenu = la chaîne HTML de la colonne Formule.
- Champs qui **préservent la mise en forme du gabarit** (sinon Gotenberg ajoute
  ~1 cm de marge et ignore les fonds) :
  `preferCssPageSize=true`, `marginTop/Bottom/Left/Right=0`,
  `paperWidth=8.27` / `paperHeight=11.69` (A4 en pouces, filet de sécurité si le
  HTML ne déclare pas de `@page`), `printBackground=true`,
  `skipNetworkIdleEvent=false` (attendre le chargement du logo distant).
- Réponse : `application/pdf`, relayée avec
  `Content-Disposition: inline; filename="bulletin-adhesion.pdf"` et
  `Cache-Control: no-store` (`inline` = ouvre la visionneuse, l'usager fait
  Ctrl+P). Le lien côté Vue ouvre un nouvel onglet (`target="_blank"`).

## Contraintes sur la colonne Formule

- Renvoyer un **document HTML complet**, pas un fragment (Chromium a besoin d'une
  page entière).
- CSS **inline** dans un `<style>` ; URLs d'assets **absolues en `https://`**.
- Gérer le cas cotisation « famille » (boucle sur les membres liés) et le cas
  personne morale (pas de date de naissance).

## Sécurité

- **Jeton obligatoire.** Sans lui, `?adhesion=123` serait énumérable et
  exposerait nom / adresse / date de naissance d'autrui — le bulletin concentre
  plus de données personnelles que les endpoints unitaires. Le jeton est signé,
  à durée de vie courte, et lié à un `adhesionId` précis.
- **Le HTML de la Formule ne repart jamais vers le navigateur** en `text/html` —
  uniquement le PDF. Ainsi, même si la Formule contenait du script, il ne
  s'exécute que dans le bac à sable de Gotenberg.
- `GOTENBERG_URL` et `GRIST_API_KEY` restent **côté serveur** ; le navigateur ne
  voit que la route `/api/adhesion/bulletin`.
- Gotenberg doit avoir un **accès sortant** vers l'hôte qui sert le logo / les
  CSS.

## Chemins d'erreur

| Cas | Réponse |
| :--- | :--- |
| `GOTENBERG_URL` / `BULLETIN_SECRET` non configurés | `501` (et le lien n'est pas affiché) |
| Jeton absent, invalide ou expiré | `404` |
| `adhesionId` inconnu dans Grist | `404` |
| Colonne Formule vide | `422` |
| Gotenberg injoignable / erreur | `502` |
| Erreur Grist (config, réseau) | statut porté par `GristError` |

Tout est **non bloquant** : l'adhésion est déjà enregistrée en base. Aujourd'hui
le lien est un simple `<a>` — en cas d'échec, le nouvel onglet affiche la
réponse JSON d'erreur. Amélioration possible : `fetch` + `Blob` côté Vue pour
présenter un message de repli propre.

## Configuration (tous environnements, dev inclus)

La fonctionnalité est inactive tant que les deux variables ne sont pas lues par
le serveur **de l'environnement où on veut la voir** — ce n'est pas réservé à la
prod. En dev : les ajouter au **`.env`** (le même fichier que `GRIST_*`, chargé
par `astro dev`) puis **redémarrer** le serveur (`.env` lu au démarrage, pas à
chaud) :

```bash
GOTENBERG_URL=http://localhost:3000
BULLETIN_SECRET=<chaîne aléatoire longue>   # node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

```bash
npx astro dev stop && npx astro dev --background
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4321/api/adhesion/bulletin?t=x"
# 501 = pas configuré · 404 = configuré (jeton bidon rejeté, normal)
```

`GOTENBERG_URL` doit être **joignable depuis la machine qui exécute le serveur**.
En dev, le plus simple est un Gotenberg local
(`docker run --rm -p 3000:3000 gotenberg/gotenberg:8` → `http://localhost:3000`) ;
`http://gotenberg:3000` ne résout que dans le réseau Docker de la prod.

## Déploiement

Gotenberg doit être **joignable depuis le conteneur `web`** : soit un service
dans le `docker-compose.yml` (même réseau, `GOTENBERG_URL=http://gotenberg:3000`),
soit une instance externe dont l'URL est renseignée dans `.env`. Voir
[deploiement.md](deploiement.md#imprimer-des-pdf-bulletin-dadhésion-planning-des-rendez-vous).

## Piste d'évolution — généraliser le jeton

Le jeton du bulletin est un cas particulier d'un besoin plus large : **aucune
route `/api/adhesion/*` n'authentifie aujourd'hui l'appelant** (on peut créer un
membre, rejouer un `adhesionId`, et surtout **rechercher des membres par nom**
via `/api/adhesion/membres`).

La généralisation cohérente serait un **jeton de parcours signé**, émis à la
création du membre (étape 1), portant les IDs que le serveur a accordés à ce
client, transporté à chaque requête suivante et vérifié (signature + expiration +
l'ID demandé fait partie de l'ensemble accordé). Le lien bulletin devient alors
« jeton de parcours encore valide → rends le bulletin pour son `adhesionId` » :
même secret, même mécanisme.

Restent hors périmètre (données publiques du formulaire, pas à protéger) :
`/api/adhesion/cotisations`, `/api/adhesion/activites`, `/api/adhesion/adresse`.
