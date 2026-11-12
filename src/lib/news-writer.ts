/**
 * Écriture d'une actualité dans les sources (`src/content/news/<AAAA-MM-JJ-slug>/`)
 * depuis le module « Actualités » de l'Espace Admin. La publication
 * elle-même (reconstruction du site) est faite par `site-build.ts`.
 *
 * Tout est vérifié AVANT d'écrire, avec les mêmes règles que le schéma de la
 * collection `news` (`src/content.config.ts`) : un fichier qui ferait échouer
 * le build est refusé avec un message clair, plutôt que de bloquer toutes les
 * publications suivantes.
 *
 * Sécurité : le fichier déposé est un `.md` (jamais de MDX, donc aucun code).
 * Le HTML y est AUTORISÉ (tableaux, encadrés…) : il est nettoyé à l'affichage
 * par `src/lib/sanitize-news.ts` (code exécutable retiré). Ici, on refuse
 * seulement ce qui ferait échouer le build ou ce qu'on peut signaler
 * clairement : liens Markdown non `http(s)`/`mailto:`/`tel:`/internes, et
 * images Markdown locales (la seule photo est la couverture).
 *
 * Code serveur uniquement (node:fs, sharp).
 */

import type { Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SITE_ROOT } from 'astro:env/server';
import sharp from 'sharp';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { isSafeUrl } from './safe-url';

export { isSafeUrl };

/** Taille maximale de la photo déposée (octets). */
export const COVER_MAX_BYTES = 10 * 1024 * 1024;
/** Taille maximale du fichier Markdown déposé (octets). */
export const MARKDOWN_MAX_BYTES = 200 * 1024;

/** Nom de dossier d'une actualité : `AAAA-MM-JJ-slug`. */
export const NEWS_SLUG = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

export function siteRoot(): string {
	return resolve(SITE_ROOT || process.cwd());
}

export function newsSourceDir(): string {
	return join(siteRoot(), 'src', 'content', 'news');
}

/** « Atelier : AMELI & Mon espace santé ! » → `atelier-ameli-mon-espace-sante`. */
export function slugify(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/g, '');
}

function optionalString(value: unknown, field: string, errors: string[]): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') {
		errors.push(`\`${field}\` doit être un texte (entre guillemets).`);
		return undefined;
	}
	return value.trim() || undefined;
}

interface NewsFrontmatter {
	title: string;
	isPublish: boolean;
	publishAt: string;
	excerpt: string;
	tag?: string;
	author?: string;
	imageCredit?: string;
}

/** Contrôle du corps (liens et images Markdown ; le HTML est nettoyé à l'affichage). Renvoie les problèmes trouvés. */
export function checkBody(body: string): string[] {
	const problems = new Set<string>();
	const walk = (node: Nodes) => {
		const line = node.position?.start.line;
		const where = line ? ` (ligne ${line} du texte)` : '';
		if ((node.type === 'link' || node.type === 'definition') && !isSafeUrl(node.url)) {
			problems.add(`Lien refusé${where} : seuls les liens http(s), mailto:, tel: et internes sont acceptés.`);
		}
		if (node.type === 'image' && !/^https?:\/\//i.test(node.url.trim())) {
			problems.add(`Image refusée${where} : seule la photo de couverture se dépose ici ; dans le texte, utilisez une adresse http(s).`);
		}
		if ('children' in node) node.children.forEach((child) => walk(child as Nodes));
	};
	walk(fromMarkdown(body));
	return [...problems];
}

/** Lit et vérifie un fichier `.md` déposé ; renvoie le frontmatter normalisé et le corps, ou les erreurs. */
export function parseNewsMarkdown(markdown: string): { frontmatter?: NewsFrontmatter; body: string; errors: string[] } {
	const text = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
	const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
	if (!match) {
		return { body: '', errors: ["En-tête (frontmatter) introuvable : le fichier doit commencer par un bloc `---` … `---`."] };
	}
	let raw: Record<string, unknown>;
	try {
		const parsed = parseYaml(match[1]);
		raw = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch (err) {
		return { body: '', errors: [`En-tête illisible : ${(err as Error).message.split('\n')[0]}`] };
	}
	const body = text.slice(match[0].length).trim();
	const errors: string[] = [];

	const title = optionalString(raw.title, 'title', errors);
	const excerpt = optionalString(raw.excerpt, 'excerpt', errors);
	const publishAt = String(raw.publishAt ?? '').trim();
	if (!title) errors.push('`title` est obligatoire.');
	if (!excerpt) errors.push('`excerpt` (résumé court) est obligatoire.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(publishAt) || Number.isNaN(new Date(`${publishAt}T00:00:00Z`).getTime())) {
		errors.push('`publishAt` est obligatoire, au format AAAA-MM-JJ (ex. 2026-10-06).');
	}
	if (raw.isPublish !== undefined && typeof raw.isPublish !== 'boolean') errors.push('`isPublish` doit valoir true ou false.');
	const tag = optionalString(raw.tag, 'tag', errors);
	const author = optionalString(raw.author, 'author', errors);
	const imageCredit = optionalString(raw.imageCredit, 'imageCredit', errors);
	if (!body) errors.push("Le fichier ne contient pas de texte après l'en-tête.");
	else errors.push(...checkBody(body));

	if (errors.length > 0) return { body, errors };
	return {
		body,
		errors,
		frontmatter: { title: title!, isPublish: raw.isPublish !== false, publishAt, excerpt: excerpt!, tag, author, imageCredit },
	};
}

/** Photo redressée selon l'EXIF, sans métadonnées (dont la position GPS), 1600 px de large au plus. */
export async function writeCover(dir: string, input: Buffer): Promise<void> {
	await sharp(input, { failOn: 'error' })
		.rotate()
		.resize({ width: 1600, withoutEnlargement: true })
		.jpeg({ quality: 85, mozjpeg: true })
		.toFile(join(dir, 'cover.jpg'));
}

/**
 * Crée `src/content/news/<publishAt>-<titre>/` (index.md + cover.jpg).
 * Le frontmatter est réécrit à partir des champs validés : un `cover:` du
 * fichier déposé est ignoré (la photo est celle du formulaire).
 */
/** Contenu de `index.md` : frontmatter validé (`cover:` éventuel) + corps. */
function serializeNews(frontmatter: NewsFrontmatter, body: string, cover?: string): string {
	const data: Record<string, unknown> = Object.fromEntries(
		Object.entries({ ...frontmatter, cover }).filter(([, v]) => v !== undefined),
	);
	const yaml = stringifyYaml(data, { defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN', lineWidth: 0 });
	return `---\n${yaml}---\n\n${body}\n`;
}

/**
 * Dossier de travail des écritures (préparation, sauvegardes, suppressions en
 * attente) : DANS src/content, donc sur le même système de fichiers que les
 * actualités — un renommage ne peut pas changer de disque (EXDEV), or
 * src/content peut être un volume monté (Docker). Aucune collection ne lit ce
 * dossier (les loaders visent src/content/news, pages, activites).
 */
export function workRoot(): string {
	return join(siteRoot(), 'src', 'content', '.tmp-publication');
}

export function workDir(name: string): string {
	return join(workRoot(), `${name}-${process.pid}-${Date.now()}`);
}

export const COVER_ERROR = "La photo n'a pas pu être lue (formats acceptés : JPEG, PNG, WebP).";

export async function writeNews(markdown: string, cover?: Buffer): Promise<{ slug?: string; title?: string; errors: string[] }> {
	const { frontmatter, body, errors } = parseNewsMarkdown(markdown);
	if (!frontmatter) return { errors };

	const slug = `${frontmatter.publishAt}-${slugify(frontmatter.title) || 'actualite'}`;
	const target = join(newsSourceDir(), slug);
	if (await stat(target).then(() => true, () => false)) {
		return { errors: [`Une actualité « ${slug} » existe déjà (même date et même titre).`] };
	}

	const tmp = workDir(slug);
	await mkdir(tmp, { recursive: true });
	try {
		if (cover) {
			try {
				await writeCover(tmp, cover);
			} catch {
				return { errors: [COVER_ERROR] };
			}
		}
		await writeFile(join(tmp, 'index.md'), serializeNews(frontmatter, body, cover ? './cover.jpg' : undefined), 'utf8');
		await mkdir(newsSourceDir(), { recursive: true }); // site sans aucune actualité
		await rename(tmp, target);
		return { slug, title: frontmatter.title, errors: [] };
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
}

/** Chemin `cover:` acceptable dans un fichier existant : un fichier du dossier (`./cover.png`). */
const COVER_FIELD = /^\.\/[\w.-]+$/;

export interface NewsSource {
	slug: string;
	title: string;
	publishAt: string;
	excerpt: string;
	isPublish: boolean;
	tag: string;
	author: string;
	imageCredit: string;
	body: string;
	/** Valeur `cover:` actuelle (`./cover.jpg`), ou `null` sans photo. */
	cover: string | null;
}

/**
 * Lit une actualité telle qu'elle est dans les sources (pour le formulaire
 * d'édition). Lecture tolérante : un champ absent devient une chaîne vide.
 */
export async function readNewsSource(slug: string): Promise<NewsSource | null> {
	if (!NEWS_SLUG.test(slug)) return null;
	let text: string;
	try {
		text = await readFile(join(newsSourceDir(), slug, 'index.md'), 'utf8');
	} catch {
		return null;
	}
	text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
	let raw: Record<string, unknown> = {};
	try {
		const parsed = match ? parseYaml(match[1]) : null;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed;
	} catch {
		// En-tête illisible : on laisse les champs vides, la personne les corrige.
	}
	const str = (v: unknown) => (v === undefined || v === null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
	const cover = typeof raw.cover === 'string' && COVER_FIELD.test(raw.cover) ? raw.cover : null;
	return {
		slug,
		title: str(raw.title),
		publishAt: str(raw.publishAt),
		excerpt: str(raw.excerpt),
		isPublish: raw.isPublish !== false,
		tag: str(raw.tag),
		author: str(raw.author),
		imageCredit: str(raw.imageCredit),
		body: match ? text.slice(match[0].length).trim() : text.trim(),
		cover,
	};
}

/** Photo lors d'une édition : garder l'actuelle, la remplacer, ou la retirer. */
/**
 * Toutes les actualités des sources (liste du module) : y compris celles
 * enregistrées sans publier, que le site construit ne connaît pas encore.
 */
export async function listNewsSources(): Promise<NewsSource[]> {
	const names = await readdir(newsSourceDir()).catch(() => [] as string[]);
	const sources = await Promise.all(names.filter((name) => NEWS_SLUG.test(name)).map(readNewsSource));
	return sources.filter((source): source is NewsSource => source !== null);
}

export type CoverChange = { action: 'keep' } | { action: 'replace'; data: Buffer } | { action: 'remove' };

/**
 * Remplace le contenu d'une actualité existante, sans changer son dossier
 * (l'URL reste la même, même si le titre ou la date changent). Une copie de
 * sauvegarde est faite d'abord : `restore` la remet en place si la
 * reconstruction échoue, `purge` l'efface une fois la nouvelle version en ligne.
 */
export async function updateNews(
	slug: string,
	markdown: string,
	coverChange: CoverChange,
): Promise<{ title?: string; restore?: () => Promise<void>; purge?: () => Promise<void>; errors: string[] }> {
	const current = await readNewsSource(slug);
	if (!current) return { errors: ['Actualité introuvable dans les sources.'] };
	const { frontmatter, body, errors } = parseNewsMarkdown(markdown);
	if (!frontmatter) return { errors };

	const dir = join(newsSourceDir(), slug);
	const tmp = workDir(`edition-${slug}`);
	await mkdir(tmp, { recursive: true });
	try {
		// Nouvelle version complète préparée à part : rien n'est touché tant que tout n'est pas prêt.
		await cp(dir, tmp, { recursive: true });
		let cover = current.cover ?? undefined;
		if (coverChange.action !== 'keep' && current.cover) await rm(join(tmp, current.cover), { force: true });
		if (coverChange.action === 'remove') cover = undefined;
		if (coverChange.action === 'replace') {
			try {
				await writeCover(tmp, coverChange.data);
			} catch {
				return { errors: [COVER_ERROR] };
			}
			cover = './cover.jpg';
		}
		await writeFile(join(tmp, 'index.md'), serializeNews(frontmatter, body, cover), 'utf8');

		const backup = workDir(`sauvegarde-${slug}`);
		await rename(dir, backup);
		await rename(tmp, dir);
		return {
			title: frontmatter.title,
			errors: [],
			restore: async () => {
				await rm(dir, { recursive: true, force: true });
				await rename(backup, dir);
			},
			purge: () => rm(backup, { recursive: true, force: true }),
		};
	} finally {
		await rm(tmp, { recursive: true, force: true });
	}
}

/** Retire le dossier d'une actualité (annulation si la publication échoue). */
export async function removeNews(slug: string): Promise<void> {
	if (!NEWS_SLUG.test(slug)) return;
	await rm(join(newsSourceDir(), slug), { recursive: true, force: true });
}

/**
 * Suppression en deux temps : le dossier de l'actualité est d'abord mis de
 * côté (hors de src/content, même disque), puis effacé (`purge`) une fois le
 * site reconstruit, ou remis en place (`restore`) si la reconstruction échoue.
 * `null` si l'actualité n'existe pas.
 */
export async function setAsideNews(
	slug: string,
): Promise<{ purge: () => Promise<void>; restore: () => Promise<void> } | null> {
	if (!NEWS_SLUG.test(slug)) return null;
	const source = join(newsSourceDir(), slug);
	if (!(await stat(source).then((s) => s.isDirectory(), () => false))) return null;
	const aside = workDir(`suppression-${slug}`);
	await mkdir(workRoot(), { recursive: true });
	await rename(source, aside);
	return {
		purge: () => rm(aside, { recursive: true, force: true }),
		restore: () => rename(aside, source),
	};
}
