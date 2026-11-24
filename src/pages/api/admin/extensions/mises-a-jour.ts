/**
 * Mises à jour des extensions (module « Extensions », super admin : garde
 * `/api/admin/extensions` de `src/middleware.ts`) — `src/lib/extension-versions.ts` :
 *  - GET (`?rafraichir=1` pour ignorer le cache) : dernière version publiée
 *    de chaque extension qui déclare son dépôt ;
 *  - POST `{ id }` : archive de la dernière version téléchargée puis
 *    installée comme un dépôt à la main, site reconstruit (retour arrière si
 *    la construction échoue), journal `extension.mise-a-jour`.
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { publishBlocked, publishChange } from '../../../../lib/admin-publish';
import { misesAJourExtensions, telechargerMiseAJour } from '../../../../lib/extension-versions';
import { installExtension } from '../../../../lib/extension-writer';
import { siteRoot } from '../../../../lib/news-writer';
import { lireArchive } from '../../../../../scripts/extension.mjs';

export const prerender = false;

export const GET: APIRoute = withErrors(async ({ url }) =>
	json({ misesAJour: await misesAJourExtensions({ rafraichir: url.searchParams.has('rafraichir') }) }),
);

export const POST: APIRoute = withErrors(async ({ request, locals }) => {
	const blocked = await publishBlocked(request);
	if (blocked) return blocked;
	const body = (await readJson(request)) ?? {};
	let telecharge;
	let result;
	try {
		telecharge = await telechargerMiseAJour(body.id);
		// L'archive doit bien être celle de cette extension.
		const { fiche } = lireArchive(telecharge.zip, siteRoot());
		if (fiche.id !== body.id) throw new Error(`L'archive publiée est celle de « ${fiche.id} », pas de « ${body.id} » : mise à jour annulée.`);
		result = await installExtension(telecharge.zip);
	} catch (err) {
		return jsonError((err as Error).message, 422);
	}
	const label = `Extension « ${result.fiche.label} » mise à jour : ${telecharge.precedente} → ${result.fiche.version}`;
	return publishChange({
		request,
		user: locals.user!,
		action: 'extension.mise-a-jour',
		subject: label,
		label,
		applied: result.applied,
	});
});
