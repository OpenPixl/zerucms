/**
 * Photos des blocs des pages enrichies (blocs « Photos » et « Carrousel »,
 * `src/lib/blocs.ts`) : fichiers `photo_<n>.<ext>` rangés dans le
 * dossier de la page (`src/content/pages/<chemin>/`), à côté de `cover.jpg`,
 * écrits par `src/lib/page-writer.ts` (n = numéro suivant le plus grand du
 * dossier). Retrouvés par `import.meta.glob` pour
 * passer par l'optimisation d'images d'Astro (`<Image>`, `getImage`).
 *
 * Code Astro (build et routes serveur), pas pour l'îlot Vue.
 */
import type { ImageMetadata } from 'astro';

const fichiers = import.meta.glob<ImageMetadata>('../content/pages/**/photo_*.{jpg,jpeg,png,webp}', {
	eager: true,
	import: 'default',
});

/**
 * Image d'un champ `photo` (`./photo_1.jpg`) de la page `chemin`
 * (identifiant de la collection `pages`, ex. `association/qui-sommes-nous`) ;
 * `undefined` si le fichier manque (bloc rendu sans cette photo).
 */
export function blocImage(chemin: string, photo: string): ImageMetadata | undefined {
	return fichiers[`../content/pages/${chemin}/${photo.replace(/^\.\//, '')}`];
}
