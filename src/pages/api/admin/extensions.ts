/**
 * Extensions (module « Extensions », super admin seul, garde dans `src/middleware.ts`) :
 *  - GET    : extensions installées (fiche valide) avec leur état, comme le
 *             module « Plugins », plus les dossiers invalides, la version du
 *             CMS, l'état de la dernière publication ;
 *  - PUT    : `{ id, actif, valeurs }` → `extensions.<id>` de `reglages.yaml`
 *             et réglages dans son fichier (`saveExtension()`), puis
 *             reconstruction ;
 *  - POST   : corps = archive .zip brute → installée (ou remplacée), modèle
 *             de réglages copié s'il manque, puis reconstruction ;
 *  - DELETE : `?id=<id>` → retirée, puis reconstruction.
 * Reconstruction en échec = état d'avant remis (`publishChange`).
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../lib/admin-publish';
import { readExtensionsSource, saveExtension } from '../../../lib/plugin-writer';
import { installExtension, removeExtension } from '../../../lib/extension-writer';
import { canPublish, readStatus } from '../../../lib/site-build';
import { siteRoot } from '../../../lib/news-writer';
import { listerExtensions, TAILLE_MAX, versionCms } from '../../../../scripts/extension.mjs';

export const prerender = false;

const STATUS_RECALL_MS = 24 * 60 * 60 * 1000;

export const GET: APIRoute = withErrors(async () => {
	const status = await readStatus();
	const finished = status.finishedAt ? Date.parse(status.finishedAt) : 0;
	const recent = status.state === 'running' || status.state === 'idle' || Date.now() - finished < STATUS_RECALL_MS;
	const invalides = (listerExtensions(siteRoot()) as { id: string; erreurs: string[] }[])
		.filter((e) => e.erreurs.length)
		.map((e) => ({ id: e.id, erreurs: e.erreurs }));
	return json({
		extensions: await readExtensionsSource(),
		invalides,
		versionCms: versionCms(siteRoot()),
		status: recent ? status : { state: 'idle' },
		availability: await canPublish(),
	});
});

export const PUT: APIRoute = withErrors(async ({ request, locals }) => {
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = (await readJson(request)) ?? {};
	const result = await saveExtension(body.id, body.actif, body.valeurs);
	if (!result.applied) return jsonError(result.errors.join(' '), 422);
	return publishChange({
		request,
		user: locals.user!,
		action: 'extension.modification',
		subject: result.label,
		label: result.label,
		applied: result.applied,
	});
});

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	if (Number(request.headers.get('content-length') ?? 0) > TAILLE_MAX) return jsonError('Archive trop volumineuse.', 413);
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const zip = new Uint8Array(await request.arrayBuffer());
	if (!zip.length) return jsonError('Fichier vide.');
	let result;
	try {
		result = await installExtension(zip);
	} catch (err) {
		return jsonError((err as Error).message, 422);
	}
	const { fiche, precedente } = result;
	const label = `Extension « ${fiche.label} » ${fiche.version} ${precedente ? `installée (remplace la ${precedente})` : 'installée'}`;
	return publishChange({
		request,
		user: locals.user!,
		action: 'extension.installation',
		subject: label,
		label,
		applied: result.applied,
	});
});

export const DELETE: APIRoute = withErrors(async ({ request, locals, url }) => {
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const id = url.searchParams.get('id') ?? '';
	let result;
	try {
		result = removeExtension(id);
	} catch (err) {
		return jsonError((err as Error).message, 422);
	}
	const label = `Extension « ${result.fiche?.label ?? id} » supprimée`;
	return publishChange({
		request,
		user: locals.user!,
		action: 'extension.suppression',
		subject: label,
		label,
		applied: result.applied,
	});
});
