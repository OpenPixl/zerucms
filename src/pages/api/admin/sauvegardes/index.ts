/**
 * Module « Sauvegardes » (bureau, garde dans `src/middleware.ts`) :
 *  - GET  : archives de `<DATA_DIR>/sauvegardes/` (la plus récente d'abord),
 *           restauration possible ou non (publication, lot en attente) ;
 *  - POST : `{ motif? }` → nouvelle archive de `src/content/`, `extensions/` + comptes et
 *           journal (`scripts/sauvegarde.mjs`).
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { dataDir } from '../../../../lib/data-dir';
import { logEvent } from '../../../../lib/journal';
import { siteRoot } from '../../../../lib/news-writer';
import { restaurationBloquee } from '../../../../lib/sauvegardes';
import { creerSauvegarde, listerSauvegardes } from '../../../../../scripts/sauvegarde.mjs';

export const prerender = false;

export const GET: APIRoute = withErrors(async () => {
	const liste = await listerSauvegardes(dataDir());
	return json({
		sauvegardes: liste.map(({ nom, taille, date, manifeste }) => ({
			nom,
			taille,
			date,
			association: manifeste?.association ?? null,
			modele: manifeste?.modele ?? null,
			motif: manifeste?.motif ?? '',
			par: manifeste?.par ?? '',
			valide: Boolean(manifeste),
		})),
		restauration: await restaurationBloquee(),
	});
});

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	const body = (await readJson(request)) ?? {};
	const motif = typeof body.motif === 'string' ? body.motif.trim().slice(0, 80) : '';
	let result;
	try {
		result = creerSauvegarde({ root: siteRoot(), dataDir: dataDir(), motif, par: locals.user!.fullname || locals.user!.login });
	} catch (err) {
		return jsonError((err as Error).message, 422);
	}
	await logEvent({ by: locals.user!, action: 'sauvegarde.creation', label: result.nom, message: `${result.fichiers} fichiers` });
	return json({ ok: true, nom: result.nom });
});
