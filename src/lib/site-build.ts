/**
 * Publication depuis l'Espace Admin : reconstruit le site (`npm run
 * build`) après une modification de contenu dans `src/content/`, sur le
 * serveur Node lui-même. Tout le contenu restant dans les sources, le site
 * publié est toujours le produit d'un build complet (cf. docs/publication.md).
 *
 * Déroulé d'une publication :
 *  1. build dans un dossier neuf `.releases/<horodatage>/` (le site en ligne
 *     n'est pas touché pendant ce temps) ;
 *  2. bascule atomique : `dist` devient un lien vers cette version ;
 *  3. commande `PUBLISH_HOOK` facultative (ex. copie vers un hébergement statique) ;
 *  4. redémarrage du serveur sur la nouvelle version (~1 s d'interruption) :
 *     lancé par `npm start`, le serveur sort avec le code de relance et le
 *     superviseur (`scripts/start.mjs`) le relance (`restartServer()`).
 * En cas d'échec du build, `onFailure` défait la modification de contenu et
 * le site reste tel quel ; en cas de succès, `onSuccess` la rend définitive
 * (ex. effacer le dossier d'une actualité supprimée, gardé de côté jusque-là).
 * Toute reconstruction réussie publie aussi les modifications enregistrées
 * sans publier (lot refermé, cf. `publication-lot.ts`).
 *
 * En développement (`astro dev`), rien à construire : le contenu est relu à chaud.
 * Une seule publication à la fois ; l'état est gardé dans
 * `<DATA_DIR>/publication/status.json` pour survivre au redémarrage, jusqu'à
 * ce que l'encadré soit fermé (`dismissStatus`). Chaque résultat est aussi
 * consigné dans le journal (`src/lib/journal.ts`).
 *
 * Code serveur uniquement.
 */

import { PUBLISH_HOOK, PUBLISH_RESTART, SITE_ROOT } from 'astro:env/server';
import { spawn } from 'node:child_process';
import { createWriteStream, readdirSync } from 'node:fs';
import { access, constants, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { avancerMaintenance, fermerMaintenance } from '../../scripts/maintenance.mjs';
import { RELEASES_DIR, pruneReleases, releaseStamp, swapDist } from '../../scripts/releases.mjs';
import { dataDir } from './data-dir';
import { logEvent, type JournalActor } from './journal';
import { clearLot } from './publication-lot';

export interface BuildStatus {
	state: 'idle' | 'running' | 'succeeded' | 'failed';
	/** Ce qui a déclenché la publication (titre de l'actualité…). */
	label?: string;
	/** Page à ouvrir une fois publiée. */
	href?: string;
	startedAt?: string;
	finishedAt?: string;
	/** Message d'erreur, ou avertissement (hook en échec…). */
	message?: string;
	/** Personne qui a lancé la publication. */
	by?: JournalActor;
}

/** Publication en cours dans ce process, ou `null`. */
let current: Promise<void> | null = null;

function root(): string {
	return resolve(SITE_ROOT || process.cwd());
}

function statusDir(): string {
	return join(dataDir(), 'publication');
}

async function writeStatus(status: BuildStatus): Promise<void> {
	await mkdir(statusDir(), { recursive: true });
	await writeFile(join(statusDir(), 'status.json'), JSON.stringify(status, null, 2));
}

/** État de la dernière publication. Un « en cours » sans build actif = interrompu (serveur arrêté pendant le build). */
export async function readStatus(): Promise<BuildStatus> {
	let status: BuildStatus;
	try {
		status = JSON.parse(await readFile(join(statusDir(), 'status.json'), 'utf8'));
	} catch {
		return { state: 'idle' };
	}
	if (status.state === 'running' && !current) {
		return { ...status, state: 'failed', message: 'La publication a été interrompue (serveur arrêté pendant la reconstruction). Relancez-la.' };
	}
	return status;
}

/**
 * La publication est-elle possible sur ce serveur ? Il faut les sources du
 * site et ses dépendances (pas seulement `dist/`), en écriture.
 */
export async function canPublish(): Promise<{ ok: boolean; reason?: string }> {
	if (import.meta.env.DEV) return { ok: true };
	const base = root();
	try {
		await access(join(base, 'package.json'));
		await access(join(base, 'node_modules', 'astro', 'package.json'));
		await access(join(base, 'src', 'content', 'news'), constants.W_OK);
		await access(base, constants.W_OK);
	} catch {
		return {
			ok: false,
			reason:
				"La publication en ligne n'est pas disponible sur ce serveur : les sources du site (src/, node_modules/) sont absentes ou en lecture seule. Voir docs/publication.md.",
		};
	}
	return { ok: true };
}

/**
 * Ferme définitivement l'encadré du dernier résultat (pour tout le monde) :
 * l'état repasse à `idle`, le résultat reste consultable dans le journal.
 * Une publication interrompue (jamais journalisée, le serveur s'étant arrêté
 * pendant le build) y est consignée à ce moment-là.
 */
export async function dismissStatus(by: JournalActor): Promise<boolean> {
	if (current) return false;
	const status = await readStatus();
	if (status.state === 'idle') return true;
	let raw: BuildStatus | null = null;
	try {
		raw = JSON.parse(await readFile(join(statusDir(), 'status.json'), 'utf8'));
	} catch {
		// déjà absent
	}
	if (raw?.state === 'running') {
		await logEvent({ by: raw.by, action: 'publication', label: raw.label, outcome: 'echec', message: status.message });
	}
	await writeStatus({ state: 'idle' });
	await logEvent({ by, action: 'publication.message-ferme', label: status.label, outcome: status.state === 'succeeded' ? 'ok' : 'echec' });
	return true;
}

export function isPublishing(): boolean {
	return current !== null;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, log: NodeJS.WritableStream, onLine?: (line: string) => void): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		log.write(`\n$ ${command} ${args.join(' ')}\n`);
		const child = spawn(command, args, { cwd: root(), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
		child.stdout.pipe(log, { end: false });
		if (onLine) {
			let reste = '';
			child.stdout.on('data', (chunk: Buffer) => {
				const lignes = (reste + chunk.toString('utf8')).split('\n');
				reste = lignes.pop() ?? '';
				for (const ligne of lignes) onLine(ligne.replace(/\x1b\[[0-9;]*m/g, ''));
			});
		}
		child.stderr.pipe(log, { end: false });
		child.on('error', reject);
		child.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${command} a échoué (code ${code})`))));
	});
}

/** Code de sortie qui demande au superviseur une relance (cf. `scripts/start.mjs`). */
const CODE_RELANCE = 75;

/** `'…'` pour le shell. */
function shellQuote(arg: string): string {
	return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Redémarre le serveur sur la nouvelle version. Lancé par `npm start`
 * (`ZERUCMS_SUPERVISE`) : on sort avec `CODE_RELANCE`, le superviseur
 * relance. Sinon (serveur lancé autrement), un petit shell détaché attend la
 * fin de ce process (libération du port) puis relance la même commande Node,
 * mêmes options, même dossier, même environnement.
 */
function restartServer(log: NodeJS.WritableStream): void {
	if (process.env.ZERUCMS_SUPERVISE) {
		setTimeout(() => process.exit(CODE_RELANCE), 500);
		return;
	}
	const command = [process.execPath, ...process.execArgv, ...process.argv.slice(1)].map(shellQuote).join(' ');
	const waiter = spawn('sh', ['-c', `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done; exec ${command}`], {
		cwd: process.cwd(),
		env: process.env,
		detached: true,
		stdio: 'inherit',
	});
	waiter.unref();
	log.write(`\nServeur lancé sans \`npm start\` : relance autonome (${command}).\n`);
	console.log('[publication] Nouvelle version en ligne : le serveur redémarre (relance autonome, en arrière-plan).');
	setTimeout(() => process.exit(0), 500);
}

/** Nombre de pages HTML du site en ligne : estimation des pages à prérendre. */
function pagesEnLigne(): number {
	let n = 0;
	const walk = (dir: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (e.isDirectory()) {
				if (e.name !== '_astro') walk(join(dir, e.name));
			} else if (e.name.endsWith('.html')) n++;
		}
	};
	try {
		walk(join(root(), 'dist', 'client'));
	} catch {
		// pas encore de site construit
	}
	return n;
}

/** Pages de contenu des sources (actualités, pages, activités) : le contenu restauré peut être bien plus grand que le site en ligne. */
function pagesDesSources(): number {
	let n = 0;
	const walk = (dir: string) => {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (e.isDirectory()) walk(join(dir, e.name));
			else if (/^index\.mdx?$/.test(e.name)) n++;
		}
	};
	for (const d of ['news', 'pages', 'activites']) {
		try {
			walk(join(root(), 'src', 'content', d));
		} catch {
			// dossier absent
		}
	}
	return n;
}

/**
 * Progression du build lue dans sa sortie (mode maintenance) : étapes
 * d'Astro, pages prérendues (comparées à celles du site en ligne), images
 * optimisées (« (n/N) »). De 15 % à 90 % ; le reste = bascule et redémarrage.
 */
function suiviDuBuild(avancer: (etape: string, progression: number) => void): (ligne: string) => void {
	// Pages de contenu + pages du site, catégories, listes… (≈ 15 de plus).
	const attendues = Math.max(1, pagesEnLigne(), pagesDesSources() + 15);
	let pages = 0;
	return (ligne) => {
		if (ligne.includes('Syncing content')) avancer('Lecture du contenu restauré…', 15);
		else if (ligne.includes('Building server entrypoints')) avancer('Construction du site…', 22);
		else if (ligne.includes('prerendering static routes')) avancer('Création des pages…', 35);
		else if (/[├└]─ \/.*\.html/.test(ligne)) {
			pages++;
			avancer(`Création des pages (${pages})…`, 35 + 35 * Math.min(1, pages / attendues));
		} else {
			const image = ligne.match(/▶ .*\((\d+)\/(\d+)\)\s*$/);
			if (image) avancer(`Optimisation des images (${image[1]}/${image[2]})…`, 70 + (20 * Number(image[1])) / Number(image[2]));
			else if (ligne.includes('build:cli')) avancer('Finalisation…', 90);
		}
	};
}

export interface PublishRequest {
	label: string;
	/** Personne qui publie (journal). */
	by: JournalActor;
	href?: string;
	/** Annule la modification de contenu si la reconstruction échoue. */
	onFailure?: () => Promise<void>;
	/** Rend la modification définitive une fois le site reconstruit (avant le redémarrage). */
	onSuccess?: () => Promise<void>;
	/**
	 * Site en mode maintenance pendant la publication (restauration) : le
	 * fichier, ouvert par l'appelant, reçoit la progression ; il est retiré en
	 * cas d'échec, ou par `scripts/start.mjs` après le redémarrage.
	 */
	maintenance?: boolean;
}

/**
 * Lance la reconstruction en arrière-plan. Refusée si une publication est
 * déjà en cours (`{ started: false }`).
 */
export async function publish(request: PublishRequest): Promise<{ started: boolean; reason?: string }> {
	if (current) return { started: false, reason: 'Une publication est déjà en cours, réessayez dans une minute.' };
	const startedAt = new Date().toISOString();
	const by = { login: request.by.login, fullname: request.by.fullname };

	if (import.meta.env.DEV) {
		await request.onSuccess?.().catch(() => {});
		await clearLot().catch(() => {});
		// Pas de build en dev (contenu relu à chaud) : le mode est affiché dans la barre d'admin.
		await writeStatus({ state: 'succeeded', label: request.label, href: request.href, startedAt, finishedAt: startedAt, by });
		await logEvent({ by, action: 'publication', label: request.label, href: request.href, outcome: 'ok', message: 'Serveur de développement : aucune reconstruction.' });
		if (request.maintenance) fermerMaintenance(dataDir());
		return { started: true };
	}

	await writeStatus({ state: 'running', label: request.label, href: request.href, startedAt, by });
	current = (async () => {
		const release: string = releaseStamp();
		const outDir = join(RELEASES_DIR, release);
		await mkdir(statusDir(), { recursive: true });
		const log = createWriteStream(join(statusDir(), 'build.log'));
		const avancer = (etape: string, progression: number) => {
			if (request.maintenance) avancerMaintenance(dataDir(), { etape, progression });
		};
		try {
			avancer('Construction du site…', 12);
			await run('npm', ['run', '-s', 'build'], { ASTRO_OUT_DIR: outDir }, log, request.maintenance ? suiviDuBuild(avancer) : undefined);
			avancer('Mise en ligne de la nouvelle version…', 93);
			await swapDist(root(), release);
			await request.onSuccess?.().catch(() => {});
			// Les sources entières sont en ligne : lot en attente compris.
			await clearLot().catch(() => {});
			let message: string | undefined;
			if (PUBLISH_HOOK) {
				try {
					await run('sh', ['-c', PUBLISH_HOOK], {}, log);
				} catch (err) {
					message = `Site reconstruit, mais la commande PUBLISH_HOOK a échoué : ${(err as Error).message}.`;
				}
			}
			await pruneReleases(root()).catch(() => {});
			await writeStatus({ state: 'succeeded', label: request.label, href: request.href, startedAt, finishedAt: new Date().toISOString(), message, by });
			await logEvent({ by, action: 'publication', label: request.label, href: request.href, outcome: 'ok', message });
			if (PUBLISH_RESTART) {
				// La maintenance prend fin quand le serveur relancé écoute (scripts/start.mjs).
				if (request.maintenance) avancerMaintenance(dataDir(), { etape: 'Redémarrage du serveur…', progression: 96, etat: 'redemarrage' });
				log.write('\nPublication terminée : redémarrage du serveur.\n');
				restartServer(log);
			} else if (request.maintenance) fermerMaintenance(dataDir());
		} catch (err) {
			await request.onFailure?.().catch(() => {});
			if (request.maintenance) fermerMaintenance(dataDir());
			await rm(join(root(), outDir), { recursive: true, force: true });
			const message = `La reconstruction du site a échoué, rien n'a été publié (${(err as Error).message}). Détail : ${join(statusDir(), 'build.log')}`;
			await writeStatus({ state: 'failed', label: request.label, startedAt, finishedAt: new Date().toISOString(), message, by });
			await logEvent({ by, action: 'publication', label: request.label, outcome: 'echec', message });
		} finally {
			log.end();
			current = null;
		}
	})();
	return { started: true };
}
