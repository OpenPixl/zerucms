/**
 * Manifeste du plugin adhésion (lu par la config Astro, cf. `../manifests.ts`).
 * Le reste du plugin : `README.md` de ce dossier.
 */
import { envField } from 'astro/config';
import type { PluginManifest } from '../manifests';
import { ENV_GRIST_ASSO, routesGristAsso } from '../../lib/grist-asso/manifeste';

const route = (pattern: string, fichier: string) => ({ pattern, entrypoint: `src/plugins/adhesion/${fichier}` });

/**
 * Routes `/api/adhesion/<nom>` du formulaire d'adhésion : un fichier
 * `api/<nom>.ts` chacune. `membre`, `membres` et `inscription` sont des
 * routes communes (src/lib/grist-asso/api/), partagées avec les plugins
 * activités et présence.
 */
const API = ['activites', 'adresse', 'bulletin', 'co-membre', 'contact', 'cotisation', 'cotisations', 'detacher-membre', 'preferences'];

export default {
	id: 'adhesion',
	routes: () => [
		route('/adherer', 'pages/adherer.astro'),
		route('/adherer/formulaire', 'pages/formulaire.astro'),
		...API.map((nom) => route(`/api/adhesion/${nom}`, `api/${nom}.ts`)),
		...routesGristAsso('membre', 'membres', 'inscription'),
	],
	env: {
		...ENV_GRIST_ASSO,
		// Lien signé du bulletin d'adhésion PDF (docs/bulletin-pdf.md).
		BULLETIN_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
	},
} satisfies PluginManifest;
