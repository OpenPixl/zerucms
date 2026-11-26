/**
 * Images propres à chaque association, dans `src/content/images/` (dossier de
 * l'association, jamais remplacé par une mise à jour du modèle) :
 *
 * - `logo.(png|jpg|jpeg|webp|svg)` — obligatoire : en-tête et pied de page ;
 * - `logo-sombre.(png|jpg|jpeg|webp|svg)` — facultatif : logo de l'en-tête
 *   en mode sombre (`src/lib/mode-sombre.ts`), absent = logo normal ;
 * - `accueil.(jpg|jpeg|png|webp)` — facultatif : fond du bandeau d'accueil
 *   (réglé depuis le module « Bandeau » de l'accueil, `home-photo.ts`) ;
 * - `presentation.(jpg|jpeg|png|webp|svg)` — facultatif : illustration du
 *   module « Présentation » de l'accueil (réglée depuis ce module, `home-photo.ts`) ;
 * - `favicon.(svg|png|ico)` — facultatif, un ou plusieurs formats : icône
 *   de l'onglet (une balise `<link rel="icon">` par fichier trouvé).
 *
 * Retrouvées par `import.meta.glob` (extension libre, suivi par Vite : un
 * fichier remplacé est repris en dev) ; deux fichiers pour la même image ou
 * logo absent = build en échec avec un message clair.
 */

import type { ImageMetadata } from 'astro';

type ImageModules = Record<string, { default: ImageMetadata }>;

const logos: ImageModules = import.meta.glob('../content/images/logo.{png,jpg,jpeg,webp,svg}', { eager: true });
const logosSombres: ImageModules = import.meta.glob('../content/images/logo-sombre.{png,jpg,jpeg,webp,svg}', { eager: true });
const accueils: ImageModules = import.meta.glob('../content/images/accueil.{jpg,jpeg,png,webp}', { eager: true });
const presentations: ImageModules = import.meta.glob('../content/images/presentation.{png,jpg,jpeg,webp,svg}', { eager: true });
const faviconFiles: Record<string, string> = import.meta.glob('../content/images/favicon.{svg,png,ico}', {
	eager: true,
	query: '?url',
	import: 'default',
});

function single(modules: ImageModules, name: string, required: boolean): ImageMetadata | undefined {
	const files = Object.keys(modules);
	if (files.length > 1) {
		throw new Error(`src/content/images : un seul fichier ${name}.* attendu, trouvé ${files.map((f) => f.split('/').pop()).join(', ')}.`);
	}
	if (files.length === 0) {
		if (required) throw new Error(`src/content/images : ${name}.png (ou .jpg, .webp, .svg) manquant.`);
		return undefined;
	}
	return modules[files[0]].default;
}

/** Logo de l'association (en-tête, pied de page). */
export const logo = single(logos, 'logo', true)!;

/** Logo de l'en-tête en mode sombre (charte graphique), facultatif. */
export const logoSombre = single(logosSombres, 'logo-sombre', false);

/**
 * Largeur du logo pour une hauteur donnée, d'après ses proportions réelles :
 * un logo carré, large ou haut n'est ni rogné ni déformé.
 */
export function logoWidth(height: number, image: ImageMetadata = logo): number {
	return Math.round((height * image.width) / image.height);
}

/** Photo de fond du bandeau d'accueil ; absente = bandeau sans photo. */
export const accueilImage = single(accueils, 'accueil', false);

/** Illustration du module « Présentation » de l'accueil ; absente = module sans illustration propre. */
export const presentationImage = single(presentations, 'presentation', false);

// ICO sans `type` : le navigateur reconnaît le contenu lui-même.
const FAVICON_TYPES: Record<string, string | undefined> = { svg: 'image/svg+xml', png: 'image/png', ico: undefined };
/** Ordre : SVG d'abord (préféré par les navigateurs récents), puis PNG, puis ICO. */
const FAVICON_ORDER = ['svg', 'png', 'ico'];

/** Icônes d'onglet trouvées, pour les `<link rel="icon">` des layouts. */
export const favicons: { href: string; type?: string }[] = Object.entries(faviconFiles)
	.map(([file, href]) => ({ ext: file.split('.').pop()!, href }))
	.sort((a, b) => FAVICON_ORDER.indexOf(a.ext) - FAVICON_ORDER.indexOf(b.ext))
	.map(({ ext, href }) => ({ href, type: FAVICON_TYPES[ext] }));
