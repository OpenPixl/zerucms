/**
 * Une page (groupes `redacteur` / `admin`, garde dans `src/middleware.ts`) :
 *  - GET    : contenu tel qu'il est dans les sources (formulaire d'édition) ;
 *  - PUT    : `{ page, cover: { action: keep|remove|replace, type?, data? } }`
 *             → nouvelle version (l'adresse change si l'emplacement ou
 *             l'adresse changent), site reconstruit, tout remis en place si échec ;
 *  - DELETE : `{ confirm: <chemin> }` → page supprimée, site reconstruit.
 */
import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { getEntry } from 'astro:content';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../../lib/admin-publish';
import { readCover } from '../../../../lib/admin-cover';
import { blocPhotoUrls as blocPhotoUrlsDe } from '../../../../lib/bloc-images';
import { deletePage, readPageInput, readPageSource, savePage, type CoverChange } from '../../../../lib/page-writer';

export const prerender = false;

export const GET: APIRoute = withErrors(async ({ params }) => {
	const source = await readPageSource(String(params.path ?? ''));
	if (!source) return jsonError('Page introuvable dans les sources.', 404);
	// Aperçu de la photo actuelle : celle du site construit (la source n'est pas servie).
	const entry = await getEntry('pages', source.path);
	const coverUrl = entry?.data.cover ? (await getImage({ src: entry.data.cover, width: 640, height: 360, fit: 'cover' })).src : null;
	const blocPhotoUrls = await blocPhotoUrlsDe(`pages/${source.path}`, source.blocs);
	return json({ ...source, coverUrl, blocPhotoUrls });
});

export const PUT: APIRoute = withErrors(async ({ params, request, locals }) => {
	const path = String(params.path ?? '');
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = (await readJson(request)) ?? {};
	const rawCover = (body.cover ?? {}) as { action?: unknown };
	let coverChange: CoverChange = { action: 'keep' };
	if (rawCover.action === 'remove') coverChange = { action: 'remove' };
	if (rawCover.action === 'replace') {
		const cover = readCover(rawCover);
		if (cover.error) return jsonError(cover.error);
		coverChange = { action: 'replace', data: cover.data! };
	}

	const result = await savePage(readPageInput(body.page), path, coverChange);
	if (!result.applied) return jsonError(result.errors.join(' '), result.errors[0]?.includes('introuvable') ? 404 : 422);
	return publishChange({
		request,
		user: locals.user!,
		action: 'page.modification',
		subject: result.title!,
		label: `Modification : ${result.title}`,
		href: `/${result.path}`,
		message: result.path !== path ? `adresse : /${path} → /${result.path}` : undefined,
		applied: result.applied,
	});
});

export const DELETE: APIRoute = withErrors(async ({ params, request, locals }) => {
	const path = String(params.path ?? '');
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = await readJson(request);
	if (body?.confirm !== path) return jsonError('Confirmation manquante.');

	const result = await deletePage(path);
	if (!result.applied) return jsonError(result.errors.join(' '), 404);
	return publishChange({
		request,
		user: locals.user!,
		action: 'page.suppression',
		subject: result.title!,
		label: `Suppression : ${result.title}`,
		message: `/${path}`,
		applied: result.applied,
	});
});
