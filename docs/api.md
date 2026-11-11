# Routes serveur et intégration Grist

Le site est statique par défaut (`output: 'static'`, voir [developpement.md](developpement.md)). Certaines routes ont besoin d'un vrai serveur — typiquement pour appeler une API externe avec une clé secrète, ce qu'on ne peut jamais faire depuis le navigateur sans exposer cette clé à n'importe quel visiteur.

## Pourquoi pas d'appel direct à Grist depuis le navigateur

L'API de Grist s'authentifie avec une clé (`Authorization: Bearer <clé>`) qui donne accès en lecture/écriture au document. Si le futur formulaire d'adhésion appelait Grist directement depuis le JS du navigateur, cette clé se retrouverait visible dans le code source pour n'importe qui — permettant de lire, modifier ou supprimer les données du document, pas seulement d'envoyer un bulletin.

La solution : le formulaire (un îlot Vue — intégration `@astrojs/vue`, voir [composants.md](composants.md)) n'appelle que nos propres routes API. Ce sont ces routes, exécutées côté serveur, qui détiennent la clé Grist et relaient la requête.

## Activer le rendu serveur pour une route

Par défaut toutes les pages restent pré-rendues en HTML statique. Pour qu'une route précise s'exécute côté serveur à chaque requête, il suffit d'ajouter dans son frontmatter/module :

```ts
export const prerender = false;
```

C'est ce que font les routes `src/plugins/adhesion/api/*`. Le reste du site (toutes les autres pages) continue d'être généré statiquement au build, sans changement de comportement ni de performance.

## Adaptateur

`@astrojs/node` (mode `standalone`) fournit le serveur HTTP qui exécute ces routes. Configuré dans `astro.config.mjs` :

```js
import node from '@astrojs/node';

export default defineConfig({
	// ...
	adapter: node({ mode: 'standalone' }),
});
```

En développement (`astro dev`), tout fonctionne de façon transparente. En production sur un VPS/serveur dédié (OVH ou autre) :

1. Lancer le serveur : `npm start`
   (= `node --env-file-if-exists=.env scripts/start.mjs`, superviseur qui
   lance `scripts/serveur.mjs` et le relance après chaque publication ; en
   continu sur un serveur : service systemd, cf. [deploiement.md](deploiement.md)).
   Le `.env` est lu **au démarrage**. `scripts/serveur.mjs` construit d'abord le site (`npm run build`
   → `dist/server/entry.mjs` + `dist/client/`) s'il n'existe pas ou si la
   version, `SITE_URL` ou `src/content/` ont changé depuis le dernier build
   (empreinte `dist/build-info.json`, cf. [mise-a-jour.md](mise-a-jour.md)),
   puis lance le serveur. Le build ne recopie aucun secret (voir plus bas).
3. Mettre nginx/Apache en reverse proxy devant, avec le vrai nom de domaine.
4. Définir les variables d'environnement (voir plus bas) directement sur le serveur — jamais dans les fichiers commités. Après une modification du `.env`, **redémarrer** le serveur suffit : pas de rebuild.

## Variables d'environnement

Copier `.env.example` en `.env` (déjà dans `.gitignore`) et renseigner.
**`SITE_URL`** (adresse publique, ex. `https://www.mon-asso.fr`) est
**obligatoire pour construire** et lue **à la construction**
(`astro.config.mjs`, via `loadEnv` : `.env` ou environnement) ; la changer
puis redémarrer suffit : `scripts/start.mjs` détecte le changement et
reconstruit. Toutes les autres
sont **facultatives** : une fonction non configurée se désactive proprement
(formulaires Grist en erreur gérée, bulletin PDF masqué, connexion « non
configurée »), le reste du site fonctionne.

| Variable | Rôle |
| :--- | :--- |
| `SITE_URL` | Adresse publique du site — **obligatoire**, lue à la construction (`site`, `security.allowedDomains`) |
| `GRIST_BASE_URL` | URL de l'instance Grist (ex. `https://grist.exemple.org`) |
| `GRIST_DOC_ID` | Identifiant du document Grist contenant les tables d'adhésion |
| `GRIST_API_KEY` | Clé API Grist — **secret**, ne doit exister que dans `.env` côté serveur |
| `GRIST_TABLE_MEMBRES` | Nom technique de la table des membres (défaut `Membres`) — optionnel |
| `GRIST_TABLE_ADHESIONS` | Table des adhésions (défaut `Adhesions`) — optionnel |
| `GRIST_TABLE_INSCRIPTIONS` | Table des inscriptions (défaut `Inscription`) — optionnel |
| `GRIST_TABLE_COTISATIONS` | Table des cotisations (défaut `Cotisation`) — optionnel |
| `GRIST_TABLE_ACTIVITES` | Table des activités (défaut `Activite`) — optionnel |
| `GRIST_TABLE_SAISONS` | Table des saisons (défaut `Saisons`) — optionnel |
| `GRIST_TABLE_PRESENCE` | Table de présence aux ateliers (défaut `Presence`) — optionnel |
| `GRIST_DOC_ID_RDV` | Document Grist des RDV (plugin `rdv`) — optionnel, voir [le plugin](../src/plugins/rdv/README.md) |
| `GRIST_API_KEY_RDV` | Clé API Grist propre au plugin `rdv` — **secret**, facultative (sinon `GRIST_API_KEY`) ; conseillée : limitée au document des RDV |
| `GRIST_TABLE_BENEFICIAIRES` / `GRIST_TABLE_RDV` / `GRIST_TABLE_DEMARCHES` | Tables du document RDV (défauts `Beneficiaires`, `RDV`, `Demarches`) — optionnel |
| `GRIST_DOC_ID_FACTURATION` | Document Grist de la facturation (plugin `facturation`, auto-entrepreneur) — voir [facturation.md](facturation.md) |
| `GRIST_API_KEY_FACTURATION` | Clé API Grist propre au plugin `facturation` — **secret**, facultative (sinon `GRIST_API_KEY`) |
| `GOTENBERG_URL` | Instance Gotenberg pour le bulletin PDF et le PDF des semaines de RDV (module « Rendez-vous ») (ex. `http://gotenberg:3000`) — optionnel, voir [bulletin-pdf.md](bulletin-pdf.md) |
| `GOTENBERG_USERNAME` / `GOTENBERG_PASSWORD` | Auth HTTP Basic de Gotenberg — optionnel, seulement si l'instance l'exige |
| `BULLETIN_SECRET` | Secret HMAC du lien de bulletin — **secret**, requis avec `GOTENBERG_URL` |
| `AUTH_SECRET` | Signature des sessions de l'Espace Admin (≥ 32 caractères) — **secret**, voir [auth.md](auth.md) ; absent = généré au premier démarrage |
| `DATA_DIR` | Dossier des comptes et de l'état des publications de l'Espace Admin (défaut `./data`) — optionnel |
| `SITE_ROOT` / `PUBLISH_HOOK` / `PUBLISH_RESTART` | Publication depuis l'Espace Admin — optionnel, voir [publication.md](publication.md) |

### Lues au démarrage, jamais figées dans le build

Les variables sont déclarées dans `astro.config.mjs` (`env.schema`, API
[`astro:env`](https://docs.astro.build/en/guides/environment-variables/)), toutes
en `access: 'secret'` : le code les lit par
`import { GRIST_API_KEY } from 'astro:env/server'` et leur valeur est prise
**au démarrage du serveur**, jamais recopiée dans `dist/`. Conséquences :

- on peut construire le site n'importe où (poste, CI) et déposer `dist/` sur le
  serveur : aucun secret de la machine de build ne part avec ;
- changer le `.env` demande un **redémarrage**, pas un rebuild ;
- ne jamais lire un secret via `import.meta.env.X` : Vite le recopierait en
  clair dans le build. (Une variable serveur `access: 'public'` d'`astro:env`
  est elle aussi figée au build — d'où `secret` partout.)

Les variables propres à un plugin (document et tables Grist de l'adhésion,
`BULLETIN_SECRET` : plugin `adhesion` ; document des RDV : plugin `rdv`)
sont déclarées dans le manifeste du plugin (`src/plugins/<id>/plugin.ts`,
`env`) et ajoutées au même schéma, que le plugin soit actif ou non.

**Secrets de l'installation** : les valeurs saisies dans l'assistant
d'installation sont rangées dans `<DATA_DIR>/installation/secrets.env` et
chargées au démarrage **en complément** du `.env` (une variable définie
dans le `.env` l'emporte) — voir [installation.md](installation.md#les-secrets).

Nouvelle variable : l'ajouter à `env.schema` (`astro.config.mjs`) — ou à
`env` du manifeste si elle n'appartient qu'à un plugin — et à
`.env.example`. `DATA_DIR` fait exception (lue par `process.env` dans
`src/lib/data-dir.ts`, partagé avec le CLI `auth-user`).

## Formulaire d'adhésion

> Adhésion, présence et planning Grist forment le plugin `adhesion` (actif
> par défaut) : code dans `src/plugins/adhesion/`, routes `/api/adhesion/*`
> et `/api/presence/*` ajoutées seulement s'il est actif — voir [son
> README](../src/plugins/adhesion/README.md). L'inscription à une activité
> est le plugin `inscription` (routes `/api/inscription/*`, requiert
> l'adhésion) : [son README](../src/plugins/inscription/README.md).

> Vue fonctionnelle du parcours (schéma + étape par étape, pour former des
> utilisateurs) : [adhesion-parcours.md](adhesion-parcours.md). Ci-dessous, le
> détail technique.

### Îlot Vue

`src/plugins/adhesion/pages/formulaire.astro` monte l'îlot `src/plugins/adhesion/formulaire/adhesion/AdhesionForm.vue` en `client:load`, entouré de `<FormGate form="adhesion">`. Deux parcours (**Nouveau membre** / **Renouvellement**) et un déroulé : identité → cotisation → *(membres du groupe si cotisation multiple)* → activité → récapitulatif, chaque étape n'étant révélée qu'après le retour de la précédente. En **renouvellement**, l'étape 1 marque une pause « confirmation de la fiche + préférences » (cases `newsletter` / `droitImage` pré-cochées, écrites via `/api/adhesion/preferences`) ; si `Membres.Adhesion_en_cours` est vrai, la cotisation est **sautée** et on passe directement à l'activité (permet à un membre à jour de s'inscrire à une nouvelle activité).

**Fermer les adhésions en ligne** : passer `site.forms.adhesion.enabled` à `false` dans `src/content/reglages.yaml`. Le formulaire est alors remplacé par le message `closedTitle` / `closedMessage`, et le bouton « Adhérer en ligne » de `src/plugins/adhesion/pages/adherer.astro` disparaît (`isFormOpen('adhesion')`). Voir [composants.md](composants.md#forms) pour le mécanisme `FormGate`.

| Composant | Rôle |
| :--- | :--- |
| `AdhesionForm.vue` | orchestrateur : machine à états, appels API, gestion d'erreur, bouton « Annuler et tout effacer » |
| `MembreFields.vue` | grille de champs d'un membre (genre en radios, identité, coordonnées, cases newsletter / droit à l'image) — réutilisée pour l'adhérent principal **et** les membres supplémentaires ; `hidePreferences` masque les deux cases pour un membre de groupe (le choix vient du·de la responsable) ; masque la date de naissance si genre = `Association` ; **autocomplétion de l'adresse** (voir route `/api/adhesion/adresse`) qui remplit code postal + commune ; affiche les messages de validation reçus via la prop `errors` |
| `SectionIdentite.vue` | étape 1 ; en renouvellement : recherche nom + prénom puis panneau **confirmation de la fiche + préférences** (`newsletter` / `droitImage`) et mention « adhésion déjà à jour » ; un membre rattaché est résolu côté serveur sur son·sa responsable (silencieux). Porte aussi le sous-parcours **« recevoir seulement les actualités »** (nom + prénom + courriel + consentement) |
| `SectionCotisation.vue` | étape 2 ; filtre les cotisations selon personne physique / morale (`personneMorale`) |
| `SectionMembres.vue` | étape « groupe », affichée si la cotisation choisie a `Multiple = true` ; liste des membres + formulaire d'ajout, min. 2 membres pour continuer |
| `SectionActivite.vue` | étape 3 ; « N places restantes » / « Complet ». Select **« Pour qui ? »** si l'adhésion compte plusieurs membres. Bouton **« Ajouter une activité »** → `POST /api/adhesion/inscription` immédiat (1 `Inscription` par membre × activité), la ligne s'ajoute à la liste ; **« Valider mon inscription »** → enregistre la sélection en attente puis va au récap ; **« Continuer sans activité »** (visible tant qu'aucune activité n'est ajoutée) → récap sans créer d'`Inscription`. Pas de retrait ici — se corrige ensuite dans Grist. |
| `SectionRecap.vue` | récapitulatif (liste des activités, une par ligne) + montant à régler (règlement en présentiel) + lien bulletin PDF |

Les appels réseau passent par `src/plugins/adhesion/formulaire/adhesion/client.ts`.

### Routes API (`src/plugins/adhesion/api/`)

Toutes en `prerender = false`. Elles ne parlent à Grist qu'à travers `src/plugins/adhesion/lib/grist.ts`.

| Route | Méthode | Rôle |
| :--- | :--- | :--- |
| `/api/adhesion/cotisations` | GET | Cotisations de la saison en cours (`{ id, label, prix, personneMorale, multiple }`). |
| `/api/adhesion/activites` | GET | Activités **publiées** de type `Séances`/`Modules` (`TYPES_ACTIVITE_ADHESION`) de la saison en cours (`{ id, label, prix, placesRestantes }`). Utilisée par le parcours d'adhésion. |
| `/api/inscription/offre` | GET | [Inscription en ligne](inscription.md), étape 2 : activités `Séances` / `Ateliers` / `Atelier CN` (`TYPES_ACTIVITE_INSCRIPTION`) de la saison en cours → `{ mode, activites, cibleIntrouvable }`. Cible `?activite=<Nom>` (répétable, `*` final = préfixe) et/ou `?type=<Type>` : ses lignes publiées (`mode:'inscription'`), ou toutes ses lignes si aucune n'est publiée (`mode:'preinscription'`) ; sans cible ou cible inconnue : toutes les activités publiées. Chaque option porte `prix`, `prixNonAdherent` (`Tarif_non_adherent`, facultatif) et `adhesionRequise` ; `prixAdhesion` = tarif de la cotisation « Individuelle » de la saison (total adhérent·e affiché = `prixAdhesion` + `prix`). |
| `/api/inscription/preinscription` | POST | Inscription en ligne, activité **non publiée** (`{ membreId, activiteId }`) : ajoute « `<date> : Intéressé·e par « <Nom> » — préinscription` » à `Membres.Commentaires` (sans doublon). Refusé pour une activité publiée. |
| `/api/adhesion/membre` | POST | Étape 1. `mode:'nouveau'` → crée le `Membres` (rôle déduit du genre) et renvoie `membreId`. `mode:'renouvellement'` → rapproche sur nom + prénom normalisés : `ok` / `ambigu` (plusieurs fiches) / `introuvable`. Si la fiche retrouvée est un **membre rattaché** (elle figure dans le `Responsable_de` d'un·e autre membre), la réponse `ok` est **résolue silencieusement sur le·la responsable** — c'est lui/elle qui porte l'adhésion du groupe. La réponse `ok` porte aussi **`ficheId`**, l'id de la fiche réellement trouvée (= `membreId` hors rattachement) : c'est celui qu'utilise l'[inscription en ligne](inscription.md), pour inscrire la personne elle-même. Les réponses `ok` et les candidats `ambigu` portent l'**état** de la fiche : `newsletter`, `droitImage`, `adhesionEnCours` (colonne formule `Membres.Adhesion_en_cours`) et `groupe` (responsable + membres rattachés, `[]` si fiche seule). |
| `/api/adhesion/preferences` | POST | Renouvellement — met à jour `Newsletters` + `Droit_image` (`{ membreId, newsletter, droitImage }`). **Adhésion liée** : le même choix est appliqué à `membreId` **et à tous ses `Responsable_de`** (un réglage unique pour le foyer, PATCH groupé). |
| `/api/adhesion/contact` | POST | Sous-parcours actualités : crée un `Membres` minimal `Role = Contact`, `Newsletters = true`. |
| `/api/inscription/participant-exterieur` | POST | [Inscription en ligne](inscription.md), profil extérieur·e : crée un `Membres` minimal (`Genre`, `Nom`, `Prenom`, `Telephone_Mobile` 10 chiffres), `Role = Contact`, `Newsletters = false`, sans adhésion. Renvoie `{ membreId, prenom, nom }`. |
| `/api/adhesion/cotisation` | POST | Étape 2. Crée l'enregistrement **`Adhesions`** (membre + cotisation, `Statut = Impayé`), renvoie `adhesionId`. |
| `/api/adhesion/co-membre` | POST | Adhésion multiple : crée (ou rattache) un `Membres`, l'ajoute à `Adhesions.Membres` et à `Membres[responsable].Responsable_de` ; ses `Newsletters` / `Droit_image` sont alignés sur ceux du·de la responsable. |
| `/api/adhesion/inscription` | POST | Étape 3. Crée l'enregistrement **`Inscription`** (membre + activité), `Disponibilite = Inscrit` ou `Liste d'attente` selon `Places_restantes`. Refusé si l'activité n'est pas publiée. Montant dû : `Tarif_non_adherent` s'il est renseigné et que le membre n'a pas d'adhésion en cours, sinon `Tarif`. |
| `/api/adhesion/membres` | GET | Recherche de membres par nom/prénom (`?q=`), pour rattacher un membre existant à une adhésion multiple. |
| `/api/adhesion/detacher-membre` | POST | Retire un membre d'une adhésion multiple (`Adhesions.Membres` + `Responsable_de`). |
| `/api/adhesion/adresse` | GET | Proxy vers l'**API Adresse** (Base Adresse Nationale, `api-adresse.data.gouv.fr`, sans clé). `?q=` → suggestions `{ label, adresse, codePostal, commune }`. |

### Deux tables distinctes

Le process alimente **deux** tables, pas une :

- **`Adhesions`** (étape 2) : « la personne adhère à l'association avec telle cotisation » — `Membres` (RefList), `Cotisation`, `Statut`, `Montant_du`.
- **`Inscription`** (étape 3) : « la personne s'inscrit à telle activité » — `Membre` (Ref), `Activite`, `Date_d_inscription`, `Montant_du`, `Disponibilite`.

`Saison` est une **colonne formule** dans les deux ; de même `Tarif` / `Regle` (`Adhesions`) et `Eligible` / `Regle` (`Inscription`), ainsi que `Places_restantes` (`Activite`, décrément automatique). Ces colonnes ne sont **jamais écrites** par le code — Grist les calcule.

## Prise de RDV (plugin `rdv`)

Document Grist distinct (`GRIST_DOC_ID_RDV`), tables `Beneficiaires`, `RDV`,
`Demarches`. Parcours, routes `/api/rdv/*` et mapping :
[src/plugins/rdv/README.md](../src/plugins/rdv/README.md) (schéma Grist attendu compris).

## Planning hebdomadaire (Activite)

`src/pages/activites.astro` (`prerender = false`) lit à chaque requête la
table **`Activite`** via `src/plugins/adhesion/lib/planning.ts`
(`fetchPlanningAgenda()`) et l'affiche avec `WeeklyAgenda.astro`. Chaque
ligne `Activite` est déjà un créneau précis (jour, horaires, lieu,
encadrant·e·s) — pas de table séparée : seules les lignes `Publiee = true`
de la **saison en cours** sont retenues, et celles sans `Categorie_agenda`
valide (colonne pas encore renseignée) sont ignorées.

Les **permanences de prise de RDV** (plugin `rdv`) viennent de
`permanences:` de `src/content/rdv.yaml` (plugin RDV : `permanencesAffichees()`,
`src/plugins/rdv/index.ts`, vide si le plugin est inactif) — dispositif géré à part de la
programmation de l'association, jamais dans `Activite`. La page les
recombine : `[...permanencesAffichees(), ...(await fetchPlanningAgenda())]`.

Si Grist est injoignable (ou non configuré), la page n'affiche que les
permanences de prise de RDV, avec un avertissement « planning
momentanément indisponible » (prop `notice` de `WeeklyAgenda`). Plus de
planning figé de secours : il devenait faux sans que personne le voie.

Colonnes du planning sur `Activite` (mapping `COLS.activite` dans
`src/plugins/adhesion/lib/grist.ts`), en plus de celles déjà utilisées par
l'adhésion (`Nom`, `Saison`…) :

| Colonne | Type Grist | Rôle |
| :--- | :--- | :--- |
| `Publiee` | Bool | Visible sur le planning public si coché |
| `Categorie_agenda` | Choice | `parcours` \| `fablab` \| `espace-jeune` \| `bidouille-repair` (cf. `AgendaKind`, `src/lib/agenda.ts`) |
| `Jour` | Choice | `Lundi` … `Samedi` |
| `Debute_a` / `Fini_a` | Text | Format `"16:30"`, converti en `"16h30"` à la lecture (cohérent avec le tri de `WeeklyAgenda.astro`) |
| `Lieu` | Text | Facultatif |
| `Encadrant` | RefList:Membres | Résolu en prénoms seuls (nom complet via `membreLabel()` si prénom vide), facultatif |
| `Ouverture` | Date | Facultatif : date de la première séance. Renseignée, la ligne n'apparaît qu'à partir de la semaine (lundi → dimanche, heure de Paris) de cette date ; vide = affichée chaque semaine |
| `Places_max` / `Places_restantes` | Int | Si `Places_max` > 0, le bloc porte la note « n place(s) restante(s) » ou « Complet » |
| `Nombre_de_seances` | Int | Facultatif, lu seulement avec `Ouverture` : la ligne disparaît après ce nombre de semaines (0 ou vide = sans fin). |

## Présence (« Je participe »)

`/je-participe` (îlot Vue `src/plugins/adhesion/formulaire/presence/PresenceForm.vue`, `client:load`) permet à un membre de signaler sa présence — ou son absence — à la séance en cours, sans système de connexion : l'identification se fait par sélection dans une liste (recherche par nom, route déjà publique `/api/adhesion/membres`), mémorisée ensuite en `localStorage` sur l'appareil (`changerMembre()` permet de ré-choisir, ex. appareil partagé).

### Détection de la séance en cours

`fetchSeancesCourantes(membreId)` (`src/plugins/adhesion/lib/presence.ts`) reprend les lignes `Activite` publiées de la saison en cours (mêmes critères que le planning), **restreintes à celles où le membre a une `Inscription`** (table `Inscription`, cf. parcours d'adhésion), et ne retient que celles dont l'horaire couvre l'instant présent (marge de 15 min avant le début, jusqu'à la fin). 0, 1 ou plusieurs séances peuvent correspondre à la fois (ex. deux créneaux qui se chevauchent) — la page affiche alors un bouton « Je participe » / « Je ne pourrai pas venir » par séance candidate. `enregistrerPresence()` revérifie cette inscription avant d'écrire (au cas où la liste affichée serait périmée) et renvoie `non-inscrit` sinon.

### Table `Presence`

Une ligne par **séance** (`Activite` × `Date`, calculée côté serveur = aujourd'hui), pas par membre — pas besoin de pré-générer les dates de séance, la date du jour est calculée à l'écriture.

| Colonne | Type Grist | Rôle |
| :--- | :--- | :--- |
| `Activite` | Ref:Activite | La séance concernée |
| `Date` | Date | Jour de la séance (calculé serveur, fuseau `Europe/Paris`) |
| `Presents` | RefList:Membres | Membres ayant signalé leur présence |
| `Absents` | RefList:Membres | Membres ayant signalé leur absence |

`enregistrerPresence()` relit la ligne de la séance (ou la crée si absente), vérifie que le membre n'est pas déjà dans la liste visée (`Presents` ou `Absents`) puis réécrit la liste complète — pas d'opération atomique « ajouter un élément » côté API Grist. Suffisant pour une petite association ; pas garanti à l'abri d'une double-écriture si deux personnes valident à la même seconde.

### Routes API (`src/plugins/adhesion/api/presence/`)

| Route | Méthode | Rôle |
| :--- | :--- | :--- |
| `/api/presence/seances` | GET | `?membreId=` (obligatoire) → séance(s) en cours où ce membre est inscrit (`{ activiteId, label }[]`), 0 à N. |
| `/api/presence/inscrire` | POST | `{ membreId, activiteId, statut: 'present' \| 'absent' }` → `{ status: 'ok' \| 'deja' \| 'non-inscrit' }`. |

### Mapping Grist — le seul point à ajuster

`src/plugins/adhesion/lib/grist.ts` centralise tout ce qui dépend du schéma : `TABLES` (défauts = `Membres` / `Adhesions` / `Inscription` / `Cotisation` / `Activite` / `Saisons` / `Presence`, surchargeables par variables d'environnement), `COLS`, les valeurs de listes de choix (`GENRE_CHOICES`, `ROLE_*`, `STATUT_IMPAYE`, `DISPO_*`), et les helpers `dateToEpochSeconds` / `refList` / `parseRefList` / `currentSaisonId`.

`src/plugins/adhesion/lib/membre-fields.ts` porte la validation + conversion d'un membre **côté serveur** (partagée par `membre` et `co-membre`). `src/plugins/adhesion/lib/validation.ts` porte la validation **côté client** (`validateMembre` / `validateContact` / `validateRenouvellement`) : champs obligatoires, format courriel / code postal / téléphone (10 chiffres, au moins un des deux), date de naissance non future et plausible. Les composants passent le résultat à `MembreFields` via la prop `errors` et bloquent l'envoi tant qu'il reste une erreur ; le serveur revalide systématiquement.

### Bulletin d'adhésion en PDF

Lien « Imprimer le bulletin » au récapitulatif : la route
`/api/adhesion/bulletin` lit la colonne Formule `Adhesions.Formule` (HTML
complet) et la fait convertir par une instance **Gotenberg**. Accès protégé par
un jeton signé (`BULLETIN_SECRET`) émis dans la réponse de
`/api/adhesion/cotisation`. Actif seulement si `GOTENBERG_URL` et
`BULLETIN_SECRET` sont renseignés. Détail complet : [bulletin-pdf.md](bulletin-pdf.md).

### À finaliser

- Protection anti-spam (honeypot, rate-limit) et éventuel e-mail de confirmation.
- Vérifier le comportement si `Places_restantes` cesse d'être une formule (verrou de place à gérer).
- Pas de retrait d'une `Inscription` depuis l'étape 3 (il faudrait une route `detacher-inscription` façon `detacher-membre`).

> Besoin de réinspecter le schéma Grist (tables/colonnes/formules) ? Recréer une petite route de debug jetable qui appelle `GET {GRIST_BASE_URL}/api/docs/{GRIST_DOC_ID}/tables` puis `.../tables/<id>/columns`, la garder derrière `import.meta.env.DEV`, et la supprimer une fois le mapping calé.
