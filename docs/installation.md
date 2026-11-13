# Installer un nouveau site (assistant d'installation)

Sur un serveur neuf, l'installation se fait en deux temps : **en ligne de
commande**, le strict minimum (déployer le site) ; puis **dans le
navigateur**, comme pour les CMS courants : écran « Bienvenue » (création de
son compte), puis un assistant qui règle tout le reste : type de structure,
compte administrateur, identité, plugins et leurs secrets, contenu d'exemple.

> Pour un site **déjà en service** (le vôtre, mis à jour) : rien ne change,
> l'assistant ne s'ouvre jamais (des comptes existent déjà). Voir
> [Sites existants](#sites-existants).

## 1. En ligne de commande

Le déploiement lui-même (Docker ou Node.js, pas à pas) est décrit dans
[deploiement.md](deploiement.md).
Seul le **`SITE_URL`** est indispensable dans le `.env` :

```dotenv
SITE_URL=https://www.mon-site.fr
```

`AUTH_SECRET` (signature des sessions) n'est plus à générer : **s'il manque,
le site en crée un au premier démarrage** et le garde dans
`data/installation/secrets.env` (journal du démarrage : « AUTH_SECRET
absent : généré… »). Les clés Grist, Gotenberg, etc. se saisissent dans
l'assistant ; rien n'empêche de les mettre dans le `.env` à l'avance (elles
ne sont alors plus demandées).

## 2. Dans le navigateur

1. Ouvrir le site. Tant qu'il n'a **aucun compte**, toute page affiche
   l'écran **« Bienvenue »** (`scripts/bienvenue.mjs`, servi par la porte de
   `scripts/maintenance.mjs`) : nom, identifiant, email facultatif, mot de
   passe choisi → compte **super admin** créé
   (`POST /api/auth/premier-compte`, refusé dès qu'un compte existe) et
   session ouverte. Comme pour WordPress, la première personne qui ouvre le
   site l'installe.
2. Connecté·e, on arrive directement sur la page **`/installation`** :
   l'assistant, sur une page à part (fond gris, ni menu ni pied de page ni
   barre d'admin), sans repasser par le site de démonstration.

Variante en ligne de commande (ferme l'écran « Bienvenue », mot de passe
provisoire à changer à la première connexion) :

```bash
./auth-user.sh init                     # Docker (VPS)
npm run auth:user -- init               # Node seul
SUPERADMIN_PASSWORD='…' ./auth-user.sh init   # pour imposer le mot de passe provisoire
```

La page **« Installation du site »** (étape 2) :

| Étape | Contenu |
| --- | --- |
| **Structure** | **Association** ou **Auto-entrepreneur** : décide des plugins proposés, du vocabulaire, des mentions légales et du contenu d'exemple — voir [structure.md](structure.md) |
| **Compte** | Compte administrateur du site (bureau de l'association, ou l'entrepreneur·e) : prénom et nom, identifiant, email facultatif, **mot de passe provisoire** proposé (bouton ↻ pour un autre). À noter et transmettre : il sera changé à la première connexion |
| **Identité** | Nom (de l'association, ou nom commercial), email, téléphone, adresse (rue sur 1 à 3 lignes — complément, bâtiment… —, gardées à l'affichage : pied de page, Contact, PDF ; puis code postal et ville) ; **logo** facultatif (PNG, JPEG, WebP, SVG, 5 Mo). Les champs sont vides tant que l'identité est celle de démonstration. Le reste (présentation, réseaux, SIRET, mentions légales, couleurs) : **Paramètres → Association / Entreprise** |
| **Plugins** | Volets proposés à ce type de structure, **tous décochés** au départ. Cocher un plugin coche ceux qu'il requiert ; décocher retire ceux qui en dépendent |
| **Réglages** | Pour chaque plugin coché : ses **secrets** (adresse de l'instance Grist, identifiant du document, clé d'API, service PDF…) et ses réglages (adresse de la page publique, document Grist du RDV…). Étape absente si aucun plugin coché n'a rien à régler |
| **Contenu** | **Garder les exemples** (site rempli, textes à remplacer) ou **partir d'un site vide** (les catégories d'activités restent, pour créer les premières fiches ; vides, elles ne sont ni dans le plan du site ni indexées) |
| **Installer** | Récapitulatif (avec le mot de passe provisoire), puis installation |

4. **Installer le site** : le site passe en **maintenance** (page « en cours
   d'installation » avec barre de progression), se reconstruit, puis revient
   sur `/installation`, écran **« Votre site est prêt »** : « Me déconnecter
   et voir le site » (le super admin a fini) ou « Voir le site en restant
   connecté ». Le compte administrateur peut alors se connecter. Si la
   construction échoue, l'installation est annulée (compte et secrets
   gardés) et l'assistant revient avec le message d'erreur.

**Plus tard** mène au site sans y être renvoyé jusqu'à la fermeture de
l'onglet ; l'assistant revient à la connexion suivante, ou depuis
**Paramètres → Site** (bouton « Assistant d'installation »).

## Ce que l'installation écrit

| Fichier | Contenu |
| --- | --- |
| `data/accounts/<login>.yaml` | Le compte administrateur (groupe `admin`, mot de passe provisoire) |
| `src/content/association.yaml` | Nom, email, téléphone, adresse (le reste du fichier est gardé) |
| `src/content/images/logo.*` | Le logo déposé |
| `src/content/reglages.yaml` | `structure: entreprise` (rien pour une association) et l'état de **chaque** plugin (`plugins: {adhesion: false, …, facturation: true}`) |
| `src/content/facturation.yaml` | Créé depuis le modèle du plugin s'il est coché et que le fichier manque, avec les réglages saisis |
| `src/content/…` | Exemples retirés, ou exemples « auto-entrepreneur » posés ([structure.md](structure.md#contenu-dexemple)) |
| `data/installation/secrets.env` | Les secrets saisis (droits 600) |
| `data/installation/installation.json` | `{ "etat": "terminee", "date", "par" }` |

Tout est **journalisé** (action « Site installé » du module Journal).

## Les secrets

`data/installation/secrets.env` **complète** le `.env` : au démarrage,
`scripts/start.mjs` charge chaque variable de ce fichier **qui n'est pas
déjà définie** (non vide) par le `.env` ou l'environnement. Le `.env`
l'emporte donc toujours.

Pourquoi un fichier à part : sous Docker, le `.env` est lu par `docker
compose` **sur l'hôte**, hors de portée du conteneur, qui ne peut pas
l'écrire. `data/` est le volume des données : il survit aux mises à jour.

- Une variable déjà présente dans le `.env` est affichée « déjà définie »
  dans l'assistant, ni demandée ni écrite.
- Les secrets ne se saisissent **qu'à l'installation**. Ensuite, pour en
  changer un : l'écrire dans le `.env` (qui l'emporte) puis redémarrer ;
  ou modifier `secrets.env` sur le serveur.
- Ils ne sont **jamais** dans les sauvegardes (comme le `.env`) : à garder à
  part pour un déménagement.
- Secrets générés sans être demandés : `AUTH_SECRET` (s'il manque au
  démarrage) et `BULLETIN_SECRET` (plugin Adhésion).

Format : une ligne `NOM="valeur"` (valeur en JSON) par variable,
commentaires `#`.

## Reprise et échec

- **Erreur de saisie** (champ obligatoire vide, format, identifiant déjà
  pris…) : rien n'est écrit, l'assistant affiche les erreurs.
- **Reconstruction en échec** : le contenu (identité, logo, plugins,
  exemples) est remis en l'état, la maintenance levée ; le compte et les
  secrets restent. `installation.json` reste « en-cours » : l'assistant se
  rouvre (le compte déjà créé est signalé, pas recréé).
- En **développement** (`astro dev`) : rien n'est reconstruit ; relancer le
  serveur de dev pour que les secrets saisis soient pris en compte.

## Sites existants

L'assistant est proposé seulement si `data/installation/installation.json`
est absent **et** qu'aucun compte autre que super admin n'existe (ou si une
installation a commencé sans aboutir). Un site mis à jour depuis une
version antérieure a déjà des comptes : il ne le voit pas, son
`reglages.yaml` n'est pas touché, il reste une **association** et ses
plugins gardent leur état (Adhésion et Inscription actifs par défaut).

## Détails techniques

- Logique : `src/lib/installation.ts` (`lireEtat`, `installer`,
  `installationRequise`, `terminerInstallation`) ; route
  `src/pages/api/admin/installation.ts` (`GET`, `GET ?requise`, `POST`),
  réservée au **super admin** (`GUARDS` de `src/middleware.ts`).
- Interface : page `src/pages/installation.astro` (rendue à la demande,
  super admin seul ; mise en page `src/layouts/InstallationLayout.astro`,
  sans `AdminLoader`) qui monte `src/components/admin/InstallationWizard.vue`
  ou l'écran de fin. `AdminRoot.vue` y renvoie (`verifierInstallation`,
  `apresConnexion` après connexion ou mot de passe provisoire, évènement
  `numerik:installation` du module Site), l'écran « Bienvenue » aussi.
- Secrets : `scripts/installation.mjs` (`lireSecrets`, `ecrireSecrets`,
  `chargerSecrets`, `assurerAuthSecret`, `lireInstallation`) ; chargés par
  `scripts/start.mjs` en production et par `src/integrations/installation.ts`
  en dev (en donnant la priorité au `.env`, contrairement à Vite).
- Secrets demandés : `secrets` de chaque plugin du catalogue
  (`src/plugins/catalogue.ts` : `nom`, `label`, `type` `url` / `identifiant`
  / `cle`, `obligatoire`, `genere`) ; fichier créé à l'activation :
  `modele`.
- Tout est contrôlé avant la moindre écriture ; chaque écriture de contenu
  rend son annulation (`Applied`), appelée si la reconstruction échoue
  (`publish({ onFailure })`).
