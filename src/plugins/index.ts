/**
 * Registre des plugins actifs, lu dans `site.plugins` (réglages de
 * l'association). Utilisable côté serveur, au build et dans le navigateur.
 *
 * Les routes d'un plugin inactif ne sont pas construites du tout
 * (`src/integrations/plugins.ts`) ; le reste du site interroge
 * `pluginActif()` / `disponible()` pour masquer ce que le plugin y ajoute
 * (module d'accueil, bloc de page, liens, plan du site…).
 */
import { site } from '../config/site';
import { extensionActive } from '../lib/extensions';
import type { PluginId } from './catalogue';

export type { PluginId } from './catalogue';

export function pluginActif(id: PluginId): boolean {
	return site.plugins[id];
}

/**
 * Élément d'un catalogue (module d'accueil, bloc, module d'admin…) : visible
 * si le plugin ou l'extension qui l'apporte, s'il y en a un, est actif.
 */
export function disponible(def: { plugin?: PluginId; extension?: string }): boolean {
	return (!def.plugin || pluginActif(def.plugin)) && (!def.extension || extensionActive(def.extension));
}
