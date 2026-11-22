/**
 * Une fiche d'activité (groupes `redacteur` / `admin`, garde dans `src/middleware.ts`) :
 *  - GET    : fiche telle qu'elle est dans les sources + aperçu de la photo
 *             + actualités liées (onglet « Partage », `[slug]/actualite.ts`) ;
 *  - PUT    : `{ activity, cover: { action: keep|remove|replace, type?, data? } }`
 *             → même dossier (l'adresse ne change pas ; l'URL change seulement
 *             avec la catégorie), site reconstruit, sauvegarde remise si échec ;
 *  - DELETE : `{ confirm: <slug> }` → dossier retiré, site reconstruit.
 */
import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { getEntry } from 'astro:content';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../../lib/admin-publish';
import { readCover } from '../../../../lib/admin-cover';
import { blocPhotoUrls } from '../../../../lib/bloc-images';
import { newsOfActivity } from '../../../../lib/activity-news';
import { deleteActivity, readActivityInput, readActivitySource, saveActivity, type CoverChange } from '../../../../lib/activity-writer';

export const prerender = false;

export const GET: APIRoute = withErrors(async ({ params }) => {
	const source = await readActivitySource(String(params.slug ?? ''));
	if (!source) return jsonError('Activité introuvable dans les sources.', 404);
	// Aperçu de la photo actuelle : celle du site construit (la source n'est pas servie).
	const entry = await getEntry('activites', source.slug);
	const coverUrl = entry?.data.cover ? (await getImage({ src: entry.data.cover, width: 640, height: 360, fit: 'cover' })).src : null;
	const actualites = (await newsOfActivity(source.slug)).map((n) => ({
		slug: n.slug,
		title: n.title || n.slug,
		publishAt: n.publishAt,
		isPublish: n.isPublish,
		href: `/actualites/${n.slug}`,
	}));
	return json({ ...source, coverUrl, actualites, blocPhotoUrls: await blocPhotoUrls(`activites/${source.slug}`, source.blocs) });
});

export const PUT: APIRoute = withErrors(async ({ params, request, locals }) => {
	const slug = String(params.slug ?? '');
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = (await readJson(request)) ?? {};
	const rawCover = body.cover as { action?: unknown } | undefined;
	let coverChange: CoverChange = { action: 'keep' };
	if (rawCover?.action === 'remove') coverChange = { action: 'remove' };
	if (rawCover?.action === 'replace') {
		const cover = readCover(rawCover);
		if (cover.error) return jsonError(cover.error);
		coverChange = { action: 'replace', data: cover.data! };
	}

	const input = readActivityInput(body.activity);
	const result = await saveActivity(input, slug, coverChange);
	if (!result.applied) return jsonError(result.errors.join(' '), result.errors[0]?.includes('introuvable') ? 404 : 422);
	return publishChange({
		request,
		user: locals.user!,
		action: 'activite.modification',
		subject: result.title!,
		label: `Modification : ${result.title}`,
		href: input.isPublish ? result.href : undefined,
		message:
			[coverChange.action !== 'keep' ? `photo : ${coverChange.action === 'remove' ? 'retirée' : 'remplacée'}` : '', input.isPublish ? '' : 'brouillon']
				.filter(Boolean)
				.join(' · ') || undefined,
		applied: result.applied,
	});
});

export const DELETE: APIRoute = withErrors(async ({ params, request, locals }) => {
	const slug = String(params.slug ?? '');
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = await readJson(request);
	if (body?.confirm !== slug) return jsonError('Confirmation manquante.');

	const result = await deleteActivity(slug);
	if (!result.applied) return jsonError(result.errors.join(' '), 404);
	return publishChange({
		request,
		user: locals.user!,
		action: 'activite.suppression',
		subject: result.title!,
		label: `Suppression : ${result.title}`,
		message: slug,
		applied: result.applied,
	});
});
