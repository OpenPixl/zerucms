import type { APIRoute } from 'astro';
import {
	COLS,
	currentSaisonId,
	GristError,
	listRecords,
	TABLES,
	TYPES_ACTIVITE_INSCRIPTION,
	type GristRecord,
} from '../../../lib/grist-asso/grist';
import { toActiviteOption } from '../../../lib/grist-asso/activite-option';
import { json, normalize, toNumberOrNull } from '../../../lib/http';
import type { OffreInscription } from '../../../lib/grist-asso/types';

export const prerender = false;

/** `Nom` exact (hors accents/casse), ou préfixe si le motif finit par `*` (« Initiation* »). */
function correspond(nom: string, motif: string): boolean {
	const n = normalize(nom);
	const m = normalize(motif);
	return m.endsWith('*') ? n.startsWith(m.slice(0, -1).trim()) : n === m;
}

/** Prix de l'adhésion individuelle de la saison (cotisation dont le libellé contient « individuel »). */
async function prixAdhesionIndividuelle(saisonId: number): Promise<number | null> {
	const c = COLS.cotisation;
	const cotisations = await listRecords(TABLES.cotisations, { [c.saison]: [saisonId] });
	const individuelle = cotisations.find((r) =>
		normalize(`${r.fields[c.label] ?? ''} ${r.fields[c.type] ?? ''}`).includes('individuel'),
	);
	return individuelle ? toNumberOrNull(individuelle.fields[c.prix]) : null;
}

/**
 * Inscription en ligne, étape 2 : activités `Séances` / `Ateliers` /
 * `Atelier CN` de la saison en cours. La fiche d'où l'on vient cible des
 * activités par nom (`?activite=`, répétable, `*` final = préfixe) et/ou par
 * type (`?type=`). Cible trouvée : ses lignes publiées, ou — si aucune ne
 * l'est — préinscription sur ses lignes non publiées. Sans cible (ou cible
 * inconnue) : toutes les activités publiées.
 */
export const GET: APIRoute = async ({ url }) => {
	const motifs = url.searchParams.getAll('activite').filter((m) => m.trim());
	const typeParam = url.searchParams.get('type') ?? '';
	const type = TYPES_ACTIVITE_INSCRIPTION.find((t) => normalize(t) === normalize(typeParam));

	try {
		const saisonId = await currentSaisonId();
		const [records, prixAdhesion] = await Promise.all([
			listRecords(TABLES.activites, {
				[COLS.activite.saison]: [saisonId],
				[COLS.activite.type]: [...TYPES_ACTIVITE_INSCRIPTION],
			}),
			prixAdhesionIndividuelle(saisonId),
		]);
		const publiee = (r: GristRecord) => r.fields[COLS.activite.publiee] === true;
		const nomDe = (r: GristRecord) => String(r.fields[COLS.activite.nom] ?? '');

		const cible = motifs.length > 0 || Boolean(type);
		const visees = cible
			? records.filter(
					(r) =>
						(!type || r.fields[COLS.activite.type] === type) &&
						(motifs.length === 0 || motifs.some((m) => correspond(nomDe(r), m))),
				)
			: [];

		let result: OffreInscription;
		if (visees.some(publiee)) {
			result = {
				mode: 'inscription',
				activites: visees.filter(publiee).map(toActiviteOption),
				cibleIntrouvable: false,
				prixAdhesion,
			};
		} else if (visees.length > 0) {
			result = {
				mode: 'preinscription',
				activites: visees.map(toActiviteOption),
				cibleIntrouvable: false,
				prixAdhesion,
			};
		} else {
			result = {
				mode: 'inscription',
				activites: records.filter(publiee).map(toActiviteOption),
				cibleIntrouvable: cible,
				prixAdhesion,
			};
		}
		return json(result);
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/inscription/offre]', err);
		return json({ error: 'Impossible de charger les activités.' }, status);
	}
};
