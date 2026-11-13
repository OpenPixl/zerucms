/**
 * Extensions du site (`extensions/<id>/`, cf. `src/lib/extensions.ts` et
 * docs/extensions.md) — logique unique, partagée par la ligne de commande,
 * le module « Extensions » de l'Espace Admin
 * (`src/lib/extension-writer.ts`) et la config Astro
 * (`src/integrations/extensions.ts`) :
 *
 *   npm run extension -- liste
 *   npm run extension -- install <archive.zip>
 *   npm run extension -- supprimer <id>
 *
 * Installer = vérifier l'archive (fiche `extension.json`, identifiant,
 * version minimale du CMS, chemins), l'extraire à côté puis la mettre en
 * place d'un coup ; l'ancienne version est gardée jusqu'à la fin (retour en
 * arrière si la reconstruction échoue). Le dossier `extensions/` lui-même
 * n'est jamais supprimé ni renommé (point de montage Docker). Le site est
 * reconstruit au prochain démarrage (empreinte, `scripts/releases.mjs`) ou
 * aussitôt depuis l'Espace Admin.
 *
 * Node seul, sans dépendance hors `fflate`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

/** Identifiant = nom du dossier : minuscules, chiffres, tirets (cf. `EXTENSION_ID` de src/lib/extensions.ts). */
export const EXTENSION_ID = /^[a-z][a-z0-9-]{1,39}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
export const FICHE = 'extension.json';
/** Archive et contenu extrait : au-delà, refusé. */
export const TAILLE_MAX = 20 * 1024 * 1024;
const FICHIERS_MAX = 2000;

export function racineSite() {
	return resolve(process.env.SITE_ROOT || process.cwd());
}
export function dossierExtensions(root = racineSite()) {
	return join(root, 'extensions');
}
export function versionCms(root = racineSite()) {
	return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
}

/** `version` ≥ `minimum` (X.Y.Z) ? */
export function versionAuMoins(version, minimum) {
	const a = String(version).split('.').map(Number);
	const b = String(minimum).split('.').map(Number);
	for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
	return true;
}

const texte = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Problèmes d'une fiche `extension.json` (liste vide = valide).
 * @param {unknown} fiche
 * @param {{ id?: string, cms?: string }} attendu id du dossier, version du CMS en place
 */
export function verifierFiche(fiche, { id, cms } = {}) {
	if (!fiche || typeof fiche !== 'object' || Array.isArray(fiche)) return [`${FICHE} : objet JSON attendu.`];
	const f = /** @type {Record<string, unknown>} */ (fiche);
	const erreurs = [];
	if (typeof f.id !== 'string' || !EXTENSION_ID.test(f.id)) erreurs.push(`${FICHE} : « id » invalide (minuscules, chiffres et tirets, commence par une lettre).`);
	else if (id && f.id !== id) erreurs.push(`${FICHE} : « id » (${f.id}) différent du nom du dossier (${id}).`);
	for (const champ of ['label', 'description', 'icon']) if (!texte(f[champ])) erreurs.push(`${FICHE} : « ${champ} » manquant.`);
	if (typeof f.version !== 'string' || !VERSION.test(f.version)) erreurs.push(`${FICHE} : « version » attendue au format X.Y.Z.`);
	if (typeof f.cms !== 'string' || !VERSION.test(f.cms)) erreurs.push(`${FICHE} : « cms » (version minimale du CMS) attendue au format X.Y.Z.`);
	else if (cms && !versionAuMoins(cms, f.cms)) erreurs.push(`Cette extension demande le CMS ${f.cms} ou plus récent (version en place : ${cms}). Mettez d'abord le site à jour.`);
	if (f.gardes !== undefined && !Array.isArray(f.gardes)) erreurs.push(`${FICHE} : « gardes » doit être une liste.`);
	for (const g of Array.isArray(f.gardes) ? f.gardes : []) {
		if (!g || typeof g.prefixe !== 'string' || !g.prefixe.startsWith('/api/admin/') || !Array.isArray(g.groupes) || !texte(g.message)) {
			erreurs.push(`${FICHE} : garde invalide (prefixe /api/admin/…, groupes, message).`);
		}
	}
	return erreurs;
}

/** Fiche lue dans `extensions/<id>/`, ou `null` (absente ou illisible). */
export function lireFiche(dossier) {
	try {
		return JSON.parse(readFileSync(join(dossier, FICHE), 'utf8'));
	} catch {
		return null;
	}
}

/**
 * Extensions présentes (dossiers non cachés de `extensions/`), avec leurs problèmes.
 * @returns {{ id: string, dossier: string, fiche: any, erreurs: string[] }[]}
 */
export function listerExtensions(root = racineSite()) {
	const base = dossierExtensions(root);
	if (!existsSync(base)) return [];
	const cms = versionCms(root);
	return readdirSync(base, { withFileTypes: true })
		.filter((d) => d.isDirectory() && !d.name.startsWith('.'))
		.map((d) => {
			const dossier = join(base, d.name);
			const fiche = lireFiche(dossier);
			const erreurs = fiche ? verifierFiche(fiche, { id: d.name, cms }) : [`${FICHE} absent ou illisible.`];
			if (!EXTENSION_ID.test(d.name)) erreurs.unshift(`Nom de dossier invalide : ${d.name}`);
			return { id: d.name, dossier, fiche, erreurs };
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Contenu d'une archive d'extension : fichiers relatifs au dossier de
 * l'extension (archive « à plat » ou avec un seul dossier de premier
 * niveau, ex. `zerucms-rdv-1.0.0/`), fiche vérifiée.
 * @param {Uint8Array} zip
 */
export function lireArchive(zip, root = racineSite()) {
	if (zip.length > TAILLE_MAX) throw new Error(`Archive trop volumineuse (${TAILLE_MAX / 1024 / 1024} Mo max).`);
	let entrees;
	try {
		entrees = unzipSync(zip);
	} catch {
		throw new Error("Ce fichier n'est pas une archive ZIP lisible.");
	}
	const noms = Object.keys(entrees).filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'));
	const fiche = noms.filter((n) => n.split('/').at(-1) === FICHE).sort((a, b) => a.split('/').length - b.split('/').length)[0];
	if (!fiche) throw new Error(`Archive sans ${FICHE} : ce n'est pas une extension.`);
	const prefixe = fiche.slice(0, -FICHE.length);
	if (prefixe.split('/').length > 2) throw new Error(`${FICHE} trop profond dans l'archive (à la racine ou dans un seul dossier).`);
	let total = 0;
	/** @type {Map<string, Uint8Array>} */
	const fichiers = new Map();
	for (const nom of noms) {
		if (!nom.startsWith(prefixe)) continue;
		const rel = nom.slice(prefixe.length);
		const parts = rel.split('/');
		if (nom.startsWith('/') || nom.includes('\\') || parts.some((p) => p === '..' || p === '' || p === '.')) throw new Error(`Chemin refusé dans l'archive : ${nom}`);
		if (parts[0] === 'node_modules') throw new Error("L'archive ne doit pas contenir node_modules/.");
		total += entrees[nom].length;
		fichiers.set(rel, entrees[nom]);
	}
	if (fichiers.size > FICHIERS_MAX) throw new Error(`Trop de fichiers dans l'archive (${FICHIERS_MAX} max).`);
	if (total > TAILLE_MAX) throw new Error(`Extension trop volumineuse une fois extraite (${TAILLE_MAX / 1024 / 1024} Mo max).`);
	let info;
	try {
		info = JSON.parse(strFromU8(fichiers.get(FICHE)));
	} catch {
		throw new Error(`${FICHE} illisible (JSON invalide).`);
	}
	const erreurs = verifierFiche(info, { cms: versionCms(root) });
	if (erreurs.length) throw new Error(erreurs.join(' '));
	return { fiche: info, fichiers };
}

const horodatage = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');

/**
 * Installe (ou remplace) une extension depuis une archive. Rien n'est
 * changé si l'archive est refusée. L'ancienne version reste à côté
 * (`.ancienne-<id>-<horodatage>`) : `restaurer()` la remet, `purger()` l'efface.
 * @param {Uint8Array} zip
 */
export function installerArchive(zip, root = racineSite()) {
	const { fiche, fichiers } = lireArchive(zip, root);
	const base = dossierExtensions(root);
	mkdirSync(base, { recursive: true });
	const cible = join(base, fiche.id);
	const temporaire = join(base, `.installation-${fiche.id}-${horodatage()}`);
	try {
		for (const [rel, data] of fichiers) {
			const chemin = join(temporaire, rel);
			mkdirSync(dirname(chemin), { recursive: true });
			writeFileSync(chemin, data);
		}
	} catch (err) {
		rmSync(temporaire, { recursive: true, force: true });
		throw err;
	}
	const precedente = existsSync(cible) ? lireFiche(cible) : null;
	const ancienne = existsSync(cible) ? join(base, `.ancienne-${fiche.id}-${horodatage()}`) : null;
	if (ancienne) renameSync(cible, ancienne);
	renameSync(temporaire, cible);
	return {
		fiche,
		precedente: precedente?.version ?? null,
		restaurer() {
			rmSync(cible, { recursive: true, force: true });
			if (ancienne && existsSync(ancienne)) renameSync(ancienne, cible);
		},
		purger() {
			if (ancienne) rmSync(ancienne, { recursive: true, force: true });
		},
	};
}

/** Retire une extension ; mise de côté jusqu'à `purger()` (`restaurer()` la remet). */
export function supprimerExtension(id, root = racineSite()) {
	if (!EXTENSION_ID.test(id)) throw new Error(`Identifiant d'extension invalide : ${id}`);
	const base = dossierExtensions(root);
	const cible = join(base, id);
	if (!existsSync(cible) || !statSync(cible).isDirectory()) throw new Error(`Extension « ${id} » non installée.`);
	const fiche = lireFiche(cible);
	const cote = join(base, `.supprimee-${id}-${horodatage()}`);
	renameSync(cible, cote);
	return {
		fiche,
		restaurer() {
			if (existsSync(cote)) renameSync(cote, cible);
		},
		purger() {
			rmSync(cote, { recursive: true, force: true });
		},
	};
}

// --- Ligne de commande -------------------------------------------------------

function main(args) {
	const [commande, argument] = args;
	if (commande === 'liste' || commande === 'list' || !commande) {
		const liste = listerExtensions();
		if (!liste.length) console.log('Aucune extension installée (dossier extensions/).');
		for (const e of liste) {
			console.log(`${e.id}${e.fiche?.version ? ` ${e.fiche.version}` : ''}${e.fiche?.label ? ` — ${e.fiche.label}` : ''}`);
			for (const err of e.erreurs) console.log(`  ⚠ ${err}`);
		}
		return;
	}
	if (commande === 'install' || commande === 'installer') {
		if (!argument) throw new Error('Usage : npm run extension -- install <archive.zip>');
		const r = installerArchive(readFileSync(resolve(argument)));
		r.purger();
		console.log(`Extension « ${r.fiche.label} » ${r.fiche.version} installée dans extensions/${r.fiche.id}/${r.precedente ? ` (remplace la ${r.precedente})` : ''}.`);
		console.log('Le site sera reconstruit au prochain démarrage (npm start, ou redémarrage du conteneur / du service).');
		return;
	}
	if (commande === 'supprimer' || commande === 'remove') {
		if (!argument) throw new Error('Usage : npm run extension -- supprimer <id>');
		const r = supprimerExtension(argument);
		r.purger();
		console.log(`Extension « ${r.fiche?.label ?? argument} » supprimée. Le site sera reconstruit au prochain démarrage.`);
		return;
	}
	throw new Error(`Commande inconnue : ${commande} (liste, install, supprimer).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main(process.argv.slice(2));
	} catch (err) {
		console.error(`[extension] ${err instanceof Error ? err.message : err}`);
		process.exit(1);
	}
}
