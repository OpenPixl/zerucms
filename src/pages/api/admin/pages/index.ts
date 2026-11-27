/**
 * Module « Pages » (groupes `redacteur` / `admin`, garde dans `src/middleware.ts`) :
 *  - GET  : arborescence des sources (menus déroulants, pages, pages réservées), aperçu de la
 *           photo d'accueil (`homePhoto`), vignettes des photos des sections de l'accueil
 *           (`accueilPhotoUrls`), état de
 *           la dernière publication, disponibilité de la publication ;
 *  - POST : `{ page, cover?: { type, data (base64) } }` → crée
 *           `src/content/pages/<…>/index.md` puis reconstruit le site
 *           (annulé si le build échoue).
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../../lib/admin-publish';
import { readCover } from '../../../../lib/admin-cover';
import { readHomePhotoPreview, readIllustrationPreview } from '../../../../lib/home-photo';
import { listPagesSource, readPageInput, savePage } from '../../../../lib/page-writer';
import { blocPhotoUrls } from '../../../../lib/bloc-images';
import { sectionPhotos } from '../../../../lib/home-modules';
import { canPublish, readStatus } from '../../../../lib/site-build';

export const prerender = false;

/** Au-delà, le résultat de la dernière publication n'est plus rappelé dans le module. */
const STATUS_RECALL_MS = 24 * 60 * 60 * 1000;

export const GET: APIRoute = withErrors(async () => {
	const status = await readStatus();
	const finished = status.finishedAt ? Date.parse(status.finishedAt) : 0;
	const recent = status.state === 'running' || status.state === 'idle' || Date.now() - finished < STATUS_RECALL_MS;
	const source = await listPagesSource();
	const accueil = source.sitePages.find((p) => p.id === 'accueil');
	return json({
		...source,
		homePhoto: await readHomePhotoPreview(),
		// Vignettes des photos des sections de l'accueil (dossier `src/content/pages/`).
		accueilPhotoUrls: await blocPhotoUrls('pages', {}, (accueil?.modules ?? []).flatMap(sectionPhotos)),
		homeIllustration: await readIllustrationPreview(),
		status: recent ? status : { state: 'idle' },
		availability: await canPublish(),
	});
});

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = (await readJson(request)) ?? {};
	const cover = readCover(body.cover);
	if (cover.error) return jsonError(cover.error);

	const result = await savePage(readPageInput(body.page), null, cover.data ? { action: 'replace', data: cover.data } : { action: 'keep' });
	if (!result.applied) return jsonError(result.errors.join(' '), 422);
	return publishChange({
		request,
		user: locals.user!,
		action: 'page.ajout',
		subject: result.title!,
		label: `Page : ${result.title}`,
		href: `/${result.path}`,
		applied: result.applied,
	});
});
