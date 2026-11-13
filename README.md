# numérik&Co — site associatif

Site de l'association **numérik&Co**, développé avec [Astro 7](https://docs.astro.build) et [Tailwind CSS 4](https://tailwindcss.com).

## Démarrage rapide

```sh
npm install
npm run dev
```

Le site est alors disponible sur `http://localhost:4321`.

> En session avec l'assistant IA, le serveur de dev se lance en tâche de fond avec `astro dev --background` (voir `CLAUDE.md`), géré ensuite avec `astro dev stop` / `astro dev status` / `astro dev logs`.

| Commande            | Action                                    |
| :------------------ | :----------------------------------------- |
| `npm run dev`        | Lance le serveur de développement          |
| `npm run build`       | Génère le site statique dans `./dist/`     |
| `npm run preview`     | Prévisualise le build de production        |
| `npm run astro ...`   | Accès direct à la CLI Astro                |

## Documentation

La documentation détaillée est dans le dossier [`docs/`](docs/), organisée **par besoin** :

| Je veux... | Voir |
| :--- | :--- |
| Publier ou modifier une actualité | [docs/actualites.md](docs/actualites.md) |
| Publier ou modifier une activité (parcours, atelier...) | [docs/activites.md](docs/activites.md) |
| Afficher une annonce temporaire dans la bannière du site (AG, appel à bénévoles...) | [docs/annonces.md](docs/annonces.md) |
| Créer ou modifier une page (ex: une nouvelle rubrique) | [docs/pages.md](docs/pages.md) |
| Rédiger une page éditoriale et la placer dans le menu (guide éditeur) | [src/content/README.md](src/content/README.md) |
| Installer un nouveau site (assistant : structure, compte, plugins, secrets, exemples) | [docs/installation.md](docs/installation.md) |
| Choisir entre site d'association et site d'auto-entrepreneur | [docs/structure.md](docs/structure.md) |
| Gérer devis et factures (auto-entrepreneur, plugin Grist) | [docs/facturation.md](docs/facturation.md) |
| Sauvegarder / restaurer le contenu, les comptes et le journal d'un site (ZIP) | [docs/sauvegarde.md](docs/sauvegarde.md) |
| Changer les couleurs, les polices ou le logo | [docs/theme.md](docs/theme.md) |
| Savoir quels composants réutiliser (boutons, cartes, sections...) | [docs/composants.md](docs/composants.md) |
| Modifier les liens du menu ou du pied de page | [docs/navigation.md](docs/navigation.md) |
| Partager une actualité ou une page sur Facebook, activer/désactiver le partage | [docs/partage.md](docs/partage.md) |
| Ouvrir / fermer un formulaire (adhésion, contact…) | [docs/composants.md](docs/composants.md#forms) |
| Comprendre l'inscription en ligne à une activité (bouton « S'inscrire »), l'ouvrir / la fermer | [docs/inscription.md](docs/inscription.md) |
| Comprendre / présenter le parcours d'adhésion en ligne | [docs/adhesion-parcours.md](docs/adhesion-parcours.md) |
| Installer une extension (développement propre à une structure, ex. prise de rendez-vous de numérik&Co), en écrire une | [docs/extensions.md](docs/extensions.md) |
| Copier un bloc prêt à l'emploi (frontmatter, bouton, cartes, formulaire, route API…) | [docs/snippets.md](docs/snippets.md) |
| Comprendre l'organisation technique du projet | [docs/developpement.md](docs/developpement.md) |

## Structure du projet (vue rapide)

```text
src/
├── components/         # Briques réutilisables, rangées par famille
│   ├── ui/             # Primitives génériques (Button, Card)
│   ├── layout/         # Chrome du site (Header, Footer, BrandStripe, AnnonceBanner, Breadcrumb)
│   ├── cards/          # Cartes de contenu (ArticleCard, ActivityCard, CategoryCard)
│   ├── article/        # Briques de page de lecture (Article, TableOfContents, ReadingProgress, FigureImage, PrevNextNav, ShareTools)
│   └── sections/       # Sections de page assemblées à partir des briques (Hero, CtaSection...)
├── config/             # site.ts : config par déploiement (CTA « Adhérer », menu des pages applicatives)
├── content/
│   ├── news/            # Actualités : un dossier par article (index.md + image)
│   ├── activites/       # Activités : un dossier par activité (index.md + image)
│   ├── pages/           # Pages éditoriales : le chemin = l'URL, frontmatter menu: (voir content/README.md)
│   └── README.md        # Guide de rédaction destiné aux éditeurs
├── layouts/             # Layout.astro : squelette HTML commun à toutes les pages
├── lib/                 # Fonctions utilitaires (news.ts, activites.ts, content-pages.ts, navigation.ts)
├── pages/               # Une route par fichier ("/", "/actualites"...) + [...slug].astro (pages éditoriales)
└── styles/              # global.css (couleurs, polices), fonts/, img/ (logo)
```

Pour le détail de chaque dossier, voir [docs/developpement.md](docs/developpement.md).
