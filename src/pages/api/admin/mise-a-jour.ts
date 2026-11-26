/**
 * Mise à jour du modèle depuis l'Espace Admin (super admin seul, garde dans
 * `src/middleware.ts` ; logique `src/lib/mise-a-jour.ts`) :
 *  - GET : `{ mode, version, bloquee, dernier }` (installation git / archive /
 *          Docker, versions en ligne et publiée, raison d'attendre, dernier résultat) ;
 *  - POST : `{ version: 'X.Y.Z', confirm: 'X.Y.Z' }` → site en maintenance,
 *           `scripts/update.mjs` lancé en arrière-plan (202) ; redémarrage à la fin.
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../lib/auth/api';
import { etatMiseAJour, lancerMiseAJour } from '../../../lib/mise-a-jour';

export const prerender = false;

export const GET: APIRoute = withErrors(async () => json(await etatMiseAJour()));

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	const body = (await readJson(request)) ?? {};
	const version = typeof body.version === 'string' ? body.version.replace(/^v/, '') : '';
	if (!version || body.confirm !== version) return jsonError('Confirmation manquante.');
	const lance = await lancerMiseAJour(version, locals.user!);
	if (!lance.ok) return jsonError(lance.raison!, 409);
	return json({ ok: true }, 202);
});
