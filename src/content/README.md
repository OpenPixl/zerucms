# Rédiger le contenu du site

Ce dossier contient **tout ce qu'un éditeur a besoin de modifier**. Pas besoin
de toucher au code : créer une page = créer un fichier Markdown.

Il est propre à chaque association et n'est pas suivi par git. Sur un nouveau
site, il est rempli au premier lancement avec le **contenu de démonstration**
de `src/modeles/association/` (« Mon association », logo neutre, exemples à
remplacer), personnalisable ensuite depuis l'Espace Admin.

## Où va quoi

| Dossier | Contenu |
| --- | --- |
| `pages/` | Pages « éditoriales » (présentation, statuts, mentions légales…), photo citée par `cover:` ; `pages/espace-benevoles/` = pages réservées |
| `news/` | Articles d'actualité (un dossier par article ; photo citée par `cover: ./cover.jpg` dans le frontmatter) — voir `docs/actualites.md` |
| `activites/` | Fiches d'activité (un dossier par fiche) et leurs catégories (`_categories.yaml`) ; aussi gérables depuis le module « Activités » de l'Espace Admin — voir `docs/activites.md` |
| `annonces.yaml` | Annonces de la bannière en haut du site (liste, ordre = ordre de défilement) — voir `docs/annonces.md` |
| `reglages.yaml` | Couleurs du site, bouton « Adhérer », lien « Je participe », partage, ouverture/fermeture des formulaires, plugins activés (`plugins:`, ex. prise de RDV) (commentaires dans le fichier) — couleurs modifiables aussi depuis l'Espace Admin, module « Association » (onglet Charte graphique) |
| `partenaires.yaml` | Partenaires (cartes de la page Adhérer et de l'accueil), relais d'adhésion, avantages adhérent·e·s (commentaires dans le fichier) |
| `rdv.yaml` | Prise de rendez-vous en ligne (plugin `rdv`, à activer dans `reglages.yaml`) : adresse de la page, textes, encart d'accueil, permanences (jours, horaires, lieux), zones géographiques (commentaires dans le fichier) — voir `src/plugins/rdv/README.md` |
| `images/` | Logo (`logo.png`, obligatoire), photo d'accueil (`accueil.jpg`), icône d'onglet (`favicon.svg` / `.ico`) — remplacer le fichier en gardant le nom, ou logo et icône depuis l'Espace Admin (module « Association », onglet Charte graphique) ; voir `docs/theme.md` |
| `association.yaml` | Nom, coordonnées, réseaux sociaux et mentions légales de l'association (commentaires dans le fichier) — modifiable aussi par le bureau depuis l'Espace Admin, module « Association » (onglet Généralités) |

Les pages du site (Accueil, Activités, Actualités, Contact) sont fournies par
le template : on les active et on règle leurs textes depuis le module
« Pages » (fichier `pages/_pages-site.md`, voir plus bas). Le bouton
**Adhérer**, les outils de partage et l'ouverture des formulaires se règlent
dans `reglages.yaml`.

---

## Créer une page

> **Le plus simple** : module **« Pages »** de la barre d'administration
> (rédacteur·rice·s et bureau) — créer, modifier, déplacer, supprimer pages
> et menus déroulants sans toucher aux fichiers. Ce qui suit décrit les fichiers qu'il
> écrit, pour qui préfère les éditer à la main.

1. Créer un dossier dans `pages/` et y placer un fichier `index.md` :

   ```
   src/content/pages/notre-projet/index.md   ->  page accessible sur /notre-projet
   ```

2. En tête du fichier, un bloc **frontmatter** (entre `---`) :

   ```md
   ---
   title: "Notre projet"
   description: "Résumé affiché sous le titre et dans les moteurs de recherche."
   menu:
     show: true      # true = la page apparaît dans la barre de navigation
     order: 15        # ordre d'apparition (petit = plus à gauche)
     label: "Projet"  # facultatif : texte du menu s'il doit différer du titre
   ---

   Le contenu de la page, en **Markdown**…
   ```

3. C'est tout. La route et l'entrée de menu sont générées automatiquement au
   déploiement.

### Ajouter une image de couverture

Placer la photo à côté de `index.md` et la citer dans le frontmatter avec
`cover:` (chemin relatif au dossier) : elle s'affiche en haut de la page. Le
champ optionnel `imageCredit` affiche un crédit sous l'image (utile pour
respecter la licence d'une photo libre de droit) :

```md
---
title: "Notre projet"
cover: ./cover.jpg
imageCredit: "Photo : Prénom Nom / Source (licence)"
---
```

Si le fichier cité n'existe pas, le site refuse de se construire et indique
la page en cause.

### Page enrichie (blocs)

Une page peut recevoir des **blocs** prêts à l'emploi (grille de cartes,
encadré tarif, bouton, encadré d'information, rendez-vous du Conseiller
Numérique) : `type: enrichie`, les blocs décrits sous `blocs:`, et un
marqueur **seul sur sa ligne** à l'endroit où chacun doit s'afficher :

```md
---
title: "Adhérer en tant qu'association"
type: enrichie
blocs:
  cotisation:
    type: tarif
    libelle: "Adhésion structure, valable de septembre à juin"
    montant: "110 € / an"
  contact:
    type: bouton
    texte: "Nous contacter"
    lien: "/contact"
---

## Cotisation

[[bloc:cotisation]]

[[bloc:contact]]
```

Types et champs : `src/lib/blocs.ts` (exemple complet :
`pages/association/adhesion-associations/index.md`). Un bloc inconnu, un
champ obligatoire manquant ou un marqueur sans bloc empêchent le site de se
construire, avec un message qui nomme la page.

### Informations de l'association dans le texte

`{{association.nom}}`, `{{association.email}}`, `{{association.adresse}}`…
sont remplacés par les valeurs configurées pour le site
(`src/content/association.yaml`) : pas de recopie qui se périme. Liste complète :
`src/lib/page-variables.ts` (exemple : `pages/mentions-legales/index.md`).

### Page accessible mais absente du menu

Ne pas mettre de bloc `menu:`, ou mettre `show: false` :

```md
---
title: "Statuts"
menu:
  show: false
---
```

La page reste consultable via son URL (utile pour les liens de pied de page).

### Page réservée au bureau ou aux animateur·rice·s

Ranger la page dans le dossier **`pages/espace-benevoles/`** : elle n'est
visible qu'après connexion (lien « Espace Admin » en pied de page), son
adresse commence par `/espace-benevoles/` et elle n'apparaît jamais dans le
menu public. Les personnes autorisées la retrouvent dans « Pages réservées »
de la barre d'administration (dans le module « Pages » pour le bureau et
les rédacteur·rice·s).

```
src/content/pages/espace-benevoles/fiches-animateurs/index.md  ->  /espace-benevoles/fiches-animateurs
```

Par défaut, toute personne connectée y a accès. `access:` restreint à
certains groupes :

```md
---
title: "Fiches animateur·rice·s"
access: animateur        # ou : admin, redacteur, [animateur, admin]
---
```

`access:` n'est accepté que dans ce dossier (ailleurs, la page serait publiée
en clair : le site refuse alors de se construire). Ces pages demandent un
serveur Node ; tout le reste du site est statique.

Les comptes se gèrent dans le module « Comptes » de la barre d'administration (bureau uniquement).

---

## Créer un menu déroulant (sous-menu)

La **structure des dossiers** décide du regroupement. Toutes les pages rangées
dans un même sous-dossier de `pages/` deviennent les entrées d'un même menu
déroulant.

```
pages/
  association/
    _group.md                     <- décrit le menu déroulant
    notre-histoire/index.md        -> /association/notre-histoire
    conseiller-numerique/index.md  -> /association/conseiller-numerique
```

Le fichier `_group.md` donne le **libellé et la position** du menu déroulant :

```md
---
label: "Association"
order: 10
---
```

> Le libellé du menu déroulant **n'est pas cliquable** : seules les pages
> enfants ont un lien. Si `_group.md` est absent, le libellé est déduit du nom
> du dossier (`association` → « Association »).

Chaque page enfant garde son propre bloc `menu:` (`show`, `order`, `label`) qui
contrôle sa présence et sa position **dans le menu déroulant**.

---

## Ordre des entrées

Tout est trié par `order` (les pages de contenu et les pages du template sont
mélangées sur la même échelle). Repères actuels :

| `order` | Entrée |
| --- | --- |
| 0 | Accueil |
| 10 | Association (menu déroulant) |
| 20 | Activités |
| 30 | Actualités |
| 40 | Contact |

Choisir un `order` intermédiaire (ex. `25`) pour intercaler une nouvelle page.

Activation, libellé, position, visibilité et textes d'Accueil, Activités,
Actualités et Contact se règlent depuis le module « Pages », qui écrit
seulement ce qui diffère des valeurs d'origine dans `pages/_pages-site.md` :

```yaml
---
pages:
  contact:
    label: "Nous écrire"
    order: 5
    textes:
      titre: "Écrivez-nous"
  actualites:
    show: false     # retiré du menu, la page reste accessible
  activites:
    active: false   # page désactivée : absente du site (404)
---
```

Les noms des textes de chaque page sont dans `src/lib/site-pages.ts`.

---

## Récapitulatif des champs frontmatter

### Page — `pages/<...>/index.md`

| Champ | Requis | Rôle |
| --- | --- | --- |
| `title` | oui | Titre de la page (onglet, en-tête, fil d'ariane) |
| `description` | non | Chapô sous le titre + méta description SEO |
| `menu.show` | non | `true` pour afficher dans la navigation (défaut : masqué) |
| `menu.order` | non | Position dans son niveau (défaut : `99`) |
| `menu.label` | non | Texte du menu si différent de `title` |
| `cover` | non | Photo, chemin relatif au dossier (`./cover.jpg`) |
| `imageCredit` | non | Crédit affiché sous la photo |
| `type` | non | `enrichie` pour une page à blocs (défaut : `classique`) |
| `blocs` | non | Blocs d'une page enrichie, par identifiant (voir plus haut) |
| `access` | non | Pages réservées seulement : groupe(s) autorisé(s) |

### Menu déroulant — `pages/<dossier>/_group.md`

| Champ | Requis | Rôle |
| --- | --- | --- |
| `label` | non | Libellé du menu déroulant (défaut : nom du dossier) |
| `order` | non | Position du menu déroulant dans la navbar (défaut : `50`) |
