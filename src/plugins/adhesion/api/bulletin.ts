import type { APIRoute } from 'astro';
import { COLS, GristError, listRecords, TABLES } from '../../../lib/grist-asso/grist';
import { json } from '../../../lib/http';
import {
	GotenbergError,
	htmlToPdf,
	isBulletinEnabled,
	verifyBulletinToken,
} from '../lib/bulletin';

export const prerender = false;

/**
 * Bulletin d'adhésion en PDF (voir docs/bulletin-pdf.md).
 *
 * Relais : vérifie le jeton -> lit la colonne Formule (HTML complet) de
 * l'enregistrement Adhesions dans Grist -> la convertit via Gotenberg ->
 * renvoie le PDF. Le HTML de la formule ne repart jamais vers le navigateur.
 */
export const GET: APIRoute = async ({ url }) => {
	if (!isBulletinEnabled()) {
		return json({ error: 'Génération du bulletin non configurée sur ce serveur.' }, 501);
	}

	const adhesionId = verifyBulletinToken(url.searchParams.get('t'));
	if (adhesionId === null) {
		return json({ error: 'Lien de bulletin invalide ou expiré.' }, 404);
	}

	try {
		const rows = await listRecords(TABLES.adhesions, { id: [adhesionId] });
		const adhesion = rows.find((r) => r.id === adhesionId);
		if (!adhesion) {
			return json({ error: 'Adhésion introuvable.' }, 404);
		}

		const html = adhesion.fields[COLS.adhesion.bulletinHtml];
		if (typeof html !== 'string' || html.trim() === '') {
			return json({ error: "Le bulletin n'est pas disponible pour cette adhésion." }, 422);
		}

		const pdf = await htmlToPdf(html);

		return new Response(pdf, {
			status: 200,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': 'inline; filename="bulletin-adhesion.pdf"',
				'Cache-Control': 'no-store',
			},
		});
	} catch (err) {
		const status =
			err instanceof GristError ? err.status : err instanceof GotenbergError ? 502 : 500;
		console.error('[api/adhesion/bulletin]', err);
		return json({ error: 'Échec de la génération du bulletin.' }, status);
	}
};
