/**
 * Sauvegarde et restauration de ce qui appartient à l'association, façon
 * Grav : une archive ZIP de `src/content/` (contenu du site), de
 * `extensions/` (extensions installées, docs/extensions.md) et de
 * `<DATA_DIR>/accounts` + `<DATA_DIR>/journal` (comptes de l'Espace Admin,
 * journal). Le `.env` (secrets) n'y est jamais.
 *
 * Les archives sont rangées dans `<DATA_DIR>/sauvegardes/` (volume Docker
 * `./data`, conservé d'une version à l'autre). Chaque archive porte
 * `sauvegarde.json` (format, date, version du modèle, association, motif).
 *
 * Restaurer = remplacer : `src/content/`, `extensions/` (archives qui la
 * contiennent : manifeste `extensions: true`, depuis la 0.5.22, dossier
 * présent à la sauvegarde ; sinon on n'y touche pas), `accounts/` et `journal/` sont
 * mis dans l'état de l'archive (fichiers différents réécrits, fichiers en
 * trop supprimés ; les dossiers eux-mêmes restent : ce sont des volumes sous
 * Docker, et le serveur de dev ne perd pas sa surveillance). Une sauvegarde « avant-restauration » de
 * l'état courant est faite d'abord, et remise en place si l'écriture échoue.
 * Le site doit ensuite être reconstruit (redémarrage, ou publication depuis
 * l'Espace Admin).
 *
 * Utilisé par les commandes `./sauvegarde.sh` / `./restauration.sh` (ou
 * directement `node scripts/sauvegarde.mjs …`) et par le module
 * « Sauvegardes » de l'Espace Admin (`/api/admin/sauvegardes*`).
 *
 *   node scripts/sauvegarde.mjs creer [motif] [--garder N]   (N = archives de ce motif gardées)
 *   node scripts/sauvegarde.mjs liste
 *   node scripts/sauvegarde.mjs restaurer <nom.zip | chemin> [--oui]
 *
 * `SITE_ROOT` (dossier du projet, défaut : dossier courant) et `DATA_DIR`
 * (défaut : `<projet>/data`), comme le serveur.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { dossierModele } from './contenu-initial.mjs';
import { EXTENSION_ID } from './extension.mjs';

export const FORMAT = 'numerik-sauvegarde';
/** Nom d'une archive : minuscules, chiffres, tirets, `.zip`. */
export const NOM_SAUVEGARDE = /^[a-z0-9][a-z0-9-]{0,99}\.zip$/;
/** Taille maximale d'une archive déposée ou restaurée. */
export const TAILLE_MAX = 500 * 1024 * 1024;
const MANIFESTE = 'sauvegarde.json';
/** Sous-dossiers de DATA_DIR sauvegardés (pas `publication/`, ni les sauvegardes elles-mêmes). */
const DONNEES = ['accounts', 'journal'];
/**
 * `extensions/` : fichiers du modèle (README) jamais sauvegardés ni touchés ;
 * dossiers cachés (`.ancienne-…`, `.supprimee-…`, `.installation-…` de
 * `scripts/extension.mjs`) ignorés.
 */
const EXTENSIONS = 'extensions';
const FICHIERS_DU_MODELE_EXTENSIONS = new Set(['README.md']);
/** Fichiers déjà compressés : stockés tels quels (plus rapide, même taille). */
const DEJA_COMPRESSE = /\.(jpe?g|png|webp|gif|avif|woff2?|zip|gz|pdf|mp4|webm)$/i;

export function racineSite() {
	return resolve(process.env.SITE_ROOT || process.cwd());
}
export function dossierDonnees(root = racineSite()) {
	return resolve(process.env.DATA_DIR || process.env.AUTH_DATA_DIR || join(root, 'data'));
}
export function dossierSauvegardes(dataDir = dossierDonnees()) {
	return join(dataDir, 'sauvegardes');
}

// --- Lecture des fichiers ------------------------------------------------------

/**
 * Fichiers d'un dossier (récursif), chemins relatifs avec « / ».
 * `sansCaches` : sauter fichiers et dossiers dont le nom commence par « . ».
 */
function fichiersDe(dir, { sansCaches = false } = {}) {
	if (!existsSync(dir)) return [];
	const out = [];
	const walk = (d) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const full = join(d, entry.name);
			if (sansCaches && entry.name.startsWith('.')) continue;
			if (entry.isDirectory()) {
				if (entry.name === '.tmp-publication') continue;
				walk(full);
			} else if (entry.isFile()) out.push(relative(dir, full).split(sep).join('/'));
		}
	};
	walk(dir);
	return out.sort();
}

function lireNomAsso(root) {
	try {
		const m = readFileSync(join(root, 'src', 'content', 'association.yaml'), 'utf8').match(/^name:\s*['"]?(.*?)['"]?\s*$/m);
		return m ? m[1] : '';
	} catch {
		return '';
	}
}

function lireVersion(root) {
	try {
		return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? '';
	} catch {
		return '';
	}
}

const pad = (n) => String(n).padStart(2, '0');
function horodatage(d = new Date()) {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}h${pad(d.getMinutes())}`;
}
const slug = (texte, max) =>
	String(texte ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, max)
		.replace(/-+$/, '');
const motifPropre = (motif) => slug(motif, 40);

/**
 * Fichiers de `src/content/` fournis par le modèle (guide de l'éditeur) :
 * jamais sauvegardés, jamais remplacés ni effacés par une restauration
 * (une archive ancienne ramènerait une version périmée).
 */
const FICHIERS_DU_MODELE = new Set(['README.md']);

// --- Création -----------------------------------------------------------------

/** Fichiers sauvegardés de l'état courant : chemin dans l'archive → octets. */
function etatCourant(root, dataDir) {
	const content = join(root, 'src', 'content');
	if (!existsSync(join(content, 'association.yaml'))) throw new Error('src/content/association.yaml introuvable : rien à sauvegarder.');
	const files = {};
	const ajouter = (base, prefix) => {
		for (const rel of fichiersDe(base)) {
			if (prefix === 'src/content' && FICHIERS_DU_MODELE.has(rel)) continue;
			files[`${prefix}/${rel}`] = readFileSync(join(base, rel));
		}
	};
	ajouter(content, 'src/content');
	for (const rel of fichiersDe(join(root, EXTENSIONS), { sansCaches: true })) {
		if (!FICHIERS_DU_MODELE_EXTENSIONS.has(rel)) files[`${EXTENSIONS}/${rel}`] = readFileSync(join(root, EXTENSIONS, rel));
	}
	for (const d of DONNEES) ajouter(join(dataDir, d), `data/${d}`);
	return files;
}

/**
 * Empreinte d'un ensemble de fichiers (chemins + contenus) : deux états
 * identiques ont la même, quel que soit l'ordre ou la compression.
 * `prefixe` : ne compter que les fichiers sous ce chemin.
 */
function empreinte(files, prefixe = '') {
	const h = createHash('sha256');
	for (const name of Object.keys(files).filter((n) => n.startsWith(prefixe)).sort()) {
		h.update(name.slice(prefixe.length)).update('\0').update(createHash('sha256').update(files[name]).digest()).update('\0');
	}
	return h.digest('hex');
}

/** Le contenu est-il encore le contenu de démonstration (`src/modeles/association/`, site neuf) ? */
function estContenuDeDemo(root, files) {
	const demo = dossierModele(root, 'association');
	if (!existsSync(demo)) return false;
	const fichiersDemo = {};
	for (const rel of fichiersDe(demo)) if (!FICHIERS_DU_MODELE.has(rel)) fichiersDemo[rel] = readFileSync(join(demo, rel));
	return empreinte(fichiersDemo) === empreinte(files, 'src/content/');
}

/** Archive (octets) d'un état ; `manifeste` complété (date, version, association, empreinte…). */
function archiver(root, files, { motif = '', par = '' } = {}) {
	const nbFichiers = Object.keys(files).length;
	const manifeste = {
		format: FORMAT,
		version: 1,
		creeLe: new Date().toISOString(),
		modele: lireVersion(root),
		association: lireNomAsso(root),
		motif: String(motif ?? ''),
		par: String(par ?? ''),
		fichiers: nbFichiers,
		// Dossier présent (sous Docker : volume monté) : l'archive dit l'état
		// des extensions, la restauration le remettra. Sinon (ancien
		// docker-compose sans le volume), elle n'y touchera pas.
		extensions: existsSync(join(root, EXTENSIONS)),
		empreinte: empreinte(files),
	};
	const entrees = { [MANIFESTE]: strToU8(JSON.stringify(manifeste, null, 2)) };
	for (const [name, data] of Object.entries(files)) entrees[name] = [data, { level: DEJA_COMPRESSE.test(name) ? 0 : 6 }];
	return { zip: zipSync(entrees), manifeste };
}

/** Range une archive dans `<DATA_DIR>/sauvegardes/` sous un nom horodaté. */
function ranger(dataDir, zip, motif) {
	const dossier = dossierSauvegardes(dataDir);
	mkdirSync(dossier, { recursive: true });
	const suffixe = motifPropre(motif);
	let nom = `sauvegarde-${horodatage()}${suffixe ? `-${suffixe}` : ''}.zip`;
	for (let n = 2; existsSync(join(dossier, nom)); n++) nom = nom.replace(/(-\d+)?\.zip$/, `-${n}.zip`);
	const chemin = join(dossier, nom);
	// Écrite puis renommée : jamais d'archive à moitié écrite dans la liste.
	writeFileSync(`${chemin}.partiel`, zip);
	renameSync(`${chemin}.partiel`, chemin);
	return { nom, chemin };
}

/**
 * Crée une archive dans `<DATA_DIR>/sauvegardes/`.
 * @returns {{ nom: string, chemin: string, taille: number, fichiers: number }}
 */
export function creerSauvegarde({ root = racineSite(), dataDir = dossierDonnees(root), motif = '', par = '' } = {}) {
	const files = etatCourant(root, dataDir);
	const { zip } = archiver(root, files, { motif, par });
	const { nom, chemin } = ranger(dataDir, zip, motif);
	return { nom, chemin, taille: zip.length, fichiers: Object.keys(files).length };
}

// --- Lecture / liste ----------------------------------------------------------

/** Manifeste d'une archive (lecture complète : quelques Mo). `null` = pas une sauvegarde du site. */
export function lireManifeste(zip) {
	try {
		const entries = unzipSync(zip, { filter: (f) => f.name === MANIFESTE });
		const m = entries[MANIFESTE] ? JSON.parse(strFromU8(entries[MANIFESTE])) : null;
		return m && m.format === FORMAT ? m : null;
	} catch {
		return null;
	}
}

/** Archives de `<DATA_DIR>/sauvegardes/`, la plus récente d'abord. */
export async function listerSauvegardes(dataDir = dossierDonnees()) {
	const dossier = dossierSauvegardes(dataDir);
	if (!existsSync(dossier)) return [];
	const noms = (await readdir(dossier)).filter((n) => NOM_SAUVEGARDE.test(n));
	const liste = await Promise.all(
		noms.map(async (nom) => {
			const chemin = join(dossier, nom);
			const s = await stat(chemin);
			const manifeste = lireManifeste(await readFile(chemin));
			return { nom, taille: s.size, date: manifeste?.creeLe ?? s.mtime.toISOString(), manifeste };
		}),
	);
	return liste.sort((a, b) => b.date.localeCompare(a.date));
}

export function cheminSauvegarde(nom, dataDir = dossierDonnees()) {
	if (!NOM_SAUVEGARDE.test(nom)) return null;
	const chemin = join(dossierSauvegardes(dataDir), nom);
	return existsSync(chemin) ? chemin : null;
}

/**
 * Garde les `garder` archives les plus récentes d'un motif (ex. sauvegardes
 * automatiques « avant mise à jour ») et supprime les plus anciennes.
 * @returns {string[]} noms supprimés
 */
export function elaguerSauvegardes(motif, garder, dataDir = dossierDonnees()) {
	const slug = motifPropre(motif);
	const dossier = dossierSauvegardes(dataDir);
	if (!slug || !existsSync(dossier)) return [];
	const meme = new RegExp(`^sauvegarde-\\d{4}-\\d{2}-\\d{2}-\\d{2}h\\d{2}-${slug}(-\\d+)?\\.zip$`);
	const date = (n) => statSync(join(dossier, n)).mtimeMs;
	const noms = readdirSync(dossier)
		.filter((n) => meme.test(n))
		.sort((a, b) => date(b) - date(a));
	const anciens = noms.slice(Math.max(0, garder));
	for (const nom of anciens) rmSync(join(dossier, nom), { force: true });
	return anciens;
}

export async function supprimerSauvegarde(nom, dataDir = dossierDonnees()) {
	const chemin = cheminSauvegarde(nom, dataDir);
	if (!chemin) return false;
	await rm(chemin);
	return true;
}

/**
 * Range une archive reçue (dépôt dans l'Espace Admin, fichier copié sur le
 * serveur) dans `<DATA_DIR>/sauvegardes/` après contrôle.
 * @returns {{ nom: string }}
 */
export async function deposerSauvegarde(zip, nomPropose, dataDir = dossierDonnees()) {
	verifierArchive(zip);
	const dossier = dossierSauvegardes(dataDir);
	await mkdir(dossier, { recursive: true });
	// Nom d'origine gardé en entier (avec son motif), dans la limite de NOM_SAUVEGARDE.
	const base = slug(String(nomPropose ?? '').replace(/\.zip$/i, ''), 90) || `sauvegarde-deposee-${horodatage()}`;
	let nom = `${base}.zip`;
	for (let n = 2; existsSync(join(dossier, nom)); n++) nom = `${base}-${n}.zip`;
	await writeFile(join(dossier, nom), zip);
	return { nom };
}

// --- Restauration -------------------------------------------------------------

/** Contrôle une archive ; rend ses fichiers (chemin → octets). */
export function verifierArchive(zip) {
	if (zip.length > TAILLE_MAX) throw new Error(`Archive trop volumineuse (${Math.round(TAILLE_MAX / 1024 / 1024)} Mo max).`);
	let entries;
	try {
		entries = unzipSync(zip);
	} catch {
		throw new Error("Ce fichier n'est pas une archive ZIP lisible.");
	}
	const manifeste = entries[MANIFESTE] ? (() => {
		try {
			return JSON.parse(strFromU8(entries[MANIFESTE]));
		} catch {
			return null;
		}
	})() : null;
	if (!manifeste || manifeste.format !== FORMAT) throw new Error("Ce fichier n'est pas une sauvegarde du site (sauvegarde.json absent).");
	if (!entries['src/content/association.yaml']) throw new Error('Sauvegarde incomplète : src/content/association.yaml absent.');
	const autorises = ['src/content/', `${EXTENSIONS}/`, ...DONNEES.map((d) => `data/${d}/`)];
	const fichiers = {};
	for (const [name, data] of Object.entries(entries)) {
		if (name === MANIFESTE || name.endsWith('/')) continue;
		const parts = name.split('/');
		if (name.startsWith('/') || name.includes('\\') || parts.some((p) => p === '..' || p === '' || p === '.')) {
			throw new Error(`Chemin refusé dans l'archive : ${name}`);
		}
		if (!autorises.some((a) => name.startsWith(a))) throw new Error(`Fichier inattendu dans l'archive : ${name}`);
		if (name.startsWith('src/content/') && FICHIERS_DU_MODELE.has(name.slice('src/content/'.length))) continue;
		if (name.startsWith(`${EXTENSIONS}/`)) {
			const rel = name.slice(EXTENSIONS.length + 1);
			if (FICHIERS_DU_MODELE_EXTENSIONS.has(rel)) continue;
			if (!manifeste.extensions) throw new Error(`Fichier inattendu dans l'archive : ${name}`);
			if (!EXTENSION_ID.test(parts[1]) || parts.length < 3 || parts.some((p) => p.startsWith('.'))) {
				throw new Error(`Fichier d'extension refusé dans l'archive : ${name}`);
			}
		}
		fichiers[name] = data;
	}
	return { manifeste, fichiers };
}

/**
 * Met un dossier dans l'état de l'archive **sans le vider** : seuls les
 * fichiers différents sont réécrits, ceux en trop supprimés, puis les
 * dossiers devenus vides. Le dossier lui-même reste (point de montage
 * Docker) et un serveur de développement qui le surveille ne perd pas le fil
 * (vider puis recréer toute l'arborescence lui faisait manquer les
 * changements).
 * @param {string} dir dossier cible
 * @param {Map<string, Uint8Array>} voulus chemin relatif (« / ») → octets
 * @param {Set<string>} garder fichiers de premier niveau jamais touchés
 * @param {{ sansCaches?: boolean }} options `sansCaches` : fichiers et dossiers « .… » jamais touchés
 */
function synchroniserDossier(dir, voulus, garder = new Set(), { sansCaches = false } = {}) {
	mkdirSync(dir, { recursive: true });
	for (const [rel, data] of voulus) {
		const cible = join(dir, rel);
		if (existsSync(cible)) {
			if (statSync(cible).isDirectory()) rmSync(cible, { recursive: true, force: true });
			else if (Buffer.from(data).equals(readFileSync(cible))) continue;
		}
		mkdirSync(dirname(cible), { recursive: true });
		writeFileSync(cible, data);
	}
	for (const rel of fichiersDe(dir, { sansCaches })) {
		if (!voulus.has(rel) && !garder.has(rel)) rmSync(join(dir, rel), { force: true });
	}
	const elaguer = (d) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			if (!entry.isDirectory() || (sansCaches && entry.name.startsWith('.'))) continue;
			const full = join(d, entry.name);
			elaguer(full);
			if (!readdirSync(full).length) rmSync(full, { recursive: true, force: true });
		}
	};
	elaguer(dir);
}

/**
 * Écrit un état (chemin dans l'archive → octets). `avecExtensions` : met
 * aussi `extensions/` dans cet état (sinon le laisse tel quel : archive
 * d'avant la 0.5.22).
 */
function ecrire(root, dataDir, fichiers, avecExtensions) {
	const cibles = [
		{ prefixe: 'src/content/', dir: join(root, 'src', 'content'), garder: FICHIERS_DU_MODELE },
		...(avecExtensions ? [{ prefixe: `${EXTENSIONS}/`, dir: join(root, EXTENSIONS), garder: FICHIERS_DU_MODELE_EXTENSIONS, sansCaches: true }] : []),
		...DONNEES.map((d) => ({ prefixe: `data/${d}/`, dir: join(dataDir, d), garder: new Set() })),
	];
	for (const { prefixe, dir, garder, sansCaches } of cibles) {
		const voulus = new Map();
		for (const [name, data] of Object.entries(fichiers)) if (name.startsWith(prefixe)) voulus.set(name.slice(prefixe.length), data);
		synchroniserDossier(dir, voulus, garder, { sansCaches });
	}
}

/**
 * Sauvegarde de sécurité avant une restauration, rangée seulement si utile :
 * pas quand l'état courant est déjà dans une archive du dossier (même
 * empreinte), ni quand c'est le contenu de démonstration d'un site neuf
 * (migration). L'état précédent reste toujours en mémoire pour le retour
 * arrière.
 * @returns {{ etat: Record<string, Uint8Array>, nom: string | null, deja: string | null, demo: boolean }}
 */
function securiser(root, dataDir, par) {
	const etat = etatCourant(root, dataDir);
	if (estContenuDeDemo(root, etat)) return { etat, nom: null, deja: null, demo: true };
	const cible = empreinte(etat);
	const dossier = dossierSauvegardes(dataDir);
	if (existsSync(dossier)) {
		for (const nom of readdirSync(dossier).filter((n) => NOM_SAUVEGARDE.test(n))) {
			if (lireManifeste(readFileSync(join(dossier, nom)))?.empreinte === cible) return { etat, nom: null, deja: nom, demo: false };
		}
	}
	const { zip } = archiver(root, etat, { motif: 'avant-restauration', par });
	return { etat, nom: ranger(dataDir, zip, 'avant-restauration').nom, deja: null, demo: false };
}

/**
 * Restaure une archive (octets) : sauvegarde de sécurité de l'état courant
 * si utile (`securiser`), puis remplacement. Échec d'écriture = état
 * courant remis.
 * @returns {{ manifeste: object, fichiers: number, securite: string | null, securiteExistante: string | null, demo: boolean, precedent: Record<string, Uint8Array> }}
 *   `securite` : archive « avant-restauration » créée ; `securiteExistante` :
 *   archive identique déjà présente ; `demo` : contenu de démonstration
 *   remplacé ; `precedent` : état d'avant, pour `annulerRestauration`.
 */
export function restaurerSauvegarde(zip, { root = racineSite(), dataDir = dossierDonnees(root), par = '' } = {}) {
	const { manifeste, fichiers } = verifierArchive(zip);
	const securite = securiser(root, dataDir, par);
	try {
		ecrire(root, dataDir, fichiers, Boolean(manifeste.extensions));
	} catch (err) {
		ecrire(root, dataDir, securite.etat, true);
		throw new Error(`Restauration impossible (${err.message}) : l'état précédent a été remis.`);
	}
	return {
		manifeste,
		fichiers: Object.keys(fichiers).length,
		securite: securite.nom,
		securiteExistante: securite.deja,
		demo: securite.demo,
		precedent: securite.etat,
	};
}

/** Phrase décrivant où est gardé l'état d'avant une restauration. */
export function etatPrecedentGarde(r) {
	if (r.securite) return `état précédent : ${r.securite}`;
	if (r.securiteExistante) return `état précédent déjà sauvegardé : ${r.securiteExistante}`;
	return 'contenu de démonstration remplacé (pas de sauvegarde de sécurité)';
}

/** Remet l'état d'avant une restauration (publication en échec) : `precedent` d'un résultat de `restaurerSauvegarde`. */
export function annulerRestauration(precedent, { root = racineSite(), dataDir = dossierDonnees(root) } = {}) {
	ecrire(root, dataDir, precedent, true);
}

// --- Ligne de commande --------------------------------------------------------

const taille = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

async function main(args) {
	const [commande, ...reste] = args;
	const root = racineSite();
	const dataDir = dossierDonnees(root);
	if (commande === 'creer') {
		const i = reste.indexOf('--garder');
		const garder = i >= 0 ? Number(reste.splice(i, 2)[1]) : NaN;
		const motif = reste.join(' ');
		if (!existsSync(join(root, 'src', 'content', 'association.yaml'))) {
			console.log('Rien à sauvegarder : src/content/ est vide (site jamais démarré).');
			return;
		}
		const r = creerSauvegarde({ root, dataDir, motif, par: 'ligne de commande' });
		console.log(`✓ Sauvegarde créée : ${r.nom} (${r.fichiers} fichiers, ${taille(r.taille)})`);
		console.log(`  ${r.chemin}`);
		if (Number.isInteger(garder) && garder > 0) {
			for (const nom of elaguerSauvegardes(motif, garder, dataDir)) console.log(`  ancienne sauvegarde « ${motif} » supprimée : ${nom}`);
		}
		return;
	}
	if (commande === 'liste') {
		const liste = await listerSauvegardes(dataDir);
		if (!liste.length) console.log(`Aucune sauvegarde dans ${dossierSauvegardes(dataDir)}.`);
		for (const s of liste) {
			const m = s.manifeste;
			console.log(`${s.nom}  ${taille(s.taille)}  ${m ? `${m.association} · modèle ${m.modele}${m.motif ? ` · ${m.motif}` : ''}` : '(pas une sauvegarde du site)'}`);
		}
		return;
	}
	if (commande === 'restaurer') {
		const oui = reste.includes('--oui');
		const cible = reste.find((a) => a !== '--oui');
		if (!cible) throw new Error('Indiquez la sauvegarde : node scripts/sauvegarde.mjs restaurer <nom.zip | chemin>');
		const chemin = cheminSauvegarde(cible, dataDir) ?? (existsSync(cible) ? resolve(cible) : null);
		if (!chemin) throw new Error(`Sauvegarde introuvable : ${cible} (voir « liste »).`);
		const zip = readFileSync(chemin);
		const { manifeste, fichiers } = verifierArchive(zip);
		console.log(`Sauvegarde : ${basename(chemin)}`);
		console.log(`  association « ${manifeste.association} », créée le ${manifeste.creeLe}, modèle ${manifeste.modele}, ${Object.keys(fichiers).length} fichiers`);
		console.log(`  ⚠️  Remplace TOUT src/content/${manifeste.extensions ? ', les extensions installées' : ''} et les comptes + journal de l’Espace Admin.`);
		if (!oui) {
			const rl = createInterface({ input: process.stdin, output: process.stdout });
			const reponse = await rl.question('  Taper « oui » pour restaurer : ');
			rl.close();
			if (reponse.trim().toLowerCase() !== 'oui') {
				console.log('Abandon : rien n’a été modifié.');
				process.exitCode = 3; // ./restauration.sh : pas de redémarrage
				return;
			}
		}
		const r = restaurerSauvegarde(zip, { root, dataDir, par: 'ligne de commande' });
		console.log(`✓ Restauration faite (${r.fichiers} fichiers) — ${etatPrecedentGarde(r)}.`);
		console.log('  Redémarrez le site pour le reconstruire avec ce contenu.');
		return;
	}
	console.log('Usage : node scripts/sauvegarde.mjs creer [motif] | liste | restaurer <nom.zip | chemin> [--oui]');
	process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2)).catch((err) => {
		console.error(`✗ ${err.message}`);
		process.exit(1);
	});
}
