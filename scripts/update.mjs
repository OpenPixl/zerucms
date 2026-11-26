/**
 * Mise à jour d'une installation « Node » (sans Docker) vers une version
 * publiée du modèle. Lancé par `./update.sh` (mode node) ou par le bouton
 * « Mettre à jour » de l'Espace Admin (`src/lib/mise-a-jour.ts`, option
 * `--suivi`) :
 *
 *   node scripts/update.mjs v1.2.0 [--archive fichier.tar.gz] [--sans-sauvegarde] [--suivi]
 *
 * Deux façons d'avoir installé le site, reconnues seules :
 *
 * **Par `git clone`** (dossier `.git`) :
 * 1. `git fetch` des versions publiées (étiquettes `vX.Y.Z`) ;
 * 2. sauvegarde du contenu de l'association (`scripts/sauvegarde.mjs`,
 *    motif « avant mise à jour », 5 dernières gardées dans
 *    `data/sauvegardes/`) ; échec = mise à jour annulée, sauf
 *    `--sans-sauvegarde` ;
 * 3. fichiers du modèle modifiés sur le serveur (ex. `package.json` réécrit
 *    par npm ou cPanel) **mis de côté** (`git stash`, message
 *    « zerucms : modifications locales avant la mise à jour vers … ») :
 *    la mise à jour n'est jamais bloquée et rien n'est perdu
 *    (`git stash list`, `git stash show -p`) ;
 * 4. passage à la version : avance rapide de la branche (`git merge
 *    --ff-only`, `git pull` reste possible ensuite), sinon (branche avec
 *    des commits propres, retour à une version plus ancienne) étiquette
 *    extraite seule (`git checkout --detach`) ;
 * 5. `npm install` (garde un `node_modules` lien symbolique, cas de cPanel),
 *    `package.json` / `package-lock.json` remis tels que publiés ;
 * 6. construction À CÔTÉ (`.releases/<horodatage>`) — le site en ligne
 *    continue sur l'ancienne version ;
 * 7. échec en 4-6 → code d'origine (commit et modifications locales)
 *    remis, `npm install`, rien n'a changé.
 *
 * **Par archive** (ni Docker ni git) :
 * 1. télécharge l'archive des sources de la version (Release GitHub) ;
 * 2. sauvegarde du contenu, comme ci-dessus ;
 * 3. met de côté le code actuel (`.update/sauvegarde-<version>.tar.gz`) ;
 * 4. remplace le CODE : dossiers du modèle (`src/` hors `src/content/`,
 *    `scripts/`, `docs/`, `.github/`) remplacés entièrement — anciens dossiers
 *    de modèles de contenu à la racine (`contenu-initial*`, avant `src/modeles/`)
 *    retirés —, fichiers de la racine écrasés. Jamais touchés :
 *    `src/content/`, `data/`, `extensions/`, `.env`, `.releases/`, `dist`,
 *    et tout fichier ajouté à la racine ;
 * 5. `npm ci` puis construction à côté ;
 * 6. échec en 5 → code d'origine restauré, `npm ci`, rien n'a changé.
 *
 * Fin (les deux cas) : redémarrage par `UPDATE_RESTART` (.env, ex.
 * « systemctl restart monsite ») ou consigne affichée : au redémarrage,
 * `serveur.mjs` trouve la version déjà construite et bascule sans
 * reconstruire. Avec `--suivi` (bouton de l'Espace Admin), le serveur qui a
 * lancé la mise à jour se relance lui-même : rien n'est fait ici, et chaque
 * étape est annoncée aussi par une ligne `@@<progression>|<étape>`.
 *
 * Pendant la mise à jour, `node_modules` change sous le serveur en marche :
 * la lancer à un moment calme (le bouton met le site en maintenance).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RELEASES_DIR, releaseStamp } from './releases.mjs';

const root = resolve(process.env.SITE_ROOT || process.cwd());
const REPO = process.env.UPDATE_REPO || 'OpenPixl/zerucms';
/**
 * Dossiers appartenant au modèle, remplacés en entier (absents de la
 * nouvelle version = supprimés : c'est le cas des anciens emplacements des
 * modèles de contenu, déplacés dans `src/modeles/`).
 */
const TEMPLATE_DIRS = ['scripts', 'docs', '.github', 'contenu-initial', 'contenu-initial-entreprise'];
/** Entrées de `src/` appartenant à l'association : jamais remplacées. */
const SRC_KEEP = new Set(['content']);
/** À la racine : jamais touchés, même si l'archive en contient. */
const ROOT_KEEP = new Set(['.env', 'data', 'extensions', '.releases', 'dist', 'node_modules', '.update', '.git', '.dockercfg']);

const args = process.argv.slice(2);
const tag = args.find((a) => /^v\d/.test(a));
const archiveArg = args.includes('--archive') ? args[args.indexOf('--archive') + 1] : null;
const sansSauvegarde = args.includes('--sans-sauvegarde');
/** Lancé par l'Espace Admin : progression lisible, pas de redémarrage ici. */
const suivi = args.includes('--suivi');

/** Étape annoncée ; `progression` (0-100) pour la barre de l'Espace Admin. */
function etape(message, progression) {
	console.log(`→ ${message}`);
	if (suivi && progression !== undefined) console.log(`@@${progression}|${message}`);
}
function echec(message) {
	console.error(`✗ ${message}`);
	process.exit(1);
}
function run(command, args, env = {}) {
	const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
	return result.status === 0;
}
/** Commande silencieuse : sortie rendue, rien d'affiché. */
function lire(command, args) {
	const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
	return { ok: result.status === 0, sortie: (result.stdout ?? '').trim(), erreur: (result.stderr ?? '').trim() };
}
const version = async (dir) => JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version;

if (!tag) echec('usage : node scripts/update.mjs vX.Y.Z [--archive fichier.tar.gz] [--sans-sauvegarde] [--suivi]');

// Variables du .env (SITE_URL, UPDATE_RESTART) pour la construction et le redémarrage.
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
if (!/^https?:\/\//.test(process.env.SITE_URL ?? '')) echec('SITE_URL manquant dans .env (ex. SITE_URL=https://www.mon-asso.fr).');

const actuelle = await version(root);
if (`v${actuelle}` === tag) {
	console.log(`✓ Déjà en version ${actuelle}.`);
	process.exit(0);
}

/** Sauvegarde du contenu de l'association (outil livré depuis la 0.5.3). */
function sauvegarderContenu() {
	if (sansSauvegarde) {
		etape('Sauvegarde du contenu : passée (--sans-sauvegarde)', 6);
	} else if (existsSync(join(root, 'scripts', 'sauvegarde.mjs'))) {
		etape('Sauvegarde du contenu, des comptes et du journal (data/sauvegardes/)', 6);
		if (!run('node', ['scripts/sauvegarde.mjs', 'creer', 'avant mise à jour', '--garder', '5'])) {
			echec('sauvegarde impossible : mise à jour annulée, rien n’a été changé (--sans-sauvegarde pour passer outre).');
		}
	} else {
		etape('Sauvegarde du contenu : outil absent de la version actuelle (avant 0.5.3), passée', 6);
	}
}

/** Construit la version à côté du site en ligne ; `false` si elle ne se construit pas (dossier retiré). */
async function construire(cible) {
	const release = releaseStamp();
	etape(`Construction de la version ${cible} à côté du site en ligne (${RELEASES_DIR}/${release})`, 30);
	if (run('npm', ['run', '-s', 'build'], { ASTRO_OUT_DIR: join(RELEASES_DIR, release) })) {
		etape(`Version ${cible} construite`, 92);
		return true;
	}
	await rm(join(root, RELEASES_DIR, release), { recursive: true, force: true });
	return false;
}

/** Fin : redémarrage (ou consigne) pour mettre la version construite en ligne. */
function terminer(cible) {
	if (suivi) {
		console.log(`✓ Version ${cible} installée et construite : redémarrage du serveur par l'Espace Admin.`);
		return;
	}
	const restart = process.env.UPDATE_RESTART;
	if (restart) {
		etape(`Redémarrage : ${restart}`);
		if (!run('sh', ['-c', restart])) echec(`la commande UPDATE_RESTART a échoué : redémarrez le serveur à la main (version ${cible} prête).`);
		console.log(`✓ Site en version ${cible}.`);
	} else {
		console.log(`✓ Version ${cible} installée et construite. Redémarrez le site pour la mettre en ligne :`);
		console.log('  « npm start » : arrêtez-le (Ctrl+C) puis relancez-le ; service systemd : sudo systemctl restart <nom> ;');
		console.log('  hébergement cPanel (Passenger) : bouton « Restart » de « Setup Node.js App » (ou touch tmp/restart.txt) ;');
		console.log('  ou définissez UPDATE_RESTART dans .env. Vous pouvez aussi mettre à jour depuis l\'Espace Admin (bouton « Mettre à jour »).');
	}
}

// ── Installation par git ─────────────────────────────────────────────────────
async function miseAJourGit() {
	if (!lire('git', ['--version']).ok) echec('site installé avec git, mais la commande git est introuvable sur ce serveur.');

	etape('Recherche des versions publiées (git fetch)', 3);
	if (!run('git', ['fetch', '--quiet', '--tags', '--force', 'origin'])) echec('impossible de joindre le dépôt du modèle (réseau ?) : rien n’a été changé.');
	const commitCible = lire('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`]).sortie;
	if (!commitCible) echec(`version ${tag} introuvable dans le dépôt : rien n’a été changé.`);

	sauvegarderContenu();

	const avant = lire('git', ['rev-parse', 'HEAD']).sortie;
	const branche = lire('git', ['symbolic-ref', '-q', '--short', 'HEAD']).sortie;

	// Fichiers du modèle modifiés sur le serveur : mis de côté, jamais perdus.
	const modifies = lire('git', ['diff', '--name-only', 'HEAD']).sortie.split('\n').filter(Boolean);
	let misDeCote = false;
	if (modifies.length) {
		const date = new Date().toLocaleString('fr-FR');
		etape(`Modifications locales mises de côté (${modifies.length} fichier${modifies.length > 1 ? 's' : ''})`, 10);
		for (const fichier of modifies) console.log(`  ${fichier}`);
		if (!run('git', ['stash', 'push', '--quiet', '-m', `zerucms : modifications locales avant la mise à jour vers ${tag} (${date})`])) {
			echec('impossible de mettre de côté les modifications locales : rien n’a été changé.');
		}
		misDeCote = true;
		console.log('  À retrouver avec « git stash list » puis « git stash show -p » (rien n’est perdu).');
	}

	/** Retour exact à l'état d'avant : commit, branche, dépendances, puis modifications locales. */
	async function annuler(raison) {
		console.error(`✗ ${raison} : retour au code de la version ${actuelle}.`);
		if (branche) {
			run('git', ['checkout', '--quiet', '-f', branche]);
			run('git', ['reset', '--quiet', '--hard', avant]);
		} else {
			run('git', ['checkout', '--quiet', '-f', '--detach', avant]);
		}
		run('npm', ['install', '--no-audit', '--no-fund']);
		run('git', ['checkout', '--quiet', '--', 'package.json', 'package-lock.json']);
		// En dernier : `package.json` modifié sur le serveur fait partie de ce qui est rendu.
		if (misDeCote && !run('git', ['stash', 'pop', '--quiet'])) console.error('  Modifications locales non réappliquées : elles restent dans « git stash list ».');
		echec(`mise à jour annulée, le site reste en version ${actuelle} (il n'a pas été arrêté).`);
	}

	etape(`Passage au code de la version ${tag.slice(1)} (src/content, data, extensions, .env non touchés)`, 12);
	// Avance rapide de la branche : `git pull` reste possible ensuite.
	let passe = Boolean(branche) && lire('git', ['merge', '--ff-only', '--quiet', tag]).ok && lire('git', ['rev-parse', 'HEAD']).sortie === commitCible;
	if (!passe) {
		if (branche && lire('git', ['rev-parse', 'HEAD']).sortie !== avant) run('git', ['reset', '--quiet', '--hard', avant]);
		passe = run('git', ['checkout', '--quiet', '--detach', tag]);
		if (passe && branche) console.log(`  La branche « ${branche} » ne mène pas à ${tag} (commits propres ou version plus ancienne) : version extraite seule, la branche est gardée telle quelle.`);
	}
	if (!passe) await annuler(`impossible de passer à la version ${tag}`);
	const cible = await version(root);

	etape('Installation des dépendances (npm install)', 18);
	const dependances = run('npm', ['install', '--no-audit', '--no-fund']);
	// npm peut réécrire ces fichiers (version de npm, cPanel) : gardés tels que publiés.
	run('git', ['checkout', '--quiet', '--', 'package.json', 'package-lock.json']);
	if (!dependances) await annuler('npm install a échoué');

	if (!(await construire(cible))) await annuler(`la version ${cible} ne se construit pas avec votre contenu`);
	if (misDeCote) console.log('  Rappel : vos modifications locales sont dans « git stash list ».');
	terminer(cible);
}

// ── Installation par archive (ni Docker ni git) ──────────────────────────────
async function miseAJourArchive() {
	// 1. Archive de la version visée, extraite dans un dossier temporaire.
	const work = await mkdtemp(join(tmpdir(), 'numerik-update-'));
	const nouvelle = join(work, 'code');
	await mkdir(nouvelle);
	let archive = archiveArg && resolve(archiveArg);
	if (!archive) {
		const url = `https://github.com/${REPO}/archive/refs/tags/${tag}.tar.gz`;
		etape(`Téléchargement de ${url}`, 3);
		const response = await fetch(url);
		if (!response.ok) echec(`version ${tag} introuvable (HTTP ${response.status}).`);
		archive = join(work, 'archive.tar.gz');
		await writeFile(archive, Buffer.from(await response.arrayBuffer()));
	}
	if (!run('tar', ['-xzf', archive, '-C', nouvelle, '--strip-components=1'])) echec(`archive illisible : ${archive}`);
	const cible = await version(nouvelle);
	if (`v${cible}` !== tag) echec(`l'archive contient la version ${cible}, pas ${tag}.`);

	sauvegarderContenu();

	// Sauvegarde du code actuel (pour revenir en arrière en cas d'échec).
	await mkdir(join(root, '.update'), { recursive: true });
	const sauvegarde = join(root, '.update', `sauvegarde-${actuelle}.tar.gz`);
	const rootFiles = (await readdir(root, { withFileTypes: true })).filter((e) => e.isFile() && !ROOT_KEEP.has(e.name)).map((e) => e.name);
	const aSauver = [...rootFiles, ...TEMPLATE_DIRS.filter((d) => existsSync(join(root, d))), 'src'];
	etape(`Sauvegarde du code actuel (${actuelle}) : .update/sauvegarde-${actuelle}.tar.gz`, 10);
	if (!run('tar', ['-czf', sauvegarde, '--exclude=src/content', ...aSauver])) echec('sauvegarde impossible : rien n’a été changé.');

	/** Remplace le code de `root` par celui de `from` (contenu de l'association préservé). */
	async function installerCode(from) {
		for (const dir of TEMPLATE_DIRS) {
			await rm(join(root, dir), { recursive: true, force: true });
			if (existsSync(join(from, dir))) await cp(join(from, dir), join(root, dir), { recursive: true });
		}
		for (const entry of await readdir(join(root, 'src'))) {
			if (!SRC_KEEP.has(entry)) await rm(join(root, 'src', entry), { recursive: true, force: true });
		}
		for (const entry of await readdir(join(from, 'src'))) {
			if (!SRC_KEEP.has(entry)) await cp(join(from, 'src', entry), join(root, 'src', entry), { recursive: true });
		}
		for (const entry of await readdir(from, { withFileTypes: true })) {
			if (entry.isFile() && !ROOT_KEEP.has(entry.name)) await cp(join(from, entry.name), join(root, entry.name));
		}
	}

	async function restaurer(raison) {
		console.error(`✗ ${raison} : retour au code de la version ${actuelle}.`);
		const ancien = join(work, 'ancien');
		await mkdir(ancien);
		run('tar', ['-xzf', sauvegarde, '-C', ancien]);
		await installerCode(ancien);
		run('npm', ['ci', '--no-audit', '--no-fund']);
		echec(`mise à jour annulée, le site reste en version ${actuelle} (il n'a pas été arrêté).`);
	}

	etape(`Installation du code de la version ${cible} (src/content, data, .env non touchés)`, 12);
	await installerCode(nouvelle);
	etape('Installation des dépendances (npm ci)', 18);
	if (!run('npm', ['ci', '--no-audit', '--no-fund'])) await restaurer('npm ci a échoué');
	if (!(await construire(cible))) await restaurer(`la version ${cible} ne se construit pas avec votre contenu`);
	await rm(work, { recursive: true, force: true });
	terminer(cible);
}

if (existsSync(join(root, '.git'))) await miseAJourGit();
else await miseAJourArchive();
