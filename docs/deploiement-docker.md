# Déploiement Docker (VPS OVH)

## 1. Ce qui reste modifiable — et ce qui demande une reconstruction

Le site est généré par Astro : la majeure partie est du **HTML statique
produit au `build`**. L'image Docker n'en contient aucun : elle est la même
pour toutes les structures, et le site est construit **par le conteneur**,
avec le contenu monté depuis le serveur.

| Élément | Où il vit | Ajout / modif |
| :--- | :--- | :--- |
| **Adhésions, inscriptions, RDV** (formulaires) | **Grist** (routes `/api/*`) | En direct, aucune reconstruction |
| **Comptes de l'Espace Admin**, journal, sauvegardes | `./data/` (volume) | Depuis le site, aucune reconstruction |
| **Actualités, activités, pages, annonces, partenaires, réglages, infos de la structure** | `./src/content/` (volume) | Depuis l'Espace Admin : le serveur reconstruit le site lui-même ([publication.md](publication.md)) |
| Composants, styles, structure (le modèle) | l'image | Nouvelle version du modèle : `./update.sh` ([mise-a-jour.md](mise-a-jour.md)) |

> **En clair :** on ne touche jamais au code sur le serveur. Le contenu se
> modifie depuis l'Espace Admin, le modèle se met à jour par `./update.sh`.

---

## 2. Les fichiers ajoutés

| Fichier | Rôle |
| :--- | :--- |
| `Dockerfile` | multi-étapes : `npm ci` + sources, **sans site construit** ; `CMD node scripts/start.mjs` (construit le site au démarrage si besoin, puis sert) |
| `.dockerignore` | exclut `node_modules`, `dist`, `.astro`, **`.env`**, `.git`, `data`, `.releases`… du contexte de build |
| `docker-compose.yml` | un service `web` sur l'image publiée `ghcr.io/openpixl/zerucms:${NUMERIK_VERSION}` (jamais construite sur le serveur), `restart: unless-stopped`, `init: true`, port publié **uniquement sur `127.0.0.1:4321`**, secrets via `env_file: .env`, volumes `./data`, `./src/content`, `./.releases` |
| `update.sh` | mise à jour du site vers une version publiée ([mise-a-jour.md](mise-a-jour.md)) |
| `auth-user.sh`, `sauvegarde.sh`, `restauration.sh` | comptes et sauvegardes, exécutés dans le conteneur (recopiés depuis l'image par `update.sh`) |

### Pourquoi ces choix

- **Sources et `node_modules` complet dans l'image** : le serveur reconstruit
  lui-même le site à chaque publication depuis l'Espace Admin.
- **`init: true`** : un petit init (tini) en PID 1 relaie l'arrêt
  (`docker stop`, bascule d'`update.sh`) à Node, qui termine ses requêtes et
  s'arrête aussitôt (`scripts/start.mjs` gère aussi `SIGTERM` sans lui), et
  ramasse les processus orphelins. Le `restart: unless-stopped` relance le
  serveur après chaque publication.
- **`node:22-slim`** (Debian) plutôt qu'`alpine` : `sharp` (optimisation d'images
  au build) est plus fiable sur Debian.
- **`mode: 'standalone'`** (déjà dans `astro.config.mjs`) → `dist/server/entry.mjs`
  est un serveur HTTP complet qui sert **à la fois** les pages statiques et les
  routes API. Rien d'autre à lancer.
- **`HOST=0.0.0.0`** dans le `Dockerfile` : sans ça, le serveur n'écoute que sur
  `localhost` **dans** le conteneur et n'est pas joignable.
- **Port sur `127.0.0.1`** : le conteneur n'est pas exposé directement à
  Internet. Un reverse proxy (nginx/Traefik) fait le domaine + HTTPS (§5).
- **Trois volumes** : `./data` (comptes, journal, sauvegardes, état des
  publications), `./src/content` (contenu du site, jamais suivi par git) et
  `./.releases` (versions construites, pour une bascule rapide). Les deux
  premiers sont **à sauvegarder** (module « Sauvegardes » ou
  `./sauvegarde.sh`, [sauvegarde.md](sauvegarde.md)).

### Le `.env` : jamais dans l'image

Les clés Grist (`GRIST_API_KEY`…) **ne doivent pas** être copiées dans l'image
(elle pourrait être partagée, poussée sur un registre…). Elles sont :

- exclues du contexte de build par `.dockerignore` ;
- injectées **au démarrage** du conteneur via `env_file: .env` (compose) ;
- stockées dans un fichier `.env` **présent sur le VPS uniquement**, hors dépôt
  Git (déjà dans `.gitignore`).

L'image ne contient **aucun site construit** : elle est la même pour toutes
les associations. Au démarrage du conteneur, `scripts/start.mjs` construit le
site avec le contenu monté (`./src/content`) et `SITE_URL` (`.env`), puis
seulement quand l'un d'eux ou la version change (cf.
[mise-a-jour.md](mise-a-jour.md)). Premier démarrage : compter une à
quelques minutes avant que le site réponde (`docker compose logs -f`).

### Bulletin PDF : instance Gotenberg (optionnel)

Le bulletin d'adhésion en PDF ([bulletin-pdf.md](bulletin-pdf.md)) a besoin d'une
instance **Gotenberg** joignable depuis le conteneur `web`. Deux cas :

- **Instance externe** : renseigner seulement `GOTENBERG_URL` (+ `BULLETIN_SECRET`)
  dans le `.env`. Rien d'autre à faire.
- **Service à côté** : ajouter au `docker-compose.yml` et pointer dessus par le
  nom de service :

  ```yaml
    gotenberg:
      image: gotenberg/gotenberg:8
      restart: unless-stopped
      # pas de ports publiés : accessible seulement sur le réseau compose
  ```

  puis `GOTENBERG_URL=http://gotenberg:3000` dans le `.env`.

Sans ces variables, le lien « Imprimer le bulletin » n'apparaît simplement pas.

---

## 3. Tester en local

```bash
# à la racine du projet, avec un .env rempli : image construite depuis les
# sources sous l'étiquette « local » (le compose ne construit jamais)
docker build -t ghcr.io/openpixl/zerucms:local .
NUMERIK_VERSION=local docker compose up

# → http://localhost:4321
# Ctrl-C pour arrêter ; `docker compose down` pour nettoyer
```

Vérifs :

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/            # 200
curl -s http://localhost:4321/adherer/formulaire | grep -o 'renderer-url="[^"]*"'
# → renderer-url="/node_modules/@astrojs/vue/dist/client.js"  (l'îlot est bien monté)
curl -s http://localhost:4321/api/adhesion/cotisations                    # JSON de Grist
```

---

## 4. Première installation sur le VPS OVH

```bash
# 1. Récupérer le projet (seuls docker-compose.yml, .env.example et les
#    scripts *.sh servent sur le serveur ; jamais de `git pull` ensuite :
#    les mises à jour passent par ./update.sh)
cd /opt        # ou ~/apps, au choix
git clone https://github.com/OpenPixl/zerucms.git numerik2026
cd numerik2026
export DOCKER_CONFIG=$PWD/.dockercfg   # si /root est en lecture seule

# 2. Créer le .env — NE PAS commiter
cp .env.example .env
nano .env       # SITE_URL (obligatoire) ; le reste (AUTH_SECRET, clés Grist…)
                # peut attendre l'assistant d'installation

# 3. Télécharger l'image et démarrer (premier démarrage : src/content/ est
#    rempli avec le contenu de démonstration de src/modeles/association/, à
#    personnaliser ensuite depuis l'Espace Admin ; le site se construit en
#    une à quelques minutes). Version précise : NUMERIK_VERSION=X.Y.Z dans le .env
docker compose up -d

# 4. Vérifier
docker compose ps
docker compose logs -f web       # Ctrl-C pour quitter les logs
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4321/
```

Le conteneur redémarre tout seul au reboot du VPS (`restart: unless-stopped`).

Ensuite : `./auth-user.sh init` (super admin), puis connexion dans le
navigateur : l'**assistant d'installation** règle le type de structure, le
compte administrateur, l'identité, les plugins et leurs secrets, et le
contenu d'exemple — voir [installation.md](installation.md).

---

## 5. Reverse proxy + HTTPS (nginx)

Le conteneur écoute sur `127.0.0.1:4321`. On met nginx devant pour le domaine et
le certificat.

`/etc/nginx/sites-available/numerikandco.conf` :

```nginx
server {
    listen 80;
    server_name numerikandco.org www.numerikandco.org;

    # Photos des actualités envoyées depuis l'Espace Admin (10 Mo max,
    # ~13,5 Mo encodées) : la limite par défaut de nginx (1 Mo) donne une 413.
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

```bash
ln -s /etc/nginx/sites-available/numerikandco.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d numerikandco.org -d www.numerikandco.org   # HTTPS auto
```

> Le domaine se règle par `SITE_URL` dans le `.env` (liens absolus, flux RSS,
> sécurité derrière le proxy) : après un changement, `docker compose restart web`
> suffit, le site se reconstruit au démarrage.

---

## 6. Ajouter du contenu (actualité, activité, page…)

Tout se fait **depuis l'Espace Admin** : le module écrit dans
`./src/content/`, le serveur reconstruit le site puis redémarre (quelques
secondes) — voir [publication.md](publication.md). Ni commit, ni
reconstruction de l'image.

Ce qui ne demande **aucune** reconstruction : adhésions, inscriptions, RDV,
et toute modification faite **dans Grist** (tarifs, activités et leurs
places, saison active…), lue à chaque requête par les routes `/api/*`.

---

## 7. Commandes utiles

```bash
export DOCKER_CONFIG=$PWD/.dockercfg  # si /root est en lecture seule
docker compose logs -f web            # suivre les logs
docker compose restart web            # redémarrer (ex. après un changement du .env)
docker compose ps                     # état
./update.sh                           # passer à la dernière version publiée
./update.sh v0.5.9                    # … ou à une version précise (retour arrière compris)
./sauvegarde.sh                       # archive de src/content/ + data/
docker stats numerik2026              # CPU / RAM du conteneur
```

---

## 8. Points d'attention

| Sujet | À savoir |
| :--- | :--- |
| **RAM du build** | `astro build` + `sharp` peuvent monter à ~1–1,5 Go. VPS OVH « VPS Value » (2 Go) : OK. En dessous, ajouter du swap ou builder ailleurs. |
| **Coupure à la mise à jour** | `update.sh` construit la nouvelle version à côté (`./.releases`) puis remplace le conteneur → quelques secondes d'indisponibilité. Une publication depuis l'Espace Admin coupe de même le temps du redémarrage. |
| **`.env` absent** | le conteneur démarre mais les routes `/api/adhesion/*` renvoient `500 « Configuration Grist manquante »`. Le reste du site fonctionne. |
| **Secrets** | ne jamais faire `COPY .env` ni `ENV GRIST_API_KEY=...` dans le `Dockerfile`. Toujours `env_file` / `-e` au runtime. |
| **Fuseau horaire** | l'image est en UTC. Les dates « saison » Grist sont calculées côté Grist, donc OK. Si besoin : `ENV TZ=Europe/Paris` + paquet `tzdata`. |
| **Mises à jour Node** | image basée sur `node:22-slim`, reconstruite à chaque version publiée (correctifs de sécurité de base compris). |
| **Registre d'images** | les images sont publiées sur `ghcr.io/openpixl/zerucms` par la CI à chaque tag ([ci.md](ci.md)) ; le serveur ne construit jamais d'image. |

---

## 9. Résumé

- **Docker = bon choix** : image publiée et identique pour toutes les
  structures, `restart` automatique, isolation, retour arrière par
  `./update.sh <version précédente>`.
- **Les formulaires (adhésion, RDV…) fonctionnent en autonomie** (Grist),
  quel que soit l'état du site construit.
- **Contenu = Espace Admin**, **modèle = `./update.sh`** ; jamais de
  `git pull` ni de construction d'image sur le serveur.
