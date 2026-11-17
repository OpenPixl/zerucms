import type { APIRoute } from 'astro';
import { fetchSeancesCourantes } from '../lib/presence';
import { GristError } from '../../../lib/grist-asso/grist';
import { json } from '../../../lib/http';

export const prerender = false;

/** Séance(s) en cours (0, 1 ou plusieurs) auxquelles `membreId` est inscrit·e. */
export const GET: APIRoute = async ({ url }) => {
	const membreId = Number(url.searchParams.get('membreId'));
	if (!Number.isInteger(membreId) || membreId <= 0) {
		return json({ error: 'membreId manquant ou invalide.' }, 400);
	}

	try {
		const seances = await fetchSeancesCourantes(membreId);
		return json(seances);
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/presence/seances]', err);
		return json({ error: 'Impossible de déterminer la séance en cours.' }, status);
	}
};
