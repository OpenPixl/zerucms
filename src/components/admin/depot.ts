/**
 * Dépôt d'un contenu par fichiers (navigateur) : un fichier `.md` seul, un
 * `.md` accompagné de ses photos (sélection multiple, glisser-déposer), ou un
 * `.zip` qui les contient (préparé par un membre de l'association, ou
 * téléchargé depuis le formulaire). Les photos sont citées dans le `.md` par
 * leur nom de fichier (blocs « Photos », « Carrousel », `cover:`), retrouvées
 * par `trouverPhoto()`.
 *
 * Utilisé par « Ajouter un contenu » (`ContentImportModal.vue`), les dépôts
 * des modules (actualité, page) et « Charger un fichier modifié »
 * (`EditFileBar.vue`).
 */
import { unzipSync } from 'fflate';

export interface Depot {
	/** Le fichier `.md` du contenu. */
	markdown: File;
	/** Photos déposées avec lui (JPEG, PNG, WebP). */
	photos: File[];
	/** Fichiers ignorés (autres formats, second `.md`…), pour les remarques. */
	ignores: string[];
}

const MD = /\.(md|markdown)$/i;
const ZIP = /\.zip$/i;
const IMAGES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const ZIP_MAX = 60 * 1024 * 1024;
const DECOMPRESSE_MAX = 150 * 1024 * 1024;

/** Accept des champs de fichier d'un dépôt. */
export const DEPOT_ACCEPT = '.md,.markdown,text/markdown,.zip,application/zip,image/jpeg,image/png,image/webp';

const nomDe = (chemin: string) => chemin.split('/').pop() ?? chemin;
const extension = (nom: string) => nom.split('.').pop()?.toLowerCase() ?? '';

/** Fichiers d'une archive `.zip` (à plat : dossiers ignorés, fichiers cachés et `__MACOSX` écartés). */
async function deziper(zip: File): Promise<File[]> {
	if (zip.size > ZIP_MAX) throw new Error(`« ${zip.name} » est trop lourd (60 Mo max).`);
	let total = 0;
	let entrees: Record<string, Uint8Array>;
	try {
		entrees = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
			filter: (f) => {
				const nom = nomDe(f.name);
				if (f.name.endsWith('/') || f.name.startsWith('__MACOSX/') || nom.startsWith('.')) return false;
				total += f.originalSize;
				if (total > DECOMPRESSE_MAX) throw new Error(`« ${zip.name} » : contenu trop volumineux (150 Mo max une fois décompressé).`);
				return true;
			},
		});
	} catch (e) {
		throw new Error((e as Error).message.startsWith('«') ? (e as Error).message : `« ${zip.name} » n'est pas une archive .zip lisible.`);
	}
	return Object.entries(entrees).map(([chemin, data]) => {
		const nom = nomDe(chemin);
		return new File([data as BlobPart], nom, { type: IMAGES[extension(nom)] ?? (MD.test(nom) ? 'text/markdown' : '') });
	});
}

/** Lit les fichiers déposés (archives dépliées) : un seul `.md` exigé, photos à côté. */
export async function lireDepot(fichiers: File[]): Promise<{ depot?: Depot; error?: string }> {
	const tous: File[] = [];
	try {
		for (const f of fichiers) tous.push(...(ZIP.test(f.name) ? await deziper(f) : [f]));
	} catch (e) {
		return { error: (e as Error).message };
	}
	const markdowns = tous.filter((f) => MD.test(f.name));
	if (markdowns.length === 0) return { error: 'Aucun fichier .md parmi les fichiers déposés : le texte du contenu est un fichier Markdown (.md).' };
	if (markdowns.length > 1) return { error: `Un seul fichier .md à la fois (reçus : ${markdowns.map((f) => f.name).join(', ')}).` };
	const photos = tous.filter((f) => IMAGES[extension(f.name)]);
	const ignores = tous.filter((f) => f !== markdowns[0] && !photos.includes(f)).map((f) => f.name);
	return { depot: { markdown: markdowns[0], photos, ignores } };
}

/** Photo déposée citée par `nom` (`atelier-1.jpg`, `./photo_1.jpg`) ; majuscules indifférentes. */
export function trouverPhoto(depot: Depot | null | undefined, nom: string): File | undefined {
	const cherche = nomDe(nom.trim().replace(/^\.\//, '')).toLowerCase();
	return depot?.photos.find((f) => f.name.toLowerCase() === cherche);
}

/** Remarques de dépôt : fichiers ignorés et photos jamais citées par le `.md`. */
export function remarquesDepot(depot: Depot, citees: Set<File>): string[] {
	const remarques = depot.ignores.map((n) => `« ${n} » ignoré (ni .md ni photo JPEG, PNG ou WebP).`);
	const inutiles = depot.photos.filter((f) => !citees.has(f)).map((f) => f.name);
	if (inutiles.length) remarques.push(`Photo(s) non citée(s) dans le fichier, ignorée(s) : ${inutiles.join(', ')}.`);
	return remarques;
}

/**
 * Retrouve, pour la lecture des blocs d'un `.md` (`lireBlocsFichier`), les
 * photos déposées avec lui : chaque photo trouvée est confiée au formulaire
 * (`deposer`, cf. `modules/pages/bloc-photos.ts`) et notée dans `citees`.
 */
export function photosDuDepot(
	depot: Depot | null | undefined,
	formulaire: { deposer(file: File): string | null } | null,
	citees: Set<File>,
): (nom: string) => string | null {
	return (nom) => {
		const file = trouverPhoto(depot, nom);
		const valeur = file && formulaire ? formulaire.deposer(file) : null;
		if (valeur) citees.add(file!);
		return valeur;
	};
}
