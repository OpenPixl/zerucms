/**
 * Blocs d'un contenu (pages, actualités, activités) à l'écriture : validation
 * (catalogue `src/lib/blocs.ts`), liens des textes Markdown, et **photos des
 * blocs** (« Photos », « Carrousel »), rangées dans le dossier du contenu
 * sous le nom `photo_<n>.jpg` (n = numéro suivant le plus grand déjà pris ;
 * `photo_<n>.webp` pour une image transparente : logos).
 *
 * Une photo à écrire est citée par un champ `photo` et fournie à part
 * (`envoyees`), sous la valeur exacte du champ :
 *  - `nouvelle:<clé>` : choisie dans le formulaire (`bloc-photos.ts`) ;
 *  - un nom de fichier (`atelier-1.jpg`) : déposée avec un fichier `.md` ;
 *  - `./photo_<n>.jpg` d'un autre contenu : copie (onglet « Partage »).
 * Les autres valeurs doivent être des `./photo_<n>.jpg` déjà présentes dans
 * le dossier du contenu.
 *
 * Code serveur uniquement (node:fs, sharp).
 */
import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { svgProblem } from './svg-sur';
import { BLOC_PHOTO, BLOC_PHOTO_NOUVELLE, BLOC_TYPES, blocMarkdownTexts, blocMarkersIn, blocPhotos, remplacerPhotos, validateBloc, type Bloc } from './blocs';
import { HOME_MODULES } from './home-modules';
import { checkBody } from './markdown-check';

/** Photo envoyée : `{ type, data (base64) }` depuis le navigateur, ou contenu lu sur le serveur. */
export type PhotoEnvoyee = { type?: unknown; data?: unknown } | Buffer;
export type PhotosEnvoyees = Record<string, PhotoEnvoyee | unknown>;

export interface PhotoAEcrire {
	/** `./photo_<n>.jpg` */
	nom: string;
	data: Buffer;
}

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

/** Fichier SVG (texte qui contient une balise `<svg>`), d'après son contenu. */
function estSvg(data: Buffer): boolean {
	return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(data.subarray(0, 4096).toString('utf8'));
}
const POIDS_MAX = 10 * 1024 * 1024;

export const BLOC_PHOTO_ERREUR = "Une photo d'un bloc n'a pas pu être lue (formats acceptés : JPEG, PNG, WebP).";

/** Levée par `ecrireBlocPhotos` si sharp ne lit pas une photo (l'écriture est annulée par l'appelant). */
export class BlocPhotoError extends Error {}

/** Photo de bloc d'un dossier de contenu : `photo_<n>.<ext>`, retirée quand plus aucun bloc ne la cite. */
const FICHIER_PHOTO_BLOC = /^photo_(\d{1,4})\.(?:jpg|jpeg|png|webp|svg)$/;

function lirePhoto(raw: unknown): { data?: Buffer; error?: string } {
	if (Buffer.isBuffer(raw)) return { data: raw };
	const photo = raw as { type?: unknown; data?: unknown } | undefined;
	if (!photo || typeof photo !== 'object') return {};
	if (!TYPES.includes(String(photo.type))) return { error: 'formats acceptés JPEG, PNG ou WebP.' };
	const data = Buffer.from(String(photo.data ?? ''), 'base64');
	if (data.length === 0) return { error: 'la photo est vide.' };
	if (data.length > POIDS_MAX) return { error: 'la photo est trop lourde (10 Mo max).' };
	return { data };
}

/** Photo citée et fournie : sous sa valeur exacte, ou sans le `./` initial. */
function photoFournie(envoyees: PhotosEnvoyees, valeur: string): unknown {
	return Object.hasOwn(envoyees, valeur) ? envoyees[valeur] : envoyees[valeur.replace(/^\.\//, '')];
}

/**
 * Valide les blocs reçus (formulaire ou fichier `.md`) et prépare leurs
 * photos : chaque photo fournie reçoit son nom `./photo_<n>.jpg` (une même
 * valeur citée deux fois = un seul fichier). `dossier` = dossier actuel du
 * contenu (`null` à la création) : numéros déjà pris, photos existantes.
 * `sections` (page enrichie, accueil) : leurs photos sont préparées de même,
 * dans le même dossier ; les sections rendues ne sont pas encore validées
 * (`validateHomeModules`, par l'appelant).
 */
export async function preparerBlocs(
	brut: Record<string, unknown>,
	envoyees: PhotosEnvoyees,
	dossier: string | null,
	options: { sections?: unknown[] } = {},
): Promise<{ blocs: Record<string, Bloc>; sections: unknown[]; photos: PhotoAEcrire[]; errors: string[] }> {
	const errors: string[] = [];
	const photos: PhotoAEcrire[] = [];
	const presents = dossier ? await readdir(dossier).catch(() => [] as string[]) : [];
	let dernier = Math.max(0, ...presents.map((f) => Number(f.match(FICHIER_PHOTO_BLOC)?.[1] ?? 0)));
	const noms = new Map<string, string>();
	/** Photos fournies qui ont de la transparence (analyse avant le parcours, qui est synchrone). */
	const transparentes = new Set<unknown>();
	for (const fournie of Object.values(envoyees)) {
		const { data } = lirePhoto(fournie);
		if (data && !estSvg(data) && (await sharp(data).stats().then((s) => !s.isOpaque, () => false))) transparentes.add(fournie);
	}

	const remplacer = (valeur: unknown, where: string): unknown => {
		if (typeof valeur !== 'string' || !valeur.trim()) return valeur;
		const texte = valeur.trim();
		const fournie = photoFournie(envoyees, texte);
		if (fournie !== undefined) {
			let nom = noms.get(texte);
			if (!nom) {
				const { data, error } = lirePhoto(fournie);
				if (!data) {
					errors.push(`${where} : ${error ?? 'photo illisible.'}`);
					return './photo_0.jpg'; // nom factice : l'erreur ci-dessus suffit, rien n'est écrit
				}
				// SVG (logos, champs `svg` seulement : contrôlé par la validation) : gardé tel quel, sans contenu actif.
				const svg = estSvg(data);
				const probleme = svg ? svgProblem(data, where) : null;
				if (probleme) {
					errors.push(probleme);
					return './photo_0.jpg';
				}
				// Image transparente (logo PNG / WebP) : WebP, qui garde la transparence ; sinon JPEG.
				nom = `./photo_${++dernier}.${svg ? 'svg' : transparentes.has(fournie) ? 'webp' : 'jpg'}`;
				noms.set(texte, nom);
				photos.push({ nom, data });
			}
			return nom;
		}
		if (BLOC_PHOTO_NOUVELLE.test(texte)) {
			errors.push(`${where} : photo manquante, choisissez-la à nouveau.`);
			return './photo_0.jpg';
		}
		if (!BLOC_PHOTO.test(texte) || !presents.includes(texte.replace(/^\.\//, ''))) {
			errors.push(`${where} : photo « ${texte} » introuvable ; déposez-la avec le fichier .md ou choisissez-la dans le formulaire.`);
			return './photo_0.jpg';
		}
		return texte;
	};

	const blocs: Record<string, Bloc> = {};
	for (const [id, raw] of Object.entries(brut)) {
		const def = raw && typeof raw === 'object' ? BLOC_TYPES[String((raw as Bloc).type)] : undefined;
		const { bloc, errors: blocErrors } = validateBloc(id, def ? remplacerPhotos(def, raw, `Bloc « ${id} »`, remplacer) : raw);
		errors.push(...blocErrors);
		if (!bloc) continue;
		for (const text of blocMarkdownTexts(bloc)) errors.push(...checkBody(text).map((e) => `Bloc « ${id} » : ${e}`));
		blocs[id] = bloc;
	}
	const sections = (options.sections ?? []).map((raw, i) => {
		const def = raw && typeof raw === 'object' ? HOME_MODULES[String((raw as { type?: unknown }).type)] : undefined;
		return def ? remplacerPhotos(def, raw, `Section ${i + 1} (${def.label})`, remplacer) : raw;
	});
	return { blocs, sections, photos, errors };
}

/**
 * Marqueurs `[[bloc:…]]` du texte sans bloc correspondant : message d'erreur,
 * ou `null`. `blocs` = blocs reçus (même invalides : leur erreur est déjà
 * signalée, inutile d'ajouter celle du marqueur).
 */
export function marqueursSansBloc(body: string, blocs: Record<string, unknown>): string | null {
	const manquants = blocMarkersIn(body).filter((id) => !Object.hasOwn(blocs, id));
	return manquants.length ? `Marqueur(s) sans bloc : ${manquants.map((id) => `[[bloc:${id}]]`).join(', ')}.` : null;
}

/**
 * Écrit les nouvelles photos dans `dir` (redressées selon l'EXIF, sans
 * métadonnées dont la position GPS, 2000 px au plus) et retire les
 * `photo_<n>` qu'aucun bloc ne cite plus (ni aucune section : `autresCitees`,
 * cf. `sectionPhotos()`). `BlocPhotoError` si une photo est illisible.
 */
export async function ecrireBlocPhotos(dir: string, photos: PhotoAEcrire[], blocs: Record<string, Bloc>, autresCitees: string[] = []): Promise<void> {
	for (const photo of photos) {
		if (photo.nom.endsWith('.svg')) {
			await writeFile(join(dir, photo.nom.replace(/^\.\//, '')), photo.data);
			continue;
		}
		await sharp(photo.data, { failOn: 'error' })
			.rotate()
			.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
			[photo.nom.endsWith('.webp') ? 'webp' : 'jpeg']({ quality: 85, ...(photo.nom.endsWith('.webp') ? { alphaQuality: 100 } : { mozjpeg: true }) })
			.toFile(join(dir, photo.nom.replace(/^\.\//, '')))
			.catch(() => {
				throw new BlocPhotoError();
			});
	}
	const citees = new Set([...Object.values(blocs).flatMap(blocPhotos), ...autresCitees].map((p) => p.replace(/^\.\//, '')));
	if (!(await stat(dir).then((s) => s.isDirectory(), () => false))) return;
	for (const fichier of await readdir(dir)) {
		if (FICHIER_PHOTO_BLOC.test(fichier) && !citees.has(fichier)) await rm(join(dir, fichier), { force: true });
	}
}
