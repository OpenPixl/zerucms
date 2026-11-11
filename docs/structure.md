# Association ou auto-entrepreneur (type de structure)

Le modèle sert deux sortes de sites : celui d'une **association** (défaut)
et celui d'un **auto-entrepreneur** (micro-entreprise, entreprise
individuelle). Le type se choisit à la première étape de
l'[assistant d'installation](installation.md) et s'écrit dans
`src/content/reglages.yaml` :

```yaml
structure: entreprise   # absent = association
```

## Ce qui change

| | Association | Auto-entrepreneur |
| --- | --- | --- |
| **Plugins proposés** | Adhésion et activités, Inscription aux activités, Prise de rendez-vous | Devis et facturation, Prise de rendez-vous |
| **Module de l'Espace Admin** | « Association » | « Entreprise » |
| **Identité** | Nom de l'association, adresse du siège | Nom commercial, adresse |
| **Mentions légales** | Numéro RNA, SIRET, président·e, responsable de la publication et sa fonction | SIRET, entrepreneur·e (prénom et nom), responsable de la publication ; page « Mentions légales » d'entreprise individuelle (« EI ») |
| **Contenu d'exemple** | Actualité, deux activités, pages « Qui sommes-nous ? » (menu « Association »), statuts, règlement intérieur, annonce, partenaire | Actualité, pages « À propos » et « Prestations », accueil adapté (« Mes prestations », « Demander un devis »), annonce, logo « Mon entreprise » ; page Activités désactivée |

Un plugin non proposé au type du site est **inactif** même si
`reglages.yaml` le dit actif, et n'apparaît ni dans l'assistant ni dans le
module « Plugins ».

Les noms techniques ne changent pas : le fichier reste `association.yaml`,
les variables de page restent `{{association.nom}}`, `{{association.siret}}`,
`{{association.president}}` (l'entrepreneur·e pour une entreprise)…

## Contenu d'exemple

Au premier démarrage, `src/content/` reçoit toujours le contenu de
démonstration d'association (`src/modeles/association/`). Si l'assistant choisit
**Auto-entrepreneur**, il :

1. retire les exemples propres aux associations **encore inchangés**
   (activités sauf `_categories.yaml`, menu « Association », statuts,
   règlement intérieur) ;
2. pose ceux de **`src/modeles/entreprise/`** là où le fichier manque ou
   est encore celui de démonstration ; un fichier déjà personnalisé n'est
   jamais remplacé.

« Partir d'un site vide » ne pose que le **socle** :
`association.yaml`, `images/logo.svg`, `pages/mentions-legales/`,
`pages/_pages-site.md` (accueil, page Activités désactivée) et
`partenaires.yaml` (liste vide) ; les autres exemples sont retirés.

Le pied de page n'affiche que les pages légales qui existent (mentions
légales, statuts, règlement intérieur).

## Changer de type après l'installation

Pas prévu depuis l'Espace Admin. À la main, sur le serveur :

1. dans `src/content/reglages.yaml`, ajouter ou retirer
   `structure: entreprise`, et régler `plugins:` en conséquence ;
2. créer le fichier du plugin à activer s'il manque (ex. copier
   `src/plugins/facturation/facturation.exemple.yaml` en
   `src/content/facturation.yaml`) ;
3. adapter les pages (mentions légales, menu…) ;
4. redémarrer (le site se reconstruit).

## Pour les développeurs

- `src/lib/structure.ts` : `STRUCTURES`, `estStructure()`, `VOCABULAIRE` /
  `vocabulaire(s)` (libellés : titre, « de l'… », numéro légal,
  responsable). Module pur, utilisable dans le navigateur.
- `src/config/site.ts` : `structure` dans le schéma de `reglages.yaml`,
  `site.structure`.
- Catalogue des plugins (`src/plugins/catalogue.ts`) : `structures` (types à
  qui le plugin est proposé, absent = tous), `proposePour(id, structure)`,
  `resoudrePlugins(lus, structure)` ; lu aussi par
  `src/integrations/plugins.ts` (routes) et `src/lib/plugin-writer.ts`
  (`propose` : module Plugins, activation refusée sinon).
- Vocabulaire : libellé du module dans `src/components/admin/modules.ts`,
  `GeneralForm.vue` (mentions légales), libellés des variables
  (`src/lib/page-variables.ts`), assistant.
- Exemples : `src/modeles/entreprise/` (son `README.md`), appliqués par
  `appliquerEntreprise()` de `src/lib/installation.ts`
  (`ASSOCIATION_SEULEMENT`, `SOCLE_ENTREPRISE`).
- Nouveau plugin réservé à un type : `structures: ['entreprise']` dans son
  entrée du catalogue.
