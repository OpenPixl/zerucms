import type { APIRoute } from 'astro';
import {
	COLS,
	createRecord,
	GristError,
	listRecords,
	membreLabel,
	parseRefList,
	refList,
	STATUT_IMPAYE,
	TABLES,
} from '../../../lib/grist-asso/grist';
import { isBulletinEnabled, signBulletinToken } from '../lib/bulletin';
import { json, toNumberOrNull } from '../../../lib/http';
import type { AdhesionResult, GroupeMembre } from '../../../lib/grist-asso/types';

export const prerender = false;

/**
 * Étape 2 — crée l'adhésion (table Adhesions) : membre + type de cotisation.
 * `Saison` et `Tarif` sont des colonnes formule → calculées par Grist.
 * Si le membre a déjà des personnes rattachées (Responsable_de), on les reporte
 * d'emblée dans Adhesions.Membres (cas renouvellement d'une adhésion multiple).
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Requête invalide.' }, 400);
	}
	const { membreId, cotisationId } = body as Record<string, unknown>;
	if (typeof membreId !== 'number' || typeof cotisationId !== 'number') {
		return json({ error: 'membreId et cotisationId requis.' }, 400);
	}

	try {
		const cotisations = await listRecords(TABLES.cotisations, { id: [cotisationId] });
		const cotisation = cotisations.find((c) => c.id === cotisationId);
		if (!cotisation) {
			return json({ error: 'Cotisation inconnue.' }, 400);
		}
		const tarif = toNumberOrNull(cotisation.fields[COLS.cotisation.prix]);

		// Groupe déjà connu du membre (responsable + rattachés).
		const responsables = await listRecords(TABLES.membres, { id: [membreId] });
		const rattaches = parseRefList(responsables[0]?.fields[COLS.membre.responsableDe]);
		const membresIds = [membreId, ...rattaches];

		const a = COLS.adhesion;
		const adhesionId = await createRecord(TABLES.adhesions, {
			[a.membres]: refList(...membresIds),
			[a.cotisation]: cotisationId,
			[a.statut]: STATUT_IMPAYE,
			...(tarif !== null ? { [a.montantDu]: tarif } : {}),
		});

		let groupe: GroupeMembre[] = [];
		if (membresIds.length > 1) {
			const fiches = await listRecords(TABLES.membres, { id: membresIds });
			groupe = membresIds.map((id) => {
				const f = fiches.find((m) => m.id === id);
				return { membreId: id, label: f ? membreLabel(f.fields) : `Membre ${id}` };
			});
		}

		const result: AdhesionResult = {
			adhesionId,
			groupe,
			...(isBulletinEnabled() ? { bulletinToken: signBulletinToken(adhesionId) } : {}),
		};
		return json(result);
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/adhesion/cotisation]', err);
		return json({ error: "Échec de l'enregistrement de l'adhésion." }, status);
	}
};
