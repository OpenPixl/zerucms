/**
 * Photos des blocs d'une page enrichie (blocs « Photos », « Carrousel »)
 * dans le formulaire du module « Pages ».
 *
 * Une photo choisie reste dans le navigateur jusqu'à l'enregistrement : le
 * champ vaut `nouvelle:<clé>` (`BLOC_PHOTO_NOUVELLE`), le fichier part avec
 * la page (`PageInput.photos`) et le serveur le range dans le dossier de la
 * page (`./photo_<n>.jpg`, `src/lib/page-writer.ts`). Avant l'envoi,
 * la photo est réduite (2000 px au plus, JPEG) : envoi plus léger, plusieurs
 * photos d'un coup restent raisonnables.
 *
 * `fournirBlocPhotos()` dans le formulaire (`PageForm.vue`),
 * `useBlocPhotos()` dans les champs (`BlocFields.vue`, `BlocsEditor.vue`).
 */
import { inject, provide, shallowReactive, type InjectionKey } from 'vue';
import { BLOC_PHOTO_NOUVELLE, type Bloc } from '../../../../lib/blocs';
import { fileToBase64 } from '../../context';

export interface BlocPhotos {
	/** Adresse d'aperçu d'une valeur de champ `photo` (nouvelle ou déjà publiée), `null` sinon. */
	apercu(valeur: string): string | null;
	/** Prépare une photo choisie ; renvoie la valeur du champ (`nouvelle:<clé>`). Erreur = message à afficher. */
	choisir(file: File): Promise<string>;
}

const CLE: InjectionKey<BlocPhotos> = Symbol('bloc-photos');

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const COTE_MAX = 2000;
const POIDS_MAX = 10 * 1024 * 1024;

/** Photo réduite à 2000 px (orientation EXIF appliquée, métadonnées perdues) ; l'originale si le navigateur ne sait pas. */
async function reduire(file: File): Promise<Blob> {
	try {
		const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * echelle);
		canvas.height = Math.round(bitmap.height * echelle);
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
		return blob ?? file;
	} catch {
		return file;
	}
}

/** Valeurs `nouvelle:<clé>` citées par les blocs (champs et éléments). */
function nouvellesCitees(blocs: Record<string, Bloc>): Set<string> {
	const citees = new Set<string>();
	const voir = (v: unknown) => {
		if (typeof v === 'string' && BLOC_PHOTO_NOUVELLE.test(v)) citees.add(v);
	};
	for (const bloc of Object.values(blocs)) {
		Object.values(bloc).forEach(voir);
		for (const item of bloc.items ?? []) Object.values(item).forEach(voir);
	}
	return citees;
}

export function fournirBlocPhotos(apercus: Record<string, string> = {}) {
	const attente = shallowReactive(new Map<string, { blob: Blob; url: string }>());
	let compteur = 0;

	const api: BlocPhotos = {
		apercu: (valeur) => attente.get(valeur)?.url ?? apercus[valeur] ?? null,
		async choisir(file) {
			if (!TYPES.includes(file.type)) throw new Error(`« ${file.name} » : formats acceptés JPEG, PNG ou WebP.`);
			const blob = await reduire(file);
			if (blob.size > POIDS_MAX) throw new Error(`« ${file.name} » est trop lourde (10 Mo max).`);
			const valeur = `nouvelle:${Date.now().toString(36)}${(compteur++).toString(36)}`;
			attente.set(valeur, { blob, url: URL.createObjectURL(blob) });
			return valeur;
		},
	};
	provide(CLE, api);

	return {
		/** Photos à envoyer avec la page : seulement celles encore citées par un bloc. */
		async envoi(blocs: Record<string, Bloc>): Promise<Record<string, { type: string; data: string }>> {
			const photos: Record<string, { type: string; data: string }> = {};
			for (const valeur of nouvellesCitees(blocs)) {
				const photo = attente.get(valeur);
				if (!photo) continue;
				const file = new File([photo.blob], 'photo', { type: photo.blob.type || 'image/jpeg' });
				photos[valeur.slice('nouvelle:'.length)] = { type: file.type, data: await fileToBase64(file) };
			}
			return photos;
		},
		liberer() {
			for (const { url } of attente.values()) URL.revokeObjectURL(url);
			attente.clear();
		},
	};
}

export function useBlocPhotos(): BlocPhotos | null {
	return inject(CLE, null);
}
