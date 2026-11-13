/**
 * Versions construites du site et empreinte de construction — module partagé
 * (JavaScript simple, sans dépendance) entre :
 *  - `src/integrations/build-info.ts` : écrit `build-info.json` dans chaque
 *    site construit (`npm run build`) ;
 *  - `scripts/start.mjs` : au démarrage, reconstruit si l'empreinte a changé ;
 *  - `src/lib/site-build.ts` : publication depuis l'Espace Admin.
 *
 * L'empreinte résume ce qui rend un build propre à un déploiement : version
 * du modèle (`package.json`), adresse du site (`SITE_URL`), contenu de
 * l'association (`src/content/`, octet par octet) et extensions installées
 * (`extensions/`, hors dossiers cachés de travail). Le même état = la même
 * empreinte : inutile de reconstruire.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readdir, readFile, readlink, rename, rm, symlink } from 'node:fs/promises';
import { basename, join } from 'node:path';

export const RELEASES_DIR = '.releases';
/** Nombre de versions gardées dans `.releases/` (l'active + la précédente). */
export const KEEP_RELEASES = 2;
/** Fichier écrit à la racine de chaque site construit (`dist/build-info.json`). */
export const BUILD_INFO = 'build-info.json';

/** Dossiers de travail de la publication, jamais pris en compte. */
const IGNORED = new Set(['.tmp-publication']);

async function listFiles(dir, prefix = '') {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files = [];
	for (const entry of entries) {
		if (IGNORED.has(entry.name)) continue;
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) files.push(...(await listFiles(join(dir, entry.name), rel)));
		else if (entry.isFile()) files.push(rel);
	}
	return files;
}

/** `https://www.mon-asso.fr` (sans / final), ou '' si absente ou invalide. */
export function normalizeSiteUrl(value) {
	try {
		return value ? new URL(value).origin : '';
	} catch {
		return '';
	}
}

/**
 * Empreinte de l'état à construire, dans le dossier `root` du projet.
 * @param {string} root
 * @param {string | undefined} siteUrl
 * @returns {Promise<{ version: string, siteUrl: string, fingerprint: string }>}
 */
export async function computeFingerprint(root, siteUrl) {
	const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
	const contentDir = join(root, 'src/content');
	const hash = createHash('sha256');
	hash.update(`version:${version}\nsite:${normalizeSiteUrl(siteUrl)}\n`);
	for (const file of (await listFiles(contentDir)).sort()) {
		hash.update(`file:${file}\n`);
		hash.update(await readFile(join(contentDir, file)));
	}
	// Extensions (code propre au site) : installer, mettre à jour ou retirer = reconstruire.
	const extensionsDir = join(root, 'extensions');
	for (const file of (await listFiles(extensionsDir)).filter((f) => !f.startsWith('.') && !f.includes('/.')).sort()) {
		hash.update(`extension:${file}\n`);
		hash.update(await readFile(join(extensionsDir, file)));
	}
	return { version, siteUrl: normalizeSiteUrl(siteUrl), fingerprint: hash.digest('hex') };
}

/** `dist/build-info.json` du site en place, ou `null`. */
export async function readBuildInfo(root) {
	try {
		return JSON.parse(await readFile(join(root, 'dist', BUILD_INFO), 'utf8'));
	} catch {
		return null;
	}
}

/**
 * Version déjà construite dans `.releases/` dont l'empreinte correspond (la
 * plus récente), ou `null`. Permet de construire À L'AVANCE (mise à jour :
 * `update.sh` construit la nouvelle version pendant que l'ancienne tourne) :
 * au démarrage, `start.mjs` bascule dessus au lieu de reconstruire.
 */
export async function findRelease(root, fingerprint) {
	const dir = join(root, RELEASES_DIR);
	const names = (await readdir(dir).catch(() => [])).sort().reverse();
	for (const name of names) {
		try {
			const info = JSON.parse(await readFile(join(dir, name, BUILD_INFO), 'utf8'));
			if (info.fingerprint === fingerprint && existsSync(join(dir, name, 'server/entry.mjs'))) return name;
		} catch {
			// Version incomplète ou sans build-info.json : ignorée.
		}
	}
	return null;
}

/** Heure UTC compacte, triable : `20261006T221530Z`. */
export function releaseStamp() {
	return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

/** Fait pointer `dist` sur `.releases/<release>`, sans instant où `dist` n'existe pas. */
export async function swapDist(root, release) {
	const dist = join(root, 'dist');
	const info = await lstat(dist).catch(() => null);
	if (info && !info.isSymbolicLink()) {
		// Premier passage : le `dist` d'origine (dossier réel) est rangé comme version précédente.
		try {
			await rename(dist, join(root, RELEASES_DIR, `${release}-avant`));
		} catch (err) {
			// Docker (overlayfs) : un dossier venu de l'image ne peut pas être renommé
			// (EXDEV), mais peut être supprimé — l'image le contient de toute façon.
			if (err.code !== 'EXDEV') throw err;
			await rm(dist, { recursive: true, force: true });
		}
	}
	const tmpLink = join(root, `dist.${process.pid}.tmp`);
	await rm(tmpLink, { force: true });
	await symlink(join(RELEASES_DIR, release), tmpLink);
	await rename(tmpLink, dist);
}

/**
 * Supprime les anciennes versions : garde les `KEEP_RELEASES` plus récentes
 * et, en plus, celle sur laquelle pointe `dist` (jamais effacée, même plus
 * ancienne — ex. après un retour à la version précédente).
 */
export async function pruneReleases(root) {
	const dir = join(root, RELEASES_DIR);
	const active = await readlink(join(root, 'dist'))
		.then((target) => basename(target))
		.catch(() => null);
	const names = (await readdir(dir)).sort().reverse();
	for (const name of names.slice(KEEP_RELEASES)) {
		if (name !== active) await rm(join(dir, name), { recursive: true, force: true });
	}
}
