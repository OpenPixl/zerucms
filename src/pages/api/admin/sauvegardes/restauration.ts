/**
 * Restauration d'une sauvegarde (super admin seul, garde dans `src/middleware.ts`) :
 *  - POST : `{ nom, confirm: <nom> }` → site en **mode maintenance**
 *           (`scripts/maintenance.mjs` : page avec progression pour tous les
 *           visiteurs), `src/content/`, `extensions/`, comptes et journal remplacés par
 *           l'archive (état courant sauvegardé d'abord, sauf s'il l'est déjà
 *           ou si c'est le contenu de démonstration : `restaurerSauvegarde`),
 *           puis reconstruction du site ; si elle échoue, l'état précédent est
 *           remis et la maintenance levée. Sinon, elle prend fin quand le
 *           serveur redémarré écoute (`scripts/start.mjs`).
 * Refusée pendant une publication ou avec des modifications en attente (lot).
 */
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { dataDir } from '../../../../lib/data-dir';
import { logEvent } from '../../../../lib/journal';
import { siteRoot } from '../../../../lib/news-writer';
import { restaurationBloquee } from '../../../../lib/sauvegardes';
import { publish } from '../../../../lib/site-build';
import { avancerMaintenance, fermerMaintenance, ouvrirMaintenance } from '../../../../../scripts/maintenance.mjs';
import { annulerRestauration, cheminSauvegarde, etatPrecedentGarde, restaurerSauvegarde } from '../../../../../scripts/sauvegarde.mjs';

export const prerender = false;

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	const body = (await readJson(request)) ?? {};
	const nom = typeof body.nom === 'string' ? body.nom : '';
	if (body.confirm !== nom) return jsonError('Confirmation manquante.');
	const bloquee = await restaurationBloquee();
	if (bloquee) return jsonError(bloquee, 409);
	const chemin = cheminSauvegarde(nom, dataDir());
	if (!chemin) return jsonError('Sauvegarde introuvable.', 404);

	const user = locals.user!;
	const options = { root: siteRoot(), dataDir: dataDir() };
	// Pas de maintenance en dev : rien n'est reconstruit, aucune porte devant le serveur.
	const maintenance = !import.meta.env.DEV;
	if (maintenance) ouvrirMaintenance(options.dataDir, `Restauration : ${nom}`, "Sauvegarde de l'état actuel…");
	let result: ReturnType<typeof restaurerSauvegarde>;
	try {
		const zip = await readFile(chemin);
		result = restaurerSauvegarde(zip, { ...options, par: user.fullname || user.login });
	} catch (err) {
		if (maintenance) fermerMaintenance(options.dataDir);
		return jsonError((err as Error).message, 422);
	}
	if (maintenance) avancerMaintenance(options.dataDir, { etape: 'Contenu restauré, construction du site…', progression: 10 });
	// Journal restauré avec le reste : l'événement est écrit après.
	await logEvent({ by: user, action: 'sauvegarde.restauration', label: nom, message: etatPrecedentGarde(result) });
	// En dev, le contenu n'est relu qu'à chaud, fichier par fichier : après une
	// restauration complète, seul un redémarrage du serveur de dev est fiable.
	const label = import.meta.env.DEV
		? `Restauration : ${nom} (serveur de développement : relancez-le pour voir le contenu restauré)`
		: `Restauration : ${nom}`;
	const started = await publish({
		label,
		by: user,
		maintenance,
		onFailure: async () => annulerRestauration(result.precedent, options),
		onSuccess: async () => {},
	});
	if (!started.started) {
		annulerRestauration(result.precedent, options);
		if (maintenance) fermerMaintenance(options.dataDir);
		await logEvent({ by: user, action: 'publication', label, outcome: 'echec', message: started.reason });
		return jsonError(started.reason!, 409);
	}
	return json({ ok: true, securite: result.securite, securiteExistante: result.securiteExistante, demo: result.demo, maintenance }, 202);
});
