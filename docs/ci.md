# Intégration continue (CI)

À chaque envoi sur GitHub (branches `master` et `DEV`) et à chaque pull
request, GitHub Actions vérifie que le site se construit. **Rien n'est
déployé** : la CI dit seulement si une version est saine.

Fichier : [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Lire le résultat

Sur GitHub, à côté de chaque commit : ✅ coche verte = tout est passé,
❌ croix rouge = une étape a échoué, 🟡 rond jaune = en cours. Le détail est
dans l'onglet **Actions** du dépôt (cliquer sur l'exécution, puis sur l'étape
en rouge pour lire le message). Bouton **Run workflow** : relancer à la main.

**Règle : ne pas déployer (ni fusionner `DEV` dans `master`) une version en
croix rouge.**

## Ce qui est vérifié

Deux tâches indépendantes, lancées en parallèle :

1. **Vérification et construction du site**
   - `npm ci` — installation des dépendances exactes de `package-lock.json` ;
   - `npx astro check` — erreurs de types dans les fichiers `.ts`, `.astro`, `.vue` ;
   - `npm run build` — construction complète : schémas du contenu, fichiers
     de l'association (`src/content/*.yaml`, images), pages prérendues ;
   - **aucun secret figé** : le build reçoit des valeurs « témoins »
     (`temoin-ci-…`) pour `GRIST_API_KEY`, `AUTH_SECRET`… ; si l'une se
     retrouve dans `dist/`, un secret est lu via `import.meta.env` au lieu
     de `astro:env/server` (cf. [api.md](api.md#variables-denvironnement))
     et l'étape échoue en nommant le fichier.
2. **Image Docker** — `docker build` du `Dockerfile` (sans publier l'image),
   puis **démarrage d'un conteneur** comme sur un serveur : le site doit être
   construit par `scripts/start.mjs` et répondre en moins de 5 minutes.

Publication d'une version (tag `vX.Y.Z`) : `.github/workflows/release.yml`
réutilise cette CI puis publie l'image et la Release — voir
[mise-a-jour.md](mise-a-jour.md).

`SITE_URL` vaut `https://www.exemple.org` en CI : la vraie adresse n'est
connue que des serveurs (`.env`). La CI n'a accès à aucun secret ni à Grist.

## Limites

- Pas de tests automatisés du comportement (formulaires, Grist, espace
  bénévoles) : la CI garantit que le site **se construit**, pas qu'il
  **fonctionne** de bout en bout.
- La CI construit avec le contenu de démonstration (`src/modeles/association/`, copié
  dans `src/content/` par le `postinstall` de `npm ci`) ; un déploiement
  construit avec le contenu de son serveur (`src/content/` de l'association).
