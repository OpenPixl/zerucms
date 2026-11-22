/**
 * Charte graphique (module « Charte graphique », bureau seul, garde dans
 * `src/middleware.ts`) :
 *  - GET : `{ source, status, availability }` — couleurs du thème (sources :
 *          `reglages.yaml` fusionné avec les défauts du modèle), défauts,
 *          aperçus du logo et des icônes d'onglet ; état de la dernière
 *          publication, disponibilité de la publication ;
 *  - PUT : `{ colors, sombre, cta, fonts, logo?: { type, data (base64) }, logoSombre?, retirerLogoSombre?, favicon? }` →
 *          `saveBrand()`, puis reconstruction du site (annulée si le build échoue).
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../lib/admin-publish';
import { readBrandInput, readBrandSource, saveBrand } from '../../../lib/brand-writer';
import { canPublish, readStatus } from '../../../lib/site-build';

export const prerender = false;

/** Au-delà, le résultat de la dernière publication n'est plus rappelé dans le module. */
const STATUS_RECALL_MS = 24 * 60 * 60 * 1000;

export const GET: APIRoute = withErrors(async () => {
	const status = await readStatus();
	const finished = status.finishedAt ? Date.parse(status.finishedAt) : 0;
	const recent = status.state === 'running' || status.state === 'idle' || Date.now() - finished < STATUS_RECALL_MS;
	return json({
		source: await readBrandSource(),
		status: recent ? status : { state: 'idle' },
		availability: await canPublish(),
	});
});

export const PUT: APIRoute = withErrors(async ({ request, locals }) => {
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const input = readBrandInput(await readJson(request));
	if ('error' in input) return jsonError(input.error, 422);
	const result = await saveBrand(input);
	if (!result.applied) return jsonError(result.errors.join(' '), 422);
	return publishChange({
		request,
		user: locals.user!,
		action: 'charte.modification',
		subject: result.changes.join(', '),
		label: 'Charte graphique',
		message: result.changes.join(', '),
		applied: result.applied,
	});
});
