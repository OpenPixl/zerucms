/**
 * Mise à jour d'une installation « Node seul » (sans Docker ni git) vers une
 * version publiée du modèle. Lancé par `./update.sh` (mode node) :
 *
 *   node scripts/update.mjs v1.2.0 [--archive fichier.tar.gz]
 *
 * 1. télécharge l'archive des sources de la version (Release GitHub) ;
 * 1 bis. sauvegarde le contenu de l'association (`scripts/sauvegarde.mjs`,
 *    motif « avant mise à jour », 5 dernières gardées dans
 *    `data/sauvegardes/`) ; échec = mise à jour annulée, sauf
 *    `--sans-sauvegarde` ;
 * 2. met de côté le code actuel (`.update/sauvegarde-<version>.tar.gz`) ;
 * 3. remplace le CODE : dossiers du modèle (`src/` hors `src/content/`,
 *    `scripts/`, `docs/`, `.github/`) remplacés entièrement — anciens dossiers
 *    de modèles de contenu à la racine (`contenu-initial*`, avant `src/modeles/`)
 *    retirés —, fichiers de la
 *    racine écrasés. Jamais touchés : `src/content/`, `data/`, `.env`,
 *    `.releases/`, `dist`, et tout fichier ajouté à la racine ;
 * 4. `npm ci` puis construction de la nouvelle version À CÔTÉ
 *    (`.releases/<horodatage>`) — le site en ligne continue sur l'ancienne ;
 * 5. échec en 4 → code d'origine restauré, `npm ci`, rien n'a changé ;
 *    succès → redémarrage par `UPDATE_RESTART` (.env, ex. « pm2 restart
 *    numerik2026 ») ou consigne affichée : au redémarrage, `start.mjs` trouve
 *    la version déjà construite et bascule sans reconstruire.
 *
 * Pendant l'étape 4, `node_modules` change sous le serveur en marche : faire
 * la mise à jour à un moment calme (pas de publication en cours).
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
const ROOT_KEEP = new Set(['.env', 'data', '.releases', 'dist', 'node_modules', '.update', '.git', '.dockercfg']);

const etape = (m) => console.log(`→ ${m}`);
function echec(message) {
	console.error(`✗ ${message}`);
	process.exit(1);
}
function run(command, args, env = {}) {
	const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
	return result.status === 0;
}
const version = async (dir) => JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).version;

const args = process.argv.slice(2);
const tag = args.find((a) => /^v\d/.test(a));
const archiveArg = args.includes('--archive') ? args[args.indexOf('--archive') + 1] : null;
const sansSauvegarde = args.includes('--sans-sauvegarde');
if (!tag) echec('usage : node scripts/update.mjs vX.Y.Z [--archive fichier.tar.gz]');

// Variables du .env (SITE_URL, UPDATE_RESTART) pour la construction et le redémarrage.
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
if (!/^https?:\/\//.test(process.env.SITE_URL ?? '')) echec('SITE_URL manquant dans .env (ex. SITE_URL=https://www.mon-asso.fr).');

const actuelle = await version(root);
if (`v${actuelle}` === tag) {
	console.log(`✓ Déjà en version ${actuelle}.`);
	process.exit(0);
}

// 1. Archive de la version visée, extraite dans un dossier temporaire.
const work = await mkdtemp(join(tmpdir(), 'numerik-update-'));
const nouvelle = join(work, 'code');
await mkdir(nouvelle);
let archive = archiveArg && resolve(archiveArg);
if (!archive) {
	const url = `https://github.com/${REPO}/archive/refs/tags/${tag}.tar.gz`;
	etape(`Téléchargement de ${url}`);
	const response = await fetch(url);
	if (!response.ok) echec(`version ${tag} introuvable (HTTP ${response.status}).`);
	archive = join(work, 'archive.tar.gz');
	await writeFile(archive, Buffer.from(await response.arrayBuffer()));
}
if (!run('tar', ['-xzf', archive, '-C', nouvelle, '--strip-components=1'])) echec(`archive illisible : ${archive}`);
const cible = await version(nouvelle);
if (`v${cible}` !== tag) echec(`l'archive contient la version ${cible}, pas ${tag}.`);

// 1 bis. Sauvegarde du contenu de l'association (outil livré depuis la 0.5.3).
if (sansSauvegarde) {
	etape('Sauvegarde du contenu : passée (--sans-sauvegarde)');
} else if (existsSync(join(root, 'scripts', 'sauvegarde.mjs'))) {
	etape('Sauvegarde du contenu, des comptes et du journal (data/sauvegardes/)');
	if (!run('node', ['scripts/sauvegarde.mjs', 'creer', 'avant mise à jour', '--garder', '5'])) {
		echec('sauvegarde impossible : mise à jour annulée, rien n’a été changé (--sans-sauvegarde pour passer outre).');
	}
} else {
	etape('Sauvegarde du contenu : outil absent de la version actuelle (avant 0.5.3), passée');
}

// 2. Sauvegarde du code actuel (pour revenir en arrière en cas d'échec).
await mkdir(join(root, '.update'), { recursive: true });
const sauvegarde = join(root, '.update', `sauvegarde-${actuelle}.tar.gz`);
const rootFiles = (await readdir(root, { withFileTypes: true })).filter((e) => e.isFile() && !ROOT_KEEP.has(e.name)).map((e) => e.name);
const aSauver = [...rootFiles, ...TEMPLATE_DIRS.filter((d) => existsSync(join(root, d))), 'src'];
etape(`Sauvegarde du code actuel (${actuelle}) : .update/sauvegarde-${actuelle}.tar.gz`);
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

// 3-4. Nouveau code, dépendances, construction à côté.
etape(`Installation du code de la version ${cible} (src/content, data, .env non touchés)`);
await installerCode(nouvelle);
etape('Installation des dépendances (npm ci)');
if (!run('npm', ['ci', '--no-audit', '--no-fund'])) await restaurer('npm ci a échoué');
const release = releaseStamp();
etape(`Construction de la version ${cible} à côté du site en ligne (${RELEASES_DIR}/${release})`);
if (!run('npm', ['run', '-s', 'build'], { ASTRO_OUT_DIR: join(RELEASES_DIR, release) })) {
	await rm(join(root, RELEASES_DIR, release), { recursive: true, force: true });
	await restaurer(`la version ${cible} ne se construit pas avec votre contenu`);
}
await rm(work, { recursive: true, force: true });

// 5. Redémarrage : start.mjs basculera sur la version construite.
const restart = process.env.UPDATE_RESTART;
if (restart) {
	etape(`Redémarrage : ${restart}`);
	if (!run('sh', ['-c', restart])) echec(`la commande UPDATE_RESTART a échoué : redémarrez le serveur à la main (version ${cible} prête).`);
	console.log(`✓ Site en version ${cible}.`);
} else {
	console.log(`✓ Version ${cible} installée et construite. Redémarrez le serveur pour la mettre en ligne`);
	console.log('  (ex. « pm2 restart numerik2026 », « systemctl restart numerik2026 ») — ou définissez UPDATE_RESTART dans .env.');
}
