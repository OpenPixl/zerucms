# Créer ou modifier une page

Deux mécanismes coexistent :

- **Pages de contenu** (éditoriales) — un simple fichier Markdown dans
  `src/content/pages/`, créé à la main ou depuis le module **« Pages »** de
  l'Espace Admin (voir plus bas). Aucune ligne de code à écrire. **C'est
  le cas courant.**
  Guide pas-à-pas pour les éditeurs : [`src/content/README.md`](../src/content/README.md).
- **Pages applicatives** — un `.astro` dans `src/pages/` (routage par fichiers
  d'Astro), pour tout ce qui a une logique propre (listes, filtres, formulaires).

## Pages existantes

| Fichier | URL | Type | Contenu |
| :--- | :--- | :--- | :--- |
| `src/pages/index.astro` | `/` | applicative | Accueil (Hero, Actualités, Activités, CTA) |
| `src/pages/activites.astro` | `/activites` | applicative | Les catégories d'activités |
| `src/pages/activites/[category].astro` | `/activites/<categorie>` | applicative | Liste des activités d'une catégorie (`src/content/activites/_categories.yaml`) |
| `src/pages/activites/[category]/[slug].astro` | `/activites/<categorie>/<slug>` | applicative | Détail d'une activité (`src/content/activites/`) |
| `src/pages/actualites.astro` | `/actualites` | applicative | Liste des actualités + filtres + RSS |
| `src/pages/actualites/[slug].astro` | `/actualites/<slug>` | applicative | Détail d'un article (`src/content/news/`) |
| `src/plugins/adhesion/pages/adherer.astro` | `/adherer` | applicative | Adhésion à l'association |
| `src/pages/contact.astro` | `/contact` | applicative | Coordonnées + formulaire de contact |
| `src/pages/[...slug].astro` | (voir ci-dessous) | applicative | **Route attrape-tout** qui rend les pages de contenu |
| `src/pages/404.astro` | (toute URL inconnue) | applicative | Page « en construction » |
| `src/pages/rss.xml.js` | `/rss.xml` | applicative | Flux RSS des actualités |
| `src/content/pages/statuts/index.md` | `/statuts` | contenu | Statuts (lien de pied de page) |
| `src/content/pages/reglement-interieur/index.md` | `/reglement-interieur` | contenu | Règlement intérieur (lien de pied de page) |
| `src/content/pages/mentions-legales/index.md` | `/mentions-legales` | contenu | Mentions légales (lien de pied de page), variables `{{association.…}}` |
| `src/content/pages/association/adhesion-associations/index.md` | `/association/adhesion-associations` | contenu (enrichie) | Adhésion des associations : cartes, tarif, bouton |
| `src/content/pages/association/_group.md` | — | contenu | Décrit le menu déroulant « Association » |
| `src/content/pages/association/notre-histoire/index.md` | `/association/notre-histoire` | contenu | Histoire de l'association |
| `src/content/pages/association/ethique-du-logiciel-libre/index.md` | `/association/ethique-du-logiciel-libre` | contenu | Éthique du logiciel libre |
| `src/content/pages/association/conseiller-numerique/index.md` | `/association/conseiller-numerique` | contenu | Conseiller·ère numérique |

## Ajouter une page de contenu (cas courant)

1. Créer `src/content/pages/<slug>/index.md` (le chemin du dossier = l'URL) :

   ```
   src/content/pages/notre-projet/index.md        -> /notre-projet
   src/content/pages/association/partenaires/index.md  -> /association/partenaires (dans le dropdown)
   ```

2. Frontmatter :

   ```md
   ---
   title: "Notre projet"
   description: "Résumé affiché sous le titre et en méta description SEO."
   menu:
     show: true      # true = visible dans la barre de navigation
     order: 15        # position (petit = plus à gauche / plus haut)
     label: "Projet"  # facultatif : texte du menu si différent du titre
   ---

   Contenu en **Markdown**…
   ```

3. `npm run build` (ou dev) : la route `/notre-projet` et l'entrée de menu
   existent. Aucun `.astro` à créer.

### Détails

- **Hors menu mais accessible** : omettre le bloc `menu:` ou mettre
  `show: false`. Utile pour les pages liées seulement depuis le pied de page.
- **Menu déroulant** : ranger les pages dans un sous-dossier + y placer un
  `_group.md` (`label`, `order`). Voir [navigation.md](navigation.md).
- **Valeurs de la configuration dans le texte** : variables
  `{{association.nom}}`, `{{association.adresse}}`, `{{hebergeur.nom}}`…
  (`src/lib/page-variables.ts`), remplacées à l'affichage (ex.
  `mentions-legales`).
- **Page enrichie** : `type: enrichie` + `blocs:` + marqueurs
  `[[bloc:<id>]]` seuls sur leur ligne (catalogue `src/lib/blocs.ts`,
  rendu `src/components/blocs/BlocView.astro`). Ajouter un type de bloc =
  une entrée dans `BLOC_TYPES` (champs : formulaire du module + validation
  au build) + une branche dans `BlocView.astro`. Un composant avec
  `client:*` (îlot) y est possible.
- **`.mdx`** : reste lu par la route attrape-tout (composant `Content`),
  pour une page écrite dans le code avec ses propres `import`. Le module
  « Pages » la montre comme **page technique** (lecture seule) : le MDX
  s'exécute sur le serveur, il n'est jamais écrit depuis le site.
- **Sommaire** : `src/pages/[...slug].astro` affiche automatiquement le sommaire
  « Sur cette page » si le contenu a plus d'un titre (`<h2>`/`<h3>`).
- **Partage** : chaque page affiche un bouton de partage Facebook (colonne de
  droite, ou sous le texte sur mobile) ; l'aperçu reprend le titre, la
  `description` et l'image de couverture. Voir [partage.md](partage.md).

### Rendu et sécurité

Une page `.md` est affichée à partir du HTML rendu par le Content Layer,
**nettoyé** comme celui des actualités (`sanitizeNewsHtml()`,
`src/lib/sanitize-news.ts` : `<script>`, `on…=`, `javascript:` retirés,
balisage et classes gardés), variables remplacées, puis découpé aux
marqueurs de blocs (`pageParts()`, `src/lib/content-pages.ts`). Le texte
Markdown des blocs passe par le même nettoyage (`markdown-fragment.ts`).

## Module « Pages » (Espace Admin)

Groupes `redacteur` / `admin` / `superadmin`. Écrit dans les sources puis
reconstruit le site, comme le module « Actualités »
([publication.md](publication.md)) — ou, avec « Enregistrer sans publier »,
ajoute la modification au lot en attente, publié plus tard en une fois :

- `src/components/admin/modules/SitePagesModule.vue` — liste en quatre blocs :
  menu de navigation tel qu'affiché (pages du site actives, liens directs,
  menus déroulants et leurs pages, triés par position), pages libres (racine,
  `menu.show` faux), pages réservées, bibliothèque (pages du site
  désactivées, bouton « Activer ») ; formulaires (`pages/SitePageForm.vue` pour
  une page du site), (`pages/PageForm.vue`,
  `pages/BlocsEditor.vue`, `pages/BlocFields.vue` — champs `markdown` et
  `url` suivis du sélecteur de liens `LinkPicker.vue`) ; création = choix
  **page classique** ou **page enrichie**, ou dépôt d'un fichier `.md` qui
  pré-remplit le formulaire (`pages/page-markdown.ts` : `parsePageMarkdown()`,
  modèles `downloadPageTemplate()` ; emplacement, adresse, accès et photo
  restent à régler dans le formulaire, le serveur revalide tout).
- `src/lib/page-writer.ts` — validation identique au schéma (adresse libre et
  non prise par une page applicative de `src/pages/` ou un fichier de
  `public/`, liens sûrs, variables connues, blocs valides, marqueurs ↔ blocs),
  position dans le menu calculée (pas de champ dans le formulaire) : gardée
  si la page reste au même niveau, sinon dernière (`menuOrderFor()`, max + 10),
  écriture dans une **transaction** (copie de `src/content/pages/`, remise en
  place si la reconstruction échoue). Déplacer une page (autre menu déroulant,
  hors menu déroulant, réservée) ou changer son adresse **change son URL**.
- Menus déroulants : `_group.md` (libellé, position dans le menu de
  navigation : dernière à la création, puis glisser-déposer ou flèches) ; l'adresse d'un menu déroulant est fixée à sa création ; seul
  un menu déroulant vide se supprime ; sans page, il n'apparaît pas sur le
  site. Un seul niveau. (« Menu » seul = menu de navigation, frontmatter
  `menu:`.)
- **Pages du site** (bibliothèque `src/lib/site-pages.ts`, `SITE_PAGES` :
  Accueil, Activités, Actualités, Contact ; pages `.astro` du code) : par
  page, activation (`canDisable`, l'accueil est toujours actif), lien dans le
  menu (libellé, position, visibilité) et **textes** décrits par sections
  (`{ name, label, default, multiline? }`, variables `{{association.…}}`).
  **L'accueil** (`modules: true`) est une suite de **modules** :
  catalogue `src/lib/home-modules.ts` (`HOME_MODULES` : bandeau, actualites,
  activites, appel, partenaires, texte, plus ceux des extensions installées (ex. `rdv` : `definitions.ts` de l'extension, [extensions.md](extensions.md)) ; champs au format
  des blocs, `default` par champ, `multiple` pour les types répétables),
  liste complète enregistrée dans `pages.accueil.modules` (valeurs
  explicites ; absente = `DEFAULT_HOME`, identique à `DEFAULT_HOME` = non
  écrite), validée par `validateHomeModules()` (build et écriture), éditée
  par `HomeModulesEditor.vue` (réutilise `BlocFields.vue` ; photo du
  bandeau = `HomePhotoField.vue`, envoyée avec la page — champ `photo` du
  `PUT /api/admin/pages-du-site/accueil`, `src/lib/home-photo.ts` :
  `images/accueil.jpg` réduite à 2 400 px, ou retirée), rendue par
  `src/pages/index.astro`. Nouveau type = entrée `HOME_MODULES` + branche dans
  `index.astro`. Le planning (`WeeklyAgenda`) n'en fait pas partie : il lit
  Grist à chaque requête, l'accueil est prérendu.
  Seuls les écarts aux valeurs par défaut sont écrits dans
  `src/content/pages/_pages-site.md` (collection `sitePages`,
  `pages: { <id>: { active, label, order, show, textes } }` ; fichier
  toujours présent, `pages: {}` sans réglage — une collection vide ferait
  avertir Astro à chaque requête ; page ou texte inconnu, accueil désactivé =
  build en échec). Lecture au build : `getSitePage(id)`
  (`src/lib/site-pages-content.ts`, textes prêts dans `t`), utilisée par les
  pages et `getNavTree()` ; écriture : `saveSitePage()`.
- **Page désactivée = 404** : la page renvoie `new Response(null, { status: 404 })`
  (page 404 du site) ; une page prérendue étant quand même écrite dans
  `dist/client`, l'intégration `src/integrations/site-pages.ts` retire son HTML
  en fin de build. Les liens de l'accueil vers une page désactivée sont
  masqués (`inactiveSiteHrefs()`) ; les autres liens du site vers elle (ex.
  « Nous contacter » de /adherer) mènent à la 404.
- Nouvelle page dans la bibliothèque : une entrée `SITE_PAGES` (textes et
  valeurs par défaut), lecture de ses textes avec `getSitePage()` dans la page
  `.astro`, et `if (!page.active) return new Response(null, { status: 404 })`.
- Ordre : glisser-déposer (poignée ⠿) ou flèches ↑/↓ dans le bloc « Menu de navigation » (premier niveau :
  liens du site, liens directs, menus déroulants ; ou pages d'un menu
  déroulant), brouillon local puis `PUT /api/admin/ordre-menu`
  (`saveMenuOrder()` : liste complète du niveau exigée, positions
  renumérotées 0, 10, 20… dans `menu.order`, `_group.md` et
  `_pages-site.md`, une seule transaction et une seule publication).
- Routes : `GET/POST /api/admin/pages`, `GET/PUT/DELETE /api/admin/pages/<chemin>`,
  `POST /api/admin/menus-deroulants`, `PUT/DELETE /api/admin/menus-deroulants/<dossier>`,
  `PUT /api/admin/pages-du-site/<id>`, `PUT /api/admin/ordre-menu` ; chaque
  action est consignée au journal.

### Comment ça marche

Les pages forment la **content collection** `pages` (`src/content.config.ts`,
[doc Astro](https://docs.astro.build/en/guides/content-collections/)) : loader
`glob` sur `src/content/pages/**/index.{md,mdx}`, identifiant = chemin du
dossier (= l'URL), schéma validé au build (`title`, `description`, `menu`,
`cover` via `image()`, `imageCredit`, `access`). Les `_group.md` forment la
collection `pageGroups` (libellé et ordre des menus déroulants) et ne
produisent pas de route.

`src/lib/content-pages.ts` expose `getContentPages()` (async,
`getCollection`), `renderPage()` (`render()`) et `getGroups()` /
`groupMetaOf()`. Le rendu est partagé par `src/components/article/ContentPageView.astro` :

- `src/pages/[...slug].astro` — pages **publiques**, **prérendues** (une page
  HTML par page via `getStaticPaths()`) ;
- `src/pages/espace-benevoles/[...slug].astro` — pages **réservées**
  (`src/content/pages/espace-benevoles/`), rendues **à la demande** avec
  contrôle d'accès ([auth.md](auth.md#réserver-une-page-de-contenu)). Leur
  contenu n'est jamais écrit dans le `dist/` statique.

## Renommer une page de contenu

### Changer seulement le titre affiché (URL inchangée)

Un seul endroit : `title:` dans `src/content/pages/<slug>/index.md`. L'onglet,
le `PageHeader`, le fil d'Ariane et le libellé de menu (s'il n'y a pas de
`menu.label`) se mettent à jour automatiquement.

### Changer le slug (l'URL change)

1. Renommer le dossier : `src/content/pages/historique/` →
   `src/content/pages/notre-histoire/` (ou le déplacer dans un sous-dossier
   pour le faire passer dans un dropdown).
2. `title:` du frontmatter si besoin.
3. Liens entrants : `grep -rn "/historique" src/` — fils d'Ariane d'autres
   pages, liens dans d'autres contenus. Le menu, lui, suit automatiquement.
4. Site en ligne : ajouter une redirection dans `astro.config.mjs` —
   `redirects: { '/association/historique': '/association/notre-histoire' }`.
5. `npm run build` pour vérifier.

Il n'y a plus de fichier `.astro` ni d'appel `getPageBySlug('<slug>')` à tenir
synchronisés : le slug **est** le chemin du dossier.

## Ajouter une page applicative (`.astro`)

Réservé aux pages avec logique propre. Créer `src/pages/ma-page.astro` :

```astro
---
import Layout from '../layouts/Layout.astro';
import PageHeader from '../components/sections/PageHeader.astro';
---

<Layout
	title="Titre · numérik&Co"
	description="Description SEO"
	breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Titre affiché' }]}
>
	<PageHeader slot="page-header" title="Titre affiché" description="Sous-titre" />

	<section class="mx-auto max-w-6xl px-4 py-16 sm:px-6">
		<!-- contenu -->
	</section>
</Layout>
```

Pour qu'elle soit réglable depuis l'Espace Admin (menu, textes,
activation), l'ajouter à la bibliothèque `SITE_PAGES` de
`src/lib/site-pages.ts` (voir plus haut) — le routage par fichiers crée la
route, mais pas l'entrée de menu.

## Lien vers une page inexistante

Tout `href` vers une page pas encore créée retombe sur `src/pages/404.astro`
(statut HTTP 404 réel, présentation soignée). On peut donc poser les liens de
navigation à l'avance.
