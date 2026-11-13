# Thème : couleurs, polices, logo

Tout le thème visuel part d'un seul fichier : **`src/styles/global.css`**.

## Couleurs

```css
@theme {
	--color-primary: #2e2e2e;   /* actions principales, liens */
	--color-secondary: #2e2e2e; /* bandeaux, dates/labels */
	--color-accent: #2e2e2e;    /* appels à l'action, boutons "Adhérer" */
}
```

Ce sont les couleurs **par défaut du modèle** : neutres, noir (#2e2e2e) et
blanc, comme le `reglages.yaml` de démonstration (bande masquée). Chaque
structure règle les siennes dans `src/content/reglages.yaml` (exemple) :

```yaml
colors:
  primary: '#2f7fc1'
  secondary: '#1fa39e'
  accent: '#7cb93f'
  stripe: ['#4b4a9e', '#2f7fc1', '#1fa39e', '#7cb93f', '#e8b830', '#e2792f']  # bande sous l'en-tête
  stripeEnabled: false  # facultatif : pas de bande (en-tête, PDF des RDV), l'en-tête prend une ombre ; absent = affichée
```

Les layouts injectent ces valeurs dans `<head>` (`themeCss`,
`src/config/site.ts`) : elles remplacent celles de `@theme`, et tout le site
suit (boutons, liens, bandeaux, pastilles, calendrier RDV, bordures de
l'agenda). Tailwind compile les classes avec `var(--color-…)` ; pour les
opacités (`bg-primary/10`), il ajoute une valeur figée de repli utilisée
seulement par les navigateurs sans `color-mix()` (antérieurs à 2023).
Dans le code, ne jamais recopier une couleur en hexadécimal : utiliser
`var(--color-primary)` ou une classe Tailwind. Les valeurs de `@theme`
restent alignées sur `DEFAULTS.colors`.

L'**Espace Admin** ne suit pas la charte : il garde ses propres couleurs
(bleu `#2f7fc1`, turquoise `#1fa39e`, vert `#7cb93f`), redéfinies sur son
conteneur `#espace-benevoles` et sur la page d'installation (`.theme-admin`)
dans `global.css`. Une structure aux couleurs peu contrastées garde ainsi
une administration lisible.

Ces couleurs sont utilisables partout dans le code via les classes Tailwind générées automatiquement : `bg-primary`, `text-secondary`, `border-accent`, `from-primary`, `to-secondary`, etc. (y compris avec opacité : `bg-primary/10`).

## Polices

Deux rôles : **titres** (`h1`…`h6`, classe `font-heading`) et **texte**
(tout le reste, `body`). Réglés dans `polices:` de `src/content/reglages.yaml`,
depuis l'Espace Admin : module **Association** → onglet **Charte
graphique** → section **Polices**. Sans réglage : **Montserrat** (titres) et
**Open Sans** (texte).

```yaml
polices:
  titres: montserrat        # police proposée (id) ou nom d'une police déposée
  texte: Aileron
  deposees:                 # polices de l'association, src/content/polices/
    - nom: Aileron
      fichiers:
        '300': aileron-300.woff2
        '400': aileron-400.woff2
        # variable: ma-police-variable.woff2   (fichier qui couvre toutes les graisses)
```

- **Polices proposées** (`src/lib/font-catalogue.ts`, `FONT_CATALOGUE`) :
  Montserrat, Open Sans, Inter, Roboto, Raleway, Source Sans 3, Nunito,
  Work Sans, Lora. Paquets `@fontsource-variable/<id>` servis par le site
  lui-même (jamais Google Fonts : pas d'adresse IP des visiteurs transmise),
  fichier « variable » = toutes les graisses. Ajouter une police : `npm i
  @fontsource-variable/<id>`, une entrée dans `FONT_CATALOGUE` et ses deux
  imports dans `CATALOGUE_FILES` de `src/lib/fonts.ts`.
- **Polices déposées** : `.woff2` (conseillé), `.woff`, `.ttf` ou `.otf`,
  2 Mo max par fichier, un fichier par graisse ou un fichier variable.
  Graisses employées par le site : 300, 400, 500 et 600 pour le texte, 600
  pour les titres ; une graisse absente est imitée par le navigateur (rendu
  moins net). Vérifiez la licence : elle doit autoriser l'usage sur le web.
- Rendu : `src/lib/fonts.ts` produit au build les `@font-face` des **seules
  polices choisies** + `--font-heading` / `--font-body` (`fontsCss`, injecté
  dans `<head>` par les deux layouts, avec un `preload` du fichier
  principal) ; les valeurs de `@theme` dans `global.css` ne sont qu'un repli
  (`system-ui`).

## Logo

Les images propres à l'association vivent dans `src/content/images/` (dossier
de l'association, jamais remplacé par une mise à jour du modèle), retrouvées
par `src/lib/site-images.ts` quelle que soit leur extension :

| Fichier | Rôle |
| --- | --- |
| `logo.(png\|jpg\|webp\|svg)` | **Obligatoire.** En-tête et pied de page, via `<Image>` (`astro:assets` : redimensionné, converti en WebP au build). Largeur calculée d'après ses proportions (`logoWidth()`) : carré, large ou haut, il n'est ni rogné ni déformé. Fond transparent conseillé. |
| `accueil.(jpg\|png\|webp)` | Facultatif. Photo de fond du bandeau d'accueil ; absente = bandeau sans photo. Réglable depuis l'Espace Admin : module « Pages » → Accueil → module « Bandeau ». |
| `favicon.(svg\|png\|ico)` | Facultatif, un ou plusieurs formats. Icône de l'onglet (une balise `<link rel="icon">` par fichier) ; `favicon.ico` (ou `.png`) est aussi servi à l'adresse `/favicon.ico` (`src/pages/favicon.ico.ts`). |

Pour changer de logo : remplacer `src/content/images/logo.png` (une autre
extension convient ; un seul fichier `logo.*`, sinon le build échoue).

## Styles de base

Toujours dans `global.css` :

```css
body { font-family: var(--font-body); font-weight: 400; color: var(--color-gray-800); }
h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading); font-weight: 600; }
```

Ce sont les réglages par défaut appliqués à tout le site (pas besoin de répéter `font-heading`/`font-body` sur chaque titre).
