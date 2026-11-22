/**
 * Une actualité (groupes `redacteur` / `admin`, garde dans `src/middleware.ts`) :
 *  - GET    : contenu tel qu'il est dans les sources (formulaire d'édition) ;
 *  - PUT    : `{ fields, body, blocs, photos, cover }` → nouvelle version du même dossier
 *             (l'URL ne change pas), site reconstruit ; sauvegarde remise en
 *             place si la reconstruction échoue ;
 *  - DELETE : `{ confirm: <slug> }` → dossier mis de côté, site reconstruit,
 *             dossier effacé une fois la nouvelle version en ligne (remis en
 *             place si échec).
 * Toute modification passe par `src/lib/site-build.ts` (une à la fois), ou
 * rejoint le lot en attente (`?publier=non`, cf. `src/lib/admin-publish.ts`).
 */
import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { getEntry } from 'astro:content';
import { stringify as stringifyYaml } from 'yaml';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import {
	COVER_MAX_BYTES,
	MARKDOWN_MAX_BYTES,
	readNewsSource,
	setAsideNews,
	updateNews,
	type CoverChange,
} from '../../../../lib/news-writer';
import { publishBlocked, publishChange } from '../../../../lib/admin-publish';
import { blocPhotoUrls } from '../../../../lib/bloc-images';

export const prerender = false;

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const GET: APIRoute = withErrors(async ({ params }) => {
	const source = await readNewsSource(String(params.slug ?? ''));
	if (!source) return jsonError('Actualité introuvable dans les sources.', 404);
	// Aperçu de la photo actuelle : celle du site construit (la source n'est pas servie).
	const entry = await getEntry('news', source.slug);
	const coverUrl = entry?.data.cover
		? (await getImage({ src: entry.data.cover, width: 640, height: 360, fit: 'cover' })).src
		: null;
	return json({ ...source, coverUrl, blocPhotoUrls: await blocPhotoUrls(`news/${source.slug}`, source.blocs) });
});

/** Champs du formulaire → fichier Markdown, validé ensuite comme un dépôt. */
function toMarkdown(fields: Record<string, unknown>, body: string, blocs: unknown): string {
	const text = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string).trim() : '');
	const data: Record<string, unknown> = { title: text('title'), publishAt: text('publishAt'), excerpt: text('excerpt') };
	if (fields.isPublish === false) data.isPublish = false;
	for (const key of ['tag', 'author', 'imageCredit']) if (text(key)) data[key] = text(key);
	if (blocs && typeof blocs === 'object' && !Array.isArray(blocs) && Object.keys(blocs).length) data.blocs = blocs;
	return `---\n${stringifyYaml(data, { defaultStringType: 'QUOTE_DOUBLE', lineWidth: 0 })}---\n\n${body}\n`;
}

export const PUT: APIRoute = withErrors(async ({ params, request, locals }) => {
	const slug = String(params.slug ?? '');
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;

	const payload = (await readJson(request)) ?? {};
	const fields = (payload.fields && typeof payload.fields === 'object' ? payload.fields : {}) as Record<string, unknown>;
	const body = typeof payload.body === 'string' ? payload.body.replace(/\r\n?/g, '\n').trim() : '';
	const markdown = toMarkdown(fields, body, payload.blocs);
	const photos = payload.photos && typeof payload.photos === 'object' && !Array.isArray(payload.photos) ? (payload.photos as Record<string, unknown>) : {};
	if (Buffer.byteLength(markdown) > MARKDOWN_MAX_BYTES) return jsonError('Le texte est trop long (200 Ko max).');

	let coverChange: CoverChange = { action: 'keep' };
	const rawCover = payload.cover as { action?: unknown; type?: unknown; data?: unknown } | undefined;
	if (rawCover?.action === 'remove') coverChange = { action: 'remove' };
	if (rawCover?.action === 'replace') {
		if (!COVER_TYPES.includes(String(rawCover.type))) return jsonError('Photo : formats acceptés JPEG, PNG ou WebP.');
		const data = Buffer.from(String(rawCover.data ?? ''), 'base64');
		if (data.length === 0) return jsonError('La photo est vide.');
		if (data.length > COVER_MAX_BYTES) return jsonError('La photo est trop lourde (10 Mo max).');
		coverChange = { action: 'replace', data };
	}

	const { title, restore, purge, errors } = await updateNews(slug, markdown, coverChange, photos);
	if (!restore || !purge) return jsonError(errors.join(' '), errors[0]?.includes('introuvable') ? 404 : 422);

	return publishChange({
		request,
		user: locals.user!,
		action: 'actualite.modification',
		subject: title!,
		label: `Modification : ${title}`,
		href: fields.isPublish === false ? undefined : `/actualites/${slug}`,
		message: [coverChange.action !== 'keep' ? `photo : ${coverChange.action === 'remove' ? 'retirée' : 'remplacée'}` : '', fields.isPublish === false ? 'brouillon' : '']
			.filter(Boolean)
			.join(' · ') || undefined,
		applied: { restore, purge },
	});
});

export const DELETE: APIRoute = withErrors(async ({ params, request, locals }) => {
	const slug = String(params.slug ?? '');
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;

	const body = await readJson(request);
	if (body?.confirm !== slug) return jsonError('Confirmation manquante.');

	const title = (await getEntry('news', slug))?.data.title ?? slug;
	const aside = await setAsideNews(slug);
	if (!aside) return jsonError('Actualité introuvable dans les sources (déjà supprimée ?).', 404);

	return publishChange({
		request,
		user: locals.user!,
		action: 'actualite.suppression',
		subject: title,
		label: `Suppression : ${title}`,
		message: slug,
		applied: aside,
	});
});
