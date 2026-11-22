/**
 * Photos des blocs (« Photos », « Carrousel », `src/lib/blocs.ts`) des pages,
 * actualités et activités : fichiers `photo_<n>.<ext>` rangés dans le dossier
 * du contenu (`src/content/<pages|news|activites>/<id>/`), à côté de
 * `cover.jpg`, écrits par `src/lib/bloc-writer.ts`. Retrouvés par
 * `import.meta.glob` pour passer par l'optimisation d'images d'Astro
 * (`<Image>`, `getImage`).
 *
 * Code Astro (build et routes serveur), pas pour l'îlot Vue.
 */
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import { blocPhotos, type Bloc } from './blocs';

const fichiers = import.meta.glob<ImageMetadata>(
	[
		'../content/pages/**/photo_*.{jpg,jpeg,png,webp}',
		'../content/news/*/photo_*.{jpg,jpeg,png,webp}',
		'../content/activites/*/photo_*.{jpg,jpeg,png,webp}',
	],
	{ eager: true, import: 'default' },
);

/**
 * Image d'un champ `photo` (`./photo_1.jpg`) du contenu rangé dans `dossier`
 * (relatif à `src/content/` : `pages/association/qui-sommes-nous`,
 * `news/2026-11-18-sortie`, `activites/atelier-photo`) ; `undefined` si le
 * fichier manque (bloc rendu sans cette photo).
 */
export function blocImage(dossier: string, photo: string): ImageMetadata | undefined {
	return fichiers[`../content/${dossier}/${photo.replace(/^\.\//, '')}`];
}

/**
 * Vignettes des photos des blocs déjà publiées (module de l'Espace Admin :
 * `blocPhotoUrls` des routes GET d'un contenu), par valeur de champ
 * (`./photo_1.jpg`). Une photo pas encore publiée n'en a pas.
 */
export async function blocPhotoUrls(dossier: string, blocs: Record<string, unknown>): Promise<Record<string, string>> {
	const urls: Record<string, string> = {};
	for (const bloc of Object.values(blocs)) {
		if (!bloc || typeof bloc !== 'object') continue;
		for (const photo of blocPhotos(bloc as Bloc)) {
			const image = blocImage(dossier, photo);
			if (image && !urls[photo]) urls[photo] = (await getImage({ src: image, width: 320, height: 200, fit: 'cover' })).src;
		}
	}
	return urls;
}
