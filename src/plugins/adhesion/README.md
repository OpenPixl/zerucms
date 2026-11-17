# Plugin « adhesion » : adhésion en ligne

**Adhésion en ligne** : page `/adherer` (présentation, relais partenaires)
et formulaire `/adherer/formulaire` (nouvelle adhésion ou renouvellement,
membres rattachés, cotisation, activité choisie), **bulletin PDF** signé,
bouton « Adhérer » de la barre de navigation.

Il lit le **document Grist de l'association** (tables `Membres`,
`Adhesions`, `Cotisation`, `Activite`, `Inscription`, `Saisons`), comme les
plugins [`activites`](../activites/README.md) (planning, inscription aux
activités) et [`presence`](../presence/README.md) (« Je participe »). Les
trois sont **indépendants** : le code commun (client Grist, types, routes
`/api/adhesion/membre`, `membres` et `inscription`) est dans
[`src/lib/grist-asso/`](../../lib/grist-asso/).

**Actif par défaut** (`actifParDefaut` du catalogue) : rien à écrire dans
`src/content/reglages.yaml`. Pour le retirer d'un site :

```yaml
plugins:
  adhesion: false
```

ou la case « Plugin actif » du module **Plugins** de l'Espace Admin
(super admin). Voir aussi [les plugins](../README.md) (activation,
organisation).

> Jusqu'à la 0.5.22, ce plugin portait aussi le planning, la présence et
> l'inscription. Un site qui avait écrit `adhesion: false` sans rien dire
> des plugins `activites` et `presence` les garde coupés (`heriteDe` du
> catalogue) ; le premier enregistrement depuis le module « Plugins » écrit
> leur état.

## Plugin inactif

- `/adherer`, `/adherer/formulaire` et les routes `/api/adhesion/*` du
  formulaire n'existent pas (404) ; les routes communes restent si
  `activites` ou `presence` s'en servent ;
- le bouton « Adhérer » de la barre de navigation (si son lien mène à
  `/adherer`), le bouton « Nous rejoindre » du bandeau d'accueil et celui de
  l'encart d'appel à l'action disparaissent (`lienPluginIndisponible()`,
  `src/lib/liens-plugins.ts`) ;
- plan du site et liens proposés dans l'Espace Admin : sans ces pages.

## Mise en place

`.env` (voir [api.md](../../../docs/api.md#variables-denvironnement)) :
`GRIST_BASE_URL`, `GRIST_API_KEY` (partagés avec les autres plugins et les extensions),
`GRIST_DOC_ID`, et si besoin les noms de tables `GRIST_TABLE_*` (communs aux
trois plugins : `ENV_GRIST_ASSO`) ; pour le bulletin PDF, `GOTENBERG_URL`
(partagé) et `BULLETIN_SECRET` ([bulletin-pdf.md](../../../docs/bulletin-pdf.md)).
Ouverture et fermeture du formulaire : `forms.adhesion` de `reglages.yaml`.

## Organisation

| Dossier | Contenu |
| :--- | :--- |
| `plugin.ts` | Manifeste : pages, routes (`API` = routes `/api/adhesion/<nom>` du formulaire, plus les routes communes `routesGristAsso()`), `BULLETIN_SECRET` |
| `index.ts` | Ce que le reste du site utilise : `ADHESION_HREF`, `FORMULAIRE_HREF` |
| `pages/` | `adherer.astro`, `formulaire.astro` (`/adherer/formulaire`) |
| `api/` | Routes `/api/adhesion/*` du formulaire (cotisations, co-membres, contact, bulletin…) |
| `formulaire/adhesion/` | Îlot Vue du formulaire d'adhésion et son client `adhesionApi` (`membresApi` commun compris) |
| `lib/` | `bulletin.ts` (lien signé, PDF), `validation.ts` (formulaire) |

Détail des routes et des colonnes Grist : [api.md](../../../docs/api.md) ;
parcours : [adhesion-parcours.md](../../../docs/adhesion-parcours.md) ;
bulletin : [bulletin-pdf.md](../../../docs/bulletin-pdf.md).
