/**
 * Manifeste du plugin adhésion (lu par la config Astro, cf. `../manifests.ts`).
 * Le reste du plugin : `README.md` de ce dossier.
 */
import { envField } from 'astro/config';
import type { PluginManifest } from '../manifests';

const route = (pattern: string, fichier: string) => ({ pattern, entrypoint: `src/plugins/adhesion/${fichier}` });

/**
 * Routes `/api/adhesion/<nom>` : un fichier `api/<nom>.ts` chacune. `membre`
 * et `inscription` servent aussi au plugin inscription (qui requiert celui-ci).
 */
const API = [
	'activites',
	'adresse',
	'bulletin',
	'co-membre',
	'contact',
	'cotisation',
	'cotisations',
	'detacher-membre',
	'inscription',
	'membre',
	'membres',
	'preferences',
];

export default {
	id: 'adhesion',
	routes: () => [
		route('/adherer', 'pages/adherer.astro'),
		route('/adherer/formulaire', 'pages/formulaire.astro'),
		route('/je-participe', 'pages/je-participe.astro'),
		...API.map((nom) => route(`/api/adhesion/${nom}`, `api/${nom}.ts`)),
		route('/api/presence/inscrire', 'api/presence/inscrire.ts'),
		route('/api/presence/seances', 'api/presence/seances.ts'),
	],
	env: {
		// Grist — document de l'adhésion (GRIST_BASE_URL / GRIST_API_KEY, partagés
		// avec les autres plugins et les extensions, sont déclarés dans astro.config.mjs).
		GRIST_DOC_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
		GRIST_TABLE_MEMBRES: envField.string({ context: 'server', access: 'secret', default: 'Membres' }),
		GRIST_TABLE_ADHESIONS: envField.string({ context: 'server', access: 'secret', default: 'Adhesions' }),
		GRIST_TABLE_INSCRIPTIONS: envField.string({ context: 'server', access: 'secret', default: 'Inscription' }),
		GRIST_TABLE_COTISATIONS: envField.string({ context: 'server', access: 'secret', default: 'Cotisation' }),
		GRIST_TABLE_ACTIVITES: envField.string({ context: 'server', access: 'secret', default: 'Activite' }),
		GRIST_TABLE_SAISONS: envField.string({ context: 'server', access: 'secret', default: 'Saisons' }),
		GRIST_TABLE_PRESENCE: envField.string({ context: 'server', access: 'secret', default: 'Presence' }),
		// Lien signé du bulletin d'adhésion PDF (docs/bulletin-pdf.md).
		BULLETIN_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
	},
} satisfies PluginManifest;
