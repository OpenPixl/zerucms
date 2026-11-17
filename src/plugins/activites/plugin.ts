/**
 * Manifeste du plugin activités (lu par la config Astro, cf. `../manifests.ts`).
 * Le reste du plugin : `README.md` de ce dossier.
 */
import type { PluginManifest } from '../manifests';
import { ENV_GRIST_ASSO, routesGristAsso } from '../../lib/grist-asso/manifeste';

/** Route du plugin ; `outil` = seulement si cet outil est allumé (`outils` du catalogue). */
const route = (pattern: string, fichier: string, outil?: string) => ({ pattern, entrypoint: `src/plugins/activites/${fichier}`, outil });

export default {
	id: 'activites',
	// Outil « planning » : aucune route (calendrier de /activites, page du site).
	routes: () => [
		route('/inscription', 'pages/inscription.astro', 'inscription'),
		...['offre', 'preinscription', 'participant-exterieur'].map((nom) => route(`/api/inscription/${nom}`, `api/${nom}.ts`, 'inscription')),
		// Routes communes du formulaire d'inscription (retrouver l'adhérent·e, inscrire).
		...routesGristAsso('membre', 'inscription').map((r) => ({ ...r, outil: 'inscription' })),
	],
	env: ENV_GRIST_ASSO,
} satisfies PluginManifest;
