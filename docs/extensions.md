# Extensions

Le CMS distingue deux sortes de volets :

| | **Plugin** | **Extension** |
| :--- | :--- | :--- |
| Quoi | Outil courant (adhésion, inscription, facturation…) | Développement propre à une structure (ex. prise de RDV du dispositif conseiller numérique de numérik&Co) |
| Où est le code | Dans le CMS : `src/plugins/<id>/` | Hors du CMS : dépôt à part, installé dans `extensions/<id>/` du site |
| Qui l'a | Tous les sites ; proposé selon le type de structure (assistant d'installation, module « Plugins ») | Seulement le site où on l'installe ; jamais proposé aux structures |
| Activation | `plugins:` de `reglages.yaml` | Installée = active ; `extensions: { <id>: false }` la coupe |
| Gestion | Module « Plugins » | Module « Extensions » (super admin) |

Plus tard, un petit **market** listera les extensions disponibles : il
remplacera le dépôt manuel de l'archive par un choix dans une liste, le reste
(archive, vérification, installation) ne change pas.

## Installer, mettre à jour, retirer

Une extension se distribue en **archive `.zip`** (Releases de son dépôt, ex.
`zerucms-rdv-1.0.0.zip`), avec sa fiche `extension.json` à la racine ou dans un
seul dossier (`rdv/extension.json`).

- **Espace Admin** (super admin) : module **« Extensions »** → « Installer une
  extension (.zip) ». L'archive est vérifiée (fiche, identifiant, version
  minimale du CMS, chemins), installée, son fichier de réglages modèle copié
  dans `src/content/` s'il manque, puis le site est reconstruit ; échec de la
  construction = version précédente remise. Déposer une version plus récente
  = mise à jour. Roue dentée : réglages (adresse de la page, document
  Grist…), case « Extension active », bouton « Supprimer l'extension » (ses
  réglages de `src/content/` et ses données restent).
- **Ligne de commande** (sur le serveur, dans le dossier du site) :

  ```bash
  npm run extension -- liste
  npm run extension -- install zerucms-rdv-1.0.0.zip
  npm run extension -- supprimer rdv
  ```

  puis redémarrer : `npm start` reconstruit (l'empreinte de construction
  comprend `extensions/`, cf. `scripts/releases.mjs`).
- **Docker** : `./extensions` est monté dans le conteneur
  (`docker-compose.yml`, volume ajouté par `./update.sh` aux installations
  plus anciennes). Installer depuis l'Espace Admin, ou décompresser l'archive
  dans `extensions/<id>/` puis redémarrer le conteneur.

Le dossier `extensions/` n'est **jamais** touché par une mise à jour du CMS
(`update.mjs`, `update.sh`, `git pull` : ignoré par git), comme
`src/content/`. Une extension qui demande un CMS plus récent que celui en
place est refusée à l'installation ; une extension invalide fait échouer la
construction avec un message clair (le site en ligne reste celui d'avant).

## Écrire une extension (contrat)

Dossier `extensions/<id>/` (`<id>` : minuscules, chiffres, tirets ; = nom du
dossier). Le CMS n'importe jamais une extension nommément : il découvre ces
fichiers par leur chemin (`import.meta.glob`). Seul `extension.json` est
obligatoire.

| Fichier | Lu par | Contenu |
| :--- | :--- | :--- |
| `extension.json` | CMS partout (`src/lib/extensions.ts`), installeur (`scripts/extension.mjs`) | `id`, `label`, `description`, `icon`, `version` (X.Y.Z), `cms` (version minimale du CMS), `auteur`, `doc` ; comme une fiche du catalogue des plugins : `requis` (fichiers de `src/content/`), `modele` (`{ fichier, source }`, source relative au dossier de l'extension, copiée à l'installation), `env` (secrets du `.env` signalés), `reglages` (`fichier` + `champs` de la page de configuration, cf. `src/plugins/champs.ts`) ; `gardes` (routes `/api/admin/…` réservées à des groupes) |
| `manifest.ts` | Config Astro (`src/integrations/extensions.ts`) | `routes(root)` (`entrypoint` relatif au dossier de l'extension), `env` (variables `astro:env`, toutes facultatives), `surveiller` (fichiers de `src/content/` qui changent les routes). **Pas d'import `@cms/…`** : chargé hors de Vite |
| `definitions.ts` | CMS, aussi dans le navigateur | `accueil` (modules d'accueil), `blocs` (blocs de page enrichie), `typesRenommes`, `agenda` (familles du planning), `journal` (libellés de ses actions `<id>.<action>`) : données pures |
| `site.ts` | Pages du CMS (`src/lib/extensions-site.ts`), si active | `accueil` / `blocs` (composant Astro de chaque type : props `champs` / `bloc`), `agenda()` (séances du planning de `/activites`), `pages()` (pages publiques : plan du site, liens de l'Espace Admin) |
| `admin.ts` | Registre des modules d'admin (`src/components/admin/modules.ts`) | Liste d'`AdminModule` (composant Vue en `defineAsyncComponent`) |

Le reste (pages, routes API, îlots Vue, `lib/`) est libre. Pour utiliser le
cœur : alias **`@cms/…`** = `src/…` (ex. `import { json } from '@cms/lib/http'`,
`import { extensionActive } from '@cms/lib/extensions'`). Tailwind lit aussi
les classes des extensions (`@source` de `src/styles/global.css`).

Contenu qui cite une extension absente (module d'accueil, bloc) : ignoré à la
lecture avec un avertissement dans le journal du serveur, jamais d'échec ;
l'enregistrement depuis l'Espace Admin, lui, refuse un type inconnu.

Modèle : l'extension RDV, dépôt `OpenPixl/zerucms-rdv` (`archive.sh` fabrique
l'archive ; un tag `vX.Y.Z` = `version` d'`extension.json` la publie en
Release).

## Développer une extension en local

Copier (ou synchroniser) le dépôt de l'extension dans `extensions/<id>/` du
site de développement — pas de lien symbolique : Vite résoudrait les paquets
depuis le dossier d'origine, sans `node_modules`. `astro check` vérifie aussi
les extensions présentes (`@cms/*` déclaré dans `tsconfig.json`).

## Passage de la prise de RDV en extension (0.5.20)

Jusqu'à la 0.5.19, la prise de RDV était le plugin `rdv`. Depuis la 0.5.20,
c'est l'extension `rdv` (dépôt `OpenPixl/zerucms-rdv`). Pour un site qui
l'utilisait :

- rien à changer dans `src/content/` : `rdv.yaml` reste la même, la clé
  `plugins: rdv:` de `reglages.yaml` est ignorée, les modules d'accueil et
  blocs `rdv` reviennent dès que l'extension est installée ;
- **sans coupure** : avant `./update.sh`, décompresser l'archive dans
  `extensions/rdv/` à la racine du site (`unzip zerucms-rdv-1.0.0.zip -d
  extensions/`) ; la nouvelle version est construite avec l'extension ;
- **sinon** : mettre à jour, puis installer l'archive depuis le module
  « Extensions » (la page RDV et le module « Rendez-vous » sont absents
  entre les deux).
