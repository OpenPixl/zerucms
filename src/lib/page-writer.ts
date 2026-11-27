/**
 * Écriture des pages de contenu et des menus déroulants dans les sources
 * (`src/content/pages/`) depuis le module « Pages » de l'Espace Admin.
 * La publication (reconstruction du site) est faite par `site-build.ts`.
 *
 * Structure gérée (cf. `src/lib/content-pages.ts`) :
 *   <slug>/index.md                  page à la racine (lien direct du menu de navigation si `menu.show`)
 *   <dossier>/_group.md              menu déroulant : libellé + ordre, sans contenu
 *   <dossier>/<slug>/index.md        page du menu déroulant
 *   espace-benevoles/<slug>/index.md page réservée (`access:`), jamais dans le menu de navigation
 *   _pages-site.md                   réglages des pages du site : activation, lien, textes (cf. `site-pages.ts`)
 *
 * Tout est vérifié AVANT d'écrire, avec les règles du schéma de la collection
 * (`src/content.config.ts`, catalogue `src/lib/blocs.ts`) : une page qui
 * ferait échouer le build est refusée avec un message clair.
 *
 * Chaque modification se fait dans une « transaction » : copie de sauvegarde
 * de tout `src/content/pages/` (quelques fichiers), modification, puis
 * `restore` (reconstruction en échec) ou `purge` (nouvelle version en ligne).
 * Une page déplacée change d'URL ; les pages `.mdx` (code) ne sont jamais
 * modifiées ici.
 *
 * Code serveur uniquement.
 */

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { isAuthGroup, type AuthGroup } from './auth/groups';
import { type Bloc } from './blocs';
import { BLOC_PHOTO_ERREUR, BlocPhotoError, ecrireBlocPhotos, marqueursSansBloc, preparerBlocs, type PhotoAEcrire } from './bloc-writer';
import { RESERVED_FOLDER } from './content-pages';
import { adressesPluginsActifs } from './plugin-adresses';
import { contentTransaction, type Applied } from './content-transaction';
import { checkBody, COVER_ERROR, siteRoot, slugify, writeCover, type CoverChange } from './news-writer';
import { unknownPageVariables } from './page-variables';
import { DEFAULT_HOME, champ, homeModuleDef, sectionPhotos, validateHomeModules, type HomeModule } from './home-modules';
import { PIED_HISTORIQUES, piedDeLaPage } from './pied-pages';
import { SITE_PAGES, sitePagesState, type SitePageSettings, type SitePageState } from './site-pages';

export { type CoverChange };

/** Segment d'URL (page ou menu déroulant) : minuscules, chiffres, tirets. */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEGMENT_MAX = 60;
const BODY_MAX = 200 * 1024;

export type Placement = { kind: 'racine' } | { kind: 'dropdown'; dropdown: string } | { kind: 'reservee' };

export interface PageInput {
	placement: Placement;
	/** Dernier segment de l'URL ; déduit du titre s'il est vide. */
	slug: string;
	title: string;
	description: string;
	/** `classique` = page simple (texte + blocs) ; `enrichie` = page composée de sections. */
	type: 'classique' | 'enrichie';
	/** Sections d'une page enrichie (catalogue `src/lib/home-modules.ts`), dans l'ordre d'affichage. */
	sections: unknown[];
	/** Présence dans le menu de navigation (lien direct ou entrée d'un menu déroulant ; ignoré pour une page réservée). */
	menu: { show: boolean; order: number; label: string };
	/**
	 * Lien du bas du pied de page (mentions légales, CGV… ; pages à la racine
	 * seulement, cf. `src/lib/pied-pages.ts`). Position décidée par le serveur.
	 */
	pied: { show: boolean; order: number };
	/** Page réservée : groupes autorisés ; vide = toute personne connectée. */
	access: AuthGroup[];
	body: string;
	blocs: Record<string, unknown>;
	imageCredit: string;
	/**
	 * Photos des blocs fournies avec la page, sous la valeur du champ `photo`
	 * qui les cite (`nouvelle:<clé>`, nom de fichier) : `{ type, data (base64) }`
	 * (cf. `src/lib/bloc-writer.ts`).
	 */
	photos?: Record<string, unknown>;
}

export interface PageSource extends PageInput {
	/** Chemin complet (= URL sans `/`). */
	path: string;
	/** `cover:` actuel (`./cover.jpg`) ou `null`. */
	cover: string | null;
	/** Page `.mdx` écrite dans le code : lecture seule dans le module. */
	technique: boolean;
}

export interface DropdownSource {
	folder: string;
	label: string;
	order: number;
	/** Pages du menu déroulant (chemins). */
	pages: string[];
}

export function pagesSourceDir(): string {
	return join(siteRoot(), 'src', 'content', 'pages');
}

function readFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
	const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
	const match = clean.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
	let data: Record<string, unknown> = {};
	try {
		const parsed = match ? parseYaml(match[1]) : null;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
	} catch {
		// En-tête illisible : champs vides, la personne les corrige.
	}
	return { data, body: (match ? clean.slice(match[0].length) : clean).trim() };
}

const exists = (path: string) => stat(path).then(() => true, () => false);

/** Noms pris par les pages applicatives (`src/pages/`) et les fichiers publics (`public/`). */
async function baseRootNames(): Promise<Set<string>> {
	const names = new Set<string>([RESERVED_FOLDER, 'api', '_astro', '_image']);
	for (const dir of ['src/pages', 'public']) {
		try {
			for (const entry of await readdir(join(siteRoot(), dir))) {
				if (!entry.startsWith('[')) names.add(entry.replace(/\.[a-z]+$/i, ''));
			}
		} catch {
			// dossier absent
		}
	}
	return names;
}

/** Noms interdits à la racine : ceux de `baseRootNames()` et le premier segment de l'adresse des plugins actifs. */
async function takenRootNames(): Promise<Set<string>> {
	const names = await baseRootNames();
	for (const { adresse } of await adressesPluginsActifs()) names.add(adresse.split('/')[1]);
	return names;
}

/**
 * Adresse (`/segment/…`) déjà prise par le site : page applicative, fichier
 * public, page de contenu, menu déroulant. Pour l'adresse d'une page de
 * plugin (module « Plugins ») ; les autres plugins actifs sont contrôlés par
 * l'appelant.
 */
export async function adresseOccupee(adresse: string): Promise<boolean> {
	const [premier] = adresse.slice(1).split('/');
	if ((await baseRootNames()).has(premier)) return true;
	const { dropdowns, pages } = await listPagesSource();
	return dropdowns.some((d) => d.folder === premier) || pages.some((p) => p.path === premier || `/${p.path}` === adresse);
}

// --- Lecture ---------------------------------------------------------------

async function readPageAt(path: string): Promise<PageSource | null> {
	const dir = join(pagesSourceDir(), path);
	let file = 'index.md';
	let text: string;
	try {
		text = await readFile(join(dir, file), 'utf8');
	} catch {
		try {
			file = 'index.mdx';
			text = await readFile(join(dir, file), 'utf8');
		} catch {
			return null;
		}
	}
	const { data, body } = readFrontmatter(text);
	const segments = path.split('/');
	const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
	const menu = data.menu && typeof data.menu === 'object' ? (data.menu as Record<string, unknown>) : null;
	const access = data.access;
	const placement: Placement =
		segments[0] === RESERVED_FOLDER
			? { kind: 'reservee' }
			: segments.length > 1
				? { kind: 'dropdown', dropdown: segments[0] }
				: { kind: 'racine' };
	return {
		path,
		placement,
		slug: segments[segments.length - 1],
		title: str(data.title),
		description: str(data.description),
		// Ancienne page « enrichie » sans `sections:` (blocs seulement) : page simple.
		type: data.type === 'enrichie' && Array.isArray(data.sections) ? 'enrichie' : 'classique',
		sections: Array.isArray(data.sections) ? data.sections : [],
		menu: {
			show: menu?.show === true,
			order: typeof menu?.order === 'number' ? menu.order : 99,
			label: str(menu?.label),
		},
		pied: placement.kind === 'reservee' ? { show: false, order: 99 } : piedDeLaPage(path, data.pied, menu?.show === true),
		access: (Array.isArray(access) ? access : typeof access === 'string' ? [access] : []).filter(isAuthGroup),
		body,
		blocs: data.blocs && typeof data.blocs === 'object' && !Array.isArray(data.blocs) ? (data.blocs as Record<string, unknown>) : {},
		imageCredit: str(data.imageCredit),
		cover: typeof data.cover === 'string' && /^\.\/[\w.-]+$/.test(data.cover) ? data.cover : null,
		technique: file === 'index.mdx',
	};
}

/** Page telle qu'elle est dans les sources, par son chemin (`association/mission`). */
export async function readPageSource(path: string): Promise<PageSource | null> {
	const segments = path.split('/');
	if (segments.length > 2 || !segments.every((s) => SEGMENT.test(s))) return null;
	return readPageAt(path);
}

const SITE_PAGES_FILE = '_pages-site.md';

/**
 * Écrit `_pages-site.md`. Le fichier est gardé même sans réglage (`pages: {}`) :
 * une collection `sitePages` vide ferait avertir Astro à chaque requête.
 */
async function writeSitePages(root: string, pages: Record<string, SitePageSettings>): Promise<void> {
	await writeFile(join(root, SITE_PAGES_FILE), serialize({ pages }, '').trimEnd() + '\n', 'utf8');
}

/** Réglages enregistrés des pages du site (`pages:` de `_pages-site.md`). */
async function readSitePagesSettings(): Promise<Record<string, SitePageSettings>> {
	try {
		const { data } = readFrontmatter(await readFile(join(pagesSourceDir(), SITE_PAGES_FILE), 'utf8'));
		return data.pages && typeof data.pages === 'object' ? (data.pages as Record<string, SitePageSettings>) : {};
	} catch {
		return {};
	}
}

/**
 * Arborescence des sources : pages du site (bibliothèque), menus
 * déroulants (avec leurs pages), pages à la racine, pages réservées.
 */
export async function listPagesSource(): Promise<{ sitePages: SitePageState[]; dropdowns: DropdownSource[]; pages: PageSource[] }> {
	const root = pagesSourceDir();
	const pages: PageSource[] = [];
	const dropdowns: DropdownSource[] = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (!entry.isDirectory() || !SEGMENT.test(entry.name)) continue;
		const own = await readPageAt(entry.name);
		if (own) {
			pages.push(own);
			continue;
		}
		const children: PageSource[] = [];
		for (const child of await readdir(join(root, entry.name), { withFileTypes: true })) {
			if (!child.isDirectory() || !SEGMENT.test(child.name)) continue;
			const page = await readPageAt(`${entry.name}/${child.name}`);
			if (page) children.push(page);
		}
		pages.push(...children);
		if (entry.name === RESERVED_FOLDER) continue;
		let label = entry.name;
		let order = 50;
		try {
			const { data } = readFrontmatter(await readFile(join(root, entry.name, '_group.md'), 'utf8'));
			if (typeof data.label === 'string') label = data.label;
			if (typeof data.order === 'number') order = data.order;
		} catch {
			// pas de _group.md : valeurs déduites du dossier
		}
		dropdowns.push({ folder: entry.name, label, order, pages: children.map((p) => p.path) });
	}
	dropdowns.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'fr'));
	pages.sort((a, b) => a.menu.order - b.menu.order || a.title.localeCompare(b.title, 'fr'));
	return { sitePages: sitePagesState(await readSitePagesSettings()), dropdowns, pages };
}

// --- Validation ------------------------------------------------------------

function targetPath(placement: Placement, slug: string): string {
	if (placement.kind === 'racine') return slug;
	if (placement.kind === 'reservee') return `${RESERVED_FOLDER}/${slug}`;
	return `${placement.dropdown}/${slug}`;
}

interface NormalizedPage {
	path: string;
	frontmatter: Record<string, unknown>;
	body: string;
	/** Photos de blocs à écrire dans le dossier de la page (`src/lib/bloc-writer.ts`). */
	photos: PhotoAEcrire[];
}

async function normalizePage(input: PageInput, currentPath: string | null): Promise<{ page?: NormalizedPage; errors: string[] }> {
	const errors: string[] = [];
	const title = input.title.trim();
	if (!title) errors.push('Le titre est obligatoire.');
	const slug = (input.slug.trim() || slugify(title)).slice(0, SEGMENT_MAX);
	if (!SEGMENT.test(slug)) errors.push("L'adresse de la page ne peut contenir que des minuscules, des chiffres et des tirets.");

	const { dropdowns, pages } = await listPagesSource();
	const placement = input.placement;
	if (placement.kind === 'dropdown' && !dropdowns.some((d) => d.folder === placement.dropdown)) errors.push('Menu déroulant introuvable.');
	const path = targetPath(placement, slug);
	if (path !== currentPath) {
		if (pages.some((p) => p.path === path) || (await exists(join(pagesSourceDir(), path)))) {
			errors.push(`L'adresse /${path} est déjà prise.`);
		} else if (placement.kind === 'racine' && ((await takenRootNames()).has(slug) || dropdowns.some((d) => d.folder === slug))) {
			errors.push(`L'adresse /${slug} est déjà utilisée par le site ou par un menu déroulant.`);
		}
	}

	const body = input.body.replace(/\r\n?/g, '\n').trim();
	const enrichie = input.type === 'enrichie';
	// Page enrichie sans section « Contenu de la page » : pas de texte exigé.
	const texteAffiche = !enrichie || (input.sections ?? []).some((m) => (m as { type?: unknown })?.type === 'contenu');
	if (!body && texteAffiche) errors.push('Le texte de la page est vide.');
	if (Buffer.byteLength(body) > BODY_MAX) errors.push('Le texte est trop long (200 Ko max).');
	errors.push(...checkBody(body));
	const unknownVars = unknownPageVariables(body);
	if (unknownVars.length) errors.push(`Variable(s) inconnue(s) : ${unknownVars.map((v) => `{{${v}}}`).join(', ')}.`);

	// Blocs : toute page (ils enrichissent le texte) ; sections : page enrichie. Photos des deux dans le dossier de la page.
	const prepares = await preparerBlocs(input.blocs ?? {}, input.photos ?? {}, currentPath ? join(pagesSourceDir(), currentPath) : null, {
		sections: enrichie ? (input.sections ?? []) : [],
	});
	const { blocs, photos } = prepares;
	errors.push(...prepares.errors);
	const manquants = marqueursSansBloc(body, input.blocs ?? {});
	if (manquants) errors.push(manquants);
	let sections: HomeModule[] = [];
	if (enrichie) {
		const checked = validateHomeModules(prepares.sections, { contexte: 'page' });
		errors.push(...checked.errors, ...verifierSections(checked.modules));
		sections = checked.modules;
		if (!sections.length) errors.push('Une page enrichie a au moins une section.');
	}

	const groups = [...new Set(input.access.filter(isAuthGroup))];
	const frontmatter: Record<string, unknown> = { title };
	if (input.description.trim()) frontmatter.description = input.description.trim();
	if (placement.kind !== 'reservee') {
		const order = await menuOrderFor(placement, currentPath, pages, dropdowns);
		const label = input.menu.label.trim();
		frontmatter.menu = { show: Boolean(input.menu.show), order, ...(label && label !== title ? { label } : {}) };
	}
	// Pied de page : pages à la racine. Une ancienne page affichée d'office
	// (`PIED_HISTORIQUES`) garde un `pied:` explicite, même retirée du pied.
	const auPied = placement.kind === 'racine' && Boolean(input.pied?.show);
	if (auPied || (placement.kind === 'racine' && (PIED_HISTORIQUES as readonly string[]).includes(path))) {
		frontmatter.pied = auPied ? { show: true, order: piedOrderFor(currentPath, pages) } : { show: false };
	}
	if (enrichie) frontmatter.type = 'enrichie';
	if (placement.kind === 'reservee' && groups.length) frontmatter.access = groups.length === 1 ? groups[0] : groups;
	if (input.imageCredit.trim()) frontmatter.imageCredit = input.imageCredit.trim();
	if (Object.keys(blocs).length) frontmatter.blocs = blocs;
	if (enrichie) frontmatter.sections = sections;

	return errors.length ? { errors } : { page: { path, frontmatter, body, photos }, errors };
}

/** Écart entre deux positions attribuées : laisse la place d'intercaler à la main. */
const ORDER_STEP = 10;

/**
 * Position d'une page dans son niveau du menu : inchangée si la page reste
 * au même niveau (racine ou même menu déroulant), sinon la dernière
 * (création, déplacement). La position saisie n'est pas prise en compte.
 */
async function menuOrderFor(
	placement: Placement,
	currentPath: string | null,
	pages: PageSource[],
	dropdowns: DropdownSource[],
): Promise<number> {
	const current = currentPath ? pages.find((p) => p.path === currentPath) : undefined;
	const sameLevel = (p: PageSource) =>
		p.placement.kind === placement.kind &&
		(placement.kind !== 'dropdown' || (p.placement.kind === 'dropdown' && p.placement.dropdown === placement.dropdown));
	if (current && sameLevel(current)) return current.menu.order;

	const others = pages.filter((p) => p.path !== currentPath && sameLevel(p)).map((p) => p.menu.order);
	if (placement.kind === 'racine') {
		const sitePages = sitePagesState(await readSitePagesSettings()).filter((p) => p.active);
		others.push(...sitePages.map((p) => p.order), ...dropdowns.map((d) => d.order));
	}
	return others.length ? Math.floor(Math.max(...others) / ORDER_STEP) * ORDER_STEP + ORDER_STEP : ORDER_STEP;
}

/** Position d'une page dans le pied : inchangée si elle y était déjà, sinon la dernière. */
function piedOrderFor(currentPath: string | null, pages: PageSource[]): number {
	const current = currentPath ? pages.find((p) => p.path === currentPath) : undefined;
	if (current && current.placement.kind === 'racine' && current.pied.show) return current.pied.order;
	const others = pages.filter((p) => p.path !== currentPath && p.placement.kind === 'racine' && p.pied.show).map((p) => p.pied.order);
	return others.length ? Math.floor(Math.max(...others) / ORDER_STEP) * ORDER_STEP + ORDER_STEP : ORDER_STEP;
}

function serialize(frontmatter: Record<string, unknown>, body: string): string {
	const yaml = stringifyYaml(frontmatter, { defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN', lineWidth: 0 });
	return `---\n${yaml}---\n\n${body}\n`;
}

// --- Transactions ----------------------------------------------------------

export type { Applied };

/** Transaction sur tout `src/content/pages/` (cf. `content-transaction.ts`). */
function transaction(mutate: (root: string) => Promise<void>): Promise<Applied> {
	return contentTransaction(pagesSourceDir(), 'pages', mutate);
}

// --- Pages -----------------------------------------------------------------

class CoverError extends Error {}

/** Dossier des pages réservées devenu vide (dernière page supprimée ou déplacée) : retiré. */
async function removeEmptyReservedFolder(root: string): Promise<void> {
	const dir = join(root, RESERVED_FOLDER);
	if ((await readdir(dir).catch(() => null))?.length === 0) await rm(dir, { recursive: true, force: true });
}

/**
 * Crée (`currentPath` null) ou modifie une page ; une page modifiée peut
 * changer d'emplacement ou d'adresse (son dossier est déplacé, photo comprise).
 */
export async function savePage(
	input: PageInput,
	currentPath: string | null,
	coverChange: CoverChange,
): Promise<{ path?: string; title?: string; applied?: Applied; errors: string[] }> {
	const current = currentPath ? await readPageSource(currentPath) : null;
	if (currentPath && !current) return { errors: ['Page introuvable dans les sources.'] };
	if (current?.technique) return { errors: ['Page technique (.mdx) : elle se modifie dans le code.'] };

	const { page, errors } = await normalizePage(input, currentPath);
	if (!page) return { errors };

	let applied: Applied;
	try {
		applied = await transaction(async (root) => {
			const dir = join(root, page.path);
			if (current && current.path !== page.path) {
				await mkdir(join(dir, '..'), { recursive: true });
				await rename(join(root, current.path), dir);
			}
			await mkdir(dir, { recursive: true });
			let cover = current?.cover ?? undefined;
			if (coverChange.action !== 'keep' && cover) await rm(join(dir, cover), { force: true });
			if (coverChange.action === 'remove') cover = undefined;
			if (coverChange.action === 'replace') {
				await writeCover(dir, coverChange.data).catch(() => {
					throw new CoverError();
				});
				cover = './cover.jpg';
			}
			// Photos des blocs : nouvelles écrites, celles qu'aucun bloc ne cite plus retirées.
			const sections = (page.frontmatter.sections ?? []) as HomeModule[];
			await ecrireBlocPhotos(dir, page.photos, (page.frontmatter.blocs ?? {}) as Record<string, Bloc>, sections.flatMap(sectionPhotos));
			// `cover` avant `imageCredit`, les blocs puis les sections : ordre de lecture habituel.
			const { blocs, sections: _sections, imageCredit, ...head } = page.frontmatter;
			const frontmatter = {
				...head,
				...(cover ? { cover } : {}),
				...(imageCredit ? { imageCredit } : {}),
				...(blocs ? { blocs } : {}),
				...(sections.length ? { sections } : {}),
			};
			await writeFile(join(dir, 'index.md'), serialize(frontmatter, page.body), 'utf8');
			await removeEmptyReservedFolder(root);
		});
	} catch (err) {
		if (err instanceof CoverError) return { errors: [COVER_ERROR] };
		if (err instanceof BlocPhotoError) return { errors: [BLOC_PHOTO_ERREUR] };
		throw err;
	}
	return { path: page.path, title: String(page.frontmatter.title), applied, errors: [] };
}

/** Supprime une page (dossier entier, photo comprise). */
export async function deletePage(path: string): Promise<{ title?: string; applied?: Applied; errors: string[] }> {
	const current = await readPageSource(path);
	if (!current) return { errors: ['Page introuvable dans les sources (déjà supprimée ?).'] };
	if (current.technique) return { errors: ['Page technique (.mdx) : elle se supprime dans le code.'] };
	const applied = await transaction(async (root) => {
		await rm(join(root, path), { recursive: true, force: true });
		await removeEmptyReservedFolder(root);
	});
	return { title: current.title || path, applied, errors: [] };
}

// --- Menus déroulants -------------------------------------------------------

export interface DropdownInput {
	/** Nom du dossier = début de l'adresse des pages du menu déroulant ; fixé à la création. */
	folder: string;
	label: string;
}

/**
 * Crée (`currentFolder` null) ou modifie un menu déroulant (libellé ; le
 * dossier ne change pas). Position : dernière à la création, inchangée
 * ensuite (flèches ↑/↓, `saveMenuOrder()`).
 */
export async function saveDropdown(
	input: DropdownInput,
	currentFolder: string | null,
): Promise<{ folder?: string; applied?: Applied; errors: string[] }> {
	const errors: string[] = [];
	const label = input.label.trim();
	if (!label) errors.push('Le libellé du menu déroulant est obligatoire.');
	const { dropdowns, pages } = await listPagesSource();
	const current = currentFolder ? dropdowns.find((d) => d.folder === currentFolder) : undefined;
	const order = current ? current.order : await menuOrderFor({ kind: 'racine' }, null, pages, dropdowns);
	let folder = currentFolder;
	if (currentFolder) {
		if (!current) errors.push('Menu déroulant introuvable.');
	} else {
		folder = (input.folder.trim() || slugify(label)).slice(0, SEGMENT_MAX);
		if (!SEGMENT.test(folder)) errors.push("L'adresse du menu déroulant ne peut contenir que des minuscules, des chiffres et des tirets.");
		else if (
			dropdowns.some((d) => d.folder === folder) ||
			pages.some((p) => p.path === folder) ||
			(await takenRootNames()).has(folder) ||
			(await exists(join(pagesSourceDir(), folder)))
		) {
			errors.push(`L'adresse /${folder} est déjà utilisée.`);
		}
	}
	if (errors.length) return { errors };
	const applied = await transaction(async (root) => {
		await mkdir(join(root, folder!), { recursive: true });
		await writeFile(join(root, folder!, '_group.md'), serialize({ label, order }, '').trimEnd() + '\n', 'utf8');
	});
	return { folder: folder!, applied, errors: [] };
}

/** Supprime un menu déroulant vide (ses pages doivent d'abord être déplacées ou supprimées). */
export async function deleteDropdown(folder: string): Promise<{ label?: string; applied?: Applied; errors: string[] }> {
	const dropdown = (await listPagesSource()).dropdowns.find((d) => d.folder === folder);
	if (!dropdown) return { errors: ['Menu déroulant introuvable.'] };
	if (dropdown.pages.length) return { errors: ['Ce menu déroulant contient encore des pages : déplacez-les ou supprimez-les d’abord.'] };
	const applied = await transaction((root) => rm(join(root, folder), { recursive: true, force: true }));
	return { label: dropdown.label, applied, errors: [] };
}

// --- Pages du site (bibliothèque) ---------------------------------------------

export interface SitePageInput {
	label: string;
	show: boolean;
	active: boolean;
	/** Textes par nom ; vide = texte par défaut. */
	textes: Record<string, string>;
	/** Page à modules (accueil) : nouvelle liste ; absent = modules actuels gardés. */
	modules?: unknown[];
	/** Photos des sections (`nouvelle:<clé>` → `{ type, data }`), rangées dans `src/content/pages/`. */
	photos?: Record<string, unknown>;
}

const SITE_TEXT_MAX = 2000;

/**
 * Contrôles des textes des sections (accueil, page enrichie), en plus de
 * `validateHomeModules` : longueur, variables `{{…}}` connues, liens des
 * champs Markdown — éléments répétés compris.
 */
function verifierSections(modules: HomeModule[]): string[] {
	const errors: string[] = [];
	const verifier = (label: string, field: { label: string; type: string }, value: string) => {
		if (value.length > SITE_TEXT_MAX) errors.push(`${label} : « ${field.label} » est trop long.`);
		const unknown = unknownPageVariables(value);
		if (unknown.length) errors.push(`${label} : variable(s) inconnue(s) ${unknown.map((v) => `{{${v}}}`).join(', ')}.`);
		if (field.type === 'markdown') errors.push(...checkBody(value).map((e) => `${label} : ${e}`));
	};
	for (const module of modules) {
		const def = homeModuleDef(module.type);
		for (const field of def.fields) verifier(def.label, field, champ(module, field.name));
		for (const item of module.items ?? []) {
			for (const field of def.items?.fields ?? []) verifier(def.label, field, item[field.name] ?? '');
		}
	}
	return errors;
}

/**
 * Règle une page du site : activation, libellé et visibilité de son lien,
 * textes (position : inchangée, cf. `saveMenuOrder()`). Seuls les écarts aux
 * valeurs par défaut de `site-pages.ts` sont enregistrés.
 */
export async function saveSitePage(id: string, input: SitePageInput): Promise<{ label?: string; applied?: Applied; errors: string[] }> {
	const def = SITE_PAGES.find((p) => p.id === id);
	const state = (await listPagesSource()).sitePages.find((p) => p.id === id);
	if (!def || !state) return { errors: ['Page du site introuvable.'] };
	const errors: string[] = [];
	const label = input.label.trim();
	if (!label) errors.push('Le libellé dans le menu est obligatoire.');
	if (!input.active && !def.canDisable) errors.push(`La page « ${def.label} » ne peut pas être désactivée.`);

	const textes: Record<string, string> = {};
	for (const section of def.sections) {
		for (const t of section.texts) {
			const value = (input.textes[t.name] ?? '').replace(/\r\n?/g, '\n').trim();
			if (!value || value === t.default) continue;
			if (value.length > SITE_TEXT_MAX) errors.push(`« ${t.label} » (${section.title}) est trop long.`);
			const unknown = unknownPageVariables(value);
			if (unknown.length) errors.push(`« ${t.label} » : variable(s) inconnue(s) ${unknown.map((v) => `{{${v}}}`).join(', ')}.`);
			textes[t.name] = value;
		}
	}

	const pages = await readSitePagesSettings();
	let modules: HomeModule[] | undefined;
	// Photos des sections de l'accueil : dossier `src/content/pages/` lui-même.
	let photos: PhotoAEcrire[] = [];
	let toucherPhotos = false;
	if (def.modules && input.modules !== undefined) {
		const prepares = await preparerBlocs({}, input.photos ?? {}, pagesSourceDir(), { sections: input.modules });
		photos = prepares.photos;
		toucherPhotos = true;
		errors.push(...prepares.errors);
		const checked = validateHomeModules(prepares.sections);
		errors.push(...checked.errors, ...verifierSections(checked.modules));
		// Identique à l'accueil d'origine : rien à enregistrer.
		modules = JSON.stringify(checked.modules) === JSON.stringify(DEFAULT_HOME) ? undefined : checked.modules;
	} else if (def.modules && Array.isArray(pages[id]?.modules)) {
		modules = pages[id]!.modules as HomeModule[];
	}
	if (errors.length) return { errors };

	const settings: SitePageSettings = {};
	if (!input.active) settings.active = false;
	if (label !== def.label) settings.label = label;
	if (state.order !== def.order) settings.order = state.order;
	if (!input.show) settings.show = false;
	if (Object.keys(textes).length) settings.textes = textes;
	if (modules) settings.modules = modules;
	if (Object.keys(settings).length) pages[id] = settings;
	else delete pages[id];

	let applied: Applied;
	try {
		applied = await transaction(async (root) => {
			await writeSitePages(root, pages);
			// Nouvelles photos écrites, celles qu'aucune section de l'accueil ne cite plus retirées.
			if (toucherPhotos) await ecrireBlocPhotos(root, photos, {}, (modules ?? DEFAULT_HOME).flatMap(sectionPhotos));
		});
	} catch (err) {
		if (err instanceof BlocPhotoError) return { errors: [BLOC_PHOTO_ERREUR] };
		throw err;
	}
	return { label, applied, errors: [] };
}

// --- Ordre du menu de navigation --------------------------------------------

/** Niveau réordonné : `racine` (premier niveau du menu), `dropdown:<dossier>` ou `pied` (liens du pied de page). */
export type MenuLevel = 'racine' | 'pied' | `dropdown:${string}`;

/**
 * Éléments d'un niveau du menu, par clé : `site:<id>` (page du site
 * active), `page:<chemin>`, `dropdown:<dossier>`. Premier niveau = pages du
 * site actives, pages à la racine affichées et menus déroulants ; menu déroulant =
 * toutes ses pages ; pied de page = ses liens (`pied:<chemin>`).
 */
function levelKeys(level: string, source: Awaited<ReturnType<typeof listPagesSource>>): string[] | null {
	if (level === 'pied') return source.pages.filter((p) => p.placement.kind === 'racine' && p.pied.show).map((p) => `pied:${p.path}`);
	if (level === 'racine') {
		return [
			...source.sitePages.filter((p) => p.active).map((p) => `site:${p.id}`),
			...source.pages.filter((p) => p.placement.kind === 'racine' && p.menu.show).map((p) => `page:${p.path}`),
			...source.dropdowns.map((d) => `dropdown:${d.folder}`),
		];
	}
	const folder = level.startsWith('dropdown:') ? level.slice('dropdown:'.length) : null;
	const dropdown = source.dropdowns.find((d) => d.folder === folder);
	return dropdown ? dropdown.pages.map((path) => `page:${path}`) : null;
}

/**
 * Nouvel ordre d'un ou plusieurs niveaux du menu (flèches ↑/↓ du module) :
 * positions renumérotées 0, 10, 20… dans l'ordre reçu, qui doit contenir
 * exactement les éléments du niveau. Seule la position est réécrite :
 * `menu.order` des pages, `order` des `_group.md`, position des pages du site
 * dans `_pages-site.md`. Une seule transaction, donc une seule publication.
 */
export async function saveMenuOrder(levels: Record<string, string[]>): Promise<{ applied?: Applied; errors: string[] }> {
	const source = await listPagesSource();
	const orders = new Map<string, number>();
	for (const [level, keys] of Object.entries(levels)) {
		const expected = levelKeys(level, source);
		if (!expected) return { errors: ['Menu introuvable : rechargez la liste.'] };
		const same = keys.length === expected.length && new Set(keys).size === keys.length && keys.every((k) => expected.includes(k));
		if (!same) return { errors: ['Le menu a changé entre-temps : rechargez la liste.'] };
		keys.forEach((key, index) => orders.set(key, index * ORDER_STEP));
	}
	if (!orders.size) return { errors: ['Aucun ordre à enregistrer.'] };

	const settings = await readSitePagesSettings();
	let sitePagesChanged = false;
	for (const page of source.sitePages) {
		const order = orders.get(`site:${page.id}`);
		if (order === undefined || order === page.order) continue;
		const { order: _previous, ...rest } = settings[page.id] ?? {};
		settings[page.id] = order === page.defaultOrder ? rest : { ...rest, order };
		if (!Object.keys(settings[page.id]).length) delete settings[page.id];
		sitePagesChanged = true;
	}

	const applied = await transaction(async (root) => {
		for (const page of source.pages) {
			const order = orders.get(`page:${page.path}`);
			const piedOrder = orders.get(`pied:${page.path}`);
			const menuChange = order !== undefined && order !== page.menu.order;
			if (!menuChange && piedOrder === undefined) continue;
			const file = join(root, page.path, page.technique ? 'index.mdx' : 'index.md');
			let { data, body } = readFrontmatter(await readFile(file, 'utf8'));
			// Ancienne page du pied sans `pied:` : réglage écrit au premier réordonnancement.
			const piedChange = piedOrder !== undefined && (piedOrder !== page.pied.order || !data.pied);
			if (!menuChange && !piedChange) continue;
			if (menuChange) {
				const menu = data.menu && typeof data.menu === 'object' ? (data.menu as Record<string, unknown>) : { show: true };
				data = { ...data, menu: { ...menu, order } };
			}
			if (piedChange) data = { ...data, pied: { show: true, order: piedOrder } };
			await writeFile(file, serialize(data, body), 'utf8');
		}
		for (const dropdown of source.dropdowns) {
			const order = orders.get(`dropdown:${dropdown.folder}`);
			if (order === undefined || order === dropdown.order) continue;
			const file = join(root, dropdown.folder, '_group.md');
			const { data } = await readFile(file, 'utf8').then(readFrontmatter, () => ({ data: {} as Record<string, unknown> }));
			await writeFile(file, serialize({ label: dropdown.label, ...data, order }, '').trimEnd() + '\n', 'utf8');
		}
		if (sitePagesChanged) await writeSitePages(root, settings);
	});
	return { applied, errors: [] };
}

// --- Corps JSON des routes -------------------------------------------------

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** `PageInput` depuis le corps JSON d'une route (types forcés ; la validation suit dans `savePage`). */
export function readPageInput(raw: unknown): PageInput {
	const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const placement = (data.placement && typeof data.placement === 'object' ? data.placement : {}) as Record<string, unknown>;
	const menu = (data.menu && typeof data.menu === 'object' ? data.menu : {}) as Record<string, unknown>;
	return {
		placement:
			placement.kind === 'dropdown'
				? { kind: 'dropdown', dropdown: text(placement.dropdown) }
				: placement.kind === 'reservee'
					? { kind: 'reservee' }
					: { kind: 'racine' },
		slug: text(data.slug),
		title: text(data.title),
		description: text(data.description),
		type: data.type === 'enrichie' ? 'enrichie' : 'classique',
		sections: Array.isArray(data.sections) ? data.sections : [],
		menu: { show: menu.show === true, order: Number(menu.order ?? 99), label: text(menu.label) },
		pied: { show: Boolean(data.pied && typeof data.pied === 'object' && (data.pied as Record<string, unknown>).show === true), order: 99 },
		access: Array.isArray(data.access) ? data.access.filter(isAuthGroup) : [],
		body: text(data.body),
		blocs: data.blocs && typeof data.blocs === 'object' && !Array.isArray(data.blocs) ? (data.blocs as Record<string, unknown>) : {},
		imageCredit: text(data.imageCredit),
		photos: data.photos && typeof data.photos === 'object' && !Array.isArray(data.photos) ? (data.photos as Record<string, unknown>) : {},
	};
}
