/**
 * Polices du site : catalogue des polices proposées par le modèle et règles
 * des polices déposées par l'association. Aucune dépendance (lu par
 * `src/config/site.ts`, `src/lib/fonts.ts`, `brand-writer.ts` et l'îlot Vue).
 *
 * Deux rôles : `titres` (h1…h6, classe `font-heading`) et `texte` (tout le
 * reste). Réglés dans `polices:` de `src/content/reglages.yaml` (module
 * « Charte graphique », onglet « Polices ») ; sans réglage,
 * `DEFAULT_FONTS`.
 *
 * Polices proposées : paquets `@fontsource-variable/<id>` (un fichier
 * « variable » couvre toutes les graisses), servies par le site lui-même —
 * jamais par Google Fonts (adresse IP des visiteurs transmise à Google).
 * Ajouter une police = `npm i @fontsource-variable/<id>` + une entrée ici
 * (+ son fichier dans `CATALOGUE_FILES` de `fonts.ts`).
 */

export interface CatalogueFont {
	/** Nom du paquet `@fontsource-variable/<id>` et valeur écrite dans `reglages.yaml`. */
	id: string;
	label: string;
	/** `font-family` déclarée. */
	family: string;
	/** Graisses couvertes par le fichier variable. */
	weight: string;
	kind: 'sans' | 'serif';
}

export const FONT_CATALOGUE = [
	{ id: 'montserrat', label: 'Montserrat', family: 'Montserrat Variable', weight: '100 900', kind: 'sans' },
	{ id: 'open-sans', label: 'Open Sans', family: 'Open Sans Variable', weight: '300 800', kind: 'sans' },
	{ id: 'inter', label: 'Inter', family: 'Inter Variable', weight: '100 900', kind: 'sans' },
	{ id: 'roboto', label: 'Roboto', family: 'Roboto Variable', weight: '100 900', kind: 'sans' },
	{ id: 'raleway', label: 'Raleway', family: 'Raleway Variable', weight: '100 900', kind: 'sans' },
	{ id: 'source-sans-3', label: 'Source Sans 3', family: 'Source Sans 3 Variable', weight: '200 900', kind: 'sans' },
	{ id: 'nunito', label: 'Nunito', family: 'Nunito Variable', weight: '200 1000', kind: 'sans' },
	{ id: 'work-sans', label: 'Work Sans', family: 'Work Sans Variable', weight: '100 900', kind: 'sans' },
	{ id: 'lora', label: 'Lora (avec empattements)', family: 'Lora Variable', weight: '400 700', kind: 'serif' },
] as const satisfies readonly CatalogueFont[];

export type CatalogueFontId = (typeof FONT_CATALOGUE)[number]['id'];
export const catalogueFont = (id: string): CatalogueFont | undefined => FONT_CATALOGUE.find((f) => f.id === id);

export type FontRole = 'titres' | 'texte';
export const FONT_ROLES: { role: FontRole; label: string; help: string }[] = [
	{ role: 'titres', label: 'Titres', help: 'titres des pages et des sections, nom du site' },
	{ role: 'texte', label: 'Texte', help: 'paragraphes, menus, boutons, formulaires' },
];

/** Polices du modèle quand l'association n'a rien choisi. */
export const DEFAULT_FONTS: Record<FontRole, CatalogueFontId> = { titres: 'montserrat', texte: 'open-sans' };

/** Graisses d'un fichier déposé ; `variable` = fichier qui les couvre toutes. */
export const FONT_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'variable'] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];
export const WEIGHT_LABELS: Record<FontWeight, string> = {
	'100': '100 · très fin',
	'200': '200 · extra-léger',
	'300': '300 · léger',
	'400': '400 · normal',
	'500': '500 · moyen',
	'600': '600 · semi-gras',
	'700': '700 · gras',
	'800': '800 · extra-gras',
	'900': '900 · noir',
	variable: 'variable · toutes',
};
/** Graisses employées par le site : à fournir pour un rendu net (sinon le navigateur les imite). */
export const WEIGHTS_USED: Record<FontRole, FontWeight[]> = { titres: ['600'], texte: ['300', '400', '500', '600'] };

/** Graisse devinée d'après le nom du fichier (`Aileron-Light.woff2` → 300). */
export function guessWeight(fileName: string): FontWeight {
	const n = fileName.toLowerCase().replace(/\.[a-z0-9]+$/, '');
	if (/variable|\bvf\b|\[wght\]|-vf/.test(n)) return 'variable';
	const digits = n.match(/(?:^|[^0-9])([1-9]00)(?:[^0-9]|$)/);
	if (digits) return digits[1] as FontWeight;
	const words: [RegExp, FontWeight][] = [
		[/hairline|thin/, '100'],
		[/extra-?light|ultra-?light/, '200'],
		[/light/, '300'],
		[/semi-?bold|demi-?bold/, '600'],
		[/extra-?bold|ultra-?bold/, '800'],
		[/black|heavy/, '900'],
		[/bold/, '700'],
		[/medium/, '500'],
	];
	return words.find(([re]) => re.test(n))?.[1] ?? '400';
}

/** Formats de fichier acceptés → `format()` de `@font-face`. */
export const FONT_FORMATS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' } as const;
export type FontExt = keyof typeof FONT_FORMATS;
/** Taille maximale d'un fichier de police déposé. */
export const FONT_FILE_MAX = 2 * 1024 * 1024;
/** Nom de fichier d'une police déposée, dans `src/content/polices/`. */
export const FONT_FILE_PATTERN = /^[a-z0-9][a-z0-9-]*\.(woff2|woff|ttf|otf)$/;
export const FONT_NAME_MAX = 40;

/** « Aileron Light » → `aileron-light` (nom des fichiers déposés). */
export function fontSlug(name: string): string {
	return name
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
}

/** Polices de secours, le temps du chargement ou si un fichier manque. */
export const FALLBACK_STACK = {
	sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
	serif: 'Georgia, Cambria, "Times New Roman", serif',
} as const;
