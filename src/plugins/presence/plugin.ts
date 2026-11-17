/**
 * Manifeste du plugin présence (lu par la config Astro, cf. `../manifests.ts`).
 * Le reste du plugin : `README.md` de ce dossier.
 */
import type { PluginManifest } from '../manifests';
import { ENV_GRIST_ASSO, routesGristAsso } from '../../lib/grist-asso/manifeste';

const route = (pattern: string, fichier: string) => ({ pattern, entrypoint: `src/plugins/presence/${fichier}` });

export default {
	id: 'presence',
	routes: () => [
		route('/je-participe', 'pages/je-participe.astro'),
		route('/api/presence/inscrire', 'api/inscrire.ts'),
		route('/api/presence/seances', 'api/seances.ts'),
		// Route commune : retrouver son nom dans la liste des membres.
		...routesGristAsso('membres'),
	],
	env: ENV_GRIST_ASSO,
} satisfies PluginManifest;
