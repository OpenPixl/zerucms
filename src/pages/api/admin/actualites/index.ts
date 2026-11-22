/**
 * Module « Actualités » (groupes `redacteur` / `admin`, garde dans
 * `src/middleware.ts`) :
 *  - GET  : actualités des sources (brouillons et actualités enregistrées
 *           sans publier compris), état de la dernière publication,
 *           disponibilité de la publication sur ce serveur ;
 *  - POST : `{ markdown, cover?: { type, data (base64) }, photos? }` → écrit
 *           `src/content/news/<AAAA-MM-JJ-slug>/` puis lance la reconstruction
 *           du site (`src/lib/site-build.ts`) ; annulée si le build échoue.
 *           `?publier=non` : rejoint le lot en attente (`src/lib/admin-publish.ts`).
 * Envoi en JSON (photo en base64) : la protection d'origine du middleware
 * (Sec-Fetch-Site) ne dépend pas de la configuration du proxy.
 */
import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { getCollection } from 'astro:content';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { COVER_MAX_BYTES, MARKDOWN_MAX_BYTES, listNewsSources, removeNews, writeNews } from '../../../../lib/news-writer';
import { publishBlocked, publishChange } from '../../../../lib/admin-publish';
import { canPublish, readStatus, type BuildStatus } from '../../../../lib/site-build';

export const prerender = false;

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Au-delà, le résultat de la dernière publication n'est plus rappelé dans le module. */
const STATUS_RECALL_MS = 24 * 60 * 60 * 1000;

/**
 * État à afficher dans le module : une publication en cours toujours ; un
 * résultat seulement s'il est récent, et — s'il a réussi — si l'actualité
 * publiée existe encore (elle a pu être supprimée depuis).
 */
function statusToShow(status: BuildStatus, hrefs: Set<string>): BuildStatus {
	if (status.state === 'idle' || status.state === 'running') return status;
	// (un encadré fermé a déjà remis l'état à `idle`, cf. `dismissStatus`)
	const finished = status.finishedAt ? Date.parse(status.finishedAt) : 0;
	if (Date.now() - finished > STATUS_RECALL_MS) return { state: 'idle' };
	if (status.state === 'succeeded' && status.href && !hrefs.has(status.href)) return { state: 'idle' };
	return status;
}

export const GET: APIRoute = withErrors(async () => {
	// Liste lue dans les sources (actualités enregistrées sans publier comprises) ; vignette du site construit.
	const built = new Map((await getCollection('news')).map((e) => [e.id, e.data.cover]));
	const news = await Promise.all(
		(await listNewsSources()).map(async (source) => {
			const cover = built.get(source.slug);
			return {
				slug: source.slug,
				href: `/actualites/${source.slug}`,
				title: source.title || source.slug,
				publishAt: source.publishAt,
				isPublish: source.isPublish,
				tag: source.tag || null,
				thumbnail: cover ? (await getImage({ src: cover, width: 128, height: 80, fit: 'cover' })).src : null,
			};
		}),
	);
	news.sort((a, b) => b.publishAt.localeCompare(a.publishAt) || a.slug.localeCompare(b.slug));
	const status = statusToShow(await readStatus(), new Set(news.map((n) => n.href)));
	return json({ news, status, availability: await canPublish() });
});

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;

	const body = await readJson(request);
	const markdown = typeof body?.markdown === 'string' ? body.markdown : '';
	if (!markdown.trim()) return jsonError('Déposez un fichier Markdown (.md).');
	if (Buffer.byteLength(markdown) > MARKDOWN_MAX_BYTES) return jsonError('Le fichier Markdown est trop volumineux (200 Ko max).');

	let cover: Buffer | undefined;
	const rawCover = body?.cover as { type?: unknown; data?: unknown } | undefined;
	if (rawCover) {
		if (!COVER_TYPES.includes(String(rawCover.type))) return jsonError('Photo : formats acceptés JPEG, PNG ou WebP.');
		cover = Buffer.from(String(rawCover.data ?? ''), 'base64');
		if (cover.length === 0) return jsonError('La photo est vide.');
		if (cover.length > COVER_MAX_BYTES) return jsonError('La photo est trop lourde (10 Mo max).');
	}

	// Photos des blocs déposées avec le fichier, sous le nom cité dans le `.md`.
	const photos = body?.photos && typeof body.photos === 'object' && !Array.isArray(body.photos) ? (body.photos as Record<string, unknown>) : {};
	const { slug, title, errors } = await writeNews(markdown, cover, photos);
	if (!slug) return jsonError(errors.join(' '), 422);

	return publishChange({
		request,
		user: locals.user!,
		action: 'actualite.ajout',
		subject: title!,
		label: title!,
		href: `/actualites/${slug}`,
		applied: { restore: () => removeNews(slug), purge: async () => {} },
	});
});
