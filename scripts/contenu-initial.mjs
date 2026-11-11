/**
 * Contenu de démonstration d'un nouveau site : `src/modeles/association/`
 * (dans le modèle) est copié dans `src/content/` quand celui-ci n'a pas encore
 * d'`association.yaml` — nouvelle installation, dépôt fraîchement cloné, CI.
 * Un site déjà en place n'est jamais touché (son `association.yaml` existe) ;
 * un fichier déjà présent dans `src/content/` n'est jamais écrasé.
 *
 * Lancé par `npm install` / `npm ci` (`postinstall` : développement, CI) et
 * par `scripts/start.mjs` (production, Docker ou Node seul) avant le calcul de
 * l'empreinte ; aussi `npm run contenu:init`. Pas depuis `astro.config.mjs` :
 * Vite y lit déjà `reglages.yaml` en préparant la config. Le contenu propre
 * à chaque association n'est jamais dans le dépôt (`.gitignore`).
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Modèles de contenu fournis par le modèle, un dossier par type de structure
 * (`association` = contenu de démonstration complet, `entreprise` = fichiers
 * qui le remplacent ou le complètent, cf. son README). Jamais lus par Astro :
 * seul `src/content/` est le contenu du site.
 */
export const MODELES_DIR = join('src', 'modeles');
/** Dossier d'un modèle de contenu (`association`, `entreprise`). */
export const dossierModele = (root, nom) => join(root, MODELES_DIR, nom);

/** Copie le contenu de démonstration si besoin ; rend `true` s'il a été installé. */
export function installerContenuInitial(root) {
	const content = join(root, 'src', 'content');
	const source = dossierModele(root, 'association');
	if (existsSync(join(content, 'association.yaml')) || !existsSync(source)) return false;
	mkdirSync(content, { recursive: true });
	cpSync(source, content, { recursive: true, force: false, errorOnExist: false });
	console.log(
		'[contenu] src/content/ sans association.yaml : contenu de démonstration installé (src/modeles/association/). ' +
			"À personnaliser depuis l'Espace Admin.",
	);
	return true;
}

// Lancé directement (`node scripts/contenu-initial.mjs`, postinstall) : dans le dossier courant.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	installerContenuInitial(resolve(process.env.SITE_ROOT || process.cwd()));
}
