import type { APIRoute } from 'astro';
import {
	COLS,
	GristError,
	listRecords,
	parseRefList,
	refList,
	TABLES,
	updateRecord,
} from '../../../lib/grist-asso/grist';
import { json } from '../../../lib/http';

export const prerender = false;

/**
 * Retire un membre d'une adhésion multiple : le sort de Adhesions.Membres
 * ET de Membres[responsable].Responsable_de. Le responsable ne peut pas être retiré.
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Requête invalide.' }, 400);
	}
	const { responsableId, adhesionId, membreId } = body as Record<string, unknown>;
	if (
		typeof responsableId !== 'number' ||
		typeof adhesionId !== 'number' ||
		typeof membreId !== 'number'
	) {
		return json({ error: 'responsableId, adhesionId et membreId requis.' }, 400);
	}
	if (membreId === responsableId) {
		return json({ error: 'Le responsable de l’adhésion ne peut pas être retiré.' }, 400);
	}

	try {
		const adhesions = await listRecords(TABLES.adhesions, { id: [adhesionId] });
		const membres = parseRefList(adhesions[0]?.fields[COLS.adhesion.membres]).filter(
			(id) => id !== membreId,
		);
		await updateRecord(TABLES.adhesions, adhesionId, {
			[COLS.adhesion.membres]: refList(...membres),
		});

		const responsables = await listRecords(TABLES.membres, { id: [responsableId] });
		const rattaches = parseRefList(responsables[0]?.fields[COLS.membre.responsableDe]).filter(
			(id) => id !== membreId,
		);
		await updateRecord(TABLES.membres, responsableId, {
			[COLS.membre.responsableDe]: refList(...rattaches),
		});

		return json({ ok: true });
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/adhesion/detacher-membre]', err);
		return json({ error: "Échec du retrait du membre." }, status);
	}
};
