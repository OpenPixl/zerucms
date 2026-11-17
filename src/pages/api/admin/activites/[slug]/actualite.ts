/**
 * Onglet « Partage » d'une fiche d'activité (groupes `redacteur` / `admin`,
 * garde `/api/admin/activites` de `src/middleware.ts`) :
 *  - POST : crée une actualité datée du jour à partir de la fiche enregistrée
 *           (`src/lib/activity-news.ts`), terminée par « S'inscrire » sur le
 *           site ; site reconstruit, actualité retirée si le build échoue.
 *           `?publier=non` : rejoint le lot en attente.
 */
import type { APIRoute } from 'astro';
import { jsonError, withErrors } from '../../../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../../../lib/admin-publish';
import { writeActivityNews } from '../../../../../lib/activity-news';
import { removeNews } from '../../../../../lib/news-writer';

export const prerender = false;

export const POST: APIRoute = withErrors(async ({ params, request, locals }) => {
	const activite = String(params.slug ?? '');
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;

	const { slug, title, errors } = await writeActivityNews(activite);
	if (!slug) return jsonError(errors.join(' '), errors[0]?.includes('introuvable') ? 404 : 422);

	return publishChange({
		request,
		user: locals.user!,
		action: 'actualite.ajout',
		subject: title!,
		label: `Actualité : ${title}`,
		href: `/actualites/${slug}`,
		message: `depuis l'activité ${activite}`,
		applied: { restore: () => removeNews(slug), purge: async () => {} },
	});
});
