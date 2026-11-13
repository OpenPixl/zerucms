/**
 * Plugins (`src/plugins/`) : ajoute les routes des plugins actifs
 * (`plugins:` de `src/content/reglages.yaml`, sinon `actifParDefaut` du
 * catalogue). Un plugin inactif n'a aucune
 * route : ses pages et ses API répondent 404.
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
import { resoudrePlugins } from '../plugins/catalogue';
import { PLUGIN_MANIFESTS } from '../plugins/manifests';
import { estStructure, type Structure } from '../lib/structure';

function lireReglages(file: URL): { plugins: Record<string, unknown>; structure: Structure } {
	try {
		const r = parseYaml(readFileSync(file, 'utf8'));
		return { plugins: r?.plugins ?? {}, structure: estStructure(r?.structure) ? r.structure : 'association' };
	} catch {
		return { plugins: {}, structure: 'association' };
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
				for (const plugin of PLUGIN_MANIFESTS) {
					// Écrit dans reglages.yaml, sinon défaut du catalogue ; plugins requis actifs.
					if (!actifs[plugin.id]) continue;
					for (const r of plugin.routes(config.root)) {
						injectRoute({ pattern: r.pattern, entrypoint: fileURLToPath(new URL(r.entrypoint, config.root)) });
					}
					logger.info(`Plugin actif : ${plugin.id}`);
				}
			},
		},
	};
}
