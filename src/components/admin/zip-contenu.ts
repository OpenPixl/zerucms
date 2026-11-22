/**
 * « Télécharger le fichier » d'un contenu (page, actualité, activité) : le
 * `.md` construit depuis le formulaire (modifications en cours comprises),
 * et, si le contenu a des photos (blocs « Photos », « Carrousel »,
 * couverture), un `.zip` qui les contient avec le `.md`. Les photos y sont
 * citées par leur nom dans le `.zip` (`photo_1.jpg`, `couverture.jpg`…) :
 * l'archive se redépose telle quelle (`depot.ts`), dans ce contenu ou pour en
 * créer un autre — c'est ce qu'un membre de l'association modifie chez lui.
 *
 * Photos déjà publiées : lues dans les sources (`GET /api/admin/photos-contenu`) ;
 * photos choisies dans le formulaire : celles du navigateur.
 */
import { zipSync } from 'fflate';
import { BLOC_PHOTO, BLOC_PHOTO_NOUVELLE, type Bloc } from '../../lib/blocs';
import { transformerPhotos } from './blocs-fichier';
import { downloadMarkdown } from './markdown-file';
import type { BlocPhotos } from './modules/pages/bloc-photos';

export interface Couverture {
	/** `cover:` actuel des sources (`./cover.jpg`), ou `null`. */
	actuelle: string | null;
	/** Photo choisie dans le formulaire (remplace l'actuelle), ou `null`. */
	nouvelle: File | null;
	/** Photo actuelle retirée dans le formulaire. */
	retiree: boolean;
}

const extension = (nom: string) => (nom.split('.').pop() ?? 'jpg').toLowerCase();

async function lireSource(dossier: string, fichier: string): Promise<Uint8Array> {
	const r = await fetch(`/api/admin/photos-contenu?${new URLSearchParams({ dossier, fichier })}`, { credentials: 'same-origin' });
	if (!r.ok) throw new Error(`Photo « ${fichier} » introuvable dans les sources : enregistrez le contenu, puis réessayez.`);
	return new Uint8Array(await r.arrayBuffer());
}

export async function telechargerContenu(options: {
	/** Nom du fichier sans extension (adresse du contenu). */
	nom: string;
	/** Dossier du contenu relatif à `src/content/` (`news/<slug>`…), `null` à la création. */
	dossier: string | null;
	blocs: Record<string, Bloc>;
	photos: BlocPhotos | null;
	couverture?: Couverture;
	/** `.md` du contenu avec ces blocs et cette couverture (`cover:` = nom dans le `.zip`). */
	construire: (blocs: Record<string, Bloc>, cover?: string) => string;
}): Promise<void> {
	const { nom, dossier, photos, couverture } = options;
	const fichiers: Record<string, Uint8Array> = {};
	const noms = new Map<string, string>();
	let nouvelles = 0;
	const attente: Promise<void>[] = [];

	const renommer = (valeur: unknown): unknown => {
		if (typeof valeur !== 'string' || !valeur) return valeur;
		const deja = noms.get(valeur);
		if (deja) return deja;
		if (BLOC_PHOTO.test(valeur) && dossier) {
			const fichier = valeur.replace(/^\.\//, '');
			noms.set(valeur, fichier);
			attente.push(lireSource(dossier, fichier).then((data) => void (fichiers[fichier] = data)));
			return fichier;
		}
		const blob = BLOC_PHOTO_NOUVELLE.test(valeur) ? photos?.fichier(valeur) : null;
		if (!blob) return valeur;
		const fichier = `nouvelle_${++nouvelles}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
		noms.set(valeur, fichier);
		attente.push(blob.arrayBuffer().then((data) => void (fichiers[fichier] = new Uint8Array(data))));
		return fichier;
	};
	const blocs = Object.fromEntries(Object.entries(options.blocs).map(([id, bloc]) => [id, transformerPhotos(id, bloc, renommer) as Bloc]));

	let cover: string | undefined;
	if (couverture?.nouvelle) {
		cover = `couverture.${extension(couverture.nouvelle.name)}`;
		const file = couverture.nouvelle;
		attente.push(file.arrayBuffer().then((data) => void (fichiers[cover!] = new Uint8Array(data))));
	} else if (couverture?.actuelle && !couverture.retiree && dossier) {
		const source = couverture.actuelle.replace(/^\.\//, '');
		cover = `couverture.${extension(source)}`;
		attente.push(lireSource(dossier, source).then((data) => void (fichiers[cover!] = data)));
	}

	if (!attente.length) {
		downloadMarkdown(`${nom}.md`, options.construire(options.blocs));
		return;
	}
	await Promise.all(attente);
	fichiers[`${nom}.md`] = new TextEncoder().encode(options.construire(blocs, cover));
	// Photos déjà compressées : stockées sans recompression.
	const zip = zipSync(Object.fromEntries(Object.entries(fichiers).map(([n, d]) => [n, [d, { level: n.endsWith('.md') ? 6 : 0 }]])));
	const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
	const lien = document.createElement('a');
	lien.href = url;
	lien.download = `${nom}.zip`;
	lien.click();
	URL.revokeObjectURL(url);
}
