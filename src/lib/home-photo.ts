/**
 * Photo du bandeau d'accueil (`src/content/images/accueil.*`, lue par
 * `src/lib/site-images.ts`), réglée depuis le module « Pages » → Accueil →
 * module « Bandeau ». Enregistrée avec la page d'accueil
 * (`PUT /api/admin/pages-du-site/accueil`, champ `photo`).
 *
 * Photo envoyée : redressée, réduite à `HOME_PHOTO_WIDTH` px de large,
 * métadonnées retirées, écrite en `accueil.jpg` (les autres `accueil.*`
 * sont supprimés). Retirée : bandeau sans photo (fond uni).
 *
 * Illustration du module « Présentation » (`images/presentation.*`) :
 * même principe (`readIllustrationPreview`, `prepareIllustration`,
 * `applyIllustration`, champ `illustration` du PUT) ; SVG accepté tel quel
 * (contenus actifs refusés, `svgProblem()`), image matricielle redressée,
 * réduite à `ILLUSTRATION_WIDTH` px, transparence gardée (PNG), sinon JPEG.
 *
 * Code serveur uniquement.
 */

import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { contentTransaction, type Applied } from './content-transaction';
import { COVER_MAX_BYTES, siteRoot } from './news-writer';
import { svgProblem } from './brand-writer';

export const HOME_PHOTO_WIDTH = 2400;

export type HomePhotoChange = { action: 'keep' } | { action: 'remove' } | { action: 'replace'; data: Buffer };

const imagesDir = () => join(siteRoot(), 'src', 'content', 'images');

async function photoFiles(): Promise<string[]> {
	return (await readdir(imagesDir()).catch(() => [] as string[])).filter((f) => f.startsWith('accueil.'));
}

/** Aperçu de la photo actuelle (data URL réduite), `null` sans photo. */
export async function readHomePhotoPreview(): Promise<string | null> {
	const [file] = await photoFiles();
	if (!file) return null;
	try {
		const data = await sharp(await readFile(join(imagesDir(), file)))
			.resize({ width: 480, withoutEnlargement: true })
			.jpeg({ quality: 75 })
			.toBuffer();
		return `data:image/jpeg;base64,${data.toString('base64')}`;
	} catch {
		return null;
	}
}

/** Photo prête à écrire, ou message d'erreur. */
export async function prepareHomePhoto(data: Buffer): Promise<{ data: Buffer } | { error: string }> {
	try {
		const image = sharp(data).rotate();
		const meta = await image.metadata();
		if (!meta.width || !meta.height) return { error: "Photo d'accueil : image illisible." };
		return {
			data: await image.resize({ width: HOME_PHOTO_WIDTH, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
		};
	} catch {
		return { error: "Photo d'accueil : image illisible." };
	}
}

/** Deux transactions menées ensemble : tout est annulé ou validé d'un coup. */
export function bothApplied(a: Applied, b: Applied): Applied {
	return {
		restore: async () => {
			await a.restore();
			await b.restore();
		},
		purge: async () => {
			await a.purge();
			await b.purge();
		},
	};
}

export const ILLUSTRATION_WIDTH = 1600;
export const ILLUSTRATION_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

export type IllustrationChange = { action: 'keep' } | { action: 'remove' } | { action: 'replace'; data: Buffer; ext: string };

async function illustrationFiles(): Promise<string[]> {
	return (await readdir(imagesDir()).catch(() => [] as string[])).filter((f) => f.startsWith('presentation.'));
}

/** Aperçu de l'illustration actuelle (data URL), `null` sans illustration. */
export async function readIllustrationPreview(): Promise<string | null> {
	const [file] = await illustrationFiles();
	if (!file) return null;
	try {
		const data = await readFile(join(imagesDir(), file));
		if (file.endsWith('.svg')) return `data:image/svg+xml;base64,${data.toString('base64')}`;
		const preview = await sharp(data).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
		return `data:image/webp;base64,${preview.toString('base64')}`;
	} catch {
		return null;
	}
}

/** Illustration envoyée (`{ type, data (base64) }`) prête à écrire, ou message d'erreur. */
export async function prepareIllustration(raw: unknown): Promise<{ data: Buffer; ext: string } | { error: string }> {
	const what = 'Illustration de la présentation';
	const upload = raw as { type?: unknown; data?: unknown };
	const ext = ILLUSTRATION_TYPES[String(upload?.type)];
	if (!ext) return { error: `${what} : formats acceptés JPEG, PNG, WebP ou SVG.` };
	const data = Buffer.from(String(upload.data ?? ''), 'base64');
	if (data.length === 0) return { error: `${what} : fichier vide.` };
	if (data.length > COVER_MAX_BYTES) return { error: `${what} : fichier trop lourd (10 Mo max).` };
	if (ext === 'svg') {
		const problem = svgProblem(data, what);
		return problem ? { error: problem } : { data, ext };
	}
	try {
		const image = sharp(data).rotate();
		const meta = await image.metadata();
		if (!meta.width || !meta.height) return { error: `${what} : image illisible.` };
		const resized = image.resize({ width: ILLUSTRATION_WIDTH, withoutEnlargement: true });
		return meta.hasAlpha
			? { data: await resized.png({ compressionLevel: 9 }).toBuffer(), ext: 'png' }
			: { data: await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), ext: 'jpg' };
	} catch {
		return { error: `${what} : image illisible.` };
	}
}

/**
 * Applique ensemble, en une seule transaction sur `images/`, les changements
 * de la photo d'accueil et de l'illustration (`restore` si la reconstruction
 * échoue). `null` si aucun des deux ne change.
 */
export async function applyHomeImages(photo: HomePhotoChange, illustration: IllustrationChange): Promise<Applied | null> {
	if (photo.action === 'keep' && illustration.action === 'keep') return null;
	return contentTransaction(imagesDir(), 'images', async (root) => {
		const files = await readdir(root);
		if (photo.action !== 'keep') {
			for (const file of files.filter((f) => f.startsWith('accueil.'))) await rm(join(root, file));
			if (photo.action === 'replace') await writeFile(join(root, 'accueil.jpg'), photo.data);
		}
		if (illustration.action !== 'keep') {
			for (const file of files.filter((f) => f.startsWith('presentation.'))) await rm(join(root, file));
			if (illustration.action === 'replace') await writeFile(join(root, `presentation.${illustration.ext}`), illustration.data);
		}
	});
}
