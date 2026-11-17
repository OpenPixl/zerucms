/**
 * Écriture des fiches d'activité dans les sources (`src/content/activites/
 * <slug>/index.md` + `cover.jpg`) depuis le module « Activités » de l'espace
 * bénévoles. La publication (reconstruction du site) est faite par
 * `site-build.ts`, via `admin-publish.ts`.
 *
 * Tout est vérifié AVANT d'écrire, avec les règles du schéma de la collection
 * `activites` (`src/content.config.ts`, catégories `src/lib/categories.ts`,
 * gérées par `category-writer.ts`) :
 * une fiche qui ferait échouer le build est refusée avec un message clair.
 * Le texte suit les règles des actualités (`checkBody`) ; son HTML est
 * nettoyé à l'affichage (`renderActivity()` → `sanitizeNewsHtml()`).
 *
 * Le frontmatter est modifié en place (`yaml` Document) : les commentaires
 * d'un fichier écrit à la main sont conservés. L'adresse (nom du dossier) est
 * fixée à la création ; l'URL publique `/activites/<catégorie>/<slug>` change
 * donc seulement si la catégorie change. Ordre dans une catégorie : `order`
 * (1, 2, 3…), une nouvelle fiche ou une fiche qui change de catégorie se
 * place en dernier ; les flèches ↑/↓ du module renumérotent
 * (`activityOrderChanges` + `writeActivityOrder`, via `saveCatalogOrder`).
 *
 * Chaque modification se fait dans une transaction sur tout
 * `src/content/activites/` (`content-transaction.ts`).
 *
 * Code serveur uniquement.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Document, parseDocument } from 'yaml';
import { TYPES_ACTIVITE_INSCRIPTION } from './grist-asso/choices';
import { categories } from './categories';
import { contentTransaction, type Applied } from './content-transaction';
import { checkBody, COVER_ERROR, siteRoot, slugify, writeCover, type CoverChange } from './news-writer';

export type { Applied, CoverChange };

/** Nom de dossier (= dernier segment de l'URL). `ordre` et `categories` sont pris par des routes du module. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 60;
const RESERVED_SLUGS = new Set(['ordre', 'categories']);
const BODY_MAX = 200 * 1024;
/** `cover:` acceptable : un fichier du dossier (`./cover.jpg`). */
const COVER_FIELD = /^\.\/[\w.-]+$/;

export interface ActivityInput {
	/** Création seulement (déduit du titre s'il est vide) ; ignoré en modification. */
	slug: string;
	title: string;
	excerpt: string;
	category: string;
	isPublish: boolean;
	level: string;
	/** Bouton « S'inscrire » affiché (`inscription: false` sinon). */
	inscription: boolean;
	/** Noms `Activite.Nom` dans Grist, un par entrée ; `*` final = préfixe. */
	activiteGrist: string[];
	/** `Activite.Type` dans Grist (cf. `TYPES_ACTIVITE_INSCRIPTION`), vide = aucun. */
	typeGrist: string;
	imageCredit: string;
	body: string;
}

export interface ActivitySource extends ActivityInput {
	slug: string;
	order: number;
	/** `cover:` actuel (`./cover.jpg`) ou `null`. */
	cover: string | null;
}

export function activitesSourceDir(): string {
	return join(siteRoot(), 'src', 'content', 'activites');
}

// --- Lecture ---------------------------------------------------------------

function splitFile(text: string): { yaml: string; body: string } {
	const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
	const match = clean.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
	return { yaml: match ? match[1] : '', body: (match ? clean.slice(match[0].length) : clean).trim() };
}

function toSource(slug: string, data: Record<string, unknown>, body: string): ActivitySource {
	const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
	const grist = data.activiteGrist;
	return {
		slug,
		title: str(data.title),
		excerpt: str(data.excerpt),
		category: str(data.category),
		isPublish: data.isPublish !== false,
		level: str(data.level),
		inscription: data.inscription !== false,
		activiteGrist: (Array.isArray(grist) ? grist : grist ? [grist] : []).map(String),
		typeGrist: str(data.typeGrist),
		imageCredit: str(data.imageCredit),
		body,
		order: typeof data.order === 'number' ? data.order : 999,
		cover: typeof data.cover === 'string' && COVER_FIELD.test(data.cover) ? data.cover : null,
	};
}

async function readSourceFile(slug: string): Promise<{ doc: Document; body: string } | null> {
	if (!SLUG.test(slug)) return null;
	let text: string;
	try {
		text = await readFile(join(activitesSourceDir(), slug, 'index.md'), 'utf8');
	} catch {
		return null;
	}
	const { yaml, body } = splitFile(text);
	return { doc: parseDocument(yaml), body };
}

function docData(doc: Document): Record<string, unknown> {
	try {
		const data = doc.toJS();
		return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
	} catch {
		// En-tête illisible : champs vides, la personne les corrige.
		return {};
	}
}

/** Fiche telle qu'elle est dans les sources (formulaire d'édition). Lecture tolérante. */
export async function readActivitySource(slug: string): Promise<ActivitySource | null> {
	const file = await readSourceFile(slug);
	return file ? toSource(slug, docData(file.doc), file.body) : null;
}

/** Toutes les fiches des sources, brouillons compris. */
export async function listActivitySources(): Promise<ActivitySource[]> {
	let names: string[];
	try {
		names = await readdir(activitesSourceDir());
	} catch {
		return [];
	}
	const sources = await Promise.all(names.filter((n) => SLUG.test(n)).map((n) => readActivitySource(n)));
	return sources
		.filter((s): s is ActivitySource => Boolean(s))
		.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

// --- Validation ------------------------------------------------------------

/** Contrôles du schéma ; renvoie les problèmes trouvés (vide = valide). */
function validate(input: ActivityInput): string[] {
	const errors: string[] = [];
	if (!input.title.trim()) errors.push('Le titre est obligatoire.');
	if (!input.excerpt.trim()) errors.push('Le résumé est obligatoire (affiché sur les cartes).');
	if (!categories.some((c) => c.slug === input.category)) errors.push('Choisissez une catégorie.');
	if (input.typeGrist && !(TYPES_ACTIVITE_INSCRIPTION as readonly string[]).includes(input.typeGrist)) {
		errors.push(`Type Grist inconnu (attendu : ${TYPES_ACTIVITE_INSCRIPTION.join(', ')}).`);
	}
	if (!input.body.trim()) errors.push('Le texte de la fiche est obligatoire.');
	else if (Buffer.byteLength(input.body) > BODY_MAX) errors.push('Le texte est trop long (200 Ko max).');
	else errors.push(...checkBody(input.body));
	return errors;
}

/** Champs du formulaire posés sur le frontmatter ; un champ facultatif vide est retiré. */
function applyFields(doc: Document, input: ActivityInput, extra: { order: number; cover: string | undefined }): void {
	const setOrDelete = (key: string, value: unknown) => {
		if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) doc.delete(key);
		else doc.set(key, value);
	};
	doc.set('title', input.title.trim());
	doc.set('isPublish', input.isPublish);
	doc.set('excerpt', input.excerpt.trim());
	doc.set('category', input.category);
	setOrDelete('level', input.level.trim());
	doc.set('order', extra.order);
	setOrDelete('inscription', input.inscription ? undefined : false);
	const grist = input.activiteGrist.map((n) => n.trim()).filter(Boolean);
	setOrDelete('activiteGrist', grist.length === 1 ? grist[0] : grist);
	setOrDelete('typeGrist', input.typeGrist);
	setOrDelete('cover', extra.cover);
	setOrDelete('imageCredit', input.imageCredit.trim());
}

function newDocument(): Document {
	return new Document({});
}

function serialize(doc: Document, body: string): string {
	const yaml = doc.toString({ defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN', lineWidth: 0 });
	return `---\n${yaml}---\n\n${body.trim()}\n`;
}

/** Ordre « en dernier » dans une catégorie. */
async function nextOrder(category: string, except?: string): Promise<number> {
	const orders = (await listActivitySources()).filter((s) => s.category === category && s.slug !== except).map((s) => s.order);
	return orders.length ? Math.max(...orders.filter((o) => o < 999), 0) + 1 : 1;
}

class CoverError extends Error {}

async function applyCover(dir: string, current: string | null, change: CoverChange): Promise<string | undefined> {
	let cover = current ?? undefined;
	if (change.action !== 'keep' && cover) await rm(join(dir, cover), { force: true });
	if (change.action === 'remove') cover = undefined;
	if (change.action === 'replace') {
		await writeCover(dir, change.data).catch(() => {
			throw new CoverError();
		});
		cover = './cover.jpg';
	}
	return cover;
}

/** Transaction sur tout `src/content/activites/` (fiches et `_categories.yaml`). */
export function activitiesTransaction(mutate: (root: string) => Promise<void>): Promise<Applied> {
	return contentTransaction(activitesSourceDir(), 'activites', mutate);
}

// --- Écriture --------------------------------------------------------------

export type ActivityResult = { slug?: string; title?: string; href?: string; applied?: Applied; errors: string[] };

const hrefOf = (category: string, slug: string) => `/activites/${category}/${slug}`;

/** Crée (`currentSlug` null) ou modifie une fiche. */
export async function saveActivity(input: ActivityInput, currentSlug: string | null, coverChange: CoverChange): Promise<ActivityResult> {
	const errors = validate(input);
	const current = currentSlug ? await readSourceFile(currentSlug) : null;
	if (currentSlug && !current) return { errors: ['Activité introuvable dans les sources.'] };

	let slug = currentSlug ?? '';
	if (!currentSlug) {
		slug = (input.slug.trim() || slugify(input.title)).slice(0, SLUG_MAX).replace(/-+$/, '');
		if (!SLUG.test(slug)) errors.push('Adresse invalide : minuscules, chiffres et tirets seulement (ex. atelier-photo).');
		else if (RESERVED_SLUGS.has(slug)) errors.push(`L'adresse « ${slug} » est réservée : choisissez-en une autre.`);
		else if (await readSourceFile(slug)) errors.push(`Une activité utilise déjà l'adresse « ${slug} ».`);
	}
	if (errors.length) return { errors };

	const before = current ? toSource(slug, docData(current.doc), current.body) : null;
	// Nouvelle fiche ou changement de catégorie : en dernière position.
	const order = before && before.category === input.category ? before.order : await nextOrder(input.category, slug);

	let applied: Applied;
	try {
		applied = await activitiesTransaction(async (root) => {
			const dir = join(root, slug);
			await mkdir(dir, { recursive: true });
			const cover = await applyCover(dir, before?.cover ?? null, coverChange);
			const doc = current?.doc ?? newDocument();
			applyFields(doc, input, { order, cover });
			await writeFile(join(dir, 'index.md'), serialize(doc, input.body), 'utf8');
		});
	} catch (err) {
		if (err instanceof CoverError) return { errors: [COVER_ERROR] };
		throw err;
	}
	return { slug, title: input.title.trim(), href: hrefOf(input.category, slug), applied, errors: [] };
}

/** Supprime une fiche (dossier entier, photo comprise). */
export async function deleteActivity(slug: string): Promise<ActivityResult> {
	const current = await readActivitySource(slug);
	if (!current) return { errors: ['Activité introuvable dans les sources (déjà supprimée ?).'] };
	const applied = await activitiesTransaction((root) => rm(join(root, slug), { recursive: true, force: true }));
	return { slug, title: current.title || slug, applied, errors: [] };
}

export type OrderChange = { slug: string; order: number };

/**
 * Nouvel ordre des fiches d'une ou plusieurs catégories : `{ <catégorie>:
 * [slugs…] }`, chaque liste devant contenir exactement les fiches de la
 * catégorie. Rend les fiches à renuméroter (1, 2, 3…), seulement celles dont
 * le rang change ; l'écriture se fait par `writeActivityOrder()` dans une
 * transaction (`saveCatalogOrder()`, `category-writer.ts`).
 */
export async function activityOrderChanges(levels: Record<string, string[]>): Promise<{ changes: OrderChange[]; errors: string[] }> {
	const sources = await listActivitySources();
	const changes: OrderChange[] = [];
	for (const [category, slugs] of Object.entries(levels)) {
		const expected = sources.filter((s) => s.category === category).map((s) => s.slug);
		if (!categories.some((c) => c.slug === category)) return { changes: [], errors: [`Catégorie inconnue : ${category}.`] };
		if (slugs.length !== expected.length || new Set(slugs).size !== slugs.length || slugs.some((s) => !expected.includes(s))) {
			return { changes: [], errors: ['La liste a changé entre-temps : rechargez le module puis recommencez.'] };
		}
		slugs.forEach((slug, i) => {
			if (sources.find((s) => s.slug === slug)!.order !== i + 1) changes.push({ slug, order: i + 1 });
		});
	}
	return { changes, errors: [] };
}

/** Écrit les nouveaux rangs (`order:`) dans `root` (dossier de la transaction). */
export async function writeActivityOrder(root: string, changes: OrderChange[]): Promise<void> {
	for (const { slug, order } of changes) {
		const file = await readSourceFile(slug);
		if (!file) continue;
		file.doc.set('order', order);
		await writeFile(join(root, slug, 'index.md'), serialize(file.doc, file.body), 'utf8');
	}
}

/** Corps JSON du formulaire → `ActivityInput` (types forcés, rien n'est validé ici). */
export function readActivityInput(raw: unknown): ActivityInput {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const text = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
	return {
		slug: text('slug'),
		title: text('title'),
		excerpt: text('excerpt'),
		category: text('category'),
		isPublish: r.isPublish !== false,
		level: text('level'),
		inscription: r.inscription !== false,
		activiteGrist: Array.isArray(r.activiteGrist) ? r.activiteGrist.map(String) : [],
		typeGrist: text('typeGrist'),
		imageCredit: text('imageCredit'),
		body: text('body').replace(/\r\n?/g, '\n'),
	};
}
