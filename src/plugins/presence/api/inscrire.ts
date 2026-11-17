import type { APIRoute } from 'astro';
import { GristError } from '../../../lib/grist-asso/grist';
import { enregistrerPresence } from '../lib/presence';
import { json } from '../../../lib/http';
import type { PresencePayload } from '../../../lib/grist-asso/types';

export const prerender = false;

function estValide(body: unknown): body is PresencePayload {
	if (!body || typeof body !== 'object') return false;
	const b = body as Record<string, unknown>;
	return (
		typeof b.membreId === 'number' &&
		typeof b.activiteId === 'number' &&
		(b.statut === 'present' || b.statut === 'absent')
	);
}

/** Enregistre la présence — ou l'absence signalée — d'un membre à la séance en cours. */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!estValide(body)) {
		return json({ error: 'Requête invalide.' }, 400);
	}

	try {
		const status = await enregistrerPresence(body.membreId, body.activiteId, body.statut);
		return json({ status });
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/presence/inscrire]', err);
		return json({ error: 'Impossible d’enregistrer votre réponse.' }, status);
	}
};
