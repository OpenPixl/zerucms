# Plugin « activites » : planning et inscription aux activités

Ce que le site tire de la table Grist `Activite` du **document de
l'association** (code commun : [`src/lib/grist-asso/`](../../lib/grist-asso/)),
en deux **outils** allumés par défaut, à éteindre un à un (interrupteurs de
la page de configuration du module **Plugins**, ou `outils:` de
`reglages.yaml`) :

| Outil | Contenu | Éteint |
| :--- | :--- | :--- |
| `planning` — Planning des activités | calendrier de la semaine de la page `/activites` (`lib/planning.ts`, [api.md](../../../docs/api.md)) | Grist n'est plus lu ; le calendrier disparaît, sauf s'il reste des séances d'extension (ex. permanences de RDV) |
| `inscription` — Inscription aux activités | page `/inscription` et bouton **« S'inscrire »** des fiches ([inscription.md](../../../docs/inscription.md)) | page et routes `/api/inscription/*` en 404, plus de bouton « S'inscrire » ni de réglages d'inscription dans le module « Activités » |

```yaml
outils:
  activites:
    planning: false
```

Les fiches d'activité elles-mêmes (`src/content/activites/`, module
« Activités ») ne dépendent pas de ce plugin.

**Actif par défaut**, indépendant des plugins [`adhesion`](../adhesion/README.md)
et [`presence`](../presence/README.md). `plugins: { activites: false }` (ou la
case « Plugin actif ») éteint ses deux outils. Jusqu'à la 0.5.22, planning
et inscription faisaient partie du plugin adhésion (et du plugin
`inscription`) : `plugins.inscription: false` reste reconnu (outil éteint,
réécrit sous `outils:` au premier enregistrement), et sans valeur écrite le
plugin suit `plugins.adhesion` (`heriteDe`).

## Organisation

| Fichier / dossier | Contenu |
| :--- | :--- |
| `plugin.ts` | Manifeste : page `/inscription`, routes `/api/inscription/*` et routes communes `membre`, `inscription` (outil `inscription`) |
| `index.ts` | Ce que le reste du site utilise : `planningActivites()`, `planningAffiche()`, `inscriptionEnLigne()`, `INSCRIPTION_HREF` |
| `lib/planning.ts` | Séances de la semaine lues dans `Activite` |
| `pages/inscription.astro` | Page, formulaire entouré de `<FormGate form="inscription">` |
| `formulaire/` | Îlot Vue `InscriptionForm.vue` (3 étapes : profil, activité, récapitulatif) et son client (`inscriptionApi`, `membresApi` commun) |
| `api/offre.ts` | `GET /api/inscription/offre` : activités proposées (cible de la fiche ou toutes les publiées), tarifs, places |
| `api/preinscription.ts` | `POST /api/inscription/preinscription` : intérêt noté dans `Membres.Commentaires` |
| `api/participant-exterieur.ts` | `POST /api/inscription/participant-exterieur` : fiche `Membres` minimale (rôle Contact) |
