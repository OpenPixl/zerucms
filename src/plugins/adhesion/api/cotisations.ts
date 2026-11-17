import type { APIRoute } from 'astro';
import {
	COLS,
	currentSaisonId,
	GristError,
	listRecords,
	TABLES,
} from '../../../lib/grist-asso/grist';
import { json, toNumberOrNull } from '../../../lib/http';
import type { CotisationOption } from '../../../lib/grist-asso/types';

export const prerender = false;

/** Étape 2 : types de cotisation de la saison en cours, pour le select. */
export const GET: APIRoute = async () => {
	try {
		const saisonId = await currentSaisonId();
		const records = await listRecords(TABLES.cotisations, { [COLS.cotisation.saison]: [saisonId] });

		const options: CotisationOption[] = records.map((r) => ({
			id: r.id,
			label: String(
				r.fields[COLS.cotisation.label] || r.fields[COLS.cotisation.type] || `Cotisation ${r.id}`,
			),
			prix: toNumberOrNull(r.fields[COLS.cotisation.prix]),
			personneMorale: r.fields[COLS.cotisation.personneMorale] === true,
			multiple: r.fields[COLS.cotisation.multiple] === true,
		}));

		return json(options);
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/adhesion/cotisations]', err);
		return json({ error: 'Impossible de charger les cotisations.' }, status);
	}
};
