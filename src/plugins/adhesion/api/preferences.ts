import type { APIRoute } from 'astro';
import {
	COLS,
	GristError,
	listRecords,
	parseRefList,
	TABLES,
	updateRecords,
} from '../../../lib/grist-asso/grist';
import { json } from '../../../lib/http';

export const prerender = false;

/**
 * Renouvellement — met à jour les préférences (newsletter, droit à l'image) de la
 * fiche retrouvée à l'étape 1. N'écrit que ces deux colonnes.
 *
 * Adhésion liée : le même choix est appliqué au·à la responsable **et à tous les
 * membres rattachés** (`Membres.Responsable_de`) — un seul réglage pour le foyer.
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Requête invalide.' }, 400);
	}
	const { membreId, newsletter, droitImage } = body as Record<string, unknown>;
	if (typeof membreId !== 'number') {
		return json({ error: 'membreId requis.' }, 400);
	}

	const fields = {
		[COLS.membre.newsletter]: newsletter === true,
		[COLS.membre.droitImage]: droitImage === true,
	};

	try {
		const fiches = await listRecords(TABLES.membres, { id: [membreId] });
		const rattaches = parseRefList(fiches[0]?.fields[COLS.membre.responsableDe]);
		const ids = [membreId, ...rattaches];
		await updateRecords(
			TABLES.membres,
			ids.map((id) => ({ id, fields })),
		);
		return json({ ok: true });
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/adhesion/preferences]', err);
		return json({ error: 'Échec de la mise à jour des préférences.' }, status);
	}
};
