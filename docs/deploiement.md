# Mettre le site en ligne

Ce guide accompagne pas à pas l'installation du site sur un serveur, **sans
connaissances techniques poussées**. Chaque étape dit ce que l'on fait,
pourquoi, et comment vérifier que ça a marché.

Deux méthodes sont possibles ; choisissez-en **une seule** :

- **[Avec Docker](#partie-a--installer-avec-docker)** (recommandé) ;
- **[Avec Node.js](#partie-b--installer-avec-nodejs)** (sans Docker).

Les étapes communes (nom de domaine, HTTPS, première connexion) sont
décrites une seule fois, [à la fin](#partie-c--nom-de-domaine-et-https).

---

## Avant de commencer

### Ce qu'il vous faut

| Quoi | Détail |
| :--- | :--- |
| **Un serveur** | Un VPS sous Linux (Ubuntu ou Debian), **2 Go de mémoire** au moins (la construction du site en consomme jusqu'à 1,5 Go), **10 Go de disque** libres. Exemples : OVH « VPS », Scaleway, Hetzner… |
| **Un accès au serveur** | L'adresse IP du serveur et un compte qui peut devenir administrateur (`root`, ou un compte avec `sudo`). L'hébergeur vous les envoie à la création du serveur. |
| **Un nom de domaine** | Par exemple `www.mon-asso.fr`, acheté chez un registraire (OVH, Gandi…). |
| **Un peu de temps** | Compter une heure la première fois. |

### Quelques mots de vocabulaire

- **Terminal** : la fenêtre où l'on tape des commandes. Sur votre ordinateur :
  « Terminal » (Mac, Linux) ou « PowerShell » (Windows).
- **SSH** : la façon de se connecter au serveur depuis votre terminal. Une
  fois connecté·e, les commandes tapées s'exécutent **sur le serveur**.
- **Commande** : une ligne à copier-coller dans le terminal, puis Entrée.
  Dans ce guide, les commandes sont dans des cadres gris ; les lignes qui
  commencent par `#` sont des commentaires, inutile de les taper.
- **`.env`** : un petit fichier texte qui contient les réglages secrets du
  site (adresse, mots de passe des services…). Il reste sur le serveur et
  n'est jamais partagé.
- **Reverse proxy** : un programme (ici **nginx**) qui reçoit les visiteurs
  sur votre nom de domaine, gère le cadenas HTTPS, et leur transmet le site.

### Ce qui vous appartient

Quelle que soit la méthode, **trois choses** sont propres à votre site et ne
sont jamais remplacées par une mise à jour :

| Dossier ou fichier | Contenu | À sauvegarder ? |
| :--- | :--- | :--- |
| `src/content/` | Le contenu du site : pages, actualités, activités, logo, réglages | Oui (automatique, voir [Sauvegarder](#sauvegarder)) |
| `data/` | Les comptes de l'Espace Admin, le journal, les sauvegardes | Oui |
| `.env` | Les réglages secrets | Oui, **à part** : il n'est jamais dans les sauvegardes du site |

Tout le reste (le « modèle » : le code du site) est remplacé à chaque mise à
jour.

### Docker ou Node.js ?

| | Docker (recommandé) | Node.js |
| :--- | :--- | :--- |
| **À installer sur le serveur** | Docker seulement | Node.js 22 et PM2 |
| **Fichiers sur le serveur** | Une poignée (le code est dans l'« image » Docker) | Tout le code du site |
| **Mise à jour** | `./update.sh`, avec **retour automatique** à la version précédente si le site ne répond plus | `./update.sh`, sans retour automatique |
| **Quand la choisir** | Dans la plupart des cas | Hébergement où Docker n'est pas possible, ou si vous connaissez déjà Node.js |

---

## Se connecter au serveur

Dans le terminal de votre ordinateur (remplacez l'adresse par celle de
votre serveur) :

```bash
ssh root@203.0.113.10
```

La première fois, le terminal demande de confirmer : tapez `yes` puis
Entrée. Saisissez ensuite le mot de passe (rien ne s'affiche pendant la
frappe, c'est normal).

✅ **Ça a marché si** l'invite change et montre le nom du serveur (par
exemple `root@vps-1234:~#`).

> Si votre compte n'est pas `root`, ajoutez `sudo ` devant les commandes
> d'installation (`apt`, `docker`…) : il vous sera demandé votre mot de
> passe.

---

## Partie A — Installer avec Docker

Docker fait tourner le site dans une « boîte » (un **conteneur**) préparée à
l'avance (une **image**), qui contient déjà tout le nécessaire. Vous ne
gardez sur le serveur que vos données et quelques fichiers de réglage.

### A1. Installer Docker

```bash
curl -fsSL https://get.docker.com | sh
```

Ce script officiel installe Docker et son outil `docker compose`. Compter
une à deux minutes.

✅ **Vérifier :**

```bash
docker compose version
```

doit afficher une ligne du type `Docker Compose version v2.x.x`.

### A2. Créer le dossier du site et y déposer les fichiers

On crée un dossier pour le site, puis on y télécharge les six fichiers
utiles, dans la version voulue (la dernière est indiquée sur
<https://github.com/OpenPixl/zerucms/releases>) :

```bash
mkdir -p /opt/monsite && cd /opt/monsite

VERSION=v0.5.10   # ← remplacer par la dernière version publiée
for f in docker-compose.yml .env.example update.sh auth-user.sh sauvegarde.sh restauration.sh; do
  curl -fsSLO "https://raw.githubusercontent.com/OpenPixl/zerucms/$VERSION/$f"
done
chmod +x *.sh
```

| Fichier | À quoi il sert |
| :--- | :--- |
| `docker-compose.yml` | Décrit le conteneur du site : quelle image, quels dossiers garder, quel port |
| `.env.example` | Modèle commenté du fichier de réglages `.env` |
| `update.sh` | Mettre le site à jour |
| `auth-user.sh` | Créer ou dépanner des comptes de l'Espace Admin |
| `sauvegarde.sh`, `restauration.sh` | Sauvegarder et restaurer le contenu |

✅ **Vérifier :** `ls -a` liste bien ces six fichiers.

> Plus tard, `update.sh` tient lui-même ces fichiers à jour : vous n'aurez
> plus à les télécharger.

### A3. Écrire le fichier de réglages `.env`

```bash
cd /opt/monsite
cp .env.example .env
nano .env
```

`nano` est un éditeur de texte simple dans le terminal. Une seule ligne est
**obligatoire** : l'adresse publique du site, sans `/` à la fin.

```dotenv
SITE_URL=https://www.mon-asso.fr
```

Laissez le reste vide : l'**assistant d'installation** demandera dans le
navigateur ce qui est utile (clés Grist, etc.).

Pour enregistrer et quitter `nano` : **Ctrl+O**, Entrée, puis **Ctrl+X**.

### A4. Démarrer le site

```bash
docker compose up -d
```

Docker télécharge l'image (environ 1 Go, quelques minutes), puis démarre le
conteneur. Au premier démarrage, le site **se construit** : compter encore
une à trois minutes. Pour suivre ce qui se passe :

```bash
docker compose logs -f web
```

Attendez la ligne `[démarrage] serveur à l'écoute sur http://0.0.0.0:4321`,
puis quittez l'affichage avec **Ctrl+C** (le site continue de tourner).

✅ **Vérifier :**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4321/
```

doit afficher `200`.

Le site tourne, mais il n'est joignable **que depuis le serveur lui-même**
(c'est voulu). Pour l'ouvrir au public : [Partie C](#partie-c--nom-de-domaine-et-https).

> Les dossiers `src/content/` (rempli avec un **contenu de démonstration**
> au premier démarrage) et `data/` sont apparus dans `/opt/monsite` : ce sont
> vos données.

### A5. Au quotidien (Docker)

Toujours depuis le dossier du site (`cd /opt/monsite`) :

| Je veux… | Je tape… |
| :--- | :--- |
| Voir si le site tourne | `docker compose ps` |
| Lire le journal du site | `docker compose logs --tail 50 web` |
| Prendre en compte un `.env` modifié | `docker compose up -d --force-recreate` |
| Redémarrer le site | `docker compose restart web` |
| Mettre à jour le site | `./update.sh` ([détails](#mettre-à-jour)) |
| Faire une sauvegarde | `./sauvegarde.sh` |
| Créer un compte | `./auth-user.sh add prenom.nom "Prénom Nom" admin` |

> ⚠️ `docker compose restart` **ne relit pas** le `.env` : après l'avoir
> modifié, utilisez `docker compose up -d --force-recreate`.

---

## Partie B — Installer avec Node.js

Ici, le code du site est déposé directement sur le serveur et lancé par
**Node.js** (le moteur qui fait tourner le site). Un petit outil, **PM2**,
le surveille : il le relance s'il s'arrête et au redémarrage du serveur.

### B1. Installer Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

✅ **Vérifier :**

```bash
node --version
```

doit afficher `v22.12.0` ou plus récent.

### B2. Installer PM2

```bash
npm install -g pm2
```

✅ **Vérifier :** `pm2 --version` affiche un numéro de version.

### B3. Télécharger le site

On télécharge l'archive d'une version (la dernière est indiquée sur
<https://github.com/OpenPixl/zerucms/releases>) et on la décompresse dans
le dossier du site :

```bash
mkdir -p /srv/monsite && cd /srv/monsite

VERSION=v0.5.10   # ← remplacer par la dernière version publiée
curl -fsSL "https://github.com/OpenPixl/zerucms/archive/refs/tags/$VERSION.tar.gz" \
  | tar xz --strip-components=1
```

✅ **Vérifier :** `ls -a` montre notamment `package.json`, `src`, `scripts`,
`update.sh` et `.env.example`.

> Les fichiers dont le nom commence par un point (`.env.example`, plus tard
> `.env`) sont **cachés** : un simple `ls` ne les montre pas, `ls -a` oui.

### B4. Installer les dépendances

```bash
npm ci
```

Cette commande télécharge les bibliothèques dont le site a besoin (dossier
`node_modules`, quelques minutes). Elle installe aussi le **contenu de
démonstration** dans `src/content/`.

> N'ajoutez **pas** `--omit=dev` : le serveur a besoin de tous les outils
> pour reconstruire le site à chaque publication depuis l'Espace Admin.

### B5. Écrire le fichier de réglages `.env`

```bash
cd /srv/monsite
cp .env.example .env
nano .env
```

> `cp: impossible d'évaluer '.env.example'` ? Vérifiez l'orthographe
> (`example`, à l'anglaise, pas `exemple`) et que `ls -a` montre bien le
> fichier dans `/srv/monsite`. À défaut, `nano .env` crée un fichier vide :
> il suffit d'y écrire les deux lignes ci-dessous.

Renseignez l'adresse publique du site, sans `/` à la fin, et la commande
qui redémarre le site après une mise à jour :

```dotenv
SITE_URL=https://www.mon-asso.fr
UPDATE_RESTART=pm2 restart monsite
```

Laissez le reste vide : l'**assistant d'installation** demandera dans le
navigateur ce qui est utile. Enregistrer et quitter : **Ctrl+O**, Entrée,
**Ctrl+X**.

### B6. Démarrer le site avec PM2

```bash
pm2 start npm --name monsite -- start
```

Au premier démarrage, le site **se construit** (une à trois minutes). Pour
suivre ce qui se passe :

```bash
pm2 logs monsite
```

Attendez la ligne `[démarrage] serveur à l'écoute sur http://localhost:4321`,
puis quittez avec **Ctrl+C** (le site continue de tourner).

✅ **Vérifier :**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4321/
```

doit afficher `200`.

### B7. Relancer le site au redémarrage du serveur

```bash
pm2 save
pm2 startup
```

`pm2 startup` affiche parfois une commande à copier-coller : faites-le.
Ensuite, le site repart tout seul quand le serveur redémarre.

Le site n'est joignable que depuis le serveur lui-même (c'est voulu). Pour
l'ouvrir au public : [Partie C](#partie-c--nom-de-domaine-et-https).

### B8. Au quotidien (Node.js)

Toujours depuis le dossier du site (`cd /srv/monsite`) :

| Je veux… | Je tape… |
| :--- | :--- |
| Voir si le site tourne | `pm2 status` |
| Lire le journal du site | `pm2 logs monsite --lines 50` |
| Prendre en compte un `.env` modifié | `pm2 restart monsite` |
| Mettre à jour le site | `./update.sh` ([détails](#mettre-à-jour)) |
| Faire une sauvegarde | `./sauvegarde.sh` |
| Créer un compte | `npm run auth:user -- add prenom.nom "Prénom Nom" admin` |

> Si Docker est **aussi** installé sur ce serveur, ajoutez `--node` aux
> commandes `./update.sh`, `./sauvegarde.sh` et `./restauration.sh` (sinon
> elles croient le site installé avec Docker).

---

## Partie C — Nom de domaine et HTTPS

Cette partie est la même pour les deux méthodes. Le site tourne sur le
serveur (port 4321) ; il reste à le rendre visible sur votre nom de domaine,
avec le cadenas HTTPS.

### C1. Faire pointer le domaine vers le serveur

Dans l'espace client de votre registraire (OVH, Gandi…), zone DNS du
domaine, créez (ou modifiez) deux enregistrements de type **A** vers
l'adresse IP du serveur :

| Type | Nom | Valeur |
| :--- | :--- | :--- |
| A | `mon-asso.fr` (parfois noté `@`) | `203.0.113.10` |
| A | `www` | `203.0.113.10` |

La prise en compte peut prendre de quelques minutes à quelques heures.

✅ **Vérifier** (depuis votre ordinateur) : `ping www.mon-asso.fr` affiche
l'adresse IP du serveur.

### C2. Installer nginx et l'outil des certificats

```bash
apt install -y nginx certbot python3-certbot-nginx
```

### C3. Configurer nginx

Créez le fichier de configuration du site :

```bash
nano /etc/nginx/sites-available/monsite.conf
```

et collez-y (en remplaçant le domaine) :

```nginx
server {
    listen 80;
    server_name www.mon-asso.fr mon-asso.fr;

    # Photos envoyées depuis l'Espace Admin (jusqu'à 10 Mo) :
    # sans cette ligne, nginx les refuse (erreur 413).
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }
}
```

Activez-le, vérifiez la configuration et rechargez nginx :

```bash
ln -s /etc/nginx/sites-available/monsite.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

✅ **Vérifier :** `nginx -t` affiche `syntax is ok` et `test is successful`,
et `http://www.mon-asso.fr` (sans « s ») affiche le site dans votre
navigateur.

### C4. Activer HTTPS (le cadenas)

```bash
certbot --nginx -d www.mon-asso.fr -d mon-asso.fr
```

Certbot pose quelques questions (email pour les alertes, acceptation des
conditions), obtient un certificat gratuit Let's Encrypt, l'installe dans
nginx et le renouvelle tout seul. Acceptez la **redirection** de HTTP vers
HTTPS si elle est proposée.

✅ **Vérifier :** `https://www.mon-asso.fr` s'ouvre avec le cadenas.

> **Une seule adresse officielle.** Seule l'adresse de `SITE_URL` accepte
> la connexion à l'Espace Admin, et les moteurs de recherche n'aiment pas
> le même site sous deux adresses. Si `SITE_URL` est `https://www.mon-asso.fr`,
> redirigez `mon-asso.fr` vers `www.mon-asso.fr` dans nginx (ou l'inverse).

### C5. Pare-feu (si activé)

Si le pare-feu `ufw` est actif sur le serveur, ouvrez le web et gardez SSH :

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
```

---

## Partie D — Paramétrer le site dans le navigateur

Ouvrez l'adresse du site dans votre navigateur. Sur un site neuf, aucune
commande n'est à taper : tout se fait en deux écrans.

> ⚠️ Comme pour WordPress, **la première personne qui ouvre le site
> l'installe**. Faites-le dès que le site répond.

### D1. Créer votre compte

L'écran **« Bienvenue sur votre nouveau site »** s'affiche à la place du
site. Indiquez votre nom, l'identifiant et le mot de passe de votre choix
(10 caractères au moins), et éventuellement votre e-mail, puis **« Créer mon
compte et continuer »**.

Ce compte d'administration (« super admin ») a tous les droits : c'est le
vôtre, en tant que personne qui installe et entretient le site.

### D2. Suivre l'assistant d'installation

Vous êtes connecté·e et l'**assistant d'installation** s'ouvre de lui-même :

1. **Structure** : association ou auto-entrepreneur.
2. **Compte** : le compte de la personne qui gérera le site au quotidien
   (bureau de l'association, entrepreneur·e).
3. **Identité** : nom, coordonnées, logo.
4. **Fonctions** à activer (adhésion, inscriptions, rendez-vous,
   facturation…) et leurs réglages.
5. **Exemples** : garder ou retirer le contenu de démonstration.
6. **Installer le site** : une page « en cours d'installation » s'affiche
   avec une barre de progression, puis le site revient tout seul.

« Plus tard » referme l'assistant ; vous le retrouvez dans **Paramètres →
Site**.

Détail de chaque étape : [installation.md](installation.md). Utiliser
l'Espace Admin au quotidien : [guide-espace-benevoles.md](guide-espace-benevoles.md).

🎉 **Le site est en ligne.**

---

## Mettre à jour

Quand une nouvelle version est publiée, un badge **« Mise à jour X.Y.Z »**
apparaît dans la barre de l'Espace Admin. Pour l'installer, depuis le
dossier du site :

```bash
./update.sh             # dernière version
./update.sh v0.5.10     # une version précise (sert aussi à revenir en arrière)
```

Le script, dans l'ordre :

1. **sauvegarde** votre contenu, vos comptes et le journal (s'il n'y arrive
   pas, il s'arrête sans rien changer) ;
2. **construit la nouvelle version à côté**, pendant que le site continue de
   tourner (s'il y a un problème, rien ne change et le message dit pourquoi) ;
3. **bascule** sur la nouvelle version (quelques secondes de coupure) ;
4. avec Docker : **vérifie** que le site répond, et revient tout seul à
   l'ancienne version sinon.

Il se termine par `✓ Site en version X.Y.Z.`

> ⚠️ N'utilisez jamais `git pull` ni `git clone` par-dessus un site en
> service : le contenu de `src/content/` pourrait être effacé.

Détails : [mise-a-jour.md](mise-a-jour.md).

## Sauvegarder

- **Automatique** : avant chaque mise à jour (les 5 dernières sont gardées).
- **À la demande** : `./sauvegarde.sh`, ou le module **« Sauvegardes »** de
  l'Espace Admin.
- Les archives sont rangées dans `data/sauvegardes/`. Copiez-les de temps
  en temps **hors du serveur**, avec votre fichier `.env`.

Restaurer, déménager sur un autre serveur : [sauvegarde.md](sauvegarde.md).

---

## En cas de problème

| Ce que je vois | Cause probable | Que faire |
| :--- | :--- | :--- |
| `SITE_URL manquant dans .env` | Ligne absente ou mal écrite | Ajouter `SITE_URL=https://…` au `.env` (sans espace autour du `=`), puis redémarrer |
| Le navigateur affiche **502 Bad Gateway** | nginx fonctionne, mais le site ne répond pas (encore en construction, ou arrêté) | Patienter 2 ou 3 minutes, puis lire le journal (A5 ou B8) |
| **413** en envoyant une photo | Limite de taille de nginx | Vérifier `client_max_body_size 20m;` (C3), puis `systemctl reload nginx` |
| Impossible de se connecter à l'Espace Admin, sans message clair | Le site est ouvert sous une autre adresse que `SITE_URL` | Utiliser l'adresse exacte de `SITE_URL`, et rediriger l'autre dans nginx (C4) |
| Mot de passe de votre compte oublié | — | Depuis le dossier du site : `./auth-user.sh reset <identifiant>` (Docker) ou `npm run auth:user -- reset <identifiant>` (Node.js) affiche un mot de passe provisoire |
| Quelqu'un d'autre a créé le premier compte avant vous | Le site est resté ouvert sans installation | Arrêter le site, vider `data/accounts/`, redémarrer : l'écran « Bienvenue » revient |
| `no space left on device` | Disque plein | `df -h /` pour voir la place ; avec Docker : `docker system prune` |
| Docker : erreur de **permission** ou de dossier **en lecture seule** sur `/root/.docker` | Certains hébergeurs protègent `/root` | Taper `export DOCKER_CONFIG=$PWD/.dockercfg` avant les commandes `docker` (les scripts `*.sh` le font déjà) |
| Le journal montre une **erreur de construction** | Un fichier du contenu est invalide (souvent après une modification à la main) | Le message indique le fichier et le champ : le corriger, ou restaurer une sauvegarde |

---

## Pour aller plus loin

### Imprimer des PDF (bulletin d'adhésion, planning des rendez-vous)

Ces fonctions utilisent **Gotenberg**, un petit service qui transforme des
pages en PDF. Deux possibilités :

- **une instance existante** : renseignez son adresse dans l'assistant
  d'installation, ou `GOTENBERG_URL=` dans le `.env` ;
- **avec Docker, sur le même serveur** : ajoutez ce service à la fin de
  `docker-compose.yml`, au même niveau que `web:` :

  ```yaml
    gotenberg:
      image: gotenberg/gotenberg:8
      restart: unless-stopped
  ```

  puis `GOTENBERG_URL=http://gotenberg:3000` dans le `.env` et
  `docker compose up -d --force-recreate`.

Sans Gotenberg, les boutons d'impression n'apparaissent simplement pas.
Détails : [bulletin-pdf.md](bulletin-pdf.md).

### Lancer le site par systemd au lieu de PM2 (Node.js)

Fichier `/etc/systemd/system/monsite.service` :

```ini
[Unit]
Description=Site
After=network.target

[Service]
WorkingDirectory=/srv/monsite
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Puis `systemctl daemon-reload && systemctl enable --now monsite`, et
`UPDATE_RESTART=systemctl restart monsite` dans le `.env`.

### Plusieurs sites sur le même serveur

Un dossier par site, chacun avec son `.env`. Chaque site doit avoir son
propre port : avec Docker, changer dans `docker-compose.yml` le
`container_name` et le premier nombre de `127.0.0.1:4321:4321` (par exemple
`4322`) ; avec Node.js, ajouter `PORT=4322` au `.env`. Dans nginx,
`proxy_pass` vise alors ce port.

### Servir le site depuis un autre hébergement

Les pages du site sont des fichiers statiques : on peut les recopier
ailleurs après chaque publication (`PUBLISH_HOOK`), voir
[publication.md](publication.md#site-statique-sur-un-autre-hébergement-publish_hook).

### Détails techniques

- Construction du site au démarrage, versions et mises à jour : [mise-a-jour.md](mise-a-jour.md).
- Publication depuis l'Espace Admin : [publication.md](publication.md).
- Variables du `.env` : `.env.example` (commenté) et [api.md](api.md#variables-denvironnement).
- Construction de l'image et publication des versions (mainteneur) : [ci.md](ci.md).
- Ce que contient l'image Docker : tout le code et ses dépendances, **sans
  site construit** (il dépend de votre contenu et de votre `SITE_URL`) ;
  les volumes `./data`, `./src/content` et `./.releases` (versions
  construites, pour une bascule rapide) sont gardés d'une version à l'autre.
