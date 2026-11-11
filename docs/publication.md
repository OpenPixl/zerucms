# Publication depuis l'Espace Admin

Tout le contenu du site vit dans les sources (`src/content/`, collections
Astro) et le site publié est **toujours** le produit d'un `npm run build`
complet. Publier, modifier ou supprimer une actualité depuis la barre d'administration
revient donc à faire, sur le serveur, ce qu'un·e développeur·se ferait à la main :

1. écrire `src/content/news/<AAAA-MM-JJ-slug>/` (`index.md` + `cover.jpg`) — ou,
   pour une modification, remplacer ce dossier par sa nouvelle version après en
   avoir gardé une sauvegarde ; pour une suppression, le mettre de côté
   (`src/content/.tmp-publication/`, même disque que le contenu) ;
2. reconstruire le site dans un dossier neuf, `.releases/<horodatage>/` — le
   site en ligne n'est pas touché pendant ce temps (≈ 10 s à 1 min) ;
3. faire pointer `dist` sur cette nouvelle version (bascule atomique) ;
4. lancer la commande `PUBLISH_HOOK` si elle est définie (voir plus bas) ;
5. redémarrer le serveur sur la nouvelle version (≈ 1 s d'interruption) :
   sous **Docker** ou **PM2**, le process s'arrête et son gestionnaire le relance ;
   sinon (ex. `npm start` dans un terminal, ou service systemd), le serveur
   **se relance lui-même** : un petit processus attend son arrêt puis relance
   la même commande (journal : « relance autonome »).

Si la reconstruction échoue, la modification est défaite (dossier ajouté
retiré, sauvegarde ou dossier supprimé remis en place), `dist` n'est pas modifié, le site reste en ligne tel quel, et le module affiche
l'erreur (journal complet : `<DATA_DIR>/publication/build.log`).

Une seule publication à la fois. En développement (`astro dev`), rien n'est
reconstruit : le contenu écrit est relu à chaud.

## Enregistrer sans publier (lot de modifications)

Chaque formulaire propose aussi **Enregistrer sans publier** (et la
pastille de suppression **Sans publier**) : la modification est écrite dans
les sources comme d'habitude, mais le site n'est pas reconstruit. Les
modifications s'accumulent dans un **lot** ; une seule reconstruction les
publie toutes (bouton **À publier (N)** de la barre, ou **Publier les
modifications** en tête des modules). Pratique au lancement d'un site, où
l'on enchaîne des dizaines de retouches.

- `src/lib/publication-lot.ts` : à la première modification du lot, copie de
  secours de tout `src/content/` dans `<DATA_DIR>/publication/lot/contenu/`,
  liste dans `<DATA_DIR>/publication/lot/modifications.json` (qui, quoi, quand).
  Route : `/api/admin/publication/lot` (GET liste, POST publie, DELETE annule).
  Côté routes : `?publier=non` sur la requête d'enregistrement
  (`publishBlocked()` / `publishChange()`, `src/lib/admin-publish.ts`).
- **Tout annuler** remet `src/content/` dans l'état de la copie de secours
  (définitif, journalisé).
- **Toute reconstruction réussie publie le lot** : celle du lot, celle d'une
  modification publiée aussitôt (« Enregistrer et publier » publie donc aussi
  ce qui attendait), mais aussi un redémarrage ou `./update.sh` (le site est
  reconstruit avec les sources du moment) : le lot se referme alors tout seul.
- Reconstruction du lot en échec : le site en ligne ne change pas, **le lot
  reste en attente** (rien n'est défait) ; corriger puis republier, ou tout
  annuler.
- Le lot est **commun** à toutes les personnes connectées : publier publie
  les modifications de tout le monde (la liste indique qui a fait quoi).
- Pas d'aperçu : une modification en attente n'est visible sur le site
  qu'après publication (badge **À publier** dans les listes des modules).

## Prérequis

La publication n'est possible que si le serveur Node dispose :

| Besoin | Pourquoi |
| :--- | :--- |
| Les **sources** du site (`src/`, `astro.config.mjs`, `package.json`…) et `node_modules` complet (`npm ci`, dépendances de développement comprises) | Le serveur relance `npm run build` |
| `npm` dans le `PATH` du process | Idem |
| Le dossier du projet **en écriture** | Écriture de `src/content/news/`, `.releases/`, lien `dist` |
| De préférence un **gestionnaire de process** (PM2, systemd, Docker) | Relance propre sur la nouvelle version (étape 5) ; à défaut, relance autonome |

Sinon, le module « Actualités » l'indique et le bouton d'ajout est désactivé
(rien n'est écrit).

> Lancé à la main (`npm start` dans un terminal), le serveur se relance
> lui-même après chaque publication, en arrière-plan : il n'est alors plus
> lié au terminal (Ctrl+C ne l'arrête plus — `pkill -f scripts/start.mjs`).
> Un gestionnaire (PM2, systemd `Restart=always`, Docker) reste recommandé en
> production. `PUBLISH_RESTART=false` désactive tout redémarrage (le nouveau
> contenu n'est alors servi qu'au prochain redémarrage manuel).

## Installation (Docker ou Node.js)

Les deux installations remplissent ces prérequis : pas à pas dans
[deploiement.md](deploiement.md). Avec Docker, l'image embarque tout le
projet (sources + `node_modules` complet) et `./src/content` est monté
depuis le serveur, donc conservé d'une version à l'autre ; le conteneur est
relancé après chaque publication (`restart: unless-stopped`). Avec Node.js,
c'est PM2 (ou systemd) qui le relance.

## Site statique sur un autre hébergement (`PUBLISH_HOOK`)

Le contenu étant entièrement prérendu, `dist/client/` peut être servi par
n'importe quel serveur web — y compris un hébergement mutualisé PHP. Le
serveur Node sert alors à l'administration (et aux fonctions dynamiques) ;
après chaque publication réussie, `PUBLISH_HOOK` recopie le site :

```dotenv
# Exemples : copie locale vers le dossier d'un vhost, ou envoi vers un hébergement
PUBLISH_HOOK=rsync -a --delete dist/client/ /var/www/site/
PUBLISH_HOOK=rsync -a --delete dist/client/ compte@hebergeur.example:www/
```

La commande s'exécute à la racine du projet (`sh -c`). Si elle échoue, le
site Node est bien publié et le module affiche un avertissement.

## Taille des photos (erreur 413)

La photo d'une actualité est envoyée telle quelle (10 Mo max, ≈ 13,5 Mo une
fois encodée). Un reverse proxy limite souvent la taille des requêtes —
nginx : **1 Mo par défaut**, d'où une erreur 413. Le relever :

```nginx
client_max_body_size 20m;   # dans le bloc server du site
```

(Équivalents : Apache `LimitRequestBody 20971520`, Traefik middleware
`buffering.maxRequestBodyBytes`.) Le module affiche un message explicite en
cas de 413.

## Variables

| Variable | Défaut | Rôle |
| :--- | :--- | :--- |
| `SITE_ROOT` | dossier de lancement | Racine du projet à reconstruire |
| `PUBLISH_HOOK` | — | Commande après chaque publication réussie |
| `PUBLISH_RESTART` | `true` | `false` : ne pas arrêter le serveur après publication |

Lues au démarrage (`astro:env`, cf. [api.md](api.md#variables-denvironnement)).

## Mettre à jour le site (nouvelle version du code)

`npm run build` fonctionne aussi quand `dist` est devenu un lien vers une
version de `.releases/` (il réécrit la version active). `.releases/` ne garde
que les deux dernières versions.

## Fichiers

- `src/lib/site-build.ts` — reconstruction, bascule, redémarrage, état (`readStatus()`, `publish()`, `canPublish()`)
- `src/lib/news-writer.ts` — validation et écriture (`writeNews`), lecture des sources (`readNewsSource`), modification avec sauvegarde (`updateNews`), mise de côté pour suppression (`setAsideNews`)
- `src/pages/api/admin/actualites/index.ts` (liste, ajout), `src/pages/api/admin/actualites/[slug].ts` (lecture, modification, suppression), `src/pages/api/admin/publication.ts` (état)
- `src/components/admin/modules/NewsModule.vue`
- `astro.config.mjs` — `outDir` piloté par `ASTRO_OUT_DIR` (utilisé par la publication)
