/**
 * Extensions (`extensions/<id>/`, cf. `src/lib/extensions.ts`) côté config
 * Astro : chargées une fois par `astro.config.mjs` (`chargerExtensions()`),
 * qui en déclare les variables d'environnement (`env` de leur
 * `manifest.ts`) ; l'intégration ajoute les routes des extensions actives
 * (`extensions: { <id>: false }` de `reglages.yaml` = inactive, aucune
 * route) et surveille leurs fichiers de réglages en dev.
 *
 * Une extension invalide (fiche, nom de dossier, version du CMS trop
 * ancienne) fait échouer la construction avec un message clair : le site en
 * ligne reste celui d'avant.
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import type { AstroIntegration } from 'astro';
import type { envField } from 'astro/config';
import { parse as parseYaml } from 'yaml';
import { listerExtensions } from '../../scripts/extension.mjs';

/** `manifest.ts` d'une extension (export par défaut), facultatif. */
export interface ExtensionManifest {
	/**
	 * Routes ajoutées si l'extension est active ; `entrypoint` relatif au
	 * dossier de l'extension. `root` = racine du site (pour lire une adresse
	 * dans un fichier de `src/content/`).
	 */
	routes?: (root: URL) => { pattern: string; entrypoint: string }[];
	/** Variables d'environnement, déclarées que l'extension soit active ou non. Toutes facultatives. */
	env?: Record<string, ReturnType<typeof envField.string>>;
	/** Fichiers de `src/content/` dont dépendent ses routes (ex. `rdv.yaml`) : relance du serveur de dev. */
	surveiller?: string[];
}

export interface ExtensionChargee {
	id: string;
	dossier: string;
	manifeste: ExtensionManifest;
}

/** Extensions installées et leurs manifestes ; erreur claire si l'une est invalide. */
export async function chargerExtensions(root: URL): Promise<ExtensionChargee[]> {
	const racine = fileURLToPath(root);
	const liste: { id: string; dossier: string; erreurs: string[] }[] = listerExtensions(racine);
	const invalides = liste.filter((e) => e.erreurs.length);
	if (invalides.length) {
		throw new Error(
			`Extension(s) invalide(s) dans extensions/ :\n${invalides.map((e) => `  - ${e.id} : ${e.erreurs.join(' ')}`).join('\n')}\n` +
				'Corrigez-la(les) ou retirez le dossier (npm run extension -- supprimer <id>).',
		);
	}
	const chargees: ExtensionChargee[] = [];
	for (const e of liste) {
		const fichier = join(e.dossier, 'manifest.ts');
		const manifeste: ExtensionManifest = existsSync(fichier) ? ((await import(/* @vite-ignore */ pathToFileURL(fichier).href)).default ?? {}) : {};
		chargees.push({ id: e.id, dossier: e.dossier, manifeste });
	}
	return chargees;
}

/** Variables d'environnement de toutes les extensions installées. */
export function envExtensions(extensions: ExtensionChargee[]): Record<string, ReturnType<typeof envField.string>> {
	return Object.assign({}, ...extensions.map((e) => e.manifeste.env ?? {}));
}

function desactivees(reglages: URL): Set<string> {
	try {
		const lu = parseYaml(readFileSync(reglages, 'utf8'))?.extensions;
		return new Set(Object.entries(lu ?? {}).filter(([, v]) => v === false).map(([k]) => k));
	} catch {
		return new Set();
	}
}

export default function extensions(chargees: ExtensionChargee[]): AstroIntegration {
	return {
		name: 'numerik:extensions',
		hooks: {
			'astro:config:setup': ({ config, injectRoute, addWatchFile, logger }) => {
				const reglages = new URL('src/content/reglages.yaml', config.root);
				const off = desactivees(reglages);
				for (const e of chargees) {
					for (const f of e.manifeste.surveiller ?? []) addWatchFile(new URL(`src/content/${f}`, config.root));
					if (off.has(e.id)) {
						logger.info(`Extension désactivée : ${e.id}`);
						continue;
					}
					for (const r of e.manifeste.routes?.(config.root) ?? []) {
						injectRoute({ pattern: r.pattern, entrypoint: join(e.dossier, r.entrypoint) });
					}
					logger.info(`Extension active : ${e.id}`);
				}
			},
		},
	};
}
