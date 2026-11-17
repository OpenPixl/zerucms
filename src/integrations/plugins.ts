/**
 * Plugins (`src/plugins/`) : ajoute les routes des plugins actifs
 * (`plugins:` de `src/content/reglages.yaml`, sinon `actifParDefaut` du
 * catalogue). Un plugin inactif n'a aucune
 * route : ses pages et ses API répondent 404 ; de même pour celles d'un
 * outil éteint (`outils:`).
 *
 * Lit `reglages.yaml` directement (la config Astro ne charge pas `?raw`) ;
 * sa validation complète reste celle de `src/config/site.ts`, au build.
 * Fichier surveillé (`reglages.yaml`) : en dev, le modifier relance le
 * serveur.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { parse as parseYaml } from 'yaml';
import { resoudreOutils, resoudrePlugins } from '../plugins/catalogue';
import { PLUGIN_MANIFESTS } from '../plugins/manifests';
import { estStructure, type Structure } from '../lib/structure';

function lireReglages(file: URL): { plugins: Record<string, unknown>; outils: Record<string, unknown>; structure: Structure } {
	try {
		const r = parseYaml(readFileSync(file, 'utf8'));
		return { plugins: r?.plugins ?? {}, outils: r?.outils ?? {}, structure: estStructure(r?.structure) ? r.structure : 'association' };
	} catch {
		return { plugins: {}, outils: {}, structure: 'association' };
	}
}

export default function plugins(): AstroIntegration {
	return {
		name: 'numerik:plugins',
		hooks: {
			'astro:config:setup': ({ config, injectRoute, addWatchFile, logger }) => {
				const reglages = new URL('src/content/reglages.yaml', config.root);
				addWatchFile(reglages);
				const lus = lireReglages(reglages);
				const actifs = resoudrePlugins(lus.plugins, lus.structure);
				const outils = resoudreOutils(lus.plugins, lus.outils, actifs);
				// Route commune à plusieurs plugins actifs (src/lib/grist-asso/) : ajoutée une fois.
				const ajoutees = new Set<string>();
				for (const plugin of PLUGIN_MANIFESTS) {
					// Écrit dans reglages.yaml, sinon défaut du catalogue ; plugins requis actifs.
					if (!actifs[plugin.id]) continue;
					for (const r of plugin.routes(config.root)) {
						if ((r.outil && !outils[plugin.id][r.outil]) || ajoutees.has(r.pattern)) continue;
						ajoutees.add(r.pattern);
						injectRoute({ pattern: r.pattern, entrypoint: fileURLToPath(new URL(r.entrypoint, config.root)) });
					}
					const eteints = Object.keys(outils[plugin.id]).filter((o) => !outils[plugin.id][o]);
					logger.info(`Plugin actif : ${plugin.id}${eteints.length ? ` (outils éteints : ${eteints.join(', ')})` : ''}`);
				}
			},
		},
	};
}
