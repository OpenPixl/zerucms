/**
 * Plugins (module « Plugins », super admin seul, garde dans `src/middleware.ts`) :
 *  - GET : plugins du catalogue avec leur état (sources / en ligne), fichiers
 *          requis manquants, variables d'environnement absentes, état de la
 *          dernière publication, disponibilité de la publication ;
 *  - PUT : `{ id, actif, valeurs, outils }` → `plugins.<id>` et
 *          `outils.<id>` de `reglages.yaml`, réglages du plugin dans son
 *          fichier (`savePlugin()`), puis
 *          reconstruction du site (annulée si le build échoue).
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../lib/admin-publish';
import { readPluginsSource, savePlugin } from '../../../lib/plugin-writer';
import { canPublish, readStatus } from '../../../lib/site-build';

export const prerender = false;

/** Au-delà, le résultat de la dernière publication n'est plus rappelé dans le module. */
const STATUS_RECALL_MS = 24 * 60 * 60 * 1000;

export const GET: APIRoute = withErrors(async () => {
	const status = await readStatus();
	const finished = status.finishedAt ? Date.parse(status.finishedAt) : 0;
	const recent = status.state === 'running' || status.state === 'idle' || Date.now() - finished < STATUS_RECALL_MS;
	return json({
		plugins: (await readPluginsSource()).filter((p) => p.propose || p.actif),
		status: recent ? status : { state: 'idle' },
		availability: await canPublish(),
	});
});

export const PUT: APIRoute = withErrors(async ({ request, locals }) => {
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = (await readJson(request)) ?? {};
	const result = await savePlugin(body.id, body.actif, body.valeurs, body.outils);
	if (!result.applied) return jsonError(result.errors.join(' '), 422);
	return publishChange({
		request,
		user: locals.user!,
		action: 'plugin.modification',
		subject: result.label,
		label: result.label,
		applied: result.applied,
	});
});
