import type { APIRoute } from 'astro';
import {
	COLS,
	createRecord,
	GristError,
	type GristRecord,
	listRecords,
	membreLabel,
	parseRefList,
	TABLES,
} from '../grist';
import { membreFieldsForGrist, readGenre, validateMembrePayload } from '../membre-fields';
import { isNonEmptyString, json, normalize } from '../../http';
import type { GroupeMembre, MembreCandidat, MembreEtat, MembreResult } from '../types';

export const prerender = false;

/** Indice de désambiguïsation (« né·e en 19•• · ville »), vide si rien d'exploitable. */
function indiceOf(m: GristRecord): string {
	const c = COLS.membre;
	const ddn = Number(m.fields[c.dateNaissance]);
	const annee = Number.isFinite(ddn) ? new Date(ddn * 1000).getUTCFullYear() : null;
	const ville = String(m.fields[c.commune] ?? '').trim();
	return [annee ? `né·e en ${String(annee).slice(0, 2)}••` : '', ville].filter(Boolean).join(' · ');
}

/** Groupe déjà connu de la fiche (responsable + membres rattachés) ; `[]` si fiche seule. */
function groupeDe(records: GristRecord[], m: GristRecord): GroupeMembre[] {
	const ids = [m.id, ...parseRefList(m.fields[COLS.membre.responsableDe])];
	if (ids.length < 2) return [];
	return ids.map((id) => {
		const f = records.find((r) => r.id === id);
		return { membreId: id, label: f ? membreLabel(f.fields) : `Membre ${id}` };
	});
}

/** Préférences + état d'adhésion d'une fiche retrouvée. */
function etatDe(records: GristRecord[], m: GristRecord): MembreEtat {
	const c = COLS.membre;
	return {
		newsletter: m.fields[c.newsletter] === true,
		droitImage: m.fields[c.droitImage] === true,
		adhesionEnCours: m.fields[c.adhesionEnCours] === true,
		groupe: groupeDe(records, m),
	};
}

function toCandidat(
	records: GristRecord[],
	m: GristRecord,
	fbPrenom = '',
	fbNom = '',
): MembreCandidat {
	const c = COLS.membre;
	return {
		membreId: m.id,
		prenom: String(m.fields[c.prenom] ?? fbPrenom),
		nom: String(m.fields[c.nom] ?? fbNom),
		genre: readGenre(m.fields[c.genre]),
		indice: indiceOf(m),
		...etatDe(records, m),
	};
}

/** Fiche dont le `Responsable_de` contient `membreId` (adhésion multiple), ou null. */
function trouverResponsable(records: GristRecord[], membreId: number): GristRecord | null {
	return (
		records.find(
			(r) =>
				r.id !== membreId &&
				parseRefList(r.fields[COLS.membre.responsableDe]).includes(membreId),
		) ?? null
	);
}

async function creerMembre(data: Record<string, unknown>): Promise<MembreResult | null> {
	const payload = validateMembrePayload(data);
	if (!payload) return null;
	const membreId = await createRecord(TABLES.membres, membreFieldsForGrist(payload));
	return {
		status: 'ok',
		membreId,
		ficheId: membreId,
		prenom: payload.prenom,
		nom: payload.nom,
		genre: payload.genre,
		newsletter: payload.newsletter,
		droitImage: payload.droitImage,
		adhesionEnCours: false,
		groupe: [],
	};
}

async function retrouverMembre(nom: string, prenom: string): Promise<MembreResult> {
	const c = COLS.membre;
	const cibleNom = normalize(nom);
	const ciblePrenom = normalize(prenom);

	const records = await listRecords(TABLES.membres);
	const matches = records.filter(
		(r) =>
			normalize(String(r.fields[c.nom] ?? '')) === cibleNom &&
			normalize(String(r.fields[c.prenom] ?? '')) === ciblePrenom,
	);

	if (matches.length === 0) return { status: 'introuvable' };
	if (matches.length === 1) {
		// Si la fiche saisie est un membre rattaché (présent dans le `Responsable_de`
		// d'un·e autre membre), on bascule silencieusement sur le·la responsable pour
		// la logique métier (adhésion, préférences partagées, groupe listé via
		// `etatDe().groupe`) : c'est lui/elle qui porte l'adhésion du foyer. Mais on
		// garde le prénom/nom de la fiche réellement saisie pour l'affichage — c'est
		// elle que la personne a tapée, pas forcément le/la responsable du foyer.
		const trouve = matches[0];
		const cible = trouverResponsable(records, trouve.id) ?? trouve;
		return {
			status: 'ok',
			membreId: cible.id,
			ficheId: trouve.id,
			prenom: String(trouve.fields[c.prenom] ?? prenom),
			nom: String(trouve.fields[c.nom] ?? nom),
			genre: readGenre(cible.fields[c.genre]),
			...etatDe(records, cible),
		};
	}

	const candidats: MembreCandidat[] = matches.map((m) => {
		const cand = toCandidat(records, m, prenom, nom);
		return { ...cand, indice: cand.indice || 'plusieurs fiches à ce nom' };
	});
	return { status: 'ambigu', candidats };
}

/** Étape 1 — création (nouveau) ou rapprochement (renouvellement) du membre. */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Requête invalide.' }, 400);
	}
	const data = body as Record<string, unknown>;
	const mode = data.mode === 'renouvellement' ? 'renouvellement' : 'nouveau';

	try {
		if (mode === 'renouvellement') {
			if (!isNonEmptyString(data.nom) || !isNonEmptyString(data.prenom)) {
				return json({ error: 'Nom et prénom requis.' }, 400);
			}
			return json(await retrouverMembre(data.nom, data.prenom));
		}

		const res = await creerMembre(data);
		if (!res) return json({ error: 'Champs manquants ou invalides.' }, 400);
		return json(res);
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/adhesion/membre]', err);
		return json({ error: "Échec de l'enregistrement du membre." }, status);
	}
};
