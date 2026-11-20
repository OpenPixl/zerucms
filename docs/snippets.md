# Bibliothèque de snippets

Blocs prêts à copier-coller, **tirés du code réel du projet**. Chaque snippet
renvoie à la doc qui détaille les champs. Deux parties :

- [Contenu](#contenu-éditeurs) — ce qu'on écrit dans `src/content/` (aucun
  code à toucher) ;
- [Développement](#développement) — composants et motifs utilisés dans
  `src/pages/`, `src/components/` et les routes API.

> Règle d'or côté contenu : valeurs du frontmatter **entre guillemets
> doubles**, dates au format `AAAA-MM-JJ`.

---

## Contenu (éditeurs)

### Frontmatter d'une actualité

`src/content/news/AAAA-MM-JJ-mon-titre/index.md` (+ la photo citée par
`cover:`, dans le même dossier). Schéma : `src/content.config.ts`. Détail :
[actualites.md](actualites.md).

```markdown
---
title: "Fête de la Science 2026 : retrouvez-nous au Village des Sciences"
isPublish: true
publishAt: 2026-09-22
excerpt: "Une phrase de résumé, reprise dans les cartes et le partage."
tag: "Vie associative"
author: "numérik&Co"
cover: ./cover.jpg
imageCredit: "Photo : Prénom Nom / Source"
---
```

### Frontmatter d'une activité

`src/content/activites/<slug>/index.md` (+ la photo citée par `cover:`). Schéma : `src/content.config.ts`. Détail :
[activites.md](activites.md), bouton « S'inscrire » : [inscription.md](inscription.md#présélection).

```markdown
---
title: "Atelier — Intelligence artificielle : comprendre pour mieux choisir"
isPublish: true
excerpt: "L'IA, oui — mais laquelle, et pour quoi faire ?"
category: "ateliers"            # parcours | ateliers | mediation-numerique | fablab
activiteGrist: "Module IA"      # nom Grist visé par « S'inscrire » (liste possible, « Initiation* » = préfixe)
# typeGrist: "Atelier CN"       # ou un type Grist entier
# inscription: false            # masque le bouton « S'inscrire »
level: "Initiation"
cover: ./cover.jpg
imageCredit: "Photo : Prénom Nom / Pexels"
order: 10
---
```

Plusieurs créneaux Grist pour une même fiche :

```markdown
activiteGrist:
  - "Initiation Mardi 16h30"
  - "Initiation Jeudi 16h30"
```

### Frontmatter d'une page de contenu

`src/content/pages/<slug>/index.md` → URL `/<slug>`. Détail :
[pages.md](pages.md), menu : [navigation.md](navigation.md).

```markdown
---
title: "Adhérer en tant qu'association"
description: "Phrase affichée sous le titre et reprise en description SEO."
menu:
  show: true        # false = page accessible mais absente du menu
  order: 40
  label: "Associations partenaires"   # libellé du menu, si différent du titre
---
```

### Page réservée (Espace Admin)

`src/content/pages/espace-benevoles/<slug>/index.md` → `/espace-benevoles/<slug>`,
cf. [auth.md](auth.md#réserver-une-page-de-contenu). Jamais dans le menu.

```markdown
---
title: "Fiches animateur·rice·s"
access: animateur          # absent = toute personne connectée ; [animateur, admin]…
---
```

### Menu déroulant (dossier de pages)

`src/content/pages/<dossier>/_group.md` — toutes les pages du dossier
deviennent les entrées d'un menu déroulant. Détail : [navigation.md](navigation.md).

```markdown
---
# Le libellé n'est pas cliquable : seules les pages enfants ont un lien.
label: "Association"
order: 10
---
```

### Annonce dans la bannière

À ajouter dans la liste de `src/content/annonces.yaml` (ordre du fichier = ordre
de défilement). Détail : [annonces.md](annonces.md).

```yaml
- id: "ag-2026"
  title: "Assemblée générale 2026"
  message: "Notre assemblée générale annuelle approche. Votre présence compte."
  startDate: "2026-08-20"
  endDate: "2026-09-18"
  tone: "info"                 # info | accent | urgent
  icon: "fa-calendar-days"
  ctaLabel: "Voir les détails"
  ctaHref: "/actualites/2026-08-17-assemblee-generale-2026"
```

### Markdown courant

```markdown
## Infos pratiques

- **Date** : samedi 3 octobre 2026
- **Lieu** : place de la Mairie, Mont-de-Marsan

> Plus d'informations sur le [site de la Fête de la Science](https://www.fetedelascience.fr/).

Voir le détail des [tarifs 2026-2027](/adherer).
```

Les titres `##` alimentent le sommaire de la colonne de droite.

### Blocs (pages enrichies)

La page déclare `type: enrichie` et ses blocs ; chaque bloc s'affiche à
l'endroit de son marqueur, seul sur sa ligne. Catalogue et champs :
`src/lib/blocs.ts` ; exemple complet :
`src/content/pages/association/adhesion-associations/index.md`. Le module
« Pages » de l'Espace Admin produit exactement ce format.

```md
---
title: "Titre"
type: enrichie
blocs:
  apports:
    type: cartes
    colonnes: "2"            # ou "3"
    items:
      - icone: cloud         # Font Awesome solid, sans « fa- »
        titre: "Titre de la carte"
        texte: "Texte **gras**, [liens](/contact) et listes « - » acceptés."
  cotisation:
    type: tarif
    libelle: "Adhésion structure, valable de septembre à juin"
    montant: "110 € / an"
  contact:
    type: bouton
    texte: "Nous contacter"
    lien: "/contact"
    style: primary           # primary | secondary | outline
  important:
    type: encart
    style: attention         # info | attention | succes
    titre: "À savoir"
    texte: "Texte **Markdown**."
  galerie:
    type: photos
    colonnes: auto           # auto | "1" | "2" | "3"
    items:                   # fichiers du dossier de la page (choisis dans le module)
      - photo: ./photo_1.jpg
        alt: "Ce que montre la photo"
        legende: "Légende facultative"
  diaporama:
    type: carrousel
    fleches: oui             # oui | non
    points: oui              # pastilles de navigation
    auto: non                # défilement automatique
    delai: "5"               # secondes (si auto : oui) : 3 | 5 | 8 | 12
    items:                   # 2 photos au moins, mêmes champs que « photos »
      - { photo: ./photo_1.jpg, alt: "…" }
      - { photo: ./photo_2.jpg, alt: "…" }
  presentation:
    type: video
    lien: "https://www.youtube.com/watch?v=…"   # YouTube, Vimeo, Framatube, peertube.fr
    titre: "Titre de la vidéo"
    legende: "Légende facultative"
  rdv:
    type: rdv                # plugin rdv actif ; titre / texte facultatifs
---

## Ce que l'adhésion vous apporte

[[bloc:apports]]

[[bloc:cotisation]]

[[bloc:contact]]
```

### Valeur tirée de la configuration

Évite de recopier nom, adresse… qui changent d'un déploiement à l'autre
(liste : `src/lib/page-variables.ts`, exemple :
`src/content/pages/mentions-legales/index.md`).

```md
L'association **{{association.nom}}** est présidée par {{association.president}}.
Siège social : {{association.adresse}}
```

---

## Développement

### Page applicative (`.astro`) avec en-tête

Détail : [pages.md](pages.md#ajouter-une-page-applicative-astro).

Modèle : `src/plugins/activites/pages/inscription.astro`.

```astro
---
import Layout from '../layouts/Layout.astro';
import PageHeader from '../components/sections/PageHeader.astro';
import { association } from '../lib/association';
---

<Layout
	title={`Titre de la page · ${association.name}`}
	description="Description SEO de la page."
	breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Titre de la page' }]}
>
	<PageHeader slot="page-header" title="Titre de la page" description="Sous-titre facultatif." />

	<section class="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-6">
		…
	</section>
</Layout>
```

`PageHeader` va dans le slot `page-header` du layout (bandeau pleine largeur).

### Sections de l'accueil

```astro
<RdvCtaSection />

<CtaSection
	title="Envie de nous rejoindre ?"
	description={`Bénévoles, adhérent·e·s ou partenaires : chacun·e a sa place chez ${association.name}.`}
	buttonLabel="Adhérer à l'association"
	buttonHref="/adherer"
/>
```

`RdvCtaSection` (plugin `rdv`, `src/plugins/rdv/sections/`, à n'afficher
que si `pluginActif('rdv')`) accepte aussi `eyebrow`, `title`, `description`,
`buttonLabel`, `buttonHref` ; sans valeur : `encart:` de `src/content/rdv.yaml`.
Détail : [composants.md](composants.md).

### Planning de la semaine

```astro
---
import WeeklyAgenda from '../components/sections/WeeklyAgenda.astro';
import { permanencesAffichees } from '../plugins/rdv';
---

<WeeklyAgenda sessions={permanencesAffichees()} showHeading={false} />
```

`sessions` est obligatoire (plus de planning figé) ; `/activites` passe les
permanences + les créneaux lus dans Grist. Props : `sessions`, `notice`
(avertissement au-dessus de la grille), `showHeading`, `title`,
`description`, `showLegend`, `startHour`, `endHour`, `class`.

### Formulaire ouvert / fermé

1. Déclarer la clé et ses valeurs par défaut dans `DEFAULTS.forms` (`src/config/site.ts`) ; chaque asso peut ensuite l'ouvrir/fermer dans `src/content/reglages.yaml` :

```ts
forms: {
	monFormulaire: {
		enabled: true,
		closedTitle: 'Formulaire momentanément fermé',
		closedMessage: "Ce formulaire n'est pas ouvert actuellement. …",
	},
},
```

2. Entourer le formulaire (voir `src/plugins/activites/pages/inscription.astro`). Le slot
   `fallback`, facultatif, s'affiche sous l'encart quand le formulaire est
   fermé :

```astro
<FormGate form="monFormulaire">
	<form class="space-y-4">…</form>

	<Button slot="fallback" href="/contact" variant="primary">Nous contacter</Button>
</FormGate>
```

3. Masquer un bouton ailleurs quand le formulaire est fermé :

```astro
---
import { isFormOpen } from '../lib/forms';
const visible = isFormOpen('monFormulaire');
---
{visible && <Button href="/mon-formulaire">Accéder au formulaire</Button>}
```

Détail : [composants.md](composants.md#forms).

### Partage et image d'article

```astro
<ShareTools title={title} />

<FigureImage image={cover} alt={title} caption={imageCredit} loading="eager" />
```

`ShareTools` : `url` facultative (défaut = URL publique de la page).
Détail : [partage.md](partage.md).

### Îlot Vue

```astro
---
import InscriptionForm from '../formulaire/InscriptionForm.vue';
---

<FormGate form="inscription">
	<InscriptionForm client:load />

	<Button slot="fallback" href="/contact" variant="primary">Nous contacter</Button>
</FormGate>
```

Côté navigateur, on ne parle jamais à Grist : on passe par les routes
`/api/*` via un client typé : celui du plugin (ex.
`src/plugins/adhesion/formulaire/adhesion/client.ts`) ou, pour les routes
communes au document Grist de l'association, `src/lib/grist-asso/client.ts` :

```ts
import { membresApi } from '../../../lib/grist-asso/client';

const res = await membresApi.retrouverMembre({ nom, prenom });
```

### Route API Grist

Motif de toutes les routes `src/plugins/<id>/api/*.ts` (nouvelle route =
le fichier + sa ligne dans `routes` du `plugin.ts` du plugin ; route commune
à plusieurs plugins : `src/lib/grist-asso/api/` + `routesGristAsso()`) : rendu serveur,
validation du corps, erreurs Grist relayées avec leur statut. Détail :
[api.md](api.md).

```ts
import type { APIRoute } from 'astro';
import { COLS, GristError, listRecords, TABLES } from '../lib/grist';
import { json } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Requête invalide.' }, 400);
	}
	const { membreId } = body as Record<string, unknown>;
	if (typeof membreId !== 'number') {
		return json({ error: 'membreId requis.' }, 400);
	}

	try {
		const [membre] = await listRecords(TABLES.membres, { id: [membreId] });
		if (!membre) return json({ error: 'Membre inconnu.' }, 400);
		// … createRecord / updateRecord …
		return json({ ok: true });
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/adhesion/ma-route]', err);
		return json({ error: "Échec de l'opération." }, status);
	}
};
```

Toujours passer par `COLS.*` / `TABLES.*` plutôt que d'écrire les noms de
colonnes Grist en dur ; une nouvelle colonne s'ajoute dans `COLS`
(`src/lib/grist-asso/grist.ts`).

### Module de l'Espace Admin

Panneau latéral ouvert depuis la barre admin, cf. [auth.md](auth.md#ajouter-un-module).

```ts
// src/components/admin/modules.ts — entrée de ADMIN_MODULES
{
	id: 'rdv',
	label: 'Rendez-vous',
	icon: 'fa-calendar-check',
	groups: ['admin'], // [] = toute personne connectée
	component: defineAsyncComponent(() => import('./modules/RdvModule.vue')),
},
```

```vue
<!-- src/components/admin/modules/RdvModule.vue -->
<script setup lang="ts">
import { inject } from 'vue';
import { ApiError } from '../client';
import { ADMIN_CONTEXT } from '../context';

const { user, sessionExpired } = inject(ADMIN_CONTEXT)!;
// appel API : catch (e) { if (e instanceof ApiError && e.status === 401) sessionExpired(); }
</script>
```

Bouton qui ouvre la connexion, n'importe où : `<button type="button" data-auth-open>Se connecter</button>`.

### Champs de formulaire

Tous les champs du site (pages publiques, plugins, Espace Admin) partagent
les classes de `src/styles/forms.css` : hauteur, bordure, focus et erreur se
règlent **là seulement** (`--champ-hauteur` : `2rem` = `h-8`, texte centré
verticalement ; textarea : `--champ-py`).

```vue
<input v-model="nom" type="text" class="mt-1 champ" />
<select v-model="statut" :class="['mt-1 champ', { 'champ-erreur': erreur }]">…</select>
<textarea rows="4" class="mt-1 champ font-mono"></textarea>

<!-- préfixe + champ : la bordure va sur le conteneur -->
<div class="mt-1 champ-groupe">
	<span>/activites/</span>
	<input v-model="slug" type="text" />
</div>
```

Libellés, aides et messages, mêmes fichier et principe :

```vue
<label for="nom" class="champ-libelle">Nom</label>
<input id="nom" v-model="nom" :class="['mt-1 champ', { 'champ-erreur': erreurs.nom }]" />
<p v-if="erreurs.nom" class="champ-erreur-texte">{{ erreurs.nom }}</p>
<p v-else class="champ-aide">Tel qu'il apparaîtra sur la carte d'adhérent·e.</p>

<p v-if="erreurEtape" class="mt-3 message-erreur">Choisissez un créneau.</p>
<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>
<p v-if="done" class="alerte-succes" role="status">Enregistré.</p>
<p class="alerte-attention">Mot de passe provisoire : choisissez-en un nouveau.</p>
```

Espace Admin : `inputClass` (`mt-1 champ`) et `compactInputClass`
(`champ`, largeur à ajouter) de `src/components/admin/context.ts`. Une classe
Tailwind ajoutée à côté (`w-28`, `pl-9`…) l'emporte toujours (couche
`components`). Cases à cocher et radios ne sont pas concernés.

### Boutons de formulaire

Même fichier, même principe : `bouton` + une couleur, jamais de chaîne
recopiée. Hauteur = celle des champs (`h-8` minimum, contenu centré ; `--bouton-px`).

| Classe | Usage |
| :--- | :--- |
| `bouton-primaire` | action principale (enregistrer, envoyer) |
| `bouton-accent` | étapes des formulaires publics, retour à la liste |
| `bouton-contour`, `bouton-accent-contour` | action secondaire |
| `bouton-neutre` | annuler, précédent |
| `bouton-danger`, `bouton-danger-contour` | supprimer |
| `bouton-mini` | plus petit (barre d'admin, listes) |
| `bouton-grand` | lien d'appel (Hero, encarts) |

```vue
<button type="submit" class="bouton bouton-accent mt-6" :disabled="busy">Continuer</button>
<button type="button" class="bouton bouton-neutre" @click="retour">Précédent</button>
```

Côté `.astro` : `<Button>` (`src/components/ui/Button.astro`) les utilise ;
un lien (`href`) est `grand` par défaut, un `<button>` à la taille des champs
(`size="grand"` / `"normal"` pour forcer).

### Classes Tailwind récurrentes

| Usage | Classes |
| :--- | :--- |
| Carte | `rounded-2xl border border-gray-100 bg-white p-6 shadow-sm` |
| Titre de carte | `font-heading text-lg font-semibold text-gray-900` |
| Texte secondaire | `text-sm font-light text-gray-600` |
| Pastille d'icône | `flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-xl text-primary` |
| Bouton d'action (formulaires) | `bouton bouton-accent` (voir [Boutons de formulaire](#boutons-de-formulaire)) |
| Message d'erreur | `alerte-erreur` (voir [Champs de formulaire](#champs-de-formulaire)) |

Couleurs (`primary`, `secondary`, `accent`) et polices : [theme.md](theme.md).
