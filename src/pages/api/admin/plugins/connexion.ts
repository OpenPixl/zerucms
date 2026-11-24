/**
 * Connexion d'un plugin à un service extérieur (module « Plugins », super
 * admin seul : garde `/api/admin/plugins` de `src/middleware.ts`). Sans
 * reconstruction du site : le fichier `<DATA_DIR>/connexions/<id>.yaml` est
 * lu à chaque usage (`src/lib/connexions.ts`).
 *  - GET `?id=` : champs (renseignés ou non, jamais la valeur d'un champ
 *    masqué) + état vérifié (`statut()` du plugin) ;
 *  - PUT `{ id, valeurs }` : `valeurs` = clé → nouvelle valeur (vide =
 *    inchangée, `null` = effacée), puis vérification immédiate ;
 *  - POST `{ id }` : nouvelle vérification auprès du service.
 * Journal : `plugin.connexion` (champs changés, jamais leurs valeurs).
 */
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../../lib/auth/api';
import { champsConnexion, enregistrerConnexion, fichierConnexionAffiche, lireConnexion } from '../../../../lib/connexions';
import { logEvent } from '../../../../lib/journal';
import { PLUGINS, type PluginInfo } from '../../../../plugins/catalogue';
import { connexionPlugin, type StatutConnexion } from '../../../../plugins/connexions';

export const prerender = false;

function definition(id: unknown) {
	if (typeof id !== 'string' || !Object.hasOwn(PLUGINS, id)) return null;
	const info = PLUGINS[id as keyof typeof PLUGINS] as PluginInfo;
	return info.connexion ? { id, info, connexion: info.connexion } : null;
}

async function reponse(id: string, champs: NonNullable<PluginInfo['connexion']>['champs'], statut: StatutConnexion[]) {
	return json({ champs: champsConnexion(champs, await lireConnexion(id)), fichier: fichierConnexionAffiche(id), statut });
}

async function statutDe(id: string, verifier: boolean): Promise<StatutConnexion[]> {
	const plugin = await connexionPlugin(id);
	if (!plugin) return [];
	try {
		return await (verifier ? plugin.verifier() : plugin.statut());
	} catch (err) {
		return [{ titre: 'Connexion', niveau: 'erreur', message: (err as Error).message }];
	}
}

export const GET: APIRoute = withErrors(async ({ url }) => {
	const def = definition(url.searchParams.get('id'));
	if (!def) return jsonError('Ce plugin n’a pas de connexion.', 404);
	return reponse(def.id, def.connexion.champs, await statutDe(def.id, false));
});

export const PUT: APIRoute = withErrors(async ({ request, locals }) => {
	const body = (await readJson(request)) ?? {};
	const def = definition(body.id);
	if (!def) return jsonError('Ce plugin n’a pas de connexion.', 404);
	const { changes, errors } = await enregistrerConnexion(def.id, def.connexion.champs, body.valeurs);
	if (errors.length) return jsonError(errors.join(' '), 422);
	const statut = await statutDe(def.id, true);
	const probleme = statut.find((s) => s.niveau === 'erreur');
	await logEvent({
		by: locals.user!,
		action: 'plugin.connexion',
		label: `${def.info.label} — ${changes.join(', ')}`,
		outcome: probleme ? 'echec' : 'ok',
		...(probleme ? { message: probleme.message } : {}),
	});
	return reponse(def.id, def.connexion.champs, statut);
});

export const POST: APIRoute = withErrors(async ({ request }) => {
	const body = (await readJson(request)) ?? {};
	const def = definition(body.id);
	if (!def) return jsonError('Ce plugin n’a pas de connexion.', 404);
	return reponse(def.id, def.connexion.champs, await statutDe(def.id, true));
});
