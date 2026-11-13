# Plugin « adhesion » : adhésion et activités

Tout ce qui s'appuie sur le **document Grist de l'adhésion** (tables
`Membres`, `Adhesions`, `Cotisation`, `Activite`, `Inscription`, `Saisons`,
`Presence`) :

- **adhésion en ligne** : page `/adherer` (présentation, relais partenaires)
  et formulaire `/adherer/formulaire` (nouvelle adhésion ou renouvellement,
  membres rattachés, cotisation, activité choisie), **bulletin PDF** signé ;
- **présence** : page `/je-participe` (« Je participe » / « Je ne pourrai pas
  venir » pendant une séance) ;
- **planning** de la page `/activites` : séances de la semaine lues dans la
  table `Activite`.

L'**inscription aux activités** (`/inscription`, bouton « S'inscrire » des
fiches) est un plugin à part, [`inscription`](../inscription/README.md), qui
**requiert** celui-ci : il se sert de ses routes `/api/adhesion/membre` et
`/api/adhesion/inscription` (aussi utilisées par le formulaire d'adhésion) et
de son code (`lib/`, client du formulaire).

**Actif par défaut** (`actifParDefaut` du catalogue) : rien à écrire dans
`src/content/reglages.yaml`. Pour le retirer d'un site :

```yaml
plugins:
  adhesion: false
```

ou la case « Plugin actif » du module **Plugins** de l'Espace Admin
(super admin). Voir aussi [les plugins](../README.md) (activation,
organisation).

## Plugin inactif

- `/adherer`, `/adherer/formulaire`, `/je-participe` et les routes
  `/api/adhesion/*`, `/api/presence/*` n'existent pas (404) ;
- **le plugin inscription est inactif lui aussi** (il le requiert) ;
- le bouton « Adhérer » de la barre de navigation et « Je participe » (si
  leur lien mène à ces pages), le bouton « Nous rejoindre » du bandeau
  d'accueil et celui de l'encart d'appel à l'action disparaissent ;
- le planning de `/activites` n'affiche que les séances des extensions (ex. permanences de prise de RDV) ;
- plan du site et liens proposés dans l'Espace Admin : sans ces pages.

## Mise en place

`.env` (voir [api.md](../../../docs/api.md#variables-denvironnement)) :
`GRIST_BASE_URL`, `GRIST_API_KEY` (partagés avec les autres plugins et les extensions),
`GRIST_DOC_ID`, et si besoin les noms de tables `GRIST_TABLE_*` ; pour le
bulletin PDF, `GOTENBERG_URL` (partagé) et `BULLETIN_SECRET`
([bulletin-pdf.md](../../../docs/bulletin-pdf.md)). Ouverture et fermeture
du formulaire : `forms.adhesion` de `reglages.yaml`.

## Organisation

| Dossier | Contenu |
| :--- | :--- |
| `plugin.ts` | Manifeste : pages, routes (`API` = routes `/api/adhesion/<nom>`), variables d'environnement propres (`GRIST_DOC_ID`, `GRIST_TABLE_*`, `BULLETIN_SECRET`) |
| `index.ts` | Ce que le reste du site utilise : `planningActivites()`, `lienAdhesionIndisponible(href)` (aussi pour `/inscription`), adresses des pages |
| `pages/` | `adherer.astro`, `formulaire.astro` (`/adherer/formulaire`), `je-participe.astro` |
| `api/` | Routes `/api/adhesion/*` (membres, cotisations, adhésion, inscription à une activité, bulletin…) et `api/presence/` (`/api/presence/*`) |
| `formulaire/` | Îlots Vue : `adhesion/` (formulaire d'adhésion et son client `adhesionApi`, `get`/`post` réutilisés par le plugin inscription), `presence/` |
| `lib/` | Client Grist et mapping des colonnes (`grist.ts`, **seul endroit à modifier si le schéma change**), choix, types, validation, planning, présence, bulletin |

Outils partagés avec les autres plugins et les extensions, hors de ce dossier : `src/lib/http.ts`,
`src/lib/grist-error.ts`, `src/lib/gotenberg.ts`.

Détail des routes, des colonnes Grist et du planning :
[api.md](../../../docs/api.md) ; bulletin :
[bulletin-pdf.md](../../../docs/bulletin-pdf.md).
