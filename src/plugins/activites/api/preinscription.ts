import type { APIRoute } from 'astro';
import {
	COLS,
	currentSaisonId,
	GristError,
	listRecords,
	TABLES,
	TYPES_ACTIVITE_INSCRIPTION,
	updateRecord,
} from '../../../lib/grist-asso/grist';
import { json } from '../../../lib/http';

export const prerender = false;

/**
 * Inscription en ligne — l'atelier visé n'est pas encore publié : on note
 * l'intérêt du membre dans `Membres.Commentaires` (une ligne ajoutée, sans
 * toucher au reste), aucune ligne `Inscription` n'est créée. Sans doublon si
 * la même préinscription figure déjà dans le commentaire.
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Requête invalide.' }, 400);
	}
	const { membreId, activiteId } = body as Record<string, unknown>;
	if (typeof membreId !== 'number' || typeof activiteId !== 'number') {
		return json({ error: 'membreId et activiteId requis.' }, 400);
	}

	try {
		const saisonId = await currentSaisonId();
		const [activite] = await listRecords(TABLES.activites, {
			id: [activiteId],
			[COLS.activite.saison]: [saisonId],
			[COLS.activite.type]: [...TYPES_ACTIVITE_INSCRIPTION],
		});
		if (!activite || activite.fields[COLS.activite.publiee] === true) {
			return json({ error: 'Préinscription impossible pour cette activité.' }, 400);
		}
		const [membre] = await listRecords(TABLES.membres, { id: [membreId] });
		if (!membre) return json({ error: 'Membre inconnu.' }, 400);

		const nom = String(activite.fields[COLS.activite.nom] ?? `Activité ${activiteId}`);
		const marque = `Intéressé·e par « ${nom} » — préinscription`;
		const actuel = String(membre.fields[COLS.membre.commentaires] ?? '').trim();
		if (!actuel.includes(marque)) {
			const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
			const ligne = `${date} : ${marque}`;
			await updateRecord(TABLES.membres, membreId, {
				[COLS.membre.commentaires]: actuel ? `${actuel}\n${ligne}` : ligne,
			});
		}
		return json({ ok: true });
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/inscription/preinscription]', err);
		return json({ error: "Échec de l'enregistrement de la préinscription." }, status);
	}
};
