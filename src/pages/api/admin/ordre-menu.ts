/**
 * Ordre du menu de navigation (flèches ↑/↓ du module « Pages », groupes
 * `redacteur` / `admin`) :
 *  - PUT : `{ levels: { racine?: [clés], 'dropdown:<dossier>'?: [clés], pied?: [clés] } }`
 *          (clés `site:<id>`, `page:<chemin>`, `dropdown:<dossier>`, `pied:<chemin>` pour les
 *          liens du pied de page),
 *          cf. `saveMenuOrder()` ; puis reconstruction du site.
 */
import type { APIRoute } from 'astro';
import { jsonError, readJson, withErrors } from '../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../lib/admin-publish';
import { saveMenuOrder } from '../../../lib/page-writer';

export const prerender = false;

export const PUT: APIRoute = withErrors(async ({ request, locals }) => {
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = (await readJson(request)) ?? {};
	const raw = body.levels && typeof body.levels === 'object' ? (body.levels as Record<string, unknown>) : {};
	const levels: Record<string, string[]> = {};
	for (const [level, keys] of Object.entries(raw)) {
		if (Array.isArray(keys)) levels[level] = keys.map(String);
	}
	const result = await saveMenuOrder(levels);
	const seulPied = Object.keys(levels).every((l) => l === 'pied');
	if (!result.applied) return jsonError(result.errors.join(' '), 422);
	return publishChange({
		request,
		user: locals.user!,
		action: 'ordre-menu.modification',
		subject: seulPied ? 'Ordre du pied de page' : 'Ordre du menu de navigation',
		label: seulPied ? 'Nouvel ordre du pied de page' : 'Nouvel ordre du menu',
		applied: result.applied,
	});
});
