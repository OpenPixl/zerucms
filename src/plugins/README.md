# Les plugins

Un **plugin** est un outil courant, livré avec le CMS, qu'une structure
active ou non selon son type (association ou auto-entrepreneur) : adhésion,
inscription, facturation… Tout son code est rangé dans un seul dossier,
`src/plugins/<id>/`, et il ne laisse aucune trace dans le site quand il est
inactif.

Un développement **propre à une structure** (ex. la prise de rendez-vous du
dispositif conseiller numérique de numérik&Co) n'est pas un plugin mais une
**extension** : dépôt à part, installée dans `extensions/<id>/` du seul site
qui l'utilise — voir [docs/extensions.md](../../docs/extensions.md).

| Plugin | Dossier | Contenu |
| :--- | :--- | :--- |
| `adhesion` | [`adhesion/`](adhesion/README.md) | Adhésion en ligne et bulletin PDF, présence, planning Grist — **actif par défaut**, associations seulement |
| `inscription` | [`inscription/`](inscription/README.md) | Inscription aux activités (`/inscription`, bouton « S'inscrire ») — **actif par défaut**, requiert `adhesion`, associations seulement |
| `facturation` | [`facturation/`](facturation/README.md) | Devis et factures dans Grist, PDF, page « Demander un devis » — **auto-entrepreneur seulement** |

## Activer ou désactiver un plugin

Depuis l'Espace Admin, module **« Plugins »** (super admin seul) :
activer / désactiver, avec publication, et ce qui manque à chaque plugin
(fichier de réglages, variable d'environnement). Ou à la main, dans
`src/content/reglages.yaml` (fichier de l'association, jamais remplacé par
une mise à jour) :

```yaml
plugins:
  facturation: true
  adhesion: false
```

**Les plugins sont inactifs par défaut** : si rien n'est écrit, le volet
n'existe pas sur le site. Exception : ceux marqués `actifParDefaut` dans le
catalogue (aujourd'hui `adhesion` et `inscription`), présents tant que
`reglages.yaml` ne dit pas `false`. Un plugin qui en **requiert** un autre
(`requiert` du catalogue : `inscription` → `adhesion`) est inactif quand
celui-ci l'est, quoi que dise son propre réglage ; le module « Plugins »
refuse de l'activer avant et prévient qu'en désactivant le premier, on
retire aussi le second. Changer la valeur demande de **reconstruire** le site
(`npm start` le fait tout seul au démarrage quand `src/content/` a changé ; en
dev, le serveur redémarre de lui-même).

⚠️ Avant de passer un site existant à une version qui introduit un plugin,
ajouter `plugins: <id>: true` à son `reglages.yaml` s'il utilisait déjà ce
volet, sinon il disparaît après la mise à jour.

Plugin inactif :

- ses pages et ses routes `/api/…` n'existent pas (404) : elles ne sont pas
  construites du tout ;
- ce qu'il ajoute ailleurs disparaît : module d'accueil, bloc de page, liens
  proposés dans l'Espace Admin, plan du site, permanences du planning…
- un module d'accueil ou un bloc déjà enregistré dans le contenu est gardé
  mais n'est plus affiché : il revient si on réactive le plugin.

## Organisation d'un plugin

```
src/plugins/
  catalogue.ts     ← liste des plugins (id, nom, description), sans dépendance
  index.ts         ← pluginActif(id), disponible(def) : utilisables partout
  manifests.ts     ← manifestes lus par la config Astro
  <id>/
    plugin.ts      ← manifeste : routes ajoutées si actif, variables d'environnement
    index.ts       ← ce que le reste du site utilise du plugin
    README.md      ← documentation du plugin
    pages/         ← pages publiques
    api/           ← routes /api/…
    formulaire/    ← îlots Vue des formulaires et leurs appels aux routes
    sections/      ← sections de page (accueil, blocs) et leurs définitions
    admin/         ← modules de l'Espace Admin
    lib/           ← code serveur
    images/        ← images propres au plugin
```

Un dossier vide n'est pas créé : chaque plugin n'a que ceux dont il a besoin.

### Comment ça marche

- **Réglage** : `site.plugins` (`src/config/site.ts`), validé avec le reste de
  `reglages.yaml` (clé inconnue = construction en échec).
- **Routes** : `src/integrations/plugins.ts` lit `reglages.yaml` au démarrage
  de la construction et ajoute (`injectRoute`) les routes du manifeste
  `plugin.ts` des seuls plugins actifs. Les pages d'un plugin ne sont donc
  **jamais dans `src/pages/`**.
- **Variables d'environnement** : déclarées dans le manifeste et ajoutées au
  schéma de `astro.config.mjs`, que le plugin soit actif ou non (son code est
  toujours vérifié par `astro check`).
- **Catalogues partagés** (modules d'accueil `src/lib/home-modules.ts`, blocs
  `src/lib/blocs.ts`) : le plugin y ajoute ses entrées depuis
  `sections/definitions.ts`, avec `plugin: '<id>'`. `disponible(def)` les
  retire de l'éditeur et du rendu quand le plugin est inactif.
- **Ailleurs** (planning, plan du site, liens) : `pluginActif('<id>')` ou une
  fonction de `<id>/index.ts` qui renvoie une liste vide si inactif.

### Outils partagés

Un plugin n'importe jamais le dossier d'un autre, sauf celui d'un plugin
qu'il **requiert** (`requiert` du catalogue : il est alors sûr qu'il est
actif) — ainsi `inscription` utilise le code et les routes d'`adhesion`. Ce
qui sert à des plugins indépendants
vit dans `src/lib/` — `http.ts` (`json`, `normalize`, type `Errors`),
`grist-error.ts` (`GristError`), `gotenberg.ts` (conversion HTML → PDF).
Les variables Grist communes (`GRIST_BASE_URL`, `GRIST_API_KEY`) et Gotenberg
sont déclarées dans `astro.config.mjs` ; le reste, dans le manifeste de chaque
plugin.

## Ajouter un plugin

1. Une entrée dans `PLUGINS` (`catalogue.ts`) : le réglage
   `plugins.<id>` est aussitôt reconnu, inactif par défaut (`actifParDefaut:
   true` pour un volet que la plupart des associations utilisent ;
   `requiert: ['<id>']` s'il se sert d'un autre plugin ; `structures` :
   types de structure à qui il est proposé, `src/lib/structure.ts`), et le plugin
   apparaît dans le module « Plugins » (`icon`, `doc`, `requis` = fichiers
   de `src/content/` sans lesquels l'activation est refusée, `env` =
   secrets du `.env` signalés si absents, `reglages` = fichier de
   `src/content/` et champs modifiables dans la page de configuration du
   module : `cle` à points, `groupe`, `type` — `adresse` (page publique,
   contrôlée contre les pages du site), `url`, `identifiant`, `table`, formats
   dans `src/plugins/champs.ts`, saisie mise en forme par `normaliserChamp()`
   (ex. `table` : « Démarches » → `Demarches`, comme l'identifiant Grist) —, `defaut`, `env` de repli, `obligatoire`).
   Le plugin lit ces valeurs dans son fichier avant le `.env`. Pour
   l'assistant d'installation : `secrets` (variables demandées, écrites dans
   `<DATA_DIR>/installation/secrets.env` ; `type` `url` / `identifiant` /
   `cle`, `obligatoire`, `genere` = créé au hasard sans être demandé) et
   `modele` (fichier de `src/content/` copié d'un modèle à l'activation
   s'il manque, ex. `facturation.yaml`).
2. Le dossier `src/plugins/<id>/` avec son `plugin.ts`, ajouté à
   `PLUGIN_MANIFESTS` (`manifests.ts`).
3. Chaque branchement dans le reste du site passe par `pluginActif()` ou
   `disponible()`.
4. Une ligne dans le tableau ci-dessus, un `README.md` dans le dossier, et le
   commentaire `plugins:` de `src/content/reglages.yaml`.
