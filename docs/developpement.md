# Organisation technique du projet

## Stack

- **[Astro 7](https://docs.astro.build)** — `output` reste `'static'` par défaut : chaque page est pré-rendue en HTML au build. Seules les routes qui déclarent explicitement `export const prerender = false` (ex. `src/pages/api/adherer.ts`) sont rendues à la demande par le serveur Node.
- **`@astrojs/node`** (`mode: 'standalone'`) — adaptateur qui fournit le petit serveur HTTP nécessaire aux routes API ; à mettre derrière un reverse proxy (nginx/Apache) et un process manager (PM2) en production. Voir [api.md](api.md).
- **[Tailwind CSS 4](https://tailwindcss.com)** — classes utilitaires, configurées directement en CSS via `@theme` dans `src/styles/global.css` (pas de fichier `tailwind.config.js`, c'est le fonctionnement natif de Tailwind 4).
- **`@astrojs/rss`** — génération du flux `/rss.xml`.
- **`@astrojs/mdx`** — pour les pages de `src/content/pages/` qui ont besoin d'interpoler des valeurs dynamiques (ex. `mentions-legales`) ; voir [pages.md](pages.md).
- **`@fortawesome/fontawesome-free`** — icônes des catégories d'activités, auto-hébergées (import CSS dans `global.css`, pas de CDN externe).

## Commandes

| Commande | Effet |
| :--- | :--- |
| `npm run dev` | Serveur de dev avec rechargement à chaud (`localhost:4321`) |
| `npm run build` | Build de production dans `./dist/` (fichiers statiques) |
| `npm run preview` | Sert le build de `./dist/` localement, pour vérifier avant mise en ligne |

En session avec l'assistant IA, le serveur de dev tourne en tâche de fond (`astro dev --background`, `astro dev stop`, `astro dev status`, `astro dev logs` — voir `CLAUDE.md` à la racine).

## Arborescence détaillée

```text
src/
├── components/
│   ├── Button.astro, Card.astro, ArticleCard.astro,
│   │   ActivityCard.astro, CategoryCard.astro,
│   │   FigureImage.astro                             # briques réutilisables
│   ├── Article.astro                                 # grille 2 colonnes article/sommaire, utilisée par ArticleLayout
│   ├── TableOfContents.astro, ReadingProgress.astro  # sommaire + temps de lecture (slot sidebar d'Article)
│   ├── Header.astro, Footer.astro                    # structure commune
│   └── sections/                                     # blocs de page (Hero, CtaSection, PageHeader...)
├── content/
│   ├── news/<slug>/                                  # collection news : un dossier par actualité (index.md + photo cover:)
│   ├── activites/<slug>/                             # collection activites : un dossier par activité (index.md + photo cover:)
│   ├── pages/<...>/index.{md,mdx}                     # pages éditoriales : le chemin = l'URL, frontmatter menu: (voir pages.md)
│   ├── pages/<dossier>/_group.md                     # libellé + ordre d'un menu déroulant
│   └── README.md                                     # guide de rédaction destiné aux éditeurs
├── layouts/
│   ├── Layout.astro                                  # <html>, <head>, Header + <slot/> + Footer
│   └── ArticleLayout.astro                           # gabarit de page complet pour le contenu de lecture (voir composants.md)
├── config/
│   └── site.ts                                       # réglages par défaut (CTA, formulaires, partage) ; l'asso les remplace dans src/content/reglages.yaml
├── lib/
│   ├── news.ts                                       # lecture/tri/formatage des actualités (getAllNews)
│   ├── activites.ts                                  # collection activites (getAllActivities, getActivitiesByCategory, renderActivity)
│   ├── content-pages.ts                              # collections pages / pageGroups (getContentPages, renderPage, getGroups)
│   ├── navigation.ts                                 # construction du menu au build (getNavTree)
│   ├── reading-time.ts                               # estimation du temps de lecture (~200 mots/minute)
│   └── categories.ts                                 # catégories d'activités (lit src/content/activites/_categories.yaml)
├── pages/
│   ├── index.astro, activites.astro, contact.astro...  # une route par fichier
│   ├── [...slug].astro                               # route attrape-tout : rend les pages de content/pages/
│   ├── actualites/[slug].astro                       # route dynamique, une page par actualité
│   ├── activites/[category].astro                    # route dynamique, une page par catégorie
│   ├── activites/[category]/[slug].astro             # route dynamique, une page par activité
│   ├── api/adherer.ts                                # route serveur (prerender=false), voir api.md
│   ├── rss.xml.js                                    # endpoint RSS
│   └── 404.astro                                     # page "en construction" (toute route inconnue)
├── styles/
│   ├── global.css                                    # couleurs, polices, styles de base + .markdown-content (voir theme.md)
│   ├── fonts/                                         # fichiers de polices (Aileron, Como)
│   └── img/                                            # logo
└── env.d.ts                                           # typage des variables d'environnement (import.meta.env)
```

### Installation, type de structure, maintenance, facturation

| Fichier | Rôle |
| --- | --- |
| `scripts/installation.mjs` | Secrets de l'installation (`<DATA_DIR>/installation/secrets.env`, chargés au démarrage en complément du `.env`), `AUTH_SECRET` généré, état `installation.json` — [installation.md](installation.md) |
| `src/lib/installation.ts`, `src/pages/api/admin/installation.ts`, `src/components/admin/InstallationWizard.vue` | Assistant d'installation (super admin, site neuf) |
| `src/integrations/installation.ts` | Secrets de l'installation en dev (le `.env` l'emporte) |
| `src/lib/structure.ts` | Type de structure (`association` / `entreprise`) et vocabulaire — [structure.md](structure.md) |
| `src/modeles/association/` | Contenu de démonstration d'un nouveau site (copié dans `src/content/` par `scripts/contenu-initial.mjs`) |
| `src/modeles/entreprise/` | Contenu d'exemple « auto-entrepreneur », appliqué par l'assistant |
| `scripts/maintenance.mjs`, `src/integrations/maintenance.ts` | Mode maintenance (restauration, installation, manuel) : porte devant le serveur (`scripts/start.mjs`) et en dev — [sauvegarde.md](sauvegarde.md#détails-techniques) |
| `src/lib/grist-client.ts` | Client Grist générique des plugins (`clientGrist()`) |
| `src/plugins/facturation/` | Plugin devis et facturation — [facturation.md](facturation.md) |

À la racine du projet : `.env.example` liste les variables d'environnement attendues (à copier en `.env`, jamais commité). Elles sont déclarées dans `astro.config.mjs` (`astro:env`, lues au démarrage, jamais figées dans `dist/`) — voir [api.md](api.md#variables-denvironnement).

Pas de dossier `src/assets/` ni `public/` actif à ce stade (contenu de démarrage Astro supprimé) ; les images du site vivent à côté de ce qui les utilise (`src/content/images/` pour le logo, le favicon et la photo d'accueil, cf. [theme.md](theme.md#logo) ; `src/content/news/<slug>/` et `src/content/activites/<slug>/` pour les visuels).

## Branches et versions (flux git)

Deux branches, un principe : **`master` ne reçoit pas le développement**.

| Branche | Contient |
| --- | --- |
| `DEV` | Tout le travail : chaque fonctionnalité, correction ou doc y est commitée (un ou plusieurs commits) |
| `master` | Seulement les **fusions de DEV** (commit « Merge branch 'DEV' ») et les **commits de version** (« Version X.Y.Z », tagués `vX.Y.Z`) |

Sur `master`, jamais de commit de développement direct, et jamais de fusion
en **avance rapide** : chaque passage de DEV crée un commit de fusion, ce
qui garde DEV sur sa propre voie dans l'historique (GitKraken, `git log
--graph`) et laisse `master` lisible fusion par fusion
(`git log --first-parent master`).

### Développer

```bash
git checkout DEV
# … modifications …
git commit -m "Module X : …"
git push origin DEV          # la CI vérifie DEV (docs/ci.md)
```

### Publier (fusion + version)

```bash
git checkout master
git merge --no-ff DEV                  # commit « Merge branch 'DEV' »
npm version patch -m "Version %s"      # package.json + commit « Version X.Y.Z » + tag vX.Y.Z
git checkout DEV
git merge --ff-only master             # DEV repart de la version publiée
git push origin master DEV --follow-tags
```

`npm version minor` / `major` selon l'ampleur (voir
[mise-a-jour.md](mise-a-jour.md#publier-une-version-du-modèle-mainteneur)) ;
le tag déclenche la Release. Seule DEV avance en avance rapide, pour
rattraper `master` : `master`, lui, ne reçoit jamais DEV en avance rapide.

Fusionner sans publier de version : seulement `git merge --no-ff DEV` sur
`master`, puis `git merge --ff-only master` sur DEV.

> De la v0.5.2 à la v0.5.6, DEV a été fusionnée en avance rapide :
> l'historique de cette période est linéaire, sans commits de fusion.

## Configuration Astro (`astro.config.mjs`)

```js
export default defineConfig({
	site: 'https://numerikandco.org', // ⚠️ placeholder — à remplacer par le vrai domaine une fois choisi
	vite: { plugins: [tailwindcss()] },
});
```

Le champ `site` sert à générer des URLs absolues correctes dans le flux RSS (`/rss.xml`). Tant qu'il n'est pas mis à jour avec le vrai nom de domaine, les liens du flux RSS pointeront vers une URL fictive.

## Pour aller plus loin

- [docs/actualites.md](actualites.md) — alimenter les actualités
- [docs/activites.md](activites.md) — alimenter les activités
- [docs/annonces.md](annonces.md) — bannière d'annonces temporaires (au-dessus de la navbar)
- [docs/pages.md](pages.md) — créer des pages
- [docs/api.md](api.md) — routes serveur et intégration Grist (bulletin d'adhésion)
- [docs/theme.md](theme.md) — couleurs, polices, logo
- [docs/composants.md](composants.md) — composants disponibles
- [docs/navigation.md](navigation.md) — menu et pied de page
