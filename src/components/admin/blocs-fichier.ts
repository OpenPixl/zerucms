/**
 * Blocs d'un fichier `.md` lu dans le navigateur (pages, actualités,
 * activités : dépôt dans « Ajouter un contenu », « Charger un fichier
 * modifié », modèles). Les blocs valides remplissent le formulaire ; les
 * erreurs deviennent des remarques de lecture.
 *
 * Photos des blocs : un champ `photo` peut citer un **fichier déposé avec le
 * `.md`** par son nom (`atelier-1.jpg`, ou `./photo_1.jpg` d'un `.zip`
 * téléchargé) : `photo(nom)` le retrouve et rend la valeur à mettre dans le
 * formulaire (`nouvelle:<clé>`, cf. `pages/bloc-photos.ts`). Sans fichier
 * correspondant, la valeur est gardée si c'est une photo du contenu
 * (`./photo_<n>.jpg`), sinon vidée avec une remarque : la photo se choisit
 * alors dans le formulaire.
 */
import { BLOC_PHOTO, BLOC_TYPES, remplacerPhotos, validateBloc, type Bloc } from '../../lib/blocs';
import { HOME_MODULES, validateHomeModules, type HomeModule } from '../../lib/home-modules';

/** Retrouve une photo déposée avec le fichier ; rend la valeur du champ, ou `null`. */
export type PhotoDeposee = (nom: string) => string | null;

/** Applique `fn` à chaque champ `photo` d'un bloc (champs et éléments) ; copie, l'original n'est pas modifié. */
export function transformerPhotos(id: string, bloc: unknown, fn: (valeur: unknown, where: string) => unknown): unknown {
	const def = bloc && typeof bloc === 'object' && typeof (bloc as Bloc).type === 'string' ? BLOC_TYPES[(bloc as Bloc).type] : undefined;
	return def ? remplacerPhotos(def, bloc, `Bloc « ${id} »`, fn) : bloc;
}

/** Photo d'un fichier : déposée (valeur du formulaire), photo du contenu gardée, sinon vidée avec une remarque. */
function remplacant(photo: PhotoDeposee, warnings: string[]) {
	return (valeur: unknown, where: string): unknown => {
		if (typeof valeur !== 'string' || !valeur.trim()) return valeur;
		const texte = valeur.trim();
		const deposee = photo(texte.replace(/^\.\//, ''));
		if (deposee) return deposee;
		if (BLOC_PHOTO.test(texte)) return texte;
		warnings.push(`${where} : photo « ${texte} » absente — déposez-la avec le fichier, ou choisissez-la dans le formulaire.`);
		return '';
	};
}

/** Sections d'un fichier `.md` de page enrichie (`sections:`), photos déposées comprises ; erreurs = remarques. */
export function lireSectionsFichier(raw: unknown, photo: PhotoDeposee = () => null): { sections: HomeModule[]; warnings: string[] } {
	if (raw === undefined) return { sections: [], warnings: [] };
	if (!Array.isArray(raw)) return { sections: [], warnings: ['« sections » ignoré : liste de sections attendue (cf. modèle).'] };
	const warnings: string[] = [];
	const remplacer = remplacant(photo, warnings);
	const avecPhotos = raw.map((m, i) => {
		const def = m && typeof m === 'object' ? HOME_MODULES[String((m as { type?: unknown }).type)] : undefined;
		return def ? remplacerPhotos(def, m, `Section ${i + 1} (${def.label})`, remplacer) : m;
	});
	const { modules, errors } = validateHomeModules(avecPhotos, { contexte: 'page', photosEnAttente: true });
	return { sections: modules, warnings: [...warnings, ...errors] };
}

export function lireBlocsFichier(raw: unknown, photo: PhotoDeposee = () => null): { blocs: Record<string, Bloc>; warnings: string[] } {
	const warnings: string[] = [];
	const blocs: Record<string, Bloc> = {};
	if (raw === undefined) return { blocs, warnings };
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { blocs, warnings: ['« blocs » ignoré : liste de blocs par identifiant attendue (cf. modèle).'] };

	const remplacer = remplacant(photo, warnings);

	for (const [id, bloc] of Object.entries(raw as Record<string, unknown>)) {
		const { bloc: valide, errors } = validateBloc(id, transformerPhotos(id, bloc, remplacer), { photosEnAttente: true });
		warnings.push(...errors);
		if (valide) blocs[id] = valide;
	}
	return { blocs, warnings };
}
