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
import { BLOC_PHOTO, BLOC_TYPES, validateBloc, type Bloc, type BlocTypeDef } from '../../lib/blocs';

/** Retrouve une photo déposée avec le fichier ; rend la valeur du champ, ou `null`. */
export type PhotoDeposee = (nom: string) => string | null;

/** Applique `fn` à chaque champ `photo` d'un bloc (champs et éléments) ; copie, l'original n'est pas modifié. */
export function transformerPhotos(id: string, bloc: unknown, fn: (valeur: unknown, where: string) => unknown): unknown {
	const def: BlocTypeDef | undefined = bloc && typeof bloc === 'object' && typeof (bloc as Bloc).type === 'string' ? BLOC_TYPES[(bloc as Bloc).type] : undefined;
	if (!def) return bloc;
	const copie = { ...(bloc as Record<string, unknown>) };
	for (const f of def.fields) if (f.type === 'photo') copie[f.name] = fn(copie[f.name], `Bloc « ${id} »`);
	if (def.items && Array.isArray(copie.items)) {
		copie.items = copie.items.map((item, i) => {
			if (!item || typeof item !== 'object') return item;
			const it = { ...(item as Record<string, unknown>) };
			for (const f of def.items!.fields) if (f.type === 'photo') it[f.name] = fn(it[f.name], `Bloc « ${id} », photo ${i + 1}`);
			return it;
		});
	}
	return copie;
}

export function lireBlocsFichier(raw: unknown, photo: PhotoDeposee = () => null): { blocs: Record<string, Bloc>; warnings: string[] } {
	const warnings: string[] = [];
	const blocs: Record<string, Bloc> = {};
	if (raw === undefined) return { blocs, warnings };
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { blocs, warnings: ['« blocs » ignoré : liste de blocs par identifiant attendue (cf. modèle).'] };

	const remplacer = (valeur: unknown, where: string): unknown => {
		if (typeof valeur !== 'string' || !valeur.trim()) return valeur;
		const texte = valeur.trim();
		const deposee = photo(texte.replace(/^\.\//, ''));
		if (deposee) return deposee;
		if (BLOC_PHOTO.test(texte)) return texte;
		warnings.push(`${where} : photo « ${texte} » absente — déposez-la avec le fichier, ou choisissez-la dans le formulaire.`);
		return '';
	};

	for (const [id, bloc] of Object.entries(raw as Record<string, unknown>)) {
		const { bloc: valide, errors } = validateBloc(id, transformerPhotos(id, bloc, remplacer), { photosEnAttente: true });
		warnings.push(...errors);
		if (valide) blocs[id] = valide;
	}
	return { blocs, warnings };
}
