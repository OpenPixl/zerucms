# Thème : couleurs, mode sombre, polices, logo

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

Fonds : **`bg-fond`** (page) et **`bg-surface`** (en-tête, cartes, champs,
encadrés), blancs en mode clair. **Ne pas écrire `bg-white`** dans les pages
publiques : il resterait blanc en mode sombre (`text-white` sur une couleur
de marque reste correct). L'Espace Admin, toujours clair, garde `bg-white`.

## Mode sombre

Proposé aux visiteurs si la structure l'active (module « Charte graphique », onglet « Mode sombre »,
**désactivé par défaut**) : bouton lune / soleil dans l'en-tête
(`ModeSombreBouton.astro`, à côté du bouton « Adhérer » ; à côté du menu
sur mobile). Première visite : le site suit la préférence de l'appareil
(`prefers-color-scheme`), puis le choix du visiteur est gardé dans
`localStorage` (clé `theme`). Un petit script en tête de page
(`ModeSombre.astro`, motif « theme toggle » de la doc Astro) pose
`data-theme="dark"` sur `<html>` avant l'affichage : pas d'éclair blanc.

Réglage dans `src/content/reglages.yaml` (seuls les écarts au défaut sont
écrits par l'admin) :

```yaml
sombre:
  enabled: true         # absent = non proposé
  fond: '#0d1117'       # arrière-plan des pages
  surface: '#161b22'    # en-tête, cartes, champs
  texte: '#e6edf3'      # texte ; les gris en sont tirés
  accent: '#ffcc00'     # facultatif : primary / secondary / accent
```

- **Palettes proposées** (`PALETTES_SOMBRES`, `src/lib/mode-sombre.ts`) :
  Material (`#121212`, recommandation de Google, **défaut**), GitHub,
  Ardoise (Tailwind slate), Neutre (zinc), Solarized.
- **Couleurs de marque** : absentes = **automatiques**
  (`couleurSombreAuto()` : éclaircies jusqu'à une luminance ≈ 0,18, lisibles
  sur le fond comme sous du texte blanc ; une couleur déjà claire est
  gardée). Une valeur égale à la variante automatique n'est pas écrite :
  elle suit la couleur claire.
- **CSS** (`global.css`) : sous `:root[data-theme="dark"]`, l'échelle
  `--color-gray-*` est recalculée depuis la palette (`color-mix` du texte
  et du fond : `text-gray-900` = texte, `bg-gray-100` = surface foncée…),
  les tons 50–300 et 700–950 de `red`, `amber`, `green`, `sky` sont
  inversés (encarts d'alerte), `--color-fond` / `--color-surface` prennent
  la palette. Les composants gardent donc leurs classes, sans `dark:`.
  `themeCss` ajoute les variables `--sombre-*` et les couleurs de marque
  sombres seulement si le mode est proposé.
- **Espace Admin** et page d'installation : toujours clairs (gris, fonds et
  couleurs d'alerte d'origine redéfinis sur `#espace-benevoles` /
  `.theme-admin`).
- **Logo du mode sombre** : `images/logo-sombre.*` facultatif (voir
  « Logo ») ; absent = logo normal.

## Pied de page

Couleurs **propres au pied de page** (`Footer.astro`), indépendantes des
couleurs de marque : module « Charte graphique », onglet « Pied de page »
(fond et texte, contraste vérifié l'un sur l'autre, aperçu ; en mode sombre,
fond et texte à part). Réglage `pied:` de `src/content/reglages.yaml`
(`src/lib/pied.ts`) :

```yaml
pied:
  fond: '#1f2937'
  texte: '#ffffff'
  sombre:              # facultatif
    fond: '#161b22'    # absent = surfaces de la palette sombre
    texte: '#e6edf3'   # absent = texte de la palette sombre
```

- `fond` absent (sites d'avant ce réglage) = couleur secondaire, comme
  avant ; l'admin l'écrit au premier enregistrement de la charte (aussi
  quand on change la couleur secondaire) : le pied ne la suit plus ensuite.
  `texte` absent = blanc.
- En mode sombre, le pied prend par défaut les **surfaces et le texte de la
  palette sombre** (cohérent avec l'en-tête) ; une valeur égale à la
  palette n'est pas écrite, elle la suit.
- CSS : `--color-pied` / `--color-pied-texte` (`@theme` de `global.css`,
  remplacées par `themeCss` via `piedCss()`), classes `bg-pied`,
  `text-pied-texte`, `text-pied-texte/80`, `border-pied-texte/10`. Les
  bandeaux en dégradé (`PageHeader`, `CtaSection`) gardent
  `from-primary to-secondary`.

## Polices

Deux rôles : **titres** (`h1`…`h6`, classe `font-heading`) et **texte**
(tout le reste, `body`). Réglés dans `polices:` de `src/content/reglages.yaml`,
depuis l'Espace Admin : menu **Paramètres** → module **Charte
graphique** → onglet **Polices**. Sans réglage : **Montserrat** (titres) et
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
| `logo.(png\|jpg\|webp\|svg)` | **Obligatoire.** En-tête et pied de page, via `<Image>` (`astro:assets` : redimensionné, converti en WebP au build). Largeur calculée d'après ses proportions (`logoWidth()`) : carré, large ou haut, il n'est ni rogné ni déformé. Affiché sur 64 px de haut au plus et, dans l'en-tête, 16 rem de large au plus (60 % de l'écran sur mobile ; pied de page : 18 rem) : un logo très large est réduit plutôt que de pousser le menu. Fond transparent conseillé. |
| `logo-sombre.(png\|jpg\|webp\|svg)` | Facultatif. Logo de l'en-tête en **mode sombre** (version claire du logo), mêmes règles que `logo.*` ; absent = logo normal. Déposé depuis la charte graphique, section « Mode sombre ». |
| `accueil.(jpg\|png\|webp)` | Facultatif. Photo de fond du bandeau d'accueil ; absente = bandeau sans photo. Réglable depuis l'Espace Admin : module « Pages » → Accueil → module « Bandeau ». |
| `presentation.(jpg\|png\|webp\|svg)` | Facultatif. Illustration du module « Présentation » de l'accueil (option « Illustration propre au module »), affichée entière ; transparence gardée. Réglable depuis l'Espace Admin : module « Pages » → Accueil → module « Présentation ». |
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
