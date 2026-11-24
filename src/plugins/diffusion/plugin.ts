/**
 * Manifeste du plugin diffusion (lu par la config Astro, cf. `../manifests.ts`).
 * Le reste du plugin : `README.md` de ce dossier. Pas de variable d'environnement :
 * la connexion à Facebook est dans `<DATA_DIR>/connexions/diffusion.yaml`
 * (`connexion` du catalogue, `src/lib/connexions.ts`).
 */
import type { PluginManifest } from '../manifests';

const route = (pattern: string, fichier: string, outil?: string) => ({
	pattern,
	entrypoint: `src/plugins/diffusion/${fichier}`,
	...(outil ? { outil } : {}),
});

export default {
	id: 'diffusion',
	routes: () => [
		// Garde `redacteur` : src/middleware.ts.
		route('/api/admin/diffusion', 'api/index.ts'),
		route('/api/admin/diffusion/facebook', 'api/facebook.ts', 'facebook'),
	],
	env: {},
} satisfies PluginManifest;
