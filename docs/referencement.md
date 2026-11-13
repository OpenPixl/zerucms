# Référencement naturel (SEO)

Tout est automatique, tiré d'`association.yaml` et du contenu : rien à
régler par association. Code : `src/lib/seo.ts`,
`src/components/layout/SeoHead.astro` (inclus par les deux layouts).

## Ce que le site fournit

| Élément | Où | Détail |
| :--- | :--- | :--- |
| `robots.txt` | `src/pages/robots.txt.ts` | Tout autorisé sauf `/espace-benevoles` et `/api/` ; donne l'adresse du sitemap |
| `sitemap.xml` | `src/pages/sitemap.xml.ts` | Reconstruit à chaque publication : pages du site actives, adhésion, inscription (si ouverte), pages des extensions actives (`pages()` de leur `site.ts`, ex. RDV), pages de contenu publiques, catégories et fiches d'activité publiées, actualités publiées (avec `lastmod`). Jamais de page réservée, de brouillon ni de page désactivée |
| Une seule adresse par page | `trailingSlash: 'never'` (`astro.config.mjs`) | `/page/` redirige (301) vers `/page` ; liens, canonique, sitemap et RSS sans « / » final |
| Adresse canonique | `SeoHead.astro` | `<link rel="canonical">` sur toutes les pages, domaine = `SITE_URL` |
| Aperçus de partage | `SeoHead.astro` | Open Graph + `twitter:card` partout ; image = celle de la page, sinon photo d'accueil, sinon logo (hors SVG), recadrée 1,91:1 |
| Flux RSS signalé | `SeoHead.astro` | `<link rel="alternate" type="application/rss+xml">` vers `/rss.xml` |
| Données structurées (JSON-LD) | `src/lib/seo.ts` | Accueil : `Organization` (nom, adresse, téléphone, email, logo, réseaux sociaux) + `WebSite` ; fil d'Ariane : `BreadcrumbList` ; actualité : `NewsArticle` |
| Pages exclues | prop `noindex` des layouts | Pages réservées, `/je-participe` |
| Titre et description de l'accueil | `index.astro` ← `getSitePage('accueil')` | Section « Référencement » de l'Accueil (module « Pages ») ; défaut `{{association.nom}}` / `{{association.description}}` |
| Longueur conseillée | `src/components/admin/SeoLength.vue` | Sous les titres et descriptions des formulaires (pages, pages du site, actualités, activités) : titre 15–60, description 120–160 caractères, « · nom de l'asso » compté ; repère, jamais bloquant |
| Photo d'accueil | `Hero.astro` | Plusieurs tailles (640 → 1920 px, `srcset`), `fetchpriority="high"` (élément principal du chargement) |

Nouvelle page `.astro` : passer `title`, `description` (et `breadcrumbs`) au
layout ; `image` et `jsonLd` facultatifs. Nouvelle page de service à
référencer : l'ajouter dans `sitemap.xml.ts`.

## À faire sur le serveur

- Rediriger le domaine sans `www` (ou tout autre nom) vers `SITE_URL` :
  [guide-espace-benevoles.md](guide-espace-benevoles.md#reverse-proxy-nginx).

## À faire par l'association (hors site)

- **Google Business Profile** : fiche « Association » à l'adresse du siège
  (même nom, adresse et téléphone qu'`association.yaml`).
- **Google Search Console** et **Bing Webmaster Tools** : valider le
  domaine, déclarer `https://www.mon-asso.fr/sitemap.xml`, suivre l'indexation.
- **Liens entrants** : mairie, agglomération, cartographie des conseillers
  numériques, partenaires.
- **Titres et descriptions** : mots que cherchent les gens + ville
  (« atelier informatique », « aide aux démarches en ligne »…), dans les
  pages et les actualités ; description de 120 à 160 caractères. Titre de
  l'accueil (aujourd'hui le seul nom) : Pages → Accueil → « Référencement »,
  ex. « NUMERIK&Co · Médiation numérique à Saint-Pierre-en-Auge ».

## Vérifier

- `https://www.mon-asso.fr/robots.txt` et `/sitemap.xml` répondent 200.
- [Test des résultats enrichis](https://search.google.com/test/rich-results)
  sur l'accueil et une actualité.
- `curl -I https://www.mon-asso.fr/actualites/` → `301` vers `/actualites`.
