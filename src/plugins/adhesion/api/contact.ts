import type { APIRoute } from 'astro';
import {
	COLS,
	createRecord,
	GristError,
	ROLE_CONTACT,
	TABLES,
} from '../../../lib/grist-asso/grist';
import { isNonEmptyString, json } from '../../../lib/http';

export const prerender = false;

/**
 * Inscription « actualités seules » : crée un enregistrement Membres minimal
 * avec Role = Contact et Newsletters = true. Pas d'adhésion ni d'inscription.
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Requête invalide.' }, 400);
	}
	const { nom, prenom, email } = body as Record<string, unknown>;
	if (![nom, prenom, email].every(isNonEmptyString) || !String(email).includes('@')) {
		return json({ error: 'Nom, prénom et courriel valides requis.' }, 400);
	}

	try {
		const c = COLS.membre;
		const membreId = await createRecord(TABLES.membres, {
			[c.nom]: String(nom).trim(),
			[c.prenom]: String(prenom).trim(),
			[c.email]: String(email).trim(),
			[c.role]: ROLE_CONTACT,
			[c.newsletter]: true,
		});
		return json({ membreId });
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/adhesion/contact]', err);
		return json({ error: "Échec de l'inscription aux actualités." }, status);
	}
};
