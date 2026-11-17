import type { APIRoute } from 'astro';
import { COLS, createRecord, GristError, ROLE_CONTACT, TABLES } from '../../../lib/grist-asso/grist';
import { readGenre } from '../../../lib/grist-asso/membre-fields';
import { isNonEmptyString, json } from '../../../lib/http';
import type { ExterieurResult } from '../../../lib/grist-asso/types';

export const prerender = false;

/**
 * Formulaire simplifié d'inscription à une activité, profil « extérieur » —
 * crée une fiche Membres minimale (genre, nom, prénom, téléphone) pour
 * pouvoir recontacter la personne au sujet de l'activité. Pas d'adhésion :
 * rôle « Contact », newsletter non cochée par défaut.
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Requête invalide.' }, 400);
	}
	const { genre, nom, prenom, telephone } = body as Record<string, unknown>;
	if (![nom, prenom, telephone].every(isNonEmptyString)) {
		return json({ error: 'Nom, prénom et téléphone requis.' }, 400);
	}
	const g = readGenre(genre);
	if (!g) {
		return json({ error: 'Genre requis.' }, 400);
	}
	const tel = String(telephone).replace(/[\s.\-]/g, '');
	if (!/^0\d{9}$/.test(tel)) {
		return json({ error: 'Numéro de téléphone invalide (10 chiffres attendus).' }, 400);
	}

	try {
		const c = COLS.membre;
		const membreId = await createRecord(TABLES.membres, {
			[c.genre]: g,
			[c.nom]: String(nom).trim(),
			[c.prenom]: String(prenom).trim(),
			[c.telMobile]: tel,
			[c.role]: ROLE_CONTACT,
			[c.newsletter]: false,
			[c.commentaires]: "Inscription à une activité (participant·e extérieur·e)",
		});
		const result: ExterieurResult = { membreId, prenom: String(prenom).trim(), nom: String(nom).trim() };
		return json(result);
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/inscription/participant-exterieur]', err);
		return json({ error: "Échec de l'enregistrement." }, status);
	}
};
