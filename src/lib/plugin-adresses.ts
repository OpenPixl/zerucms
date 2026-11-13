/**
 * Adresses des pages publiques des plugins (`adresse` du catalogue,
 * `src/plugins/catalogue.ts`) et des extensions (`extension.json`), lues
 * dans les **sources** de `src/content/` (pas le site construit) : pour
 * qu'une page de contenu ne prenne pas l'adresse d'un plugin ou d'une
 * extension actifs (`page-writer.ts`) et que les modules « Plugins » et
 * « Extensions » affichent et modifient la bonne valeur (`plugin-writer.ts`).
 *
 * Code serveur uniquement.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseReglages } from '../config/site';
import { PLUGIN_IDS, PLUGINS, type PluginInfo } from '../plugins/catalogue';
import type { ExtensionInfo } from './extensions';
import { listerExtensions } from '../../scripts/extension.mjs';
import type { ChampPlugin } from '../plugins/champs';
import { siteRoot } from './news-writer';

export const contentDir = () => join(siteRoot(), 'src', 'content');

/** Plugin du catalogue ou extension installée : même fiche (`reglages`, `requis`, `env`…). */
export interface Volet {
	genre: 'plugin' | 'extension';
	id: string;
	info: PluginInfo | ExtensionInfo;
}

/** Extensions installées dans les sources (`extensions/`, fiche valide), relues à chaque appel : une installation compte aussitôt. */
export function extensionsSources(): { id: string; fiche: ExtensionInfo }[] {
	return (listerExtensions(siteRoot()) as { id: string; fiche: ExtensionInfo; erreurs: string[] }[])
		.filter((e) => !e.erreurs.length)
		.map((e) => ({ id: e.id, fiche: { ...e.fiche, id: e.id } }));
}

/** Champ « adresse de la page » d'un plugin ou d'une extension (`reglages.champs`, `type: 'adresse'`) et son fichier. */
export function champAdresse(info: PluginInfo | ExtensionInfo): { fichier: string; champ: ChampPlugin } | null {
	const champ = info.reglages?.champs.find((c) => c.type === 'adresse');
	return champ && info.reglages ? { fichier: info.reglages.fichier, champ } : null;
}

/** Valeur d'une clé à points (`grist.tables.rdv`) dans un objet YAML lu. */
export function valeurA(data: unknown, cle: string): unknown {
	return cle.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), data);
}

/** Adresse enregistrée (défaut de la fiche si le fichier ou la clé manque), `null` s'il n'en a pas. */
export async function adresseVolet(info: PluginInfo | ExtensionInfo): Promise<string | null> {
	const a = champAdresse(info);
	if (!a) return null;
	const defaut = a.champ.defaut ?? '';
	try {
		const valeur = valeurA(parseYaml(await readFile(join(contentDir(), a.fichier), 'utf8')), a.champ.cle);
		return typeof valeur === 'string' && valeur ? valeur : defaut;
	} catch {
		return defaut;
	}
}

/** Adresses des plugins et extensions actifs dans les sources (`reglages.yaml`), sauf `sauf`. */
export async function adressesPluginsActifs(sauf?: string): Promise<{ id: string; adresse: string }[]> {
	const { plugins, extensions } = parseReglages(await readFile(join(contentDir(), 'reglages.yaml'), 'utf8').catch(() => ''));
	const volets: Volet[] = [
		...PLUGIN_IDS.filter((id) => plugins[id]).map((id): Volet => ({ genre: 'plugin', id, info: PLUGINS[id] })),
		...extensionsSources()
			.filter((e) => extensions[e.id] !== false)
			.map((e): Volet => ({ genre: 'extension', id: e.id, info: e.fiche })),
	];
	const out: { id: string; adresse: string }[] = [];
	for (const v of volets) {
		if (v.id === sauf) continue;
		const adresse = await adresseVolet(v.info);
		if (adresse) out.push({ id: v.id, adresse });
	}
	return out;
}
