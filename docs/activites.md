# Publier une activité

> ⚠️ À ne pas confondre avec les **actualités** (voir [actualites.md](actualites.md)). Les **activités** sont les parcours/ateliers proposés par l'association — du contenu évergreen, organisé par **catégorie**, affiché sur `/activites`.

## Les catégories

Les activités sont rangées par **catégorie**. Chacune a une carte (icône
[Font Awesome](https://fontawesome.com/search?ic=free&s=solid), style
« solid », auto-hébergé via `@fortawesome/fontawesome-free`, pas de CDN) sur
l'accueil et `/activites`, et sa page `/activites/<slug>` qui liste ses
activités. Catégories livrées par défaut :

| Catégorie | Slug | Icône |
| :--- | :--- | :--- |
| Parcours | `parcours` | `fa-route` |
| Ateliers | `ateliers` | `fa-screwdriver-wrench` |
| Médiation numérique | `mediation-numerique` | `fa-people-group` |
| FabLab | `fablab` | `fa-cubes` |

Elles sont **propres à chaque association** et se gèrent depuis l'espace
bénévoles (module « Activités » : créer, renommer, changer l'icône ou la
description, réordonner, supprimer une catégorie vide — voir
[le guide](guide-espace-benevoles.md#les-catégories)). Elles vivent dans
**`src/content/activites/_categories.yaml`**, fichier de l'association
qu'une mise à jour du modèle ne remplace pas :

```yaml
- slug: parcours          # adresse /activites/parcours, valeur de « category: » des fiches
  label: Parcours
  icon: fa-route          # icône Font Awesome « solid »
  description: Des parcours d'apprentissage progressifs…   # bandeau de la page (facultatif)
```

- L'ordre du fichier est l'ordre du site.
- Sans ce fichier (site installé avant la gestion des catégories), les
  catégories par défaut ci-dessus s'appliquent (`DEFAULT_CATEGORIES`,
  `src/lib/categories.ts`) ; la première modification depuis le module crée
  le fichier.
- Le fichier est validé à la construction (`parseCategories`) : slug en
  minuscules/chiffres/tirets et unique, nom (40 caractères max), icône
  `fa-…`, description (300 max), au moins une catégorie. Une erreur bloque
  le build avec un message qui nomme le champ.
- Changer un `slug` à la main oblige à changer aussi le `category:` des
  fiches concernées, et casse les liens vers l'ancienne adresse : le module
  ne le permet pas (adresse fixée à la création).

La carte sur l'accueil/`/activites`, la page `/activites/<slug>` (bandeau +
état vide « bientôt » sans activité) et le routage suivent automatiquement.

## Créer une nouvelle activité

Le plus simple : le **module « Activités »** de l'Espace Admin (voir
[plus bas](#module-activités-espace-admin)). À la main, dans les
sources :

1. Créer un dossier dans `src/content/activites/`, nommé d'après le slug de l'activité :

   ```
   src/content/activites/atelier-photo-numerique/
   ```

2. À l'intérieur, créer un fichier `index.md` avec ce frontmatter :

   ```markdown
   ---
   title: "Titre de l'activité"
   isPublish: true
   excerpt: "Un court résumé (1-2 phrases) affiché dans les cartes."
   category: "ateliers"
   order: 4
   cover: ./cover.jpg
   ---

   Le corps de la page en Markdown : paragraphes, **gras**, sous-titres `## ...`,
   citations `> ...`, liens `[texte](/contact)`.
   ```

   | Champ | Obligatoire | Rôle |
   | :--- | :--- | :--- |
   | `title` | oui | Titre affiché partout (carte, page de détail) |
   | `isPublish` | non | `false` pour masquer l'activité partout (page catégorie, accueil) et faire 404 sa page de détail — un brouillon reste dans le dossier sans être visible. Absent ou `true` = publiée |
   | `excerpt` | oui | Résumé court, utilisé dans les cartes et la description SEO de la page de détail |
   | `category` | oui | Slug d'une catégorie de `_categories.yaml` (par défaut `parcours`, `ateliers`, `mediation-numerique`, `fablab`). Détermine sous quelle page catégorie l'activité apparaît, et son URL |
   | `order` | non | Nombre entier, détermine l'ordre d'affichage au sein de sa catégorie (croissant). Sans ce champ, l'activité est affichée en dernier |
   | `level` | non | Niveau du cours (ex. `"Grand débutant"`, `"Initiation"`, `"Perfectionnement"`), affiché en pastille en bas à droite de la carte, à côté du lien "En savoir plus". Sans ce champ, la pastille ne s'affiche pas |
   | `cover` | non | Photo, chemin relatif au dossier (`./cover.jpg`). Le fichier doit exister, sinon le build échoue. Sans `cover:`, un placeholder « Image à venir » s'affiche sur la carte |
   | `imageCredit` | non | Légende affichée sous l'image **sur la page de détail uniquement** (ex. `"Photo : Prénom Nom / Source"`). Si absent ou vide, retombe automatiquement sur `"Photo : <nom de l'association>"` (voir `src/content/association.yaml`) |
   | `inscription` | non | `false` masque le bouton « S'inscrire » de la page de détail (ex. permanences sur RDV). Absent = bouton affiché — voir [inscription.md](inscription.md) |
   | `activiteGrist` | non | Nom (ou liste de noms) de l'activité dans Grist (`Activite.Nom`) ciblée par le bouton « S'inscrire » ; `*` final = préfixe (`"Initiation*"`). Absent = le `title` — voir [inscription.md](inscription.md#présélection) |
   | `typeGrist` | non | Type Grist (`Séances`, `Ateliers`, `Atelier CN`) ciblé par le bouton « S'inscrire », seul ou avec `activiteGrist` |

3. (Optionnel) Déposer la photo dans le même dossier et la citer avec `cover: ./cover.jpg` (voir le tableau).

Le frontmatter est vérifié à la construction : un champ obligatoire manquant ou une `category` inconnue bloquent le build avec un message qui nomme la fiche.

L'activité apparaît alors sur :
- la page **`/activites/<category>`** (liste des activités de sa catégorie),
- sa propre page de détail **`/activites/<category>/<slug>`**.

Elle n'apparaît **pas** directement sur l'accueil ni sur `/activites` : ces deux pages n'affichent que les 4 cartes de catégories (icônes), pas les activités individuelles.

## Module « Activités » (Espace Admin)

Les fiches se créent, se modifient, se réordonnent et se suppriment depuis
l'Espace Admin (module **Activités**, groupe `redacteur`, le bureau
passe toujours), sans toucher aux fichiers : mode d'emploi pour les
bénévoles dans
[guide-espace-benevoles.md](guide-espace-benevoles.md#gérer-les-activités).
Le module écrit **les mêmes fichiers** que ci-dessus : une fiche créée à la
main reste modifiable depuis le module, et inversement.

| Élément | Rôle |
| :--- | :--- |
| `src/components/admin/modules/ActivitiesModule.vue` | Liste par catégorie (vignette, pastilles brouillon / niveau / sans inscription), ordre par glisser-déposer (poignée ⠿) ou flèches ↑/↓, bandeau « Enregistrer et publier », suppression confirmée |
| `src/components/admin/modules/activites/ActivityForm.vue` | Formulaire de création / modification (même présentation que le module « Pages ») ; en modification, onglet **Partage** : « Créer l'actualité » (publier ou non) et liste des actualités déjà créées depuis la fiche |
| `src/lib/activity-news.ts` | Actualité dédiée : fiche **enregistrée** reprise (titre, résumé, catégorie → `tag`, texte, blocs — photos copiées —, photo et crédit), datée du jour, `activite: <slug>` ; `newsOfActivity()` |
| Blocs (`blocs:` du frontmatter) | Photos, carrousel, vidéo… comme les pages enrichies ([pages.md](pages.md)) : éditeur dans l'onglet Contenu, photos `photo_<n>.jpg` dans le dossier de la fiche (`src/lib/bloc-writer.ts`), aussi par dépôt du `.md` avec ses photos ou en `.zip` |
| `src/components/admin/modules/activites/CategoryForm.vue` | Formulaire d'une catégorie : nom, adresse (création), icône dans une grille (`src/lib/category-icons.ts`), description |
| `src/lib/category-writer.ts` | Lecture / écriture de `_categories.yaml` (en place, commentaires gardés), suppression d'une catégorie vide, ordre des catégories et des fiches en une transaction (`saveCatalogOrder`) |
| `src/lib/activity-writer.ts` | Lecture des sources, validation, écriture de `index.md` et de la photo, ordre |
| `src/lib/content-transaction.ts` | Sauvegarde / remise en place de tout `src/content/activites/` (partagé avec `page-writer.ts`) |
| `src/pages/api/admin/activites/` | Routes JSON (ci-dessous) |

### Routes

| Route | Rôle |
| :--- | :--- |
| `GET /api/admin/activites` | Fiches (brouillons compris, vignette, `href`), catégories (lues dans `_categories.yaml`), état de la dernière publication, disponibilité de la publication |
| `POST /api/admin/activites` | Création `{ activity, cover?: { type, data } }` (`data` en base64) |
| `GET /api/admin/activites/<slug>` | Sources de la fiche (formulaire), URL de la photo, `actualites` liées (sources, brouillons compris) |
| `POST /api/admin/activites/<slug>/actualite` | Crée l'actualité dédiée à la fiche (`writeActivityNews`) ; journal `actualite.ajout` |
| `PUT /api/admin/activites/<slug>` | Modification `{ activity, cover: { action: keep\|remove\|replace, type?, data? } }` |
| `DELETE /api/admin/activites/<slug>` | Suppression `{ confirm: <slug> }` (dossier et photo) |
| `PUT /api/admin/activites/ordre` | `{ levels?: { <catégorie>: [slugs…] }, categories?: [slugs…] }` : nouvel ordre des fiches d'une ou plusieurs catégories et/ou des catégories, en une publication |
| `POST /api/admin/activites/categories` | Nouvelle catégorie `{ category: { label, slug?, icon, description } }`, placée en dernier |
| `PUT /api/admin/activites/categories/<slug>` | Modification `{ category: { label, icon, description } }` (adresse inchangée) |
| `DELETE /api/admin/activites/categories/<slug>` | Suppression `{ confirm: <slug> }`, refusée si une fiche (brouillon compris) l'utilise ou si c'est la dernière |

Toutes passent par `publishChange()` (`src/lib/admin-publish.ts`) : écriture,
reconstruction du site (`site-build.ts`), puis `purge` de la sauvegarde si
elle réussit, `restore` sinon ; avec `?publier=non`, la modification
rejoint le lot en attente sans reconstruction
([publication.md](publication.md#enregistrer-sans-publier-lot-de-modifications)). Garde : `GUARDS` de `src/middleware.ts`
(`/api/admin/activites` → `redacteur`). Journal : `activite.ajout`,
`activite.modification`, `activite.suppression`, `activite.ordre`,
`categorie.ajout`, `categorie.modification`, `categorie.suppression`.

### Règles d'écriture

- **Validation = schéma** de la collection : titre, résumé et texte
  obligatoires, catégorie connue de `src/lib/categories.ts`, `typeGrist`
  parmi `TYPES_ACTIVITE_INSCRIPTION`, texte de 200 Ko au plus, liens
  Markdown sûrs et pas d'image Markdown locale (mêmes contrôles que les
  actualités, `checkBody`). Erreurs renvoyées en une fois, en français.
- **Adresse** (nom du dossier) : déduite du titre ou saisie à la création
  (`a-z`, `0-9`, tirets, 60 caractères), **fixée ensuite**. `ordre` et
  `categories` sont réservés (routes du module). Changer de catégorie garde le dossier mais
  change l'URL (`/activites/<catégorie>/<slug>`).
- **Frontmatter modifié en place** (`yaml` Document) : commentaires, champs
  inconnus et ordre des clés conservés ; un champ facultatif vidé est
  retiré (`level`, `imageCredit`, `activiteGrist`, `typeGrist`…).
  `activiteGrist` est écrit en texte pour un seul nom, en liste pour
  plusieurs ; `inscription: false` seulement quand le bouton est masqué.
- **Ordre** : `order` vaut 1, 2, 3… dans chaque catégorie. Une nouvelle
  fiche, ou une fiche qui change de catégorie, prend le dernier rang ;
  la route `ordre` renumérote et ne réécrit que les fichiers dont le rang
  change.
- **Photo** : `cover.jpg` redressée, sans métadonnées (GPS…), 1600 px au plus
  (`writeCover`, comme les actualités) ; JPEG, PNG ou WebP, 10 Mo max.
- **Transaction** : copie de tout `src/content/activites/` avant
  modification, remise en place si l'écriture ou la reconstruction échoue.

Le texte est **nettoyé à l'affichage** comme celui des actualités
(`renderActivity()` → `sanitizeNewsHtml()`) : HTML accepté, code exécutable
retiré.

Une fiche dont la catégorie a été retirée de `_categories.yaml` à la main
est signalée en rouge dans le module (sinon les prochaines publications
échoueraient).

## ⚠️ Droits d'usage des images

Avant d'ajouter une photo trouvée sur le web : vérifier sa licence. Une image créditée à une agence (Shutterstock, Getty...) trouvée sur un autre site n'est **pas** libre de réutilisation, même avec attribution — la licence appartient au site qui l'a achetée. Préférer une banque gratuite (Pexels, Unsplash, Pixabay) ou une photo dont l'association détient les droits.

## Comment ça marche techniquement

Les fiches forment la **content collection** `activites` (`src/content.config.ts`, [doc Astro](https://docs.astro.build/en/guides/content-collections/)) : loader `glob` sur `src/content/activites/*/index.md`, identifiant = nom du dossier, schéma validé au build (`category` limitée aux slugs de `src/lib/categories.ts`, `cover` via `image()`).

`src/lib/activites.ts` :
- `getAllActivities()` (async) — `getCollection('activites')` filtré sur `isPublish`, trié par `order` (puis nom de dossier). Calcule `href` en `/activites/<category>/<slug>` et le lien du bouton « S'inscrire ».
- `getActivitiesByCategory(categorySlug)` (async) — filtre `getAllActivities()` par catégorie.
- `renderActivity(activity)` — HTML rendu au build, nettoyé (`sanitizeNewsHtml`), et `headings` (sommaire).

Trois endroits consomment ces fonctions :
- `ActivitesSection.astro` (accueil + `/activites`) — affiche une `CategoryCard` par catégorie (`categories.ts`), pas les activités.
- `activites/[category].astro` — une page statique par catégorie (`getStaticPaths()` sur le registre), grille d'`ActivityCard` via `getActivitiesByCategory()`, état vide si la catégorie n'a aucune activité.
- `activites/[category]/[slug].astro` — une page statique par activité (`getStaticPaths()` sur `getAllActivities()`), avec un lien de retour vers la page de sa catégorie.

Voir [composants.md](composants.md) pour le détail de `CategoryCard.astro` et `ActivityCard.astro`.
