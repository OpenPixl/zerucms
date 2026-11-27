/**
 * Photos des blocs (« Photos », « Carrousel ») et des sections (« L'équipe »,
 * « Bandeau défilant ») dans les formulaires de l'Espace Admin.
 *
 * Une photo choisie reste dans le navigateur jusqu'à l'enregistrement : le
 * champ vaut `nouvelle:<clé>` (`BLOC_PHOTO_NOUVELLE`), le fichier part avec
 * la page (`PageInput.photos`) et le serveur le range dans le dossier de la
 * page (`./photo_<n>.jpg`, `src/lib/page-writer.ts`). Avant l'envoi,
 * la photo est réduite (2000 px au plus, JPEG ; PNG / WebP en WebP, qui
 * garde la transparence des logos) : envoi plus léger, plusieurs photos
 * d'un coup restent raisonnables.
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
	/**
	 * Photo déposée avec un fichier `.md` (`depot.ts`) : enregistrée telle
	 * quelle (réduite à l'envoi), même fichier = même valeur ; `null` si son
	 * format n'est pas accepté.
	 */
	deposer(file: File): string | null;
	/** Fichier d'une photo choisie ou déposée (`nouvelle:<clé>`), pour le téléchargement en `.zip`. */
	fichier(valeur: string): Blob | null;
}

const CLE: InjectionKey<BlocPhotos> = Symbol('bloc-photos');

/** Formats acceptés ; SVG : champs `svg` seulement (logos), filtré par le sélecteur de fichier et revérifié par le serveur. */
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const SVG = 'image/svg+xml';
const COTE_MAX = 2000;
const POIDS_MAX = 10 * 1024 * 1024;

/**
 * Photo réduite à 2000 px (orientation EXIF appliquée, métadonnées perdues) ;
 * l'originale si le navigateur ne sait pas. JPEG en JPEG ; PNG et WebP en
 * WebP (transparence gardée : logos du « Bandeau défilant »).
 */
async function reduire(file: File): Promise<Blob> {
	try {
		const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * echelle);
		canvas.height = Math.round(bitmap.height * echelle);
		canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();
		const sortie = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, sortie, 0.88));
		return blob ?? file;
	} catch {
		return file;
	}
}

/** Photo prête à envoyer : réduite, `{ type, data (base64) }` (aussi pour les dépôts envoyés tels quels). */
export async function photoPourEnvoi(file: Blob): Promise<{ type: string; data: string }> {
	// SVG : envoyé tel quel (vectoriel, pas de réduction).
	const blob = file.type === SVG || (file.type === 'image/jpeg' && file.size < 300 * 1024) ? file : await reduire(file as File);
	const f = new File([blob], 'photo', { type: blob.type || 'image/jpeg' });
	return { type: f.type, data: await fileToBase64(f) };
}

/** Blocs (par identifiant) ou sections (liste) dont on cherche les photos. */
type AvecPhotos = Record<string, Bloc> | { [champ: string]: unknown; items?: Record<string, string>[] }[];

/** Valeurs `nouvelle:<clé>` citées par des blocs ou des sections (champs et éléments). */
function nouvellesCitees(groupes: AvecPhotos[]): Set<string> {
	const citees = new Set<string>();
	const voir = (v: unknown) => {
		if (typeof v === 'string' && BLOC_PHOTO_NOUVELLE.test(v)) citees.add(v);
	};
	for (const groupe of groupes) {
		for (const valeur of Object.values(groupe) as { items?: unknown }[]) {
			Object.values(valeur).forEach(voir);
			for (const item of Array.isArray(valeur.items) ? (valeur.items as Record<string, unknown>[]) : []) Object.values(item).forEach(voir);
		}
	}
	return citees;
}

export function fournirBlocPhotos(apercus: Record<string, string> = {}) {
	const attente = shallowReactive(new Map<string, { blob: Blob; url: string; aReduire?: boolean }>());
	const deposees = new WeakMap<File, string>();
	let compteur = 0;
	const cle = () => `nouvelle:${Date.now().toString(36)}${(compteur++).toString(36)}`;

	const api: BlocPhotos = {
		apercu: (valeur) => attente.get(valeur)?.url ?? apercus[valeur] ?? null,
		async choisir(file) {
			if (!TYPES.includes(file.type)) throw new Error(`« ${file.name} » : formats acceptés JPEG, PNG, WebP (et SVG pour les logos).`);
			const blob = file.type === SVG ? file : await reduire(file);
			if (blob.size > POIDS_MAX) throw new Error(`« ${file.name} » est trop lourde (10 Mo max).`);
			const valeur = cle();
			attente.set(valeur, { blob, url: URL.createObjectURL(blob) });
			return valeur;
		},
		fichier: (valeur) => attente.get(valeur)?.blob ?? null,
		deposer(file) {
			if (!TYPES.includes(file.type)) return null;
			const deja = deposees.get(file);
			if (deja && attente.has(deja)) return deja;
			const valeur = cle();
			attente.set(valeur, { blob: file, url: URL.createObjectURL(file), aReduire: true });
			deposees.set(file, valeur);
			return valeur;
		},
	};
	provide(CLE, api);

	return {
		api,
		/** Photos à envoyer avec la page : seulement celles encore citées par un bloc ou une section. */
		async envoi(...groupes: AvecPhotos[]): Promise<Record<string, { type: string; data: string }>> {
			const photos: Record<string, { type: string; data: string }> = {};
			for (const valeur of nouvellesCitees(groupes)) {
				const photo = attente.get(valeur);
				if (!photo) continue;
				if (photo.aReduire) {
					photos[valeur] = await photoPourEnvoi(photo.blob);
					continue;
				}
				const file = new File([photo.blob], 'photo', { type: photo.blob.type || 'image/jpeg' });
				photos[valeur] = { type: file.type, data: await fileToBase64(file) };
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
