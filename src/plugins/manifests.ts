/**
 * Manifestes des plugins : ce que la config Astro doit connaître avant la
 * construction (routes à ajouter, variables d'environnement). Chargé par
 * `astro.config.mjs` : uniquement des imports sûrs côté config (pas de
 * `?raw`, pas d'`astro:*`).
 */
import type { envField } from 'astro/config';
import type { PluginId } from './catalogue';
import adhesion from './adhesion/plugin';
import inscription from './inscription/plugin';
import facturation from './facturation/plugin';

export interface PluginManifest {
	id: PluginId;
	/**
	 * Routes ajoutées si le plugin est actif ; `entrypoint` relatif à la racine
	 * du projet. Fonction de la racine : une adresse peut venir d'un fichier
	 * de l'association (lu sans `?raw`, la config Astro ne le charge pas).
	 */
	routes: (root: URL) => { pattern: string; entrypoint: string }[];
	/**
	 * Variables d'environnement du plugin, déclarées qu'il soit actif ou non
	 * (son code est toujours vérifié par `astro check`). Toutes facultatives.
	 */
	env: Record<string, ReturnType<typeof envField.string>>;
}

export const PLUGIN_MANIFESTS: PluginManifest[] = [adhesion, inscription, facturation];
