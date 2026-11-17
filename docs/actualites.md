# Publier une actualité

Les actualités sont des fichiers **Markdown**, un dossier par article, dans `src/content/news/`. Deux façons d'en ajouter un : **depuis l'Espace Admin** (module « Actualités » : dépôt du `.md` + photo, le serveur écrit le dossier et reconstruit le site — voir [publication.md](publication.md) et le [guide](guide-espace-benevoles.md#publier-une-actualité)), ou à la main comme décrit ci-dessous. Aucune base de données : ajouter un dossier suffit pour que l'article apparaisse sur le site.

## Créer un nouvel article

1. Créer un dossier dans `src/content/news/`, nommé **`AAAA-MM-JJ-slug-du-titre`** — la date de publication en préfixe, puis un slug lisible. C'est aussi ce préfixe qui compose l'URL de l'article :

   ```
   src/content/news/2026-09-15-atelier-photo-numerique/
   ```

   Nommer les dossiers ainsi les fait apparaître triés chronologiquement dans un explorateur de fichiers, sans avoir à ouvrir chaque `index.md` pour connaître sa date.

2. À l'intérieur, créer un fichier `index.md` avec ce frontmatter :

   ```markdown
   ---
   title: "Titre de l'actualité"
   isPublish: true
   publishAt: 2026-09-15
   excerpt: "Un court résumé (1-2 phrases) affiché dans les cartes de la liste et de l'accueil."
   tag: "Ateliers"
   author: "numérik&Co"
   cover: ./cover.jpg
   ---

   Le corps de l'article en Markdown : paragraphes, **gras**, sous-titres `## ...`,
   citations `> ...`, liens `[texte](https://...)`.
   ```

   | Champ | Obligatoire | Rôle |
   | :--- | :--- | :--- |
   | `title` | oui | Titre affiché partout (carte, page de détail, flux RSS) |
   | `isPublish` | non | `false` pour masquer l'article partout (listes, accueil, flux RSS) et faire 404 sa page de détail — un brouillon reste dans le dossier sans être visible. Absent ou `true` = publié |
   | `publishAt` | oui | Format `AAAA-MM-JJ`, doit correspondre à la date en préfixe du nom de dossier. Sert au tri (plus récent en premier) et à l'affichage (`19 mai 2026`) |
   | `excerpt` | oui | Résumé court, utilisé dans les cartes et la description du flux RSS |
   | `tag` | non | Catégorie affichée en pastille + utilisée par les **filtres** de la page Actualités |
   | `author` | non | Affiché à côté de la date |
   | `cover` | non | Photo de couverture, chemin **relatif au dossier** (`./cover.jpg`). Le fichier doit exister : sinon le build échoue. Formats : jpg, png, webp, avif |
   | `imageCredit` | non | Légende affichée sous l'image **sur la page de détail uniquement** (ex. `"Photo : Prénom Nom / Source"`). Si absent ou vide, retombe automatiquement sur `"Photo : <nom de l'association>"` (voir `src/content/association.yaml`) |
   | `activite` | non | Adresse (nom du dossier) d'une fiche d'activité : la page se termine par « Voir l'activité » et « S'inscrire » (si l'inscription en ligne est possible pour cette fiche). Écrit par l'onglet « Partage » du module Activités ; ignoré si la fiche n'est pas publiée |

3. (Optionnel) Déposer la photo de couverture dans le même dossier et la citer dans le frontmatter (`cover: ./cover.jpg`) :

   ```
   src/content/news/2026-09-15-atelier-photo-numerique/
   ├── index.md        ← cover: ./cover.jpg
   └── cover.jpg
   ```

   Le nom du fichier est libre (`cover.jpg` par convention) : c'est le champ `cover:` qui fait le lien. Sans `cover:`, une vignette de remplacement (dégradé + texte « Image à venir ») s'affiche automatiquement.

C'est tout : l'article apparaît immédiatement en dev, et après `npm run build` (puis dépôt du `dist/`) en production, sur :
- la page **`/actualites`** (liste complète, triée, avec filtres par tag),
- l'**accueil** (les 3 actualités les plus récentes, section "Les dernières nouvelles de l'association"),
- sa propre page de détail **`/actualites/<nom-du-dossier>`**,
- le **flux RSS** `/rss.xml`.

La page de détail propose aussi un bouton de partage Facebook, dont l'aperçu
reprend le titre, l'`excerpt` et l'image de couverture — voir
[partage.md](partage.md).

## Modifier ou supprimer un article

- Modifier : éditer directement le `index.md` du dossier concerné.
- Supprimer : supprimer le dossier entier.
- Changer la date ou le slug (URL) : renommer le dossier — attention, cela change l'URL de la page de détail. Penser à mettre à jour `publishAt` en même temps si la date change, pour que le préfixe du dossier et le tri restent cohérents.

## HTML dans une actualité

Le corps accepte le **HTML** en plus du Markdown (tableaux, `<div class>`,
styles, `<details>`, `<iframe>` de vidéo ou de carte…). À l'affichage, la page
d'article le **nettoie** (`src/lib/sanitize-news.ts`) : le balisage est gardé,
le code exécutable retiré — `<script>`, `<style>`, attributs `on…=`, liens
`javascript:`, `<svg>`/`<math>`, et `<iframe>` dont la source n'est pas
YouTube, Vimeo, PeerTube ou OpenStreetMap (`IFRAME_HOSTS`). Raison : les
actualités sont publiables depuis l'Espace Admin, sur le même site que
l'administration.

## Comment ça marche techniquement

Les actualités forment une **content collection** Astro, déclarée dans `src/content.config.ts` ([doc Astro](https://docs.astro.build/en/guides/content-collections/)) :
- loader `glob` sur `src/content/news/*/index.md` ; l'identifiant de l'entrée (et donc l'URL) est le **nom du dossier** ;
- **schéma de validation** : un champ obligatoire manquant, une date invalide ou une photo `cover:` introuvable **arrêtent le build** avec un message qui nomme le fichier fautif ;
- `cover:` est validé par le helper `image()` : la photo est optimisée par `astro:assets` comme les autres images du site.

`src/lib/news.ts` expose :
- `getAllNews()` (asynchrone) — `getCollection('news')` filtré sur `isPublish`, mis en forme (`slug`, `href`, date française, temps de lecture) et trié par `publishAt` décroissant (à date égale : ordre alphabétique du dossier) ;
- `renderNews(article)` — `render()` de l'entrée : composant `Content` et `headings` (sommaire).

Consommateurs, **tous prérendus** au build : `src/components/sections/ActualitesSection.astro` (accueil), `src/pages/actualites.astro` (liste), `src/pages/actualites/[slug].astro` (une page statique par article via `getStaticPaths`), `src/pages/rss.xml.js`. Le rendu de chaque vignette est le composant partagé `src/components/cards/ArticleCard.astro` — voir [composants.md](composants.md).

## Pistes d'évolution

- **Contenu réel manquant** : à ce stade, 6 articles ont été migrés depuis l'ancien site (clubmicrosaintpierre.fr) à titre d'exemple/contenu de démarrage. Le site source propose une page 2 avec d'autres actualités plus anciennes, non encore migrées.
- **Autres contenus** : les pages (`src/content/pages/`), activités et annonces passeront aussi en collections, sur le même modèle.
