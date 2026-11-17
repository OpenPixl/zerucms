import { COLS, type GristRecord } from './grist';
import { toNumberOrNull } from '../http';
import type { ActiviteOption } from './types';

/** Ligne `Activite` → option affichable (tarif à 0 si l'activité n'est pas payante). */
export function toActiviteOption(r: GristRecord): ActiviteOption {
	const c = COLS.activite;
	const gratuit = r.fields[c.payant] === false;
	return {
		id: r.id,
		label: String(r.fields[c.nom] ?? `Activité ${r.id}`),
		prix: gratuit ? 0 : toNumberOrNull(r.fields[c.prix]),
		prixNonAdherent: gratuit ? null : toNumberOrNull(r.fields[c.prixNonAdherent]),
		adhesionRequise: r.fields[c.adhesionRequise] === true,
		placesRestantes: toNumberOrNull(r.fields[c.placesRestantes]),
	};
}
