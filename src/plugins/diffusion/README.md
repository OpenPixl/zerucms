# Plugin `diffusion` — diffuser les actualités sur les réseaux sociaux

Proposé à tous les types de structure, **inactif par défaut**. Une fois le
plugin actif (module « Plugins », super admin), le formulaire de
modification d'une actualité gagne un onglet **« Diffusion »** : la personne
relit le texte proposé (titre + résumé), puis clique **« Diffuser sur
Facebook »** et confirme. La publication est faite **au nom de la Page** :
texte + lien vers l'actualité, dont Facebook affiche l'aperçu (titre, résumé
et photo, d'après les balises Open Graph de la page publique).

Réseaux = **outils** du plugin (interrupteurs de sa page de configuration) :
`facebook` pour l'instant. Instagram pourra suivre avec la même application
Meta (il exige une photo et un compte professionnel relié à la Page).

## Règles

- Seulement une actualité **en ligne** : ni brouillon, ni programmée, et
  présente dans le site construit (`dist/client/actualites/<slug>/`) — sinon
  Facebook ne trouverait pas l'aperçu. Une modification non enregistrée du
  formulaire n'est pas diffusée (avertissement).
- Diffusion manuelle uniquement, confirmée en deux clics ; une actualité déjà
  diffusée l'affiche (« Diffusée le … par … », lien vers la publication) et
  peut être diffusée à nouveau, après confirmation.
- Trace dans l'en-tête de l'actualité, écrite par le serveur seulement
  (`src/lib/diffusion.ts`, `enregistrerDiffusion()` de `news-writer.ts`),
  gardée quand l'actualité est modifiée :

  ```yaml
  diffusion:
    facebook:
      id: "123456789_987654321"
      date: "2026-11-22T10:15:00.000Z"
      lien: "https://www.facebook.com/…"
      par: "Prénom Nom"
  ```

- Journal : `diffusion.facebook` (réussite ou échec, avec le message de Facebook).
- Droits : rédacteur·rice·s et bureau (garde `/api/admin/diffusion` de
  `src/middleware.ts`).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `plugin.ts` | manifeste : routes `/api/admin/diffusion` (état) et `/api/admin/diffusion/facebook` (outil `facebook`) ; aucune variable d'environnement |
| `lib/facebook.ts` | API Graph : connexion lue dans `data/connexions/diffusion.yaml`, vérification (Page + `debug_token`), publication (`/{page}/feed`), messages d'erreur lisibles |
| `lib/connexion.ts` | état de la connexion pour le module « Plugins » et les rappels (`src/plugins/connexions.ts`) |
| `lib/regles.ts` | règles partagées avec le formulaire (texte proposé, longueur maximale, `rappelJeton()`) |
| `api/index.ts`, `api/facebook.ts` | routes |
| `admin/DiffusionActualite.vue`, `admin/client.ts` | onglet « Diffusion » du formulaire des actualités (`NewsModule.vue`) |

## Connexion (jamais dans le `.env`)

Saisie par le super admin dans le module **« Plugins »** → « Diffusion sur les
réseaux sociaux », encart **Réseaux** → bouton **+** → « Page Facebook »
(fenêtre de connexion du réseau ; ensuite rouverte par sa roue crantée) ; écrite **uniquement** dans
`data/connexions/diffusion.yaml` (`<DATA_DIR>`, droits 600, cf.
`src/lib/connexions.ts`), lue à chaque diffusion : ni reconstruction ni
redémarrage.

| Champ | Clé du fichier | Contenu |
| --- | --- | --- |
| Identifiant de la Page | `facebook.page_id` | identifiant numérique de la Page |
| Jeton d'accès de la Page | `facebook.jeton` | jeton **de la Page** (permission `pages_manage_posts`) |
| Version de l'API Graph | `facebook.version` | facultatif, ex. `v23.0` (vide : version par défaut de l'application Meta) |

Une fois enregistrés, l'identifiant et le jeton sont **masqués** (« •••• ») :
le navigateur ne les reçoit plus jamais ; on peut seulement les **remplacer**
ou les **effacer**. Le fichier n'est ni dans `src/content/`, ni dans le site
construit, ni dans les sauvegardes : après une restauration sur un autre
serveur, ressaisir la connexion.

### Vérification et rappels de renouvellement

À chaque enregistrement (puis une fois par jour au plus, ou « Vérifier
maintenant »), le serveur interroge Facebook : nom de la Page, et
`debug_token` pour le type du jeton (`PAGE` attendu), sa permission et ses
**échéances** — fin de validité du jeton (`expire_le`, absente = n'expire
pas) et fin de l'accès aux données accordé par la personne qui l'a créé
(`acces_donnees_expire_le`). Résultat écrit sous `etat.facebook` du même
fichier. Sont signalés :

- jeton utilisateur au lieu du jeton de Page, permission manquante, jeton
  d'une autre Page, jeton de courte durée (étape 4 oubliée) ;
- échéance dans **30 jours** ou moins (`RAPPEL_JOURS`, `lib/regles.ts`) :
  « Jeton à renouveler » ; échéance passée ou jeton refusé par Facebook
  (aussi détecté à la diffusion) : « Connexion à renouveler ».

Où : onglet « Diffusion » des actualités, page de configuration du plugin, et
badge de la barre d'admin pour le bureau et le super admin (`GET
/api/admin/rappels`). Renouveler = refaire les étapes 3 à 5 ci-dessous puis
« Remplacer » le jeton dans la rubrique Connexion.

## Obtenir le jeton de la Page (une fois)

À faire par une personne **administratrice de la Page Facebook**, sur
<https://developers.facebook.com> (compte Facebook de cette personne) :

1. **Créer une application** (Mes apps → Créer une app), cas d'usage
   « Gérer tout sur votre Page » (ou type « Entreprise »).
2. Dans les paramètres de l'application : renseigner l'**URL de politique de
   confidentialité** (ex. la page des mentions légales du site) et une
   catégorie, puis passer l'application en mode **« En ligne »** — en mode
   développement, les publications risquent de n'être visibles que par les
   personnes qui ont un rôle dans l'application. L'« accès standard » aux
   permissions suffit : aucune validation par Meta n'est nécessaire pour
   publier sur ses propres Pages.
3. **Explorateur de l'API Graph** (Outils) : choisir l'application, puis
   « Générer un jeton d'accès » utilisateur avec les permissions
   `pages_show_list`, `pages_read_engagement` et `pages_manage_posts` ;
   accepter pour la Page voulue.
4. **Débogueur de jeton d'accès** (Outils) : coller ce jeton, puis
   « Prolonger le jeton d'accès » → jeton utilisateur **longue durée**.
5. Retour dans l'Explorateur, avec ce jeton longue durée : requête
   `GET me/accounts`. La réponse donne, pour chaque Page, son `id` et son
   `access_token` : c'est le **jeton de la Page**. Vérifié dans le débogueur,
   il doit indiquer « Expire : Jamais ».
6. Module « Plugins » → « Diffusion sur les réseaux sociaux », encart
   **Réseaux** → bouton **+** → « Page Facebook » : coller l'`id` et l'`access_token`, puis « Enregistrer la
   connexion ». La vérification affiche le nom de la Page et l'échéance du
   jeton ; l'onglet « Diffusion » est prêt aussitôt.

Le jeton de Page devient invalide si la personne qui l'a créé change son mot
de passe Facebook, perd son rôle sur la Page ou retire l'application : le
formulaire et la barre d'admin le signalent ; refaire les étapes 3 à 6.
