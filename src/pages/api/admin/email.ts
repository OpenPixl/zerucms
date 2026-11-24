/**
 * Compte e-mail du site (module « Site », bureau : garde `/api/admin/email`
 * de `src/middleware.ts`). Sans reconstruction : `<DATA_DIR>/connexions/email.yaml`
 * est lu à chaque envoi (`src/lib/email.ts`).
 *  - GET : champs (renseignés ou non, jamais le mot de passe) + état vérifié ;
 *  - PUT `{ valeurs }` : clé → nouvelle valeur (vide = inchangée, `null` =
 *    effacée), puis vérification auprès du serveur d'envoi ;
 *  - POST `{ action: 'verifier' }` : nouvelle vérification ;
 *  - POST `{ action: 'test', a }` : e-mail de test envoyé à l'adresse `a`.
 * Journal : `email.connexion` (champs changés, jamais leurs valeurs), `email.test`.
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../lib/auth/api';
import { champsConnexion, enregistrerConnexion, fichierConnexionAffiche, lireConnexion } from '../../../lib/connexions';
import { CHAMPS_EMAIL, CONNEXION_EMAIL, envoyerEmail, statutEmail, verifierEmail } from '../../../lib/email';
import { logEvent } from '../../../lib/journal';
import type { StatutConnexion } from '../../../plugins/connexions';
import { FORMATS_CONNEXION } from '../../../plugins/champs';

export const prerender = false;

async function reponse(statut: StatutConnexion[]) {
	return json({
		champs: champsConnexion(CHAMPS_EMAIL, await lireConnexion(CONNEXION_EMAIL)),
		fichier: fichierConnexionAffiche(CONNEXION_EMAIL),
		statut,
	});
}

export const GET: APIRoute = withErrors(async () => reponse(await statutEmail()));

export const PUT: APIRoute = withErrors(async ({ request, locals }) => {
	const body = (await readJson(request)) ?? {};
	const { changes, errors } = await enregistrerConnexion(CONNEXION_EMAIL, CHAMPS_EMAIL, body.valeurs);
	if (errors.length) return jsonError(errors.join(' '), 422);
	const statut = await verifierEmail();
	const probleme = statut.find((s) => s.niveau === 'erreur');
	await logEvent({
		by: locals.user!,
		action: 'email.connexion',
		label: changes.join(', '),
		outcome: probleme ? 'echec' : 'ok',
		...(probleme ? { message: probleme.message } : {}),
	});
	return reponse(statut);
});

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	const body = (await readJson(request)) ?? {};
	if (body.action === 'verifier') return reponse(await verifierEmail());
	if (body.action !== 'test') return jsonError('Action inconnue.', 400);
	const a = typeof body.a === 'string' ? body.a.trim() : '';
	if (!FORMATS_CONNEXION.email.re.test(a)) return jsonError('Adresse e-mail du destinataire invalide.', 422);
	try {
		await envoyerEmail({
			a,
			sujet: 'E-mail de test du site',
			texte: `Bonjour,\n\nCet e-mail de test a été envoyé depuis l'Espace Admin du site par ${locals.user!.fullname}.\nL'envoi d'e-mails fonctionne.\n`,
		});
	} catch (err) {
		const message = (err as Error).message;
		await logEvent({ by: locals.user!, action: 'email.test', label: a, outcome: 'echec', message });
		return jsonError(message, 502);
	}
	await logEvent({ by: locals.user!, action: 'email.test', label: a, outcome: 'ok' });
	return json({ ok: true });
});
