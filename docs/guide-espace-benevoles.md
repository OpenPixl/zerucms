# Guide de l'Espace Admin

L'Espace Admin permet au **bureau** et aux **animateur·rice·s** de se
connecter au site pour accéder aux pages réservées et aux outils
d'administration. Il n'y a **pas de page d'administration séparée** : tout
s'affiche par-dessus le site, sur la page où vous vous trouvez.

Ce guide a deux parties :

1. [Mise en service](#partie-1--mise-en-service) — pour la personne qui gère le serveur (une seule fois).
2. [Utilisation](#partie-2--utilisation) — pour le bureau et les animateur·rice·s.

Détail technique (fichiers, routes, sécurité) : [auth.md](auth.md).

---

## Partie 1 — Mise en service

À faire **une fois**, sur le VPS, en plus de l'installation décrite dans
[deploiement.md](deploiement.md).

### 1. Secret de session (facultatif)

Le secret signe les cookies de connexion. **S'il manque, le site en génère
un au premier démarrage** et le garde dans
`data/installation/secrets.env` : rien à faire. Pour le fixer vous-même
(plusieurs serveurs, secret déjà connu) :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# ou, sans Node sur le VPS :
openssl rand -base64 32
```

Ajouter la valeur obtenue au fichier `.env` du VPS (à côté des clés Grist) :

```dotenv
AUTH_SECRET=colle-ici-la-chaine-generee
```

> ⚠️ **Le `.env` doit se terminer par un retour à la ligne** avant d'ajouter
> une ligne à la fin (`echo >> .env` au besoin) — sinon la nouvelle variable
> se colle à la précédente et casse les deux.
>
> Ne partagez jamais ce secret. Le changer **déconnecte tout le monde**
> (utile si un appareil a été perdu).

### 2. Vérifier le dossier des comptes

Les comptes sont des fichiers stockés dans `data/accounts/` **sur le VPS**,
hors de l'image Docker. Le `docker-compose.yml` monte déjà ce dossier :

```yaml
environment:
  - DATA_DIR=/app/data
volumes:
  - ./data:/app/data
```

Rien à faire de plus : le dossier est créé au premier compte. Il **survit
aux mises à jour** (`./update.sh`) et n'est jamais envoyé sur git.

> 💾 **Sauvegardez `data/`** avec vos autres sauvegardes du VPS : c'est la
> seule donnée de l'Espace Admin. Perdre ce dossier = recréer les comptes.

### 3. Déployer

Premier démarrage : voir [deploiement.md](deploiement.md)
(Docker ou Node.js). Ensuite, les nouvelles versions passent par
`./update.sh` ([mise-a-jour.md](mise-a-jour.md)) — jamais de `git pull`.

> Si seul le `.env` a changé, il suffit de recréer le conteneur pour que le
> nouveau secret soit lu :
>
> ```bash
> DOCKER_CONFIG=$PWD/.dockercfg docker compose up -d --force-recreate
> ```

### 4. Créer le super admin et le premier compte administrateur

Sur un site neuf, le premier compte se crée **dans le navigateur** : tant
qu'aucun compte n'existe, le site affiche l'écran « Bienvenue » qui crée le
super admin avec le mot de passe de votre choix, puis ouvre l'assistant
d'installation ([deploiement.md](deploiement.md#partie-d--paramétrer-le-site-dans-le-navigateur)).
Le script `./auth-user.sh` (à côté de `update.sh`) reste disponible pour le
faire en ligne de commande ou dépanner un compte.

Le **super admin** : compte technique (rôle `superadmin` seul), qui a
tous les droits et est **le seul à voir le journal des modifications**. Il
n'apparaît pas dans le module « Comptes » et ne peut y être ni modifié ni
supprimé. Son mot de passe est provisoire : il **doit être changé à la
première connexion**.

```bash
cd /opt/numerik2026
./auth-user.sh init                     # login « superadmin » ; ou : ./auth-user.sh init <login> "<Nom>"
```

La commande ne fait rien si un super admin existe déjà (relançable sans
risque). Pour imposer le mot de passe provisoire au lieu de le générer :
`SUPERADMIN_PASSWORD='…' ./auth-user.sh init`.

Le reste se fait dans le navigateur : connectez-vous en super admin
(**« Espace Admin »** en bas de page), choisissez votre mot de passe, et
l'**assistant d'installation** s'ouvre (voir [ci-dessous](#5-assistant-dinstallation)).

Sans l'assistant (ou pour un compte de plus), le compte du bureau se crée
aussi en ligne de commande :

```bash
./auth-user.sh add xavier "Xavier Burke" admin
```

La commande affiche un **mot de passe provisoire** (ex. `k7mp-q3zt-h9wx`),
**une seule fois** : notez-le, connectez-vous, puis changez-le (voir
[Changer mon mot de passe](#changer-mon-mot-de-passe)).

> `./auth-user.sh` lance le CLI **dans le conteneur** (`docker compose exec`)
> en posant `DOCKER_CONFIG` comme `update.sh` (`/root` est en lecture seule
> sur le VPS). Ne lancez pas `node dist/cli/auth-user.mjs` directement sur le
> VPS : le `dist/` du VPS n'est pas celui de l'image.

Autres commandes utiles :

```bash
# lister les comptes
./auth-user.sh list

# nouveau mot de passe provisoire (et réactive le compte) — dépannage
# (pour le super admin, le changement est à nouveau imposé à la connexion)
./auth-user.sh reset xavier
```

> L'identifiant : 2 à 32 caractères, minuscules, chiffres, `.`, `-` ou `_`
> (ex. `prenom.nom`). Groupes possibles : `admin`, `animateur`, `redacteur`.

### 5. Assistant d'installation

Détail (fichiers écrits, secrets, reprise) : [installation.md](installation.md).

À la première connexion du super admin sur un site neuf (aucun autre
compte), après le changement de mot de passe, une fenêtre **« Installation
du site »** s'ouvre :

0. **Structure** : **Association** ou **Auto-entrepreneur**. Ce choix décide
   des plugins proposés (adhésion et inscription pour une association,
   devis et facturation pour un auto-entrepreneur, rendez-vous pour les
   deux), du vocabulaire de l'Espace Admin (module « Association » ou
   « Entreprise »), des mentions légales (RNA et président·e, ou SIRET et
   entrepreneur individuel « EI ») et du contenu d'exemple (pages « À
   propos » et « Prestations », accueil adapté, page Activités désactivée).
1. **Compte** : le compte administrateur (bureau) de l'association. Un mot
   de passe provisoire est proposé : notez-le et transmettez-le, il sera
   changé à la première connexion.
2. **Association** : nom, email, téléphone, adresse et, si vous l'avez, le
   logo. Le reste (présentation, réseaux, mentions légales, couleurs) :
   **Paramètres → Association**.
3. **Plugins** : tous décochés au départ ; cochez les volets utiles
   (Adhésion, Inscription, Rendez-vous). Cocher un plugin coche ceux qu'il
   requiert.
4. **Réglages** des plugins cochés : adresse et identifiant du document
   Grist, clé d'API… Les **secrets** (clés, identifiants) sont gardés sur le
   serveur dans `data/installation/secrets.env` (droits 600, jamais dans
   les sauvegardes ni dans git) et ne se saisissent **qu'ici** : ensuite,
   ils se changent dans le `.env`, qui l'emporte toujours. Une variable déjà
   présente dans le `.env` est signalée et n'est pas demandée.
5. **Contenu** : garder le contenu de démonstration, ou partir d'un site
   vide (les mentions légales, catégories d'activités et pages du site
   restent ; un exemple déjà modifié n'est jamais retiré).
6. **Installer** : récapitulatif, puis le site est reconstruit (page de
   maintenance avec barre de progression) et revient seul.

**Plus tard** referme l'assistant jusqu'à la fermeture de l'onglet ; il
se rouvre ensuite, ou depuis **Paramètres → Site**. Si la reconstruction
échoue, le contenu est remis en l'état (le compte et les secrets restent)
et l'assistant se rouvre. Un site déjà en service (des comptes existent)
ne le voit jamais.

### 6. Vérifier

1. Ouvrir le site, cliquer sur **« Espace Admin »** tout en bas de la page.
2. Se connecter avec le compte créé : une **barre sombre** apparaît en haut.

### Reverse proxy (nginx)

La configuration nginx de [deploiement.md](deploiement.md#c3-configurer-nginx)
convient telle quelle. Il est conseillé d'y ajouter une ligne :

```nginx
proxy_set_header X-Forwarded-Host  $host;
```

et de **relever la taille maximale des requêtes** (photos des actualités :
10 Mo max, ≈ 13,5 Mo une fois encodées ; défaut nginx : 1 Mo → erreur 413) :

```nginx
client_max_body_size 20m;
```

Puis `nginx -t && systemctl reload nginx`. Vérifier aussi que `SITE_URL`
(`.env`) est bien l'adresse publique du site (ex. `https://www.mon-asso.fr`) :
c'est le seul domaine accepté pour la connexion. Si le site répond aussi sur
un autre domaine (sans `www`, autre nom…), le rediriger vers celui-ci dans
nginx — indispensable aussi pour le référencement (sinon contenu dupliqué,
voir [referencement.md](referencement.md)) :

```nginx
# Bloc server du domaine SANS www (certificat HTTPS compris) :
server {
    listen 443 ssl;
    server_name mon-asso.fr;
    # ssl_certificate … (mêmes lignes que le bloc principal, ou certbot)
    return 301 https://www.mon-asso.fr$request_uri;
}
```

Vérifier : `curl -I https://mon-asso.fr/` doit répondre `301` vers `https://www.…`.

### En local (développement)

```bash
# .env : AUTH_SECRET=<chaîne aléatoire ≥ 32 caractères>
npm run auth:user -- add xavier "Xavier Burke" admin
npm run dev
```

Les comptes locaux sont dans `./data/accounts/` (ignoré par git).

---

## Partie 2 — Utilisation

### Se connecter

1. Sur n'importe quelle page du site, cliquer sur **« 🔒 Espace Admin »**
   tout en bas (dernière ligne du pied de page).
2. Saisir son **identifiant** et son **mot de passe**, puis **Se connecter**.
3. La page se recharge et une **barre sombre** apparaît en haut de l'écran.

On reste connecté·e **14 jours** sur cet appareil (prolongé à chaque visite).

> Après **5 erreurs** de mot de passe, la connexion est bloquée **15 minutes**.
> Mot de passe oublié ? Demandez à un membre du bureau de le réinitialiser.

### La barre d'administration

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⚙ Espace Admin   🔒 Pages réservées              🖥 Production  👤 Marie ▾ │
└────────────────────────────────────────────────┬─────────────────────────┤
                                                 │ 👤 Mon compte │ ⏻ Déconnexion │
                                                 └─────────────────────────┘
```

- La barre occupe toute la largeur de l'écran.
- Le **nom** à droite ouvre un menu personnel : **Mon compte** et
  **Déconnexion** (fermé par un clic ailleurs ou **Échap**).
- Un badge, juste avant le nom, indique le **mode du serveur** : **Production** (vert, icône serveur) —
  chaque publication reconstruit le site — ou **Développement** (ambre) —
  serveur de test, modifications visibles aussitôt, sans reconstruction.
- **Bureau seulement** : quand une version plus récente du modèle est
  publiée, un badge bleu **Mise à jour X.Y.Z** apparaît avant ce badge. Un
  clic ouvre les nouveautés (Release GitHub) ; la mise à jour se fait sur le
  serveur avec `./update.sh` ([mise-a-jour.md](mise-a-jour.md)). Simple
  information : le site fonctionne normalement en attendant. Le
  badge **Production** (ou **Développement**) affiche la version en place
  (ex. « Production v0.2.0 »), visible du bureau seulement.
- Chaque bouton ouvre un **module** dans un **panneau à droite**, par-dessus
  la page (plein écran sur téléphone, où seules les icônes s'affichent).
- **Contenus ▾** regroupe **Pages**, **Activités**, **Actualités** et **Annonces** : un
  clic les affiche côte à côte, juste en dessous (fermé par un clic ailleurs
  ou **Échap**). Avec le droit d'en voir un seul, il a son propre bouton.
- **Paramètres ▾** (bureau) regroupe de même **Association**, **Comptes**,
  **Sauvegardes** et **Site** (mode maintenance).
- **Maintenance** (pastille rouge) : le site est en maintenance pour les
  visiteurs ; un clic ouvre le module **Site** pour la lever.
- Premier bouton de **Contenus ▾** : **Ajouter un contenu**. Une
  fenêtre s'ouvre au centre : on y dépose un fichier `.md` (modèles
  téléchargeables en bas de la fenêtre). Le type de contenu est lu dans la
  ligne `contenu:` de son en-tête (`actualite`, `page`, `activite` ou `annonce`) — à
  choisir dans la fenêtre si elle manque. **Créer…** ouvre le module
  correspondant sur son formulaire de création, déjà rempli : il reste à
  vérifier, choisir l'emplacement ou la catégorie, ajouter une photo, puis
  enregistrer. Un fichier d'un autre type chargé dans un formulaire est refusé.
- Pour fermer un panneau : la croix ✕, la touche **Échap**, ou un clic sur
  la partie assombrie de la page. Dans un formulaire (actualité, page ou
  activité à ajouter ou modifier, compte à créer ou modifier), ces mêmes gestes ramènent
  d'abord à la liste.
- Vous naviguez normalement sur le site : la barre vous suit sur toutes les pages.
- **À publier (N)** (ambre, rédaction et bureau) : apparaît dès qu'une
  modification a été enregistrée **sans publier**. Un clic montre la liste
  (quoi, qui, quand), **Publier les modifications** (une seule
  reconstruction pour tout) et **Tout annuler…** (défait toutes les
  modifications en attente, définitif).

Les modules visibles dépendent de votre groupe :

| Module | Super admin | Bureau (`admin`) | Rédacteur·rice | Animateur·rice |
| :--- | :---: | :---: | :---: | :---: |
| Pages réservées | — | — | — | ✅ |
| Pages | ✅ | ✅ | ✅ | — |
| Activités | ✅ | ✅ | ✅ | — |
| Actualités | ✅ | ✅ | ✅ | — |
| Annonces | ✅ | ✅ | ✅ | — |
| Rendez-vous (si le plugin `rdv` est actif) | ✅ | ✅ | — | ✅ |
| Facturation (si le plugin `facturation` est actif) | ✅ | ✅ | — | — |
| Association (menu Paramètres) | ✅ | ✅ | — | — |
| Sauvegardes (menu Paramètres ; restauration : super admin) | ✅ | ✅ | — | — |
| Comptes (menu Paramètres) | ✅ | ✅ | — | — |
| Site (menu Paramètres : mode maintenance) | ✅ | ✅ | — | — |
| Journal | ✅ | — | — | — |
| Plugins | ✅ | — | — | — |
| Mon compte | ✅ | ✅ | ✅ | ✅ |

Le bouton **Pages réservées** n'apparaît que pour qui n'a pas le module
**Pages** : celui-ci liste déjà les pages réservées (bloc « Pages
réservées »).

**Journal** (super admin seulement) : toutes les modifications faites depuis
l'Espace Admin — qui, quand, quoi, avec quel résultat (connexions,
mots de passe, actualités, pages, activités et catégories ajoutées /
modifiées / supprimées, changements d'ordre, informations de l'association, résultat de
chaque publication, comptes). Recherche par nom ou objet, connexions
masquables, une page par année. Lecture seule.

**Rendez-vous** (bureau et animateur·rice·s, si la prise de RDV est activée) :
les rendez-vous pris en ligne, **une semaine à la fois** (ouvert sur la
semaine en cours ; chevrons ‹ › pour la précédente ou la suivante, « Cette
semaine » pour revenir), par jour. La recherche, en haut du module (nom,
démarche, date au format 26/10/26 ou 26/10/2026 — « 26/10 » suffit —, et/ou
statut), porte sur toutes les semaines, passées comprises ; plusieurs mots
se cumulent (« camille 26/10 ») ; un clic sur une semaine
trouvée l'affiche. Le bouton **PDF** télécharge le planning de la semaine
affichée, du lundi au vendredi (logo de l'association, une colonne par jour,
créneaux libres et rendez-vous : démarche, nom de l'usager et son message — les
coordonnées restent dans le module, RGPD oblige — ; statut — Honoré, Absent — sur une semaine
terminée seulement ; rendez-vous annulés exclus) — document interne, à ne
pas diffuser. Il faut le serveur PDF (Gotenberg, `GOTENBERG_URL` du `.env`).
Un clic sur un RDV ouvre un **second panneau à gauche** : coordonnées et commentaire du bénéficiaire
(lecture seule, la fiche se modifie dans Grist) et le rendez-vous — jour et
horaire (seuls les créneaux libres de la période de réservation sont
proposés, urgences comprises), démarche, **statut** (Confirmé, Honoré, Absent,
Annulé : seul « Annulé » libère le créneau), puis, après le rendez-vous, le
**compte rendu de l'accompagnement** (lieu réel, matériel utilisé,
sous-thématique, niveau d'autonomie, orientation vers une autre structure,
notes) et l'**avis du bénéficiaire** (satisfaction, à choisir parmi cinq visages — un
nouveau clic l'efface —, suggestions) — rubriques
reprises des colonnes du document Grist. **Enregistrer** écrit directement dans Grist, sans reconstruire
le site ; un créneau déjà pris est refusé. Sur un écran assez large, les
rubriques sont sur deux colonnes (bénéficiaire et rendez-vous à gauche, compte
rendu et avis à droite). **Supprimer** (en bas de l'éditeur) efface le
rendez-vous de Grist — pour un doublon, une erreur de saisie, un test ; un
rendez-vous décommandé se passe plutôt en « Annulé » — après le choix d'un
**motif** (Doublon, Erreur de saisie, Rendez-vous de test, ou Autre avec une
précision obligatoire) ; la fiche du bénéficiaire reste. Échap ou la croix
ferme l'éditeur. Chaque modification et chaque suppression (avec son motif)
est notée dans le journal.

**Plugins** (super admin seulement) : volets du site que l'association active
ou non (aujourd'hui : adhésion et activités — adhésion en ligne,
« Je participe », planning Grist —, inscription aux activités, toutes deux
actives par défaut, et prise de rendez-vous en ligne). Désactiver
l'adhésion retire du site ses pages, le bouton « Adhérer », « Je participe »
et les séances Grist du planning, **et l'inscription**, qui en a besoin (la
page de l'adhésion le rappelle ; l'inscription ne peut pas être activée
sans elle). Désactiver l'inscription seule retire la page `/inscription` et
le bouton « S'inscrire » des fiches d'activité. La liste montre chaque
plugin et son état (actif, inactif, ou activation / désactivation en attente
de publication) ; l'icône **paramètres** (roue dentée) ouvre sa page de
configuration, un seul formulaire : description, documentation, ce qui lui
manque, la case **Plugin actif**, puis ses réglages par rubrique — pour la
prise de RDV : **adresse de la page** (ex. `/rendez-vous`, refusée si une
page du site l'utilise déjà ; les liens déjà écrits vers l'ancienne adresse
ne changent pas) et **document Grist** (adresse de l'instance, identifiant du
document, noms des tables ; un champ vide reprend la valeur du `.env`,
affichée en gris ; la clé d'API reste dans le `.env`). En bas, **Enregistrer
et publier**, qui reconstruit le site (ou rejoint les
modifications en attente avec « Enregistrer sans publier »). Un plugin dont
un fichier de réglages manque (ex. `src/content/rdv.yaml`) ne peut pas être
activé ; une clé secrète absente du `.env` est signalée, et la page dit
laquelle est utilisée (prise de RDV : `GRIST_API_KEY_RDV`, clé limitée au
document des RDV, sinon `GRIST_API_KEY`, celle de l'adhésion). Désactiver retire du site tout ce que le
plugin y ajoute, ses réglages sont gardés. Le changement est noté dans le
journal.

### Pages réservées

Liste les pages du site qui ne sont visibles qu'une fois connecté·e
(fiches pratiques, documents internes…). Un clic ouvre la page. Bureau et
rédacteur·rice·s les retrouvent dans le module **Pages** (bloc « Pages
réservées »), qui remplace alors ce bouton.

Si vous arrivez sur une page réservée **sans être connecté·e**, elle affiche
un encart **« Page réservée »** avec un bouton **Se connecter**.

### Publier une actualité

Module **📰 Actualités** (groupes *Rédacteur·rice* et *Bureau*). La liste
montre toutes les actualités, les plus récentes d'abord (badge
**Brouillon** pour celles non publiées) ; « Voir la page Actualités » ouvre la
page publique.

1. **+ Ajouter une actualité**, puis **Télécharger un modèle** : un fichier
   `.md` déjà daté du jour, avec des exemples de mise en forme, à compléter
   dans n'importe quel éditeur de texte. Il commence par cet en-tête :

   ```markdown
   ---
   title: "Atelier retouche photo"
   publishAt: 2026-10-15
   excerpt: "Un court résumé affiché sur les cartes et l'accueil."
   tag: "Ateliers"
   author: "numérik&Co"
   ---

   Le texte de l'actualité. **Gras**, listes, sous-titres `## …`, liens…
   ```

   `title`, `publishAt` (AAAA-MM-JJ) et `excerpt` sont obligatoires ;
   `tag`, `author`, `imageCredit` facultatifs ; `isPublish: false` pour un
   brouillon. Détail des champs : [actualites.md](actualites.md).
2. Glisser le fichier `.md` dans la première zone (ou cliquer pour le
   choisir) : un aperçu (titre, date, résumé) s'affiche, un champ manquant
   est signalé en rouge.
3. Glisser la **photo** de couverture dans la seconde zone (JPEG, PNG ou
   WebP, 10 Mo max) — facultative mais recommandée. Sa position GPS et ses
   autres métadonnées sont retirées automatiquement.
4. **Publier l'actualité** : le site est **reconstruit** (de quelques
   secondes à une minute) ; un encadré « Publication en cours » suit
   l'avancement, puis affiche le lien vers l'actualité en ligne. Fermer
   cet encadré par sa croix ✕ le fait disparaître **définitivement, pour
   tout le monde** ; le résultat reste consultable dans le journal du super
   admin. On peut fermer le panneau pendant la publication.
   Une fois en ligne, la **page s'actualise** d'elle-même après 3 secondes
   (« Ne pas actualiser » pour rester sur la version affichée) et le module
   se rouvre : le site visible est à jour. Si la page affichée n'existe plus
   (actualité supprimée, adresse changée), on arrive sur la page publiée ou
   sur l'accueil. Vaut pour tous les modules qui publient (Actualités, Pages,
   Activités, Association).

**Enregistrer sans publier** : chaque formulaire (et la pastille de
suppression, choix **Sans publier**) permet d'enregistrer sans reconstruire le
site. La modification est gardée mais **pas encore visible** sur le site
(badge **À publier** dans les listes) ; on enchaîne les retouches sans
attendre, puis **Publier les modifications (N)** — en tête du module ou dans
la barre — les met toutes en ligne en une fois. Idéal au lancement du site.
Attention : les modifications en attente sont communes à tout le monde, et
**Enregistrer et publier** publie aussi celles qui attendaient.

Le texte accepte le **HTML** en plus du Markdown : tableaux, encadrés
(`<div>`), mise en forme, détails dépliables, vidéos et cartes intégrées
(`<iframe>` YouTube, Vimeo, PeerTube, OpenStreetMap). Par sécurité, tout code
exécutable (`<script>`, `<style>`, attributs `onclick=`…, liens
`javascript:`, iframes d'autres sites) est **retiré à l'affichage**, sans
toucher au reste.

Refusés à l'envoi, avec un message qui indique la ligne en cause : les liens
Markdown autres que `http(s)`, `mailto:`, `tel:` ou internes, et les images
Markdown locales (`![…](./photo.jpg)` : seule la photo de couverture se
dépose ; une image en ligne `https://…` est acceptée). Si la reconstruction
échoue, rien n'est publié et le site reste tel quel.

> Le titre et la date forment l'adresse de la page
> (`/actualites/2026-10-15-atelier-retouche-photo`) : deux actualités ne
> peuvent pas avoir la même date et le même titre.

**Supprimer une actualité** : icône 🗑 au bout de sa ligne, puis
**Supprimer** dans l'encadré rouge qui apparaît (ou **Annuler**). Le site est
reconstruit comme pour un ajout ; l'actualité disparaît de la page
Actualités, de l'accueil et du flux RSS. Si la reconstruction échoue, rien
n'est supprimé. **Sans publier** (même encadré) : la suppression attend les
autres modifications. Même encadré pour toutes les suppressions (pages,
menus déroulants, activités, catégories) et la désactivation d'une page du site.

**Modifier une actualité** : clic sur son **titre** dans la liste (l'icône 👁
au bout de la ligne ouvre la page sur le site). Un formulaire
s'ouvre, prérempli : titre, date, catégorie, résumé, auteur·rice, texte (en
Markdown), photo (**Remplacer** / **Retirer**), crédit photo, et la case
**Brouillon** pour retirer l'actualité du site sans la supprimer (la décocher
plus tard la republie). **Enregistrer et publier** reconstruit le site ;
si la reconstruction échoue, la version précédente est conservée.
**Enregistrer sans publier** garde la modification en attente (voir plus haut).

**Formulaires en onglets** (actualités, pages, activités) : **Informations**
(titre, résumé, date, emplacement, brouillon…), **Contenu** (texte en
Markdown, et blocs d'une page enrichie) et **Image** (photo de couverture et
crédit). En cas de champ obligatoire vide, l'enregistrement ramène sur son
onglet.

**Travailler dans un fichier** (modification seulement) : au-dessus des
onglets, **Télécharger le fichier** donne le contenu du formulaire en `.md`
(en-tête + texte, sans la photo ; la ligne `contenu:` en tête indique le
type, ce qui permet de le réutiliser dans **Ajouter un contenu**) ; après l'avoir modifié dans un éditeur de
texte, **Charger un fichier modifié** (ou le glisser sur le bouton) remplit
le formulaire. Rien n'est publié avant **Enregistrer** ; les champs ignorés
(photo, champ inconnu, catégorie inexistante, date illisible…) sont signalés.
L'adresse et l'emplacement restent ceux du formulaire.

**Insérer un lien vers une page du site** (sous le texte des actualités, des
pages et des activités) : liste des pages du site, des pages de contenu, des
catégories et fiches d'activité et des actualités, avec une recherche. Placer
le curseur dans le texte (ou sélectionner les mots à transformer en lien),
puis cliquer sur la page : `[Titre](/adresse)` est inséré. Brouillons, pages
réservées et actualités à paraître sont signalés : le lien n'est pas encore
(ou pas pour tout le monde) consultable.

> L'adresse de la page ne change pas, même si le titre ou la date sont
> modifiés : les liens déjà partagés continuent de fonctionner.

> Supprimer à la main le dossier dans `src/content/news/` ne retire
> l'actualité du site qu'à la prochaine reconstruction : passez par le
> module.

Côté serveur, la publication a des prérequis (sources du site, gestionnaire
de process) : voir [publication.md](publication.md).

### Gérer les pages et les menus déroulants

Module **🗂 Pages** (groupes *Rédacteur·rice* et *Bureau*). La liste a quatre
blocs :

1. **Menu de navigation**, dans l'ordre d'affichage : pages du site
   (Accueil, Activités…), liens directs et **menus
   déroulants** (comme « Association ») ; un clic sur le nom d'un menu
   déroulant déplie ou replie ses pages ;
   Pour changer l'ordre (premier niveau, ou pages d'un menu déroulant),
   **glissez la ligne par sa poignée ⠿** (souris ou doigt), ou utilisez les
   flèches **↑/↓** (affichées sur téléphone et tablette ; sur grand écran,
   elles réapparaissent au clavier avec Tab) ; un bandeau propose alors **Enregistrer et publier** (une
   seule reconstruction pour tous les déplacements), **Enregistrer sans publier** ou **Annuler** ;
2. **Pages libres** : hors du menu, accessibles par leur adresse seulement ;
3. **Pages réservées** (Espace Admin) ;
4. **Bibliothèque de pages du site** : les pages fournies par le site
   (Activités, Actualités, Contact) désactivées, avec un bouton **Activer**.

**Nouvelle page** : choisir d'abord le type —

- **Page classique** : du texte mis en forme (titres `##`, listes, liens,
  tableaux) et une photo de couverture facultative ;
- **Page enrichie** : la même chose, plus des **blocs** (grille de cartes,
  encadré tarif, bouton, encadré d'information, prise de rendez-vous si le
  plugin `rdv` est actif). « Ajouter un bloc » le crée et insère son marqueur
  `[[bloc:…]]` dans le texte à l'endroit du curseur ; le bloc s'affiche à
  cet endroit (on peut déplacer la ligne du marqueur). Sous les textes des
  blocs (cartes, encadré), « Insérer un lien vers une page du site » ; sous
  le lien d'un bouton, « Choisir une page du site » remplit l'adresse.

**Ou à partir d'un fichier `.md`** (même écran) : « Télécharger un modèle »
(page classique ou page enrichie, avec des exemples de chaque bloc), le
compléter dans un éditeur de texte, puis le déposer. Le formulaire est
pré-rempli (titre, description, texte, blocs, libellé du menu) ; il reste à
vérifier, choisir l'emplacement et publier. Les champs non repris
(`access`, `cover`…) sont signalés en tête du formulaire.

Puis : titre, description, **emplacement** — **menu de navigation** (lien
direct ou dans un menu déroulant, au choix sous « Position dans le menu »),
**page libre** (hors menu, accessible par son adresse ou un lien) ou **page
réservée** (avec les groupes autorisés) —, adresse (déduite du titre),
libellé dans le menu de navigation. Une nouvelle page (ou une page changée
d'emplacement) se place en **dernière position** de son menu.
« Insérer une information de l'association » liste les variables
(`{{association.nom}}`…) remplacées par les vraies valeurs ; « Insérer un
lien vers une page du site » ajoute un lien vers une autre page (voir
[Publier une actualité](#publier-une-actualité)).

**Créer et publier** reconstruit le site (environ une minute) ; en cas
d'échec, rien n'est modifié. **Enregistrer sans publier** la garde en
attente, avec les autres modifications (badge **À publier** dans la liste). Changer l'emplacement ou l'adresse d'une page
**change son adresse** : les liens déjà partagés vers l'ancienne ne
fonctionnent plus.

Dans la liste, un clic sur le **titre** d'une page (ou le crayon) ouvre sa
modification ; l'icône 👁 l'ouvre sur le site.

**Pages du site** (Accueil, Activités, Actualités, Contact) : leur mise en
page est fournie par le site, l'association règle le reste.

- **Modifier** (crayon) : libellé et visibilité du lien dans le menu
  (masqué, la page reste accessible par son adresse), puis les **textes** de
  la page, section par section (titres, accroches, boutons). Les variables
  `{{association.nom}}`… sont acceptées. Un texte vidé reprend sa valeur
  d'origine ; « rétablir les textes d'origine » les remet tous.
- **L'accueil** est composé de **modules**, dans l'ordre d'affichage :
  bandeau, dernières actualités, activités, prise de rendez-vous (plugin `rdv`), appel à
  l'action, partenaires, texte libre. Le crayon de l'Accueil permet d'en
  **ajouter** (liste « Ajouter un module… » ; l'appel à l'action et le texte
  libre peuvent figurer plusieurs fois), d'en **retirer** (corbeille), de
  les **ordonner** (poignée ⠿ ou ↑/↓) et de **modifier leur contenu** (clic
  sur le module : titres, textes, boutons et leurs liens, nombre d'actualités…). Un champ
  facultatif vidé masque l'élément (ex. second bouton du bandeau). La
  **photo de fond** se règle dans le module **Bandeau** : remplacer
  (JPEG, PNG ou WebP, paysage d'au moins 1 600 px, 10 Mo max ; réduite à
  2 400 px de large) ou retirer (fond uni) ; elle part avec le reste à
  l'enregistrement. Dans l'**accroche** du bandeau (et celle des pages
  Activités, Actualités, Contact), `**mot**` met en gras et `*mot*` en italique. « Revenir
  à l'accueil d'origine » remet les modules de départ. Rien n'est publié
  avant **Enregistrer et publier**.
- **Référencement de l'accueil** (sous ses modules) : titre de l'onglet et
  des résultats de recherche, et description, jamais affichés sur la page.
  Par défaut le nom et la présentation courte de l'association ; viser le
  nom + l'activité + la ville. Sous ces champs, et sous le titre et le
  résumé des pages, actualités et activités, un compteur indique la
  longueur (titre : 15 à 60 caractères, description : 120 à 160) ; en
  orange, le texte risque d'être coupé ou est trop court, sans empêcher
  d'enregistrer.
- **Désactiver** (corbeille, après confirmation) : la page disparaît du menu
  **et** du site (son adresse affiche « page introuvable ») ; les liens de
  l'accueil vers elle sont masqués. Elle passe dans la **Bibliothèque**, d'où
  **Activer** la remet en place. L'accueil ne se désactive pas.

**Nouveau menu déroulant** : un libellé (non cliquable sur le site) ; il se
place en dernière position du menu de navigation (poignée ⠿ ou flèches ↑/↓
pour le déplacer). Il apparaît sur le site dès qu'il contient une page. Un menu déroulant ne se supprime que vide.

> Les pages « technique » (fichiers `.mdx`) se modifient dans le code
> uniquement.

### Gérer les activités

Module **🧑‍🏫 Activités** (groupes *Rédacteur·rice* et *Bureau*) : les fiches
des parcours, ateliers… proposés par l'association. Ce sont elles qu'on
retrouve sur les pages de catégorie (`/activites/parcours`…) et sur leur
propre page (`/activites/<catégorie>/<adresse>`). À ne pas confondre avec
les **actualités** (annonces datées) ni avec le **planning** de la semaine,
qui vient de Grist.

La liste a **une section par catégorie** (Parcours, Ateliers…, voir
[plus bas](#les-catégories)), dans l'ordre du site. Chaque ligne montre la vignette,
le titre (lien vers la fiche en ligne) et des pastilles :

| Pastille | Signification |
| :--- | :--- |
| **brouillon** | Fiche enregistrée mais absente du site (titre grisé) |
| *niveau* (ex. « Initiation ») | Pastille affichée sur la carte de l'activité |
| **sans inscription** | Bouton « S'inscrire » masqué sur la fiche |

Une catégorie vide indique « Aucune activité » : sa page affiche alors
« bientôt ».

Dans la liste, un clic sur le **titre** d'une fiche ou d'une catégorie (ou
le crayon) ouvre sa modification ; l'icône 👁 l'ouvre sur le site (pas
d'icône pour un brouillon, absent du site).

#### Créer une activité

1. **+ Nouvelle activité** (ou le **+** dans l'en-tête d'une catégorie, qui
   la présélectionne).
2. Remplir le formulaire :
   - **Titre** et **Résumé** (une ou deux phrases, affiché sur la carte et
     dans les moteurs de recherche) — obligatoires ;
   - **Catégorie** — obligatoire ;
   - **Adresse** — déduite du titre (`atelier-photo`), modifiable à la
     création seulement : minuscules, chiffres et tirets ;
   - **Publiée** — décocher pour garder la fiche en **brouillon** ;
   - **Niveau** (facultatif) — ex. *Grand débutant*, *Tous niveaux* ;
   - **Photo de couverture** (facultative, JPEG, PNG ou WebP, 10 Mo max ;
     position GPS et métadonnées retirées) et son **crédit** (sinon
     « Photo : <nom de l'association> ») ;
   - **Texte de la fiche** — en Markdown, obligatoire ; le HTML est accepté
     et nettoyé à l'affichage, comme pour les actualités ; « Insérer un lien
     vers une page du site » ajoute un lien vers une autre page ;
   - **Inscription en ligne** — voir plus bas.
3. **Créer et publier** : le site est reconstruit (encadré « Publication en
   cours », comme pour les actualités). La fiche se place **en dernier** dans
   sa catégorie.

#### Le bouton « S'inscrire »

Chaque fiche publiée a un bouton **S'inscrire** qui ouvre le formulaire
d'inscription en présélectionnant les activités Grist correspondantes :

- **Activité(s) Grist visée(s)** — un nom par ligne, tel qu'il est écrit dans
  la colonne « Nom » de la table *Activite* de Grist. Un `*` final vise
  tous les noms qui commencent ainsi (`Initiation*`). Vide = le titre de la
  fiche.
- **Type Grist visé** — *Séances*, *Ateliers* ou *Atelier CN*, seul ou avec
  les noms.
- Décocher **Bouton « S'inscrire » sur la fiche** pour le masquer (ex. activité sur
  rendez-vous). Il est aussi masqué partout quand le formulaire
  d'inscription est fermé.

Détail : [inscription.md](inscription.md#présélection).

#### Modifier, réordonner, supprimer

- **✏️** ouvre la fiche, préremplie. **Enregistrer et publier** reconstruit
  le site. La photo se **remplace** ou se **retire**.
- L'**adresse** ne change pas, même si le titre change : les liens déjà
  partagés continuent de fonctionner. **Changer de catégorie** change en
  revanche l'URL (`/activites/<nouvelle-catégorie>/<adresse>`), ce que le
  formulaire signale, et place la fiche en dernier de sa nouvelle catégorie.
- La **poignée ⠿** en début de ligne (à glisser) ou les flèches **↑/↓**
  changent l'ordre dans une catégorie. Un bandeau
  propose alors **Enregistrer et publier** (une seule reconstruction pour
  tous les déplacements), **Enregistrer sans publier** ou **Annuler**. Tant qu'il est affiché, les autres
  actions attendent.
- **🗑** supprime la fiche (photo comprise) après confirmation dans
  l'encadré rouge. Pour la retirer du site sans la perdre, préférez la case
  **Publiée** (brouillon).

Si une reconstruction échoue, rien n'est publié : la fiche (ou l'ordre)
revient à son état précédent et le site reste tel quel.

#### Les catégories

Les catégories (Parcours, Ateliers…) se gèrent dans le même module. Chacune
a sa carte sur l'accueil et sur la page Activités, et sa propre page
(`/activites/<adresse>`) qui liste ses activités.

- **Nouvelle catégorie** (en haut du module) : **nom**, **adresse** (déduite
  du nom, **fixée ensuite**), **icône** (à choisir dans la grille) et
  **description** facultative (une phrase affichée en haut de sa page).
  **Créer et publier** : elle se place en dernier.
- **✏️** dans l'en-tête d'une catégorie : changer son nom, son icône ou sa
  description. L'adresse ne change pas.
- La poignée ⠿ ou les flèches **↑/↓** de l'en-tête changent l'**ordre des
  catégories** (sur
  l'accueil et la page Activités). Comme pour les fiches, un bandeau propose
  **Enregistrer et publier** : déplacements de catégories et de fiches
  partent ensemble, en une seule reconstruction.
- **🗑** n'apparaît que sur une catégorie **vide** (aucune fiche, brouillons
  compris) : déplacez ou supprimez d'abord ses fiches. Il reste toujours au
  moins une catégorie.

Une fiche dont la catégorie a disparu (fichier modifié à la main) est
signalée en rouge en haut du module : ouvrez-la et choisissez-en une autre.

### Gérer les annonces

Les **annonces** s'affichent dans une bannière au-dessus du menu, sur toutes
les pages, entre deux dates (assemblée générale, fermeture, recherche de
bénévoles…). Module **Annonces** du menu **Contenus ▾**.

- La liste suit l'**ordre de défilement** de la bannière, avec l'état de
  chaque annonce : **en ligne**, **à venir**, **terminée** ou **brouillon**.
  Poignée ⠿ ou flèches ↑/↓ pour changer l'ordre, puis enregistrer.
- **Nouvelle annonce** (ou le crayon pour modifier) : titre, message (une à
  deux phrases), dates d'affichage (la fin est incluse), couleur de la
  bannière (principale, accent, urgent), icône, lien facultatif (texte **et**
  adresse ; « Choisir une page du site » remplit l'adresse). Un aperçu de la
  bannière suit la saisie. **Annonce active** décochée = brouillon, jamais
  affiché.
- **Par fichier `.md`**, comme les autres contenus : **Ajouter un contenu**
  (modèle « annonce », en-tête `contenu: annonce`, message = texte sous
  l'en-tête), et en modification **Télécharger le fichier** / **Charger un
  fichier modifié**.
- Une annonce terminée ne s'affiche plus d'elle-même : la supprimer n'est
  pas obligatoire.
- Un visiteur qui a fermé la bannière ne la revoit pas pendant sa visite ;
  une modification ne la lui réaffiche pas.

### Informations de l'association (bureau)

Module **🏛 Association**, réservé au bureau, en deux onglets :
**Généralités** et **Charte graphique**. Chaque onglet s'enregistre à part ;
une pastille orange signale un onglet modifié mais pas encore publié.

#### Généralités

Nom, présentation,
coordonnées, réseaux sociaux et mentions légales. Ces informations
apparaissent partout sur le site (en-tête, pied de page, page Contact,
aperçus de partage) et dans le texte des pages grâce aux variables
`{{association.nom}}`, `{{association.email}}`… (liste dans le formulaire
d'une page).

Le formulaire est découpé en blocs : **Identité**, **Coordonnées**,
**Réseaux sociaux**, **Mentions légales** (avec l'hébergeur du site).

- Nom, présentation, email, téléphone et adresse sont **obligatoires**.
- Réseaux sociaux : adresse complète (`https://…`) ; un champ vide masque
  l'icône du pied de page.
- Mentions légales : facultatives ; un champ vide s'affiche
  « [À compléter : …] » dans les pages qui l'utilisent (ex. mentions
  légales). Le responsable de la publication reprend le·la président·e s'il
  est vide.

Dès qu'un champ change, un bandeau **Modifications pas encore enregistrées**
reste en haut du panneau : **Enregistrer et publier** reconstruit le site
(environ une minute), **Enregistrer sans publier** la garde en attente,
**Annuler** remet les valeurs enregistrées. En cas
d'échec de la reconstruction, l'ancienne version est remise en place.

Le fichier modifié est `src/content/association.yaml` : ses commentaires
sont conservés, il reste modifiable à la main.

#### Charte graphique

- **Aperçu** : en-tête, bande de couleurs, lien, bouton et pied de page
  avec les couleurs et le logo en cours de saisie, avant publication.
- **Couleurs** : principale (liens, boutons, titres), secondaire (pied de
  page, survols), d'accent (bouton « Adhérer »). Nuancier ou code
  `#2f7fc1`. Le site écrit en blanc sur ces couleurs : une étiquette
  indique si c'est **lisible**, lisible en **gros caractères seulement**,
  ou **peu lisible**. « couleur d'origine » remet celle du modèle.
- **Bande de couleurs** (sous l'en-tête) : 1 à 12 couleurs, à réordonner
  (glisser-déposer ou flèches), ajouter, retirer ; « bande d'origine ».
  L'interrupteur **Affichée / Masquée** de la section la retire du site (et
  du PDF des rendez-vous) ; ses couleurs sont gardées pour la réactiver.
- **Polices** : une pour les **titres**, une pour le **texte**, choisies
  dans la liste des **polices proposées** (Montserrat, Open Sans, Inter,
  Roboto, Raleway, Source Sans 3, Nunito, Work Sans, Lora ; par défaut
  Montserrat pour les titres, Open Sans pour le texte) ou parmi **vos
  polices**. Un exemple de texte s'affiche dans la police choisie, et
  l'aperçu en haut de l'onglet la reprend. **Ajouter une police** : un
  nom, puis ses fichiers (WOFF2 conseillé ; WOFF, TTF, OTF acceptés ; 2 Mo
  max), chacun avec sa **graisse** (devinée d'après le nom du fichier :
  « Light » = 300, « Bold » = 700…) ou un seul fichier **variable**. Le
  site emploie les graisses 300, 400, 500 et 600 pour le texte, 600 pour
  les titres : une graisse absente est signalée (le navigateur l'imite,
  rendu moins net). Vérifiez que la licence de la police autorise l'usage
  sur un site web. Une police n'est retirable (✕) que si elle n'est
  choisie ni pour les titres ni pour le texte. Les polices sont servies par
  le site lui-même, jamais par Google Fonts.
- **Logo** : PNG à fond transparent ou SVG de préférence (JPEG, WebP
  acceptés, 5 Mo max). Une très grande image est réduite (1 600 px de
  large).
- **Icône d'onglet** (favicon) : image carrée, SVG ou PNG (512 × 512
  conseillé), ICO accepté. Remplace toutes les icônes actuelles ; un SVG
  donne aussi une version PNG pour les anciens navigateurs.

Un SVG contenant du script ou des liens externes est refusé par sécurité :
l'exporter en « SVG simple » ou en PNG. Fichiers modifiés : `colors:` et
`polices:` de `src/content/reglages.yaml` (autres réglages et commentaires
gardés), `src/content/images/logo.*` et `favicon.*`, `src/content/polices/`. Si la reconstruction échoue,
tout est remis comme avant.

### Sauvegardes (bureau)

Module **Sauvegardes** : une archive **.zip** de tout ce qui appartient à
l'association (contenu du site, comptes et journal de l'Espace Admin ; jamais
le `.env`), rangée sur le serveur.

- **Créer une sauvegarde** (motif facultatif), puis **télécharger** (⬇) pour
  en garder une copie hors du serveur.
- **Déposer une sauvegarde** venue d'ailleurs : elle est rangée avec les
  autres, rien n'est restauré (super admin : restaurée aussitôt si la case
  « Restaurer l'archive dès son dépôt » est cochée — migration d'un site).
- **Restaurer** (↺, super admin seul) : le site passe en maintenance (page
  avec barre de progression pour tout le monde), tout est remplacé par
  l'archive puis le site est reconstruit et revient seul ; l'état actuel est
  sauvegardé d'abord (« avant-restauration »), sauf s'il l'est déjà ou si
  c'est le contenu de démonstration d'un site neuf.

Sur le serveur : `./sauvegarde.sh`, `./restauration.sh <archive.zip>`.
Détail : [sauvegarde.md](sauvegarde.md).

### Devis et facturation (auto-entrepreneur)

Module **Facturation** (plugin `facturation`, administrateur·rice·s) ;
données dans un document Grist dont le schéma est décrit dans
`src/plugins/facturation/README.md`.

- **Devis** : les demandes reçues par la page publique « Demander un
  devis » arrivent en tête (statut « Demande », message du client).
  Compléter le client, les lignes (prestations du catalogue Grist ou lignes
  libres), le statut, puis **Enregistrer** : le devis reçoit son numéro
  (`D-2026-001`). **PDF** pour l'envoyer ; **Créer la facture** quand il
  est accepté.
- **Factures** : brouillon modifiable, puis **Émettre la facture** :
  numéro définitif (`F-2026-001`, continu dans l'année), date du jour,
  échéance. Une facture émise ne se modifie ni ne se supprime plus (une
  erreur se corrige par une facture d'avoir). Cocher **Facture payée**
  (date, mode) à l'encaissement.
- **Clients** : fiches (nom, société, coordonnées, SIRET d'un client
  professionnel).

En tête du module : demandes à traiter et montant des factures émises non
encore payées ; une échéance dépassée est signalée en rouge.

### Mode maintenance (bureau)

**Paramètres ▾** → module **Site** :

- **Mettre le site en maintenance**, avec un message facultatif (vide : « Le
  site est momentanément indisponible pour maintenance… » ; **Aperçu de la
  page** pour voir ce qu'affichent les visiteurs). Les visiteurs voient
  alors la page « Site en maintenance » à la place de toutes les pages.
- Vous, **connecté·e**, continuez de voir et modifier le site normalement
  (pastille rouge **Maintenance** dans la barre). Un membre non connecté
  peut se connecter depuis la page de maintenance (lien **Espace Admin**).
- La maintenance reste en place après une publication ou un redémarrage du
  serveur : **Remettre le site en ligne** pour la lever. **Enregistrer le
  message** change le texte sans la lever.
- Pendant une **restauration** de sauvegarde, le module affiche sa
  progression ; la maintenance prend fin avec elle (**Lever la maintenance
  quand même** : seulement pour une restauration bloquée). Une restauration
  lancée pendant une maintenance manuelle la lève à sa fin.

Ce n'est pas une protection : le contenu reste public (qui connaît le
mécanisme peut passer) ; seul l'affichage est suspendu.

### Modifier mes informations

Menu du **nom** (à droite de la barre) → **👤 Mon compte** : la fiche de
votre compte, la même que dans le module **Comptes**. Prénom et nom
(affichés dans la barre et dans le journal) et email facultatif, puis
**Enregistrer**. Vos groupes sont affichés mais ne se changent pas ici :
c'est le bureau qui les règle dans le module **Comptes**. Le mot de passe se
change en bas de la même fiche (voir ci-dessous).

### Changer mon mot de passe

Menu du **nom** (à droite de la barre) → **👤 Mon compte**, section
**Mot de passe** :

1. Saisir le mot de passe actuel.
2. Saisir deux fois le nouveau — **10 caractères minimum**. Une courte phrase
   est idéale et facile à retenir (ex. `le fablab ouvre le lundi`).
3. **Changer mon mot de passe**.

Vos **autres appareils** sont alors déconnectés ; celui-ci reste connecté.

👉 **À faire dès la première connexion** avec un mot de passe provisoire.

### Gérer les comptes (bureau)

Module **👥 Comptes**, réservé au groupe *Bureau / administration*.

#### Créer un compte

1. **+ Nouveau compte**.
2. Renseigner :
   - **Identifiant** — ce que la personne tapera pour se connecter
     (ex. `marie.fruit`) ; il ne pourra plus être changé.
   - **Prénom et nom**, **email** (facultatif).
   - **Groupes** — *Animateur·rice* pour les encadrant·e·s,
     *Rédacteur·rice* (actualités, pages et activités), *Bureau /
     administration* pour les membres du bureau (accès à tout, dont la
     gestion des comptes). Plusieurs groupes peuvent être cochés.
   - **Mot de passe provisoire** — laisser vide pour en générer un.
3. **Créer le compte**.

Un encadré vert affiche le **mot de passe provisoire une seule fois** :
transmettez-le à la personne (de vive voix, SMS…) avec son identifiant, et
demandez-lui de le changer à sa première connexion.

#### Modifier, désactiver

Cliquer sur un compte dans la liste :

- modifier le nom, l'email, les groupes, puis **Enregistrer** ;
- cocher **Compte désactivé** pour bloquer l'accès sans supprimer le
  compte (ex. bénévole en pause) — la personne est déconnectée aussitôt.

#### Mot de passe oublié

Dans la fiche du compte : **Réinitialiser le mot de passe**. Un nouveau mot
de passe provisoire s'affiche une fois ; les sessions de la personne sont
fermées.

#### Supprimer

En bas de la fiche, recopier l'identifiant dans la zone rouge puis
**Supprimer définitivement**. Préférez la désactivation si la personne
peut revenir.

#### Garde-fous

Pour éviter de bloquer l'association hors de son propre site :

- on ne peut pas se retirer ses propres droits bureau, ni se désactiver ou
  se supprimer soi-même ;
- il reste toujours **au moins un compte bureau actif**.

En dernier recours (plus aucun admin ne peut se connecter), la personne qui
gère le serveur utilise `./auth-user.sh reset <login>` (voir Partie 1).

### Se déconnecter

Menu du **nom** (à droite de la barre) → **⏻ Déconnexion**. Indispensable sur un
ordinateur partagé (médiathèque, salle d'atelier…).

---

## Pour les éditeurs : réserver une page

Ranger la page dans `src/content/pages/espace-benevoles/` (son adresse
commence alors par `/espace-benevoles/`). Par défaut, toute personne
connectée y a accès ; `access:` restreint à certains groupes :

```yaml
---
title: "Fiches animateur·rice·s"
access: animateur        # ou : admin, redacteur, [animateur, admin]
---
```

La page n'apparaît pas dans le menu public et figure dans **Pages réservées**
pour les personnes autorisées (module **Pages** pour le bureau et les
rédacteur·rice·s). Comme tout contenu, elle est publiée au
prochain build. Détail : [src/content/README.md](../src/content/README.md).

---
title: "Fiches animateur·rice·s"
access: animateur        # ou : true (toute personne connectée), admin, [animateur, admin]
---
```

La page disparaît du menu public et apparaît dans **Pages réservées** pour
les personnes autorisées (module **Pages** pour le bureau et les
rédacteur·rice·s). Comme tout contenu, elle est publiée au prochain
déploiement. Détail : [src/content/README.md](../src/content/README.md).

---

## Dépannage

| Symptôme | Cause probable | Solution |
| :--- | :--- | :--- |
| « La connexion n'est pas encore configurée sur ce serveur » | `AUTH_SECRET` absent ou trop court dans le `.env` | L'ajouter (≥ 32 caractères), puis `DOCKER_CONFIG=$PWD/.dockercfg docker compose up -d --force-recreate` (voir §3) |
| « Identifiant ou mot de passe incorrect » | Faute de frappe, majuscules, compte inexistant | Vérifier ; sinon réinitialisation par le bureau |
| « Trop de tentatives » | 5 échecs en 15 min | Attendre 15 min (ou redémarrer le conteneur) |
| « Ce compte est désactivé » | Désactivé par le bureau | Le réactiver dans **Comptes** |
| Déconnecté·e sans raison | Mot de passe changé/réinitialisé, compte désactivé, `AUTH_SECRET` changé, 14 jours sans visite | Se reconnecter |
| « Requête refusée » | Requête venant d'un autre site, ou domaine non prévu | Vérifier `SITE_URL` dans le `.env` (puis reconstruire) et l'en-tête `X-Forwarded-Host` de nginx |
| Comptes disparus après un déploiement | Volume `./data` non monté | Vérifier `volumes:` dans `docker-compose.yml`, restaurer la sauvegarde de `data/` |
| `Cannot find package 'yaml'` en lançant `auth-user.mjs` | `node dist/cli/auth-user.mjs` lancé **sur le VPS, hors du conteneur** (chemin `/opt/…`) | Utiliser `./auth-user.sh …` |
| `docker` : erreur de permission / config en lecture seule | `DOCKER_CONFIG` non posé (`/root` en lecture seule) | Passer par `./auth-user.sh` ou `./update.sh`, ou préfixer par `DOCKER_CONFIG=$PWD/.dockercfg` |
| Plus aucun admin ne peut se connecter | — | Sur le VPS : `./auth-user.sh reset <login>` |
| Modification enregistrée mais absente du site | Enregistrée **sans publier** (bouton ambre **À publier (N)** dans la barre) | **Publier les modifications** depuis ce bouton ou l'encadré en tête du module |
| Le bouton **À publier** a disparu sans qu'on ait publié | Le site a été reconstruit entre-temps (autre publication, redémarrage, `./update.sh`) : le lot est en ligne | Rien à faire |
