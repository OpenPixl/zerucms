/**
 * Charte graphique de l'association, depuis le module « Charte graphique »
 * (menu Paramètres, bureau) : couleurs du thème (`colors:` de
 * `src/content/reglages.yaml`, lu par `src/config/site.ts`), logo et icône
 * d'onglet (`src/content/images/`, lus par `src/lib/site-images.ts`). La
 * publication (reconstruction du site) est faite par `site-build.ts`, via
 * `admin-publish.ts`.
 *
 * - Couleurs : valeurs changées en place (`yaml` Document : commentaires et
 *   autres réglages gardés), fichier revalidé par `parseReglages()`.
 * - Logo : remplace `logo.*` (PNG, JPEG, WebP ou SVG). Image matricielle
 *   réduite à `LOGO_MAX_WIDTH` px de large au plus, métadonnées retirées.
 * - Mode sombre (`sombre:`, `src/lib/mode-sombre.ts`) : seules les valeurs
 *   qui s'écartent du défaut sont écrites (couleur de marque égale à sa
 *   variante automatique = clé retirée, elle suivra la couleur claire) ;
 *   logo du mode sombre facultatif (`logo-sombre.*`, mêmes règles que le logo).
 * - Pied de page (`pied:`, `src/lib/pied.ts`) : fond et texte toujours
 *   écrits (le pied ne suit plus la couleur secondaire) ; couleurs du mode
 *   sombre écrites seulement si elles s'écartent de la palette sombre.
 * - Bouton d'action de l'en-tête (`cta:` : texte, lien, affiché) : valeurs
 *   écrites en place.
 * - Icône d'onglet : remplace tous les `favicon.*`. PNG recadré en carré
 *   (fond transparent) de `FAVICON_SIZE` px au plus ; SVG accompagné d'un
 *   `favicon.png` tiré de lui (navigateurs anciens, `/favicon.ico`) ; ICO
 *   gardé tel quel.
 * - SVG refusé s'il contient du script ou des contenus actifs : le fichier
 *   est servi tel quel par le site.
 *
 * « Transaction » : dossier `images/` sauvegardé (`contentTransaction`) et
 * texte de `reglages.yaml` gardé en mémoire, tout est remis si la
 * reconstruction échoue.
 *
 * Code serveur uniquement.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { isMap, isScalar, isSeq, parseDocument, Scalar, YAMLMap, type Document } from 'yaml';
import {
	COLOR_PATTERN,
	CTA_LABEL_MAX,
	DEFAULT_COLORS,
	DEFAULT_CTA,
	parseReglages,
	type LinkToggle,
	type SiteFonts,
	type ThemeColors,
	type UploadedFont,
} from '../config/site';
import { pagesIndisponibles } from './liens-plugins';
import { isSafeUrl } from './safe-url';
import {
	catalogueFont,
	DEFAULT_FONTS,
	FONT_CATALOGUE,
	FONT_FILE_MAX,
	FONT_NAME_MAX,
	FONT_WEIGHTS,
	fontSlug,
	type FontExt,
	type FontRole,
	type FontWeight,
} from './font-catalogue';
import { CATALOGUE_FILES } from './fonts';
import { contentTransaction, type Applied } from './content-transaction';
import { couleurSombreAuto, DEFAULT_SOMBRE, MARQUE, type ReglageSombre } from './mode-sombre';
import { piedResolu, type PiedResolu, type ReglagePied } from './pied';
import { siteRoot } from './news-writer';

export const LOGO_MAX_WIDTH = 1600;
export const FAVICON_SIZE = 512;
export const BRAND_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const STRIPE_MAX = 12;

/** Formats acceptés à l'envoi → extension du fichier écrit. */
export const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
export const FAVICON_TYPES: Record<string, string> = {
	'image/svg+xml': 'svg',
	'image/png': 'png',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
};

const PREVIEW_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon' };

const imagesDir = () => join(siteRoot(), 'src', 'content', 'images');
const reglagesFile = () => join(siteRoot(), 'src', 'content', 'reglages.yaml');
const fontsDir = () => join(siteRoot(), 'src', 'content', 'polices');

// --- Lecture ---------------------------------------------------------------

export interface BrandImage {
	file: string;
	/** Aperçu (data URL, réduit pour les images matricielles). */
	preview: string;
}

export interface BrandFontFile {
	graisse: FontWeight;
	fichier: string;
	/** Fichier en data URL (aperçu dans le navigateur) ; `null` = absent du disque. */
	preview: string | null;
}

export interface BrandFonts extends Record<FontRole, string> {
	deposees: { nom: string; fichiers: BrandFontFile[] }[];
}

export interface BrandSource {
	colors: ThemeColors;
	defaults: ThemeColors;
	/** Mode sombre : couleurs de marque présentes seulement si réglées (absentes = automatiques). */
	sombre: ReglageSombre;
	/** Pied de page : couleurs effectives (`sombreFond` / `sombreTexte` absents du réglage = palette sombre). */
	pied: PiedResolu;
	/** Couleurs du mode sombre du pied réglées à part (sinon : palette sombre). */
	piedSombreRegle: { fond: boolean; texte: boolean };
	/** Bouton d'action de l'en-tête, son réglage d'origine et les pages de plugin inactives (bouton masqué si son lien y mène). */
	cta: LinkToggle;
	ctaDefaults: LinkToggle;
	pagesIndisponibles: string[];
	logo: BrandImage | null;
	logoSombre: BrandImage | null;
	favicons: BrandImage[];
	fonts: BrandFonts;
	fontDefaults: Record<FontRole, string>;
	/** Polices proposées, avec l'URL de leur fichier latin (aperçu). */
	catalogue: { id: string; label: string; family: string; weight: string; url: string }[];
}

async function preview(file: string): Promise<BrandImage> {
	const ext = file.split('.').pop()!.toLowerCase();
	let data = await readFile(join(imagesDir(), file));
	let type = PREVIEW_TYPES[ext] ?? 'application/octet-stream';
	if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') {
		data = await sharp(data).resize({ height: 160, withoutEnlargement: true }).png().toBuffer();
		type = 'image/png';
	}
	return { file, preview: `data:${type};base64,${data.toString('base64')}` };
}

/** Ordre des icônes : comme `site-images.ts` (SVG, PNG, puis ICO). */
const EXT_ORDER = ['svg', 'png', 'webp', 'jpg', 'jpeg', 'ico'];

async function imageFiles(name: 'logo' | 'logo-sombre' | 'favicon'): Promise<string[]> {
	const files = await readdir(imagesDir()).catch(() => [] as string[]);
	const rank = (f: string) => EXT_ORDER.indexOf(f.split('.').pop()!.toLowerCase());
	return files.filter((f) => f.startsWith(`${name}.`)).sort((a, b) => rank(a) - rank(b));
}

const FONT_MIME: Record<FontExt, string> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };

async function fontPreview(file: string): Promise<string | null> {
	const data = await readFile(join(fontsDir(), file)).catch(() => null);
	return data ? `data:${FONT_MIME[file.split('.').pop() as FontExt]};base64,${data.toString('base64')}` : null;
}

async function brandFonts(polices: SiteFonts): Promise<BrandFonts> {
	return {
		titres: polices.titres,
		texte: polices.texte,
		deposees: await Promise.all(
			polices.deposees.map(async (d) => ({
				nom: d.nom,
				fichiers: await Promise.all(
					(Object.entries(d.fichiers) as [FontWeight, string][]).map(async ([graisse, fichier]) => ({ graisse, fichier, preview: await fontPreview(fichier) })),
				),
			})),
		),
	};
}

export async function readBrandSource(): Promise<BrandSource> {
	const { colors, polices, sombre, pied, cta } = parseReglages(await readFile(reglagesFile(), 'utf8').catch(() => ''));
	const [logo] = await imageFiles('logo');
	const [logoSombre] = await imageFiles('logo-sombre');
	return {
		colors,
		defaults: DEFAULT_COLORS,
		sombre,
		pied: piedResolu(pied, colors.secondary, sombre),
		piedSombreRegle: { fond: !!pied.sombre?.fond, texte: !!pied.sombre?.texte },
		cta,
		ctaDefaults: DEFAULT_CTA,
		pagesIndisponibles: pagesIndisponibles(),
		logo: logo ? await preview(logo) : null,
		logoSombre: logoSombre ? await preview(logoSombre) : null,
		favicons: await Promise.all((await imageFiles('favicon')).map(preview)),
		fonts: await brandFonts(polices),
		fontDefaults: DEFAULT_FONTS,
		catalogue: FONT_CATALOGUE.map((f) => ({ id: f.id, label: f.label, family: f.family, weight: f.weight, url: CATALOGUE_FILES[f.id].latin })),
	};
}

// --- Contrôles -------------------------------------------------------------

export interface BrandUpload {
	type: string;
	data: Buffer;
}

export interface FontUpload {
	nom: string;
	fichiers: { graisse: FontWeight; data: Buffer }[];
}

export interface FontsInput extends Record<FontRole, string> {
	/** Polices déposées à ajouter. */
	ajouts: FontUpload[];
	/** Noms des polices déposées à retirer. */
	retraits: string[];
}

export interface BrandInput {
	colors: ThemeColors;
	/** `null` = mode sombre inchangé. */
	sombre: ReglageSombre | null;
	/** `null` = pied de page inchangé ; couleurs sombres absentes = palette sombre. */
	pied: ReglagePied | null;
	/** `null` = bouton d'action inchangé. */
	cta: LinkToggle | null;
	logo: BrandUpload | null;
	logoSombre: BrandUpload | null;
	/** Retire le logo du mode sombre (le logo normal sert alors partout). */
	retirerLogoSombre: boolean;
	favicon: BrandUpload | null;
	/** `null` = polices inchangées. */
	fonts: FontsInput | null;
}

/** Contenus actifs interdits dans un SVG servi tel quel par le site. */
const SVG_DANGER = /<script|<foreignObject|<iframe|<embed|<object|\bon[a-z]+\s*=|javascript:|<!ENTITY|xlink:href\s*=\s*["']?\s*(?!#)|\bhref\s*=\s*["']?\s*(?!#|data:image\/)/i;

export function svgProblem(data: Buffer, what: string): string | null {
	const text = data.toString('utf8');
	if (!/<svg[\s>]/i.test(text)) return `${what} : fichier SVG illisible.`;
	if (SVG_DANGER.test(text)) return `${what} : ce SVG contient du script ou des liens externes, refusé par sécurité. Exportez-le en « SVG simple » ou en PNG.`;
	return null;
}

function validateColors(colors: ThemeColors): string[] {
	const errors: string[] = [];
	const names: Record<string, string> = { primary: 'principale', secondary: 'secondaire', accent: "d'accent" };
	for (const key of ['primary', 'secondary', 'accent'] as const) {
		if (!COLOR_PATTERN.test(colors[key])) errors.push(`Couleur ${names[key]} invalide (format #2f7fc1).`);
	}
	if (!colors.stripe.length) errors.push('La bande de couleurs doit compter au moins une couleur.');
	else if (colors.stripe.length > STRIPE_MAX) errors.push(`La bande de couleurs compte ${STRIPE_MAX} couleurs au plus.`);
	else if (colors.stripe.some((c) => !COLOR_PATTERN.test(c))) errors.push('Une couleur de la bande est invalide (format #2f7fc1).');
	return errors;
}

function validateSombre(sombre: ReglageSombre): string[] {
	const names: Record<string, string> = { fond: 'du fond', surface: 'des surfaces', texte: 'du texte', primary: 'principale', secondary: 'secondaire', accent: "d'accent" };
	return (['fond', 'surface', 'texte', ...MARQUE] as const)
		.filter((k) => sombre[k] !== undefined && !COLOR_PATTERN.test(sombre[k]!))
		.map((k) => `Mode sombre : couleur ${names[k]} invalide (format #2f7fc1).`);
}

function validatePied(pied: ReglagePied): string[] {
	const valeurs: [string | undefined, string][] = [
		[pied.fond, 'fond'],
		[pied.texte, 'texte'],
		[pied.sombre?.fond, 'fond en mode sombre'],
		[pied.sombre?.texte, 'texte en mode sombre'],
	];
	const errors = valeurs.filter(([v]) => !!v && !COLOR_PATTERN.test(v)).map(([, n]) => `Pied de page : couleur du ${n} invalide (format #2f7fc1).`);
	if (!pied.fond || !pied.texte) errors.push('Pied de page : couleurs du fond et du texte obligatoires.');
	return errors;
}

/**
 * Réglage `pied:` réduit à ce qui doit être écrit : fond et texte toujours,
 * couleurs du mode sombre seulement si elles diffèrent de la palette sombre.
 */
function piedEcrit(pied: ReglagePied, sombre: ReglageSombre): ReglagePied {
	const out: ReglagePied = { fond: pied.fond?.toLowerCase(), texte: pied.texte?.toLowerCase() };
	const s: NonNullable<ReglagePied['sombre']> = {};
	if (pied.sombre?.fond && pied.sombre.fond.toLowerCase() !== sombre.surface.toLowerCase()) s.fond = pied.sombre.fond.toLowerCase();
	if (pied.sombre?.texte && pied.sombre.texte.toLowerCase() !== sombre.texte.toLowerCase()) s.texte = pied.sombre.texte.toLowerCase();
	if (s.fond || s.texte) out.sombre = s;
	return out;
}

/** `pied:` écrit dans le document (valeurs en place). */
function setPied(doc: Document, pied: ReglagePied): void {
	const map = ensureMap(doc, ['pied']);
	for (const key of ['fond', 'texte'] as const) {
		const node = map.get(key, true);
		if (isScalar(node)) node.value = pied[key];
		else map.set(key, quoted(pied[key]!));
	}
	if (!pied.sombre) return void map.delete('sombre');
	const sombre = ensureMap(doc, ['pied', 'sombre']);
	for (const key of ['fond', 'texte'] as const) {
		const v = pied.sombre[key];
		if (v === undefined) sombre.delete(key);
		else {
			const node = sombre.get(key, true);
			if (isScalar(node)) node.value = v;
			else sombre.set(key, quoted(v));
		}
	}
}

function validateCta(cta: LinkToggle): string[] {
	const errors: string[] = [];
	if (!cta.label) errors.push("Bouton de l'en-tête : texte vide.");
	else if (cta.label.length > CTA_LABEL_MAX) errors.push(`Bouton de l'en-tête : texte trop long (${CTA_LABEL_MAX} caractères au plus).`);
	if (!cta.href) errors.push("Bouton de l'en-tête : lien vide.");
	else if (/\s/.test(cta.href) || !isSafeUrl(cta.href)) errors.push("Bouton de l'en-tête : lien invalide (adresse du site, ex. /adherer, ou https://…).");
	return errors;
}

/** `cta:` écrit dans le document (valeurs en place). */
function setCta(doc: Document, cta: LinkToggle): void {
	const map = ensureMap(doc, ['cta']);
	for (const key of ['label', 'href'] as const) {
		const node = map.get(key, true);
		if (isScalar(node)) node.value = cta[key];
		else map.set(key, quoted(cta[key]));
	}
	map.set('enabled', cta.enabled);
}

/**
 * Réglage `sombre:` réduit à ce qui doit être écrit : écarts au défaut, et
 * couleurs de marque différentes de leur variante automatique.
 */
function sombreEcrit(sombre: ReglageSombre, colors: ThemeColors): Partial<ReglageSombre> {
	const out: Partial<ReglageSombre> = {};
	if (sombre.enabled) out.enabled = true;
	for (const k of ['fond', 'surface', 'texte'] as const) {
		if (sombre[k].toLowerCase() !== DEFAULT_SOMBRE[k].toLowerCase()) out[k] = sombre[k].toLowerCase();
	}
	for (const k of MARQUE) {
		const v = sombre[k]?.toLowerCase();
		if (v && v !== couleurSombreAuto(colors[k])) out[k] = v;
	}
	return out;
}

// --- Écriture --------------------------------------------------------------

/** Table YAML à `path`, créée si absente ou vide. */
function ensureMap(doc: Document, path: string[]): YAMLMap {
	const node = doc.getIn(path, true);
	if (isMap(node)) return node;
	const map = new YAMLMap();
	doc.setIn(path, map);
	return map;
}

function quoted(value: string): Scalar {
	const scalar = new Scalar(value);
	scalar.type = Scalar.QUOTE_SINGLE;
	return scalar;
}

/** Couleurs écrites dans le document (nœuds gardés : commentaires, guillemets ; bande sur une ligne). */
function setColors(doc: Document, colors: ThemeColors): void {
	const map = ensureMap(doc, ['colors']);
	for (const key of ['primary', 'secondary', 'accent'] as const) {
		const node = map.get(key, true);
		if (isScalar(node)) node.value = colors[key];
		else map.set(key, quoted(colors[key]));
	}
	// Activée = valeur par défaut : la clé n'est écrite que pour la désactiver.
	if (colors.stripeEnabled) map.delete('stripeEnabled');
	else map.set('stripeEnabled', false);
	const current = map.get('stripe', true);
	const seq = doc.createNode(colors.stripe.map(quoted), { flow: true });
	if (isSeq(current) && isSeq(seq)) {
		current.items = seq.items;
		current.flow = current.flow ?? true;
	} else map.set('stripe', seq);
}

const sameColors = (a: ThemeColors, b: ThemeColors) => JSON.stringify(a) === JSON.stringify(b);

/** `sombre:` écrit dans le document (valeurs en place ; table retirée si tout est par défaut). */
function setSombre(doc: Document, valeurs: Partial<ReglageSombre>): void {
	const map = ensureMap(doc, ['sombre']);
	for (const key of ['enabled', 'fond', 'surface', 'texte', ...MARQUE] as const) {
		const v = valeurs[key];
		if (v === undefined) map.delete(key);
		else if (typeof v === 'boolean') map.set(key, v);
		else {
			const node = map.get(key, true);
			if (isScalar(node)) node.value = v;
			else map.set(key, quoted(v));
		}
	}
	if (!map.items.length) doc.delete('sombre');
}

async function processLogo(upload: BrandUpload, what = 'Logo'): Promise<{ ext: string; data: Buffer } | { error: string }> {
	const ext = LOGO_TYPES[upload.type];
	if (!ext) return { error: `${what} : formats acceptés PNG, JPEG, WebP ou SVG.` };
	if (ext === 'svg') {
		const problem = svgProblem(upload.data, what);
		return problem ? { error: problem } : { ext, data: upload.data };
	}
	try {
		const image = sharp(upload.data).rotate();
		const meta = await image.metadata();
		if (!meta.width || !meta.height) return { error: `${what} : image illisible.` };
		if (meta.width > LOGO_MAX_WIDTH) image.resize({ width: LOGO_MAX_WIDTH });
		const out = ext === 'png' ? image.png() : ext === 'webp' ? image.webp({ quality: 90 }) : image.jpeg({ quality: 90 });
		return { ext, data: await out.toBuffer() };
	} catch {
		return { error: `${what} : image illisible.` };
	}
}

/** Fichiers `favicon.*` à écrire (un SVG donne aussi un PNG). */
async function processFavicon(upload: BrandUpload): Promise<{ files: { ext: string; data: Buffer }[] } | { error: string }> {
	const ext = FAVICON_TYPES[upload.type];
	if (!ext) return { error: 'Icône d’onglet : formats acceptés SVG, PNG ou ICO.' };
	const square = (input: Buffer) =>
		sharp(input)
			.resize({ width: FAVICON_SIZE, height: FAVICON_SIZE, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: true })
			.png()
			.toBuffer();
	if (ext === 'ico') {
		const isIco = upload.data.length > 6 && upload.data.readUInt32BE(0) === 0x00000100;
		return isIco ? { files: [{ ext, data: upload.data }] } : { error: 'Icône d’onglet : fichier ICO illisible.' };
	}
	if (ext === 'svg') {
		const problem = svgProblem(upload.data, 'Icône d’onglet');
		if (problem) return { error: problem };
		const files = [{ ext, data: upload.data }];
		try {
			files.push({ ext: 'png', data: await sharp(upload.data, { density: 300 }).resize(FAVICON_SIZE, FAVICON_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() });
		} catch {
			// SVG non rendu par sharp : le SVG seul suffit aux navigateurs récents.
		}
		return { files };
	}
	try {
		const meta = await sharp(upload.data).metadata();
		if (!meta.width || !meta.height) return { error: 'Icône d’onglet : image illisible.' };
		return { files: [{ ext, data: await square(upload.data) }] };
	} catch {
		return { error: 'Icône d’onglet : image illisible.' };
	}
}

/** Format d'un fichier de police d'après sa signature (jamais d'après son nom). */
function fontExt(data: Buffer): FontExt | null {
	if (data.length < 12) return null;
	const tag = data.subarray(0, 4).toString('latin1');
	if (tag === 'wOF2') return 'woff2';
	if (tag === 'wOFF') return 'woff';
	if (tag === 'OTTO') return 'otf';
	if (data.readUInt32BE(0) === 0x00010000 || tag === 'true') return 'ttf';
	return null;
}

interface FontsPlan {
	polices: SiteFonts;
	/** Fichiers à écrire / effacer dans `src/content/polices/`. */
	write: { file: string; data: Buffer }[];
	remove: string[];
	changed: boolean;
}

/** Contrôle les polices demandées ; rend le nouveau réglage et les fichiers à écrire, ou les erreurs. */
function planFonts(current: SiteFonts, input: FontsInput, existingFiles: string[]): FontsPlan | { errors: string[] } {
	const errors: string[] = [];
	const unknownRemoval = input.retraits.filter((n) => !current.deposees.some((d) => d.nom === n));
	if (unknownRemoval.length) errors.push(`Police à retirer introuvable : ${unknownRemoval.join(', ')}.`);
	const kept = current.deposees.filter((d) => !input.retraits.includes(d.nom));
	const taken = new Set([...kept.map((d) => d.nom.toLowerCase())]);
	const usedFiles = new Set([...existingFiles]);
	for (const d of current.deposees.filter((d) => input.retraits.includes(d.nom))) for (const f of Object.values(d.fichiers)) usedFiles.delete(f!);

	const added: UploadedFont[] = [];
	const write: FontsPlan['write'] = [];
	for (const a of input.ajouts) {
		const nom = a.nom.trim();
		const what = `Police « ${nom || '?'} »`;
		if (!nom) errors.push('Une police ajoutée n’a pas de nom.');
		else if (nom.length > FONT_NAME_MAX) errors.push(`${what} : nom trop long (${FONT_NAME_MAX} caractères au plus).`);
		else if (!fontSlug(nom)) errors.push(`${what} : le nom doit contenir des lettres ou des chiffres.`);
		else if (catalogueFont(nom) || FONT_CATALOGUE.some((f) => f.label.toLowerCase() === nom.toLowerCase())) errors.push(`${what} : c’est déjà une police proposée, choisissez-la dans la liste.`);
		else if (taken.has(nom.toLowerCase())) errors.push(`${what} : ce nom est déjà pris.`);
		if (!a.fichiers.length) errors.push(`${what} : aucun fichier.`);
		const weights = a.fichiers.map((f) => f.graisse);
		if (new Set(weights).size !== weights.length) errors.push(`${what} : deux fichiers pour la même graisse.`);
		const fichiers: UploadedFont['fichiers'] = {};
		for (const f of a.fichiers) {
			if (!(FONT_WEIGHTS as readonly string[]).includes(f.graisse)) errors.push(`${what} : graisse inconnue « ${f.graisse} ».`);
			if (f.data.length > FONT_FILE_MAX) errors.push(`${what} : fichier trop lourd (2 Mo max).`);
			const ext = fontExt(f.data);
			if (!ext) {
				errors.push(`${what} : fichier non reconnu (formats acceptés : WOFF2, WOFF, TTF, OTF).`);
				continue;
			}
			let file = `${fontSlug(nom)}-${f.graisse}.${ext}`;
			for (let i = 2; usedFiles.has(file); i++) file = `${fontSlug(nom)}-${f.graisse}-${i}.${ext}`;
			usedFiles.add(file);
			fichiers[f.graisse] = file;
			write.push({ file, data: f.data });
		}
		taken.add(nom.toLowerCase());
		added.push({ nom, fichiers });
	}
	const deposees = [...kept, ...added];
	const roles: Record<FontRole, string> = { titres: input.titres.trim(), texte: input.texte.trim() };
	for (const [role, value] of Object.entries(roles) as [FontRole, string][]) {
		const label = role === 'titres' ? 'des titres' : 'du texte';
		if (!catalogueFont(value) && !deposees.some((d) => d.nom === value)) {
			errors.push(input.retraits.includes(value) ? `La police « ${value} » est retirée mais reste choisie pour la police ${label}.` : `Police ${label} inconnue : « ${value} ».`);
		}
	}
	if (errors.length) return { errors };
	const remove = current.deposees.filter((d) => input.retraits.includes(d.nom)).flatMap((d) => Object.values(d.fichiers) as string[]);
	const polices: SiteFonts = { ...roles, deposees };
	const changed = write.length > 0 || remove.length > 0 || roles.titres !== current.titres || roles.texte !== current.texte;
	return { polices, write, remove, changed };
}

/** `polices:` écrit dans le document (rôles en place ; liste des polices déposées réécrite). */
function setFonts(doc: Document, polices: SiteFonts): void {
	const map = ensureMap(doc, ['polices']);
	for (const role of ['titres', 'texte'] as const) {
		const node = map.get(role, true);
		if (isScalar(node)) node.value = polices[role];
		else map.set(role, polices[role]);
	}
	if (polices.deposees.length) {
		map.set(
			'deposees',
			doc.createNode(
				polices.deposees.map((d) => ({
					nom: d.nom,
					fichiers: Object.fromEntries(Object.entries(d.fichiers).map(([w, f]) => [w, f])),
				})),
			),
		);
		// Graisses entre apostrophes ('300') : sinon lues comme des nombres.
		const seq = map.get('deposees', true);
		if (isSeq(seq)) {
			for (const item of seq.items) {
				const files = isMap(item) ? item.get('fichiers', true) : null;
				if (isMap(files)) for (const pair of files.items) if (isScalar(pair.key) && /^\d+$/.test(String(pair.key.value))) pair.key.type = Scalar.QUOTE_SINGLE;
			}
		}
	} else map.delete('deposees');
}

export type BrandResult = { applied?: Applied; changes: string[]; errors: string[] };

export async function saveBrand(input: BrandInput): Promise<BrandResult> {
	const errors = [
		...validateColors(input.colors),
		...(input.sombre ? validateSombre(input.sombre) : []),
		...(input.pied ? validatePied(input.pied) : []),
		...(input.cta ? validateCta(input.cta) : []),
	];
	const logo = input.logo ? await processLogo(input.logo) : null;
	const logoSombre = input.logoSombre ? await processLogo(input.logoSombre, 'Logo du mode sombre') : null;
	if (logoSombre && 'error' in logoSombre) errors.push(logoSombre.error);
	const favicon = input.favicon ? await processFavicon(input.favicon) : null;
	if (logo && 'error' in logo) errors.push(logo.error);
	if (favicon && 'error' in favicon) errors.push(favicon.error);
	if (errors.length) return { changes: [], errors };

	const originalReglages = await readFile(reglagesFile(), 'utf8').catch(() => null);
	const current = parseReglages(originalReglages ?? '');
	const colorsChanged = !sameColors(current.colors, input.colors);
	// Comparé sous sa forme écrite : un changement de couleur claire ne « change » pas une variante automatique.
	const sombreAvant = sombreEcrit(current.sombre, current.colors);
	const sombreApres = input.sombre ? sombreEcrit(input.sombre, input.colors) : null;
	const sombreChanged = sombreApres !== null && JSON.stringify(sombreApres) !== JSON.stringify(sombreAvant);
	// Pied : comparé sous sa forme écrite. Encore absent du fichier (pied qui suivait la couleur
	// secondaire) et couleurs changées : écrit, pour qu'il ne suive plus la couleur secondaire.
	const sombreFinal = input.sombre ?? current.sombre;
	const piedAvant = piedEcrit(
		{ ...piedResolu(current.pied, current.colors.secondary, current.sombre), sombre: current.pied.sombre },
		current.sombre,
	);
	const piedApres = input.pied ? piedEcrit(input.pied, sombreFinal) : null;
	const piedChanged =
		piedApres !== null && (JSON.stringify(piedApres) !== JSON.stringify(piedAvant) || (!current.pied.fond && colorsChanged));
	const ctaChanged = input.cta !== null && JSON.stringify(input.cta) !== JSON.stringify({ label: current.cta.label, href: current.cta.href, enabled: current.cta.enabled });
	const logoSombreRetire = input.retirerLogoSombre && !logoSombre && (await imageFiles('logo-sombre')).length > 0;
	const fontsPlan = input.fonts ? planFonts(current.polices, input.fonts, await readdir(fontsDir()).catch(() => [])) : null;
	if (fontsPlan && 'errors' in fontsPlan) return { changes: [], errors: fontsPlan.errors };
	const fontsChanged = Boolean(fontsPlan?.changed);
	const changes = [
		colorsChanged && 'couleurs',
		sombreChanged && 'mode sombre',
		piedChanged && 'pied de page',
		fontsChanged && 'polices',
		ctaChanged && 'bouton de l’en-tête',
		logo && 'logo',
		(logoSombre || logoSombreRetire) && 'logo du mode sombre',
		favicon && 'icône d’onglet',
	].filter((c): c is string => Boolean(c));
	if (!changes.length) return { changes, errors: ["Rien n'a changé."] };

	let reglagesText: string | null = null;
	if (colorsChanged || fontsChanged || sombreChanged || piedChanged || ctaChanged) {
		const doc = parseDocument(originalReglages ?? '');
		if (doc.errors.length) return { changes, errors: [`reglages.yaml illisible : ${doc.errors[0].message}`] };
		if (doc.contents === null) doc.contents = new YAMLMap() as never;
		if (colorsChanged) setColors(doc, input.colors);
		if (sombreChanged) setSombre(doc, sombreApres!);
		if (piedChanged) setPied(doc, piedApres!);
		if (fontsChanged) setFonts(doc, fontsPlan!.polices);
		if (ctaChanged) setCta(doc, input.cta!);
		reglagesText = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
		parseReglages(reglagesText);
	}

	const images = await contentTransaction(imagesDir(), 'images', async (root) => {
		const existing = await readdir(root);
		if (logo && 'data' in logo) {
			for (const f of existing.filter((f) => f.startsWith('logo.'))) await rm(join(root, f));
			await writeFile(join(root, `logo.${logo.ext}`), logo.data);
		}
		if (logoSombre || logoSombreRetire) {
			for (const f of existing.filter((f) => f.startsWith('logo-sombre.'))) await rm(join(root, f));
			if (logoSombre && 'data' in logoSombre) await writeFile(join(root, `logo-sombre.${logoSombre.ext}`), logoSombre.data);
		}
		if (favicon && 'files' in favicon) {
			for (const f of existing.filter((f) => f.startsWith('favicon.'))) await rm(join(root, f));
			for (const file of favicon.files) await writeFile(join(root, `favicon.${file.ext}`), file.data);
		}
	});
	let fonts: Applied | null = null;
	try {
		if (fontsPlan && fontsChanged && (fontsPlan.write.length || fontsPlan.remove.length)) {
			await mkdir(fontsDir(), { recursive: true });
			fonts = await contentTransaction(fontsDir(), 'polices', async (root) => {
				for (const f of fontsPlan.remove) await rm(join(root, f), { force: true });
				for (const f of fontsPlan.write) await writeFile(join(root, f.file), f.data);
			});
		}
		if (reglagesText !== null) await writeFile(reglagesFile(), reglagesText, 'utf8');
	} catch (err) {
		await images.restore();
		await fonts?.restore();
		throw err;
	}
	return {
		changes,
		errors: [],
		applied: {
			restore: async () => {
				await images.restore();
				await fonts?.restore();
				if (reglagesText !== null && originalReglages !== null) await writeFile(reglagesFile(), originalReglages, 'utf8');
				else if (reglagesText !== null) await rm(reglagesFile(), { force: true });
			},
			purge: async () => {
				await images.purge();
				await fonts?.purge();
			},
		},
	};
}

/** Corps JSON du formulaire → `BrandInput` (types forcés, rien n'est validé ici). */
export function readBrandInput(raw: unknown): BrandInput | { error: string } {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const c = (r.colors && typeof r.colors === 'object' ? r.colors : {}) as Record<string, unknown>;
	const color = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
	const upload = (v: unknown, what: string): BrandUpload | null | { error: string } => {
		if (!v || typeof v !== 'object') return null;
		const u = v as { type?: unknown; data?: unknown };
		const data = Buffer.from(String(u.data ?? ''), 'base64');
		if (!data.length) return { error: `${what} : fichier vide.` };
		if (data.length > BRAND_FILE_MAX_BYTES) return { error: `${what} : fichier trop lourd (5 Mo max).` };
		return { type: String(u.type ?? ''), data };
	};
	const logo = upload(r.logo, 'Logo');
	const logoSombre = upload(r.logoSombre, 'Logo du mode sombre');
	const favicon = upload(r.favicon, 'Icône d’onglet');
	if (logo && 'error' in logo) return logo;
	if (logoSombre && 'error' in logoSombre) return logoSombre;
	if (favicon && 'error' in favicon) return favicon;
	const fonts = readFontsInput(r.fonts);
	if (fonts && 'error' in fonts) return fonts;
	return {
		fonts,
		colors: {
			primary: color(c.primary),
			secondary: color(c.secondary),
			accent: color(c.accent),
			stripe: Array.isArray(c.stripe) ? c.stripe.map(color) : [],
			stripeEnabled: c.stripeEnabled !== false,
		},
		sombre: readSombreInput(r.sombre, color),
		pied: readPiedInput(r.pied, color),
		cta: readCtaInput(r.cta),
		logo,
		logoSombre,
		retirerLogoSombre: r.retirerLogoSombre === true,
		favicon,
	};
}

/** Partie `cta` du corps JSON ; `null` = absente (bouton inchangé). */
function readCtaInput(raw: unknown): LinkToggle | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
	return { label: text(o.label), href: text(o.href), enabled: o.enabled !== false };
}

/** Partie `pied` du corps JSON ; `null` = absente (pied de page inchangé). */
function readPiedInput(raw: unknown, color: (v: unknown) => string): ReglagePied | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const s = (o.sombre && typeof o.sombre === 'object' ? o.sombre : {}) as Record<string, unknown>;
	return { fond: color(o.fond), texte: color(o.texte), sombre: { fond: color(s.fond) || undefined, texte: color(s.texte) || undefined } };
}

/** Partie `sombre` du corps JSON ; `null` = absente (mode sombre inchangé). */
function readSombreInput(raw: unknown, color: (v: unknown) => string): ReglageSombre | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const facultative = (v: unknown) => color(v) || undefined;
	return {
		enabled: o.enabled === true,
		fond: color(o.fond),
		surface: color(o.surface),
		texte: color(o.texte),
		primary: facultative(o.primary),
		secondary: facultative(o.secondary),
		accent: facultative(o.accent),
	};
}

/** Partie `fonts` du corps JSON (fichiers en base64) ; `null` = absente. */
function readFontsInput(raw: unknown): FontsInput | null | { error: string } {
	if (!raw || typeof raw !== 'object') return null;
	const f = raw as Record<string, unknown>;
	const list = (v: unknown) => (Array.isArray(v) ? v : []);
	const ajouts: FontUpload[] = [];
	for (const a of list(f.ajouts)) {
		const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
		const fichiers: FontUpload['fichiers'] = [];
		for (const file of list(o.fichiers)) {
			const x = (file && typeof file === 'object' ? file : {}) as Record<string, unknown>;
			const data = Buffer.from(String(x.data ?? ''), 'base64');
			if (!data.length) return { error: `Police « ${String(o.nom ?? '')} » : fichier vide.` };
			if (data.length > FONT_FILE_MAX) return { error: `Police « ${String(o.nom ?? '')} » : fichier trop lourd (2 Mo max).` };
			fichiers.push({ graisse: String(x.graisse ?? '') as FontWeight, data });
		}
		ajouts.push({ nom: String(o.nom ?? ''), fichiers });
	}
	return {
		titres: String(f.titres ?? ''),
		texte: String(f.texte ?? ''),
		ajouts,
		retraits: list(f.retraits).map(String),
	};
}
