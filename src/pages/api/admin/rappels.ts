/**
 * Rappels de la barre d'admin (bureau et super admin ; liste vide pour les
 * autres) : connexions des plugins actifs à renouveler bientôt ou en panne
 * (jeton Facebook qui expire…), d'après `statut()` de chaque plugin
 * (`src/plugins/connexions.ts` ; état revérifié au plus une fois par jour).
 * `GET` → `{ rappels: [{ plugin, label, titre, niveau, message, echeance? }] }`.
 */
import type { APIRoute } from 'astro';
import { json, withErrors } from '../../../lib/auth/api';
import { hasAdminRights } from '../../../lib/auth/groups';
import { outilActif, pluginActif } from '../../../plugins';
import { PLUGIN_IDS, PLUGINS, type PluginInfo } from '../../../plugins/catalogue';
import { connexionPlugin } from '../../../plugins/connexions';

export const prerender = false;

export const GET: APIRoute = withErrors(async ({ locals }) => {
	if (!hasAdminRights(locals.user!.groups)) return json({ rappels: [] });
	const rappels = [];
	for (const id of PLUGIN_IDS) {
		if (!(PLUGINS[id] as PluginInfo).connexion || !pluginActif(id)) continue;
		const plugin = await connexionPlugin(id);
		const statuts = await plugin?.statut().catch(() => []) ?? [];
		for (const s of statuts) {
			if (s.niveau !== 'attention' && s.niveau !== 'erreur') continue;
			if (s.outil && !outilActif(id, s.outil)) continue;
			rappels.push({ plugin: id, label: PLUGINS[id].label, titre: s.titre, niveau: s.niveau, message: s.message, ...(s.echeance ? { echeance: s.echeance } : {}) });
		}
	}
	return json({ rappels });
});
