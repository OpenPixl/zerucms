/**
 * Assistant d'installation (super admin seul, garde dans `src/middleware.ts`) :
 *  - GET  : état (`requise`, compte déjà créé, association, plugins avec
 *           leurs réglages et secrets, exemples présents) ;
 *  - POST : saisie complète → compte administrateur, association, logo,
 *           plugins, secrets, exemples (`installer()`), puis reconstruction
 *           du site en mode maintenance ; l'installation est terminée quand
 *           elle réussit (annulée sinon, sauf compte et secrets).
 * Logique : `src/lib/installation.ts`.
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../lib/auth/api';
import { dataDir } from '../../../lib/data-dir';
import { installationRequise, installer, lireEtat, terminerInstallation } from '../../../lib/installation';
import { logEvent } from '../../../lib/journal';
import { canPublish, isPublishing, publish } from '../../../lib/site-build';
import { fermerMaintenance, ouvrirMaintenance } from '../../../../scripts/maintenance.mjs';

export const prerender = false;

/** `?requise` : seulement `{ requise }` (vérifié à chaque chargement de page par la barre). */
export const GET: APIRoute = withErrors(async ({ url }) =>
	json(url.searchParams.has('requise') ? { requise: await installationRequise() } : await lireEtat()),
);

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	const user = locals.user!;
	// Tout refus est consigné (terminal + journal) : sans cela, une installation
	// refusée ne laisse aucune trace sur le serveur.
	const refus = async (message: string, status: number) => {
		console.warn(`[installation] refusée (${status}) : ${message}`);
		await logEvent({ by: user, action: 'installation', label: 'Site', outcome: 'echec', message }).catch(() => {});
		return jsonError(message, status);
	};
	const availability = await canPublish();
	if (!availability.ok) return refus(availability.reason!, 503);
	if (isPublishing()) return refus('Une publication est en cours, réessayez dans une minute.', 409);

	const resultat = await installer((await readJson(request)) ?? {}, user);
	if (resultat.errors.length || !('applied' in resultat)) return refus(resultat.errors.join(' '), 422);
	console.log(`[installation] lancée par ${user.login}.`);

	const par = user.fullname || user.login;
	await logEvent({
		by: user,
		action: 'installation',
		label: 'Site',
		message: [resultat.compte && `compte ${resultat.compte}`, `plugins : ${resultat.plugins.join(', ') || 'aucun'}`].filter(Boolean).join(' · '),
	});

	const maintenance = !import.meta.env.DEV;
	if (maintenance) ouvrirMaintenance(dataDir(), 'Installation du site', 'Préparation du site…', 'installation');
	const started = await publish({
		label: resultat.label,
		by: user,
		maintenance,
		onFailure: resultat.applied.restore,
		onSuccess: async () => {
			await resultat.applied.purge();
			terminerInstallation(par);
		},
	});
	if (!started.started) {
		await resultat.applied.restore();
		if (maintenance) fermerMaintenance(dataDir());
		return jsonError(started.reason ?? 'La reconstruction du site ne peut pas démarrer.', 409);
	}
	return json({ ok: true, maintenance, compte: resultat.compte }, 202);
});
