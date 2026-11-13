# Composants réutilisables

## Briques de base (`src/components/`)

Les briques sont rangées par famille dans des sous-dossiers de `src/components/` :

| Sous-dossier | Famille |
| :--- | :--- |
| `ui/` | primitives d'interface génériques (boutons, cartes de base) |
| `layout/` | chrome global du site (en-tête, pied de page, bannières, fil d'Ariane) |
| `cards/` | cartes de contenu typées (actualité, activité, catégorie) |
| `article/` | briques de la page de lecture (colonnage, sommaire, progression, figure, nav précédent/suivant) |
| `forms/` | garde d'ouverture/fermeture des formulaires |
| `sections/` | blocs de page pleine largeur (voir plus bas) |

### `ui/`

| Composant | Usage |
| :--- | :--- |
| `ui/Button.astro` | Bouton pilule. Props : `href` (rend un `<a>`, sinon un `<button>`), `variant` (`primary` \| `secondary` \| `outline`), `class` (classes additionnelles). |
| `ui/Card.astro` | Carte simple : titre + contenu libre (slot). Utilisée pour la grille "Adhérer". |

### `layout/`

| Composant | Usage |
| :--- | :--- |
| `layout/Header.astro` | En-tête du site : logo, navigation, bouton "Adhérer", menu mobile. |
| `layout/Footer.astro` | Pied de page : logo, coordonnées, réseaux sociaux, copyright. |
| `layout/BrandStripe.astro` | Bande de couleurs de marque affichée en haut de l'en-tête. |
| `layout/AnnonceBanner.astro` | Bannière d'annonces pleine largeur montée **au-dessus de `Header`** dans `Layout`. Lit `src/lib/annonces.ts` (collection `annonces`, contenu dans `src/content/annonces.yaml`). Script client : fenêtre de dates, rotation auto (prop `intervalMs`, défaut 7000) avec flèches `‹` `›` si plusieurs annonces valides, pause au survol/focus, fermeture mémorisée en `sessionStorage`. Couleur pilotée par le `tone` de l'annonce affichée. Voir [annonces.md](annonces.md). |
| `layout/Breadcrumb.astro` | Fil d'Ariane (`Accueil > ... > page courante`). Prend un tableau `items` (`{ label, href? }`) ; le dernier élément (page courante) n'a jamais de `href` et reçoit seul `aria-current="page"`. Un élément intermédiaire peut aussi omettre `href` (ex. un libellé de menu déroulant sans page "hub" propre) : il s'affiche alors en texte simple, sans lien ni `aria-current`. Ne se rend pas si `items` contient moins de 2 éléments. Voir [navigation.md](navigation.md). |

### `cards/`

| Composant | Usage |
| :--- | :--- |
| `cards/ArticleCard.astro` | Carte d'actualité (image ou placeholder, date, auteur, titre, extrait, tag). Prend un objet `article` (voir [actualites.md](actualites.md)). Hauteur fixe `h-116` (464px, échelle dynamique Tailwind 4) pour harmoniser toutes les cartes d'une grille ; titre bloqué à 2 lignes (`line-clamp-2`, `leading-snug`), extrait bloqué à 4 lignes (`line-clamp-4`) ; carte en `flex flex-col`, le tag est poussé en bas via `mt-auto` quel que soit le nombre de lignes utilisées au-dessus. |
| `cards/ActivityCard.astro` | Carte d'activité (image ou placeholder, titre, extrait, lien "En savoir plus" et pastille de niveau optionnelle, tous deux ancrés en bas de carte), utilisée sur une page catégorie. Prend un objet `activity` (voir [activites.md](activites.md)). |
| `cards/CategoryCard.astro` | Carte de catégorie d'activité : badge icône [FontAwesome](https://fontawesome.com/search?ip=classic&s=solid) + libellé en majuscules, pas d'image. Prend un objet `category` (`{ slug, label, icon }` depuis `src/lib/categories.ts`, lu dans `src/content/activites/_categories.yaml`). |

### `article/`

| Composant | Usage |
| :--- | :--- |
| `article/Article.astro` | Grille 2 colonnes article/sommaire. Sans le slot nommé `sidebar` rempli : une seule colonne (`<article class="mx-auto max-w-3xl px-4 py-16 sm:px-6">`). Avec ce slot rempli : bascule en 2 colonnes — `article` en largeur flexible (`minmax(0,1fr)`) + `aside` collant de 240px (visible à partir de `lg:`). Utilisé uniquement par `ArticleLayout` (voir plus bas) — pas destiné à être appelé directement depuis une page. |
| `article/TableOfContents.astro` | Sommaire ("Sur cette page") à placer dans le slot `sidebar` d'`Article`. Prop `headings: { depth, slug, text }[]` (type `Heading` de `src/lib/headings.ts`) ; ne garde que `depth` 2-3, ne se rend pas s'il reste moins de 2 entrées — c'est ce qui fait que la colonne annexe n'apparaît que "selon le contenu". Défilement animé au clic (`scroll-behavior: smooth` + `scroll-margin-top` sur les `h2`/`h3`, dans `global.css`, avec respect de `prefers-reduced-motion`). Le lien du titre actuellement lu est surligné automatiquement au scroll (script `IntersectionObserver`-like sur `getBoundingClientRect`, classe `.is-active` définie dans `global.css`) — même style que le survol (liseré bleu à gauche). |
| `article/ReadingProgress.astro` | Module "X min de lecture" + barre de progression qui se remplit avec le scroll de la page. Prop `minutes: number`. Placé juste au-dessus de `TableOfContents` dans le slot `sidebar`, uniquement quand le sommaire est lui-même affiché (même condition `headings.length > 1`). Le temps de lecture est calculé automatiquement au build (`estimateReadingTime()` dans `src/lib/reading-time.ts`, ~200 mots/minute) à partir du contenu brut markdown, et exposé via le champ `readingTime` de `NewsArticle`/`Activity` (`src/lib/news.ts`, `src/lib/activites.ts`). |
| `article/FigureImage.astro` | Image (`astro:assets`) encapsulée dans un `<figure>`, avec `<figcaption>` optionnel affiché uniquement si un `caption` est fourni. Utilisé sur les pages de détail (actualité, activité) pour créditer une photo. |
| `article/ShareTools.astro` | Encart de partage (bordure complète, coins arrondis) : icône « partage » couleur du texte (`text-gray-700`) à gauche, icônes de réseaux à droite (Facebook pour l'instant). Props : `title`, `url` (défaut = URL publique de la page), `class`. Placé dans le slot `sidebar` des actualités (sous `ReadingProgress`) et des pages de contenu (au-dessus de `TableOfContents`), plus une copie `lg:hidden` sous le contenu. Outils activables dans `site.share`. Voir [partage.md](partage.md). |
| `article/PrevNextNav.astro` | Navigation "article précédent / suivant" placée dans le slot par défaut d'`ArticleLayout`. Voir [navigation.md](navigation.md). |

> `ArticleLayout.astro` (le gabarit de page qui compose `Article` + `TableOfContents` + `ReadingProgress`, voir plus bas) vit dans `src/layouts/ArticleLayout.astro`, pas dans `src/components/` — comme `Layout.astro`, c'est un gabarit de page complet plutôt qu'une brique visuelle.

### `forms/`

| Composant | Usage |
| :--- | :--- |
| `forms/FormGate.astro` | Entoure un formulaire : `<FormGate form="<clé>">…</FormGate>`. Si `site.forms.<clé>.enabled` (défaut dans `src/config/site.ts`, réglé dans `src/content/reglages.yaml`) vaut `true`, rend le contenu du slot par défaut tel quel ; sinon, le remplace par un encart informatif (`closedTitle` + `closedMessage`). Slot nommé `fallback` optionnel : un bouton d'alternative affiché sous le message de fermeture (ex. `<Button slot="fallback" href="/contact">Nous contacter</Button>`). Clés actuelles : `adhesion` (`src/plugins/adhesion/pages/formulaire.astro`), `contact` (`src/pages/contact.astro`). |

Pour la logique côté page — masquer un bouton d'accès quand le formulaire est
fermé, par exemple — `src/lib/forms.ts` expose `isFormOpen(name)` et
`getFormToggle(name)`. C'est ce qu'utilise `src/plugins/adhesion/pages/adherer.astro` pour
cacher le bouton « Adhérer en ligne ».

**Ajouter un nouveau formulaire au système** : ajouter une clé dans
`site.forms` (`enabled`, `closedTitle`, `closedMessage`), puis entourer le
formulaire de `<FormGate form="<nouvelle-clé>">`. Le type `FormName` se met à
jour automatiquement à partir de `site.forms`.

Exemple d'usage de `Button` :

```astro
<Button href="/adherer" variant="primary">Adhérer à l'association</Button>
<Button href="/activites" variant="outline">Découvrir nos activités</Button>
```

## Sections de page (`src/components/sections/`)

Une section = un bloc complet de page (souvent une balise `<section>` pleine largeur), assemblé à partir des briques ci-dessus. Une page (`src/pages/*.astro`) se construit en empilant des sections dans un `<Layout>`.

| Section | Rôle | Où elle est utilisée |
| :--- | :--- | :--- |
| `Hero.astro` | Grand titre + accroche + 2 boutons | Accueil |
| `ActivitesSection.astro` | Grille des catégories d'activités (`CategoryCard`, depuis `src/lib/categories.ts` — pas les activités individuelles). Prop `showHeading` (défaut `true`) : sur l'accueil, affiche le titre "Activités" + bouton "Accéder à la page" ; sur `activites.astro`, passé à `false` car la page a déjà son `PageHeader` | Accueil, page Activités |
| `ActualitesSection.astro` | Les 3 actualités les plus récentes + lien "Voir toutes les actualités" | Accueil |
| `CtaSection.astro` | Bandeau d'appel à l'action (dégradé primary→secondary) | Accueil |
| `RdvCtaSection.astro` (extension `rdv`, `extensions/rdv/sections/` ; rendu par le CMS via `site.ts`, cf. [extensions.md](extensions.md)) | Encart de prise de rendez-vous : permanences + bouton ; textes et logo par défaut : `encart:` de `src/content/rdv.yaml`. Props facultatives : `eyebrow`, `title`, `description`, `buttonLabel`, `buttonHref` | Accueil |
| `PageHeader.astro` | Bannière de titre pour les pages internes (dégradé + titre + description). Props : `title`, `description` | Activités, Actualités, Adhérer, Contact |

> ⚠️ Ne pas confondre **Activités** (`activites/`, `ActivitesSection`, `ActivityCard` — les parcours/ateliers proposés par l'association, contenu évergreen) et **Actualités** (`actualites/`, `ActualitesSection`, `ArticleCard` — les news datées). Deux collections de contenu distinctes, avec le même fonctionnement (dossier + `index.md` + photo citée par `cover:`).

## Ajouter une nouvelle section

1. Créer `src/components/sections/MaSection.astro`.
2. L'importer et l'ajouter dans la page souhaitée, ex. `src/pages/index.astro` :

   ```astro
   import MaSection from '../components/sections/MaSection.astro';
   ...
   <Layout>
       <Hero />
       <MaSection />
       <CtaSection />
   </Layout>
   ```

## Page longue avec sommaire (`ArticleLayout`)

`ArticleLayout` (`src/layouts/ArticleLayout.astro`) est un **gabarit de page** à part entière, au même titre que `Layout.astro` — pas un composant qu'on assemble à l'intérieur d'un `<Layout>`. Une page qui l'utilise n'importe qu'`ArticleLayout` : pas besoin de reprendre séparément `Layout`, `PageHeader`, `Article`, `TableOfContents` ou `ReadingProgress`, `ArticleLayout` les compose déjà en interne. Il est réservé aux pages qui affichent un contenu de lecture (article, page légale...) — les pages qui empilent des sections libres (accueil, `activites.astro`...) continuent d'utiliser `Layout` directement (voir plus haut).

```astro
---
import ArticleLayout from '../layouts/ArticleLayout.astro';
---
<ArticleLayout
	title="Titre · numérik&Co"
	description="Description pour les moteurs de recherche"
	breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Titre affiché' }]}
	pageHeaderTitle="Titre affiché"
	pageHeaderDescription="Sous-titre optionnel affiché sous le titre"
	headings={headings}
	readingTime={readingTime}
>
	<!-- contenu de l'article -->
</ArticleLayout>
```

Props :

| Prop | Rôle |
| :--- | :--- |
| `title`, `description`, `breadcrumbs` | Transmis tels quels à `Layout` (balise `<title>`, meta description, fil d'Ariane). |
| `pageHeaderTitle`, `pageHeaderDescription` | Transmis à `PageHeader` (bannière dégradée en haut de page). |
| `headings` | Optionnel, tableau `Heading[]`. Si plus d'une entrée, `ArticleLayout` affiche automatiquement `ReadingProgress` (si `readingTime` est fourni) + `TableOfContents` dans la colonne latérale — sinon la page reste en une seule colonne. |
| `image` | Optionnel. Image de couverture utilisée pour la balise `og:image` (aperçu Facebook et autres réseaux), convertie en JPEG paysage 1,91:1 (1200×630 au plus, sans agrandissement, dimensions réelles déclarées). Voir [partage.md](partage.md). |
| `ogType` | Optionnel, `'article'` \| `'website'` (défaut). Valeur de `og:type`. |
| `readingTime` | Optionnel (`number`, en minutes). Sans valeur, pas de module temps de lecture même si `headings` en a plusieurs. |

- Pour une page markdown/MDX (actualité, activité, page éditoriale — voir [pages.md](pages.md)), `headings` et `readingTime` viennent directement de l'objet de contenu (`article.headings`/`article.readingTime`, `activity.*`, ou `page.headings` via `src/lib/content-pages.ts`) — Astro (et `@astrojs/mdx` pour le `.mdx`) génère les `id` des `<h2>`/`<h3>` automatiquement, pas besoin de les écrire à la main.
- Le contenu spécifique à une page (ex. `PrevNextNav`, un lien "Retour à ...") se place simplement dans le slot par défaut, avant ou après le `<div class="markdown-content">`.

## Îlots interactifs (Vue)

La quasi-totalité du site est du HTML statique. Les rares blocs qui ont besoin de JavaScript côté client (état, appels réseau) sont des **îlots** : des composants Vue montés dans une page Astro avec une directive `client:*`.

- Intégration : `@astrojs/vue` (dans `astro.config.mjs`). Les fichiers `.vue` s'importent et s'utilisent comme des composants Astro, avec en plus `client:load` / `client:visible` / `client:idle` pour choisir quand ils s'hydratent.
- Rangement : un dossier par îlot sous `src/components/<nom>/` (ex. `src/plugins/adhesion/formulaire/adhesion/`), avec le composant orchestrateur, ses sous-composants présentationnels et un `client.ts` pour les appels aux routes API.
- Règle : un îlot ne parle jamais à un service externe directement — il appelle une route `src/pages/api/*` qui détient les secrets. Voir [api.md](api.md).

Îlot existant : **`adhesion/AdhesionForm.vue`** — formulaire d'adhésion (`/adherer/formulaire`), détaillé dans [api.md](api.md).

## Convention de style

Toutes les briques et sections respectent la même palette (`bg-primary`, `text-secondary`, `bg-accent`...) et les mêmes rayons/ombres (`rounded-2xl`, `border-gray-100`, `shadow-sm hover:shadow-md`) — réutiliser ces classes pour toute nouvelle carte ou bloc garde le site cohérent visuellement. Voir [theme.md](theme.md) pour la liste des couleurs disponibles.
