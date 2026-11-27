/**
 * Page du site (bibliothèque `src/lib/site-pages.ts` : Accueil, Activités…),
 * groupes `redacteur` / `admin` :
 *  - PUT : `{ label, show, active, textes, modules?, photos?, photo? }` (modules et photos de
 *          leurs éléments, photo : accueil) →
 *          `src/content/pages/_pages-site.md` (cf. `saveSitePage()`) ; `photo` = `{ type, data (base64) }`
 *          ou `'remove'` → `images/accueil.*` (`home-photo.ts`) ; `illustration` (même forme,
 *          SVG accepté) → `images/presentation.*` (module « Présentation ») ; puis reconstruction du site.
 */
import type { APIRoute } from 'astro';
import { jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../../lib/admin-publish';
import { readCover } from '../../../../lib/admin-cover';
import { applyHomeImages, bothApplied, prepareHomePhoto, prepareIllustration, type HomePhotoChange, type IllustrationChange } from '../../../../lib/home-photo';
import { saveSitePage } from '../../../../lib/page-writer';

export const prerender = false;

export const PUT: APIRoute = withErrors(async ({ params, request, locals }) => {
	const id = String(params.id ?? '');
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = (await readJson(request)) ?? {};
	const raw = body.textes && typeof body.textes === 'object' ? (body.textes as Record<string, unknown>) : {};
	const textes = Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, typeof value === 'string' ? value : '']));
	const active = body.active !== false;
	const modules = Array.isArray(body.modules) ? (body.modules as unknown[]) : undefined;

	// Photo du bandeau (accueil seulement) : contrôlée avant toute écriture.
	let photo: HomePhotoChange = { action: 'keep' };
	if (id === 'accueil' && body.photo === 'remove') photo = { action: 'remove' };
	else if (id === 'accueil' && body.photo) {
		const cover = readCover(body.photo);
		if (cover.error) return jsonError(cover.error, 422);
		const prepared = await prepareHomePhoto(cover.data!);
		if ('error' in prepared) return jsonError(prepared.error, 422);
		photo = { action: 'replace', data: prepared.data };
	}
	// Illustration du module « Présentation » (accueil seulement) : de même.
	let illustration: IllustrationChange = { action: 'keep' };
	if (id === 'accueil' && body.illustration === 'remove') illustration = { action: 'remove' };
	else if (id === 'accueil' && body.illustration) {
		const prepared = await prepareIllustration(body.illustration);
		if ('error' in prepared) return jsonError(prepared.error, 422);
		illustration = { action: 'replace', ...prepared };
	}

	// Photos des sections (accueil) : `nouvelle:<clé>` → `{ type, data }`, cf. `preparerBlocs()`.
	const photos = body.photos && typeof body.photos === 'object' && !Array.isArray(body.photos) ? (body.photos as Record<string, unknown>) : {};
	const result = await saveSitePage(id, { label: String(body.label ?? ''), show: body.show !== false, active, textes, modules, photos });
	if (!result.applied) return jsonError(result.errors.join(' '), 422);
	let applied = result.applied;
	if (photo.action !== 'keep' || illustration.action !== 'keep') {
		try {
			applied = bothApplied(result.applied, (await applyHomeImages(photo, illustration))!);
		} catch (err) {
			await result.applied.restore();
			throw err;
		}
	}
	const notes: string[] = [];
	if (!active) notes.push('désactivée');
	else if (body.show === false) notes.push('masquée du menu');
	if (photo.action === 'replace') notes.push("nouvelle photo d'accueil");
	if (photo.action === 'remove') notes.push("photo d'accueil retirée");
	if (illustration.action === 'replace') notes.push('nouvelle illustration de la présentation');
	if (illustration.action === 'remove') notes.push('illustration de la présentation retirée');
	return publishChange({
		request,
		user: locals.user!,
		action: 'page-site.modification',
		subject: result.label!,
		label: `Page du site : ${result.label}`,
		message: notes.join(', ') || undefined,
		applied,
	});
});
