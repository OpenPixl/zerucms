/**
 * Mode sombre proposé aux visiteurs (bouton de l'en-tête) : palette du
 * fond, des surfaces et du texte, variantes sombres des couleurs de marque.
 * Réglage `sombre:` de `src/content/reglages.yaml` (lu par
 * `src/config/site.ts`, écrit par `src/lib/brand-writer.ts` depuis le module
 * « Charte graphique », onglet « Mode sombre »). Désactivé par défaut.
 *
 * Sans dépendance : utilisé au build (CSS du thème) et dans l'îlot Vue
 * (formulaire, aperçu, contrastes).
 *
 * Principe CSS (`src/styles/global.css`) : sous `html[data-theme="dark"]`,
 * l'échelle des gris de Tailwind est recalculée depuis la palette
 * (`text-gray-900` devient le texte clair, `bg-gray-100` une surface
 * foncée…), `bg-surface` / `bg-fond` prennent les teintes sombres ; l'Espace
 * Admin garde ses couleurs claires.
 */

export interface PaletteSombre {
	id: string;
	label: string;
	/** D'où vient la palette (aide du formulaire). */
	origine: string;
	fond: string;
	surface: string;
	texte: string;
}

/** Palettes « classiques » du mode sombre, proposées dans la charte graphique. */
export const PALETTES_SOMBRES: readonly PaletteSombre[] = [
	{ id: 'material', label: 'Material', origine: 'recommandation de Google (Material Design)', fond: '#121212', surface: '#1e1e1e', texte: '#e3e3e3' },
	{ id: 'github', label: 'GitHub', origine: 'thème sombre de GitHub', fond: '#0d1117', surface: '#161b22', texte: '#e6edf3' },
	{ id: 'ardoise', label: 'Ardoise', origine: 'gris bleutés (Tailwind « slate »)', fond: '#0f172a', surface: '#1e293b', texte: '#e2e8f0' },
	{ id: 'neutre', label: 'Neutre', origine: 'gris purs (Tailwind « zinc »)', fond: '#18181b', surface: '#27272a', texte: '#e4e4e7' },
	{ id: 'solarized', label: 'Solarized', origine: 'palette Solarized, tons chauds', fond: '#002b36', surface: '#073642', texte: '#eee8d5' },
];

/** Palette par défaut (site neuf, mode sombre jamais réglé). */
export const PALETTE_SOMBRE_DEFAUT = PALETTES_SOMBRES[0];

export const MARQUE = ['primary', 'secondary', 'accent'] as const;
export type CouleurMarque = (typeof MARQUE)[number];

/** Réglage `sombre:` lu (couleurs de marque absentes = calculées). */
export interface ReglageSombre {
	enabled: boolean;
	fond: string;
	surface: string;
	texte: string;
	primary?: string;
	secondary?: string;
	accent?: string;
}

export const DEFAULT_SOMBRE: ReglageSombre = {
	enabled: false,
	fond: PALETTE_SOMBRE_DEFAUT.fond,
	surface: PALETTE_SOMBRE_DEFAUT.surface,
	texte: PALETTE_SOMBRE_DEFAUT.texte,
};

/** `#28c` → `#2288cc`. */
export function hexComplet(hex: string): string {
	return hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex.toLowerCase();
}

function rgb(hex: string): [number, number, number] {
	const n = parseInt(hexComplet(hex).slice(1), 16);
	return [n >> 16, (n >> 8) & 255, n & 255];
}

/** Luminance relative (WCAG 2.1), de 0 (noir) à 1 (blanc). */
export function luminance(hex: string): number {
	const [r, g, b] = rgb(hex).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs (1 à 21). */
export function contraste(a: string, b: string): number {
	const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Luminance visée pour une couleur de marque en mode sombre : lisible sur un
 * fond très sombre (lien, titre : ≈ 4:1) tout en gardant le texte blanc
 * lisible dessus (bouton : ≈ 4:1).
 */
const LUMINANCE_CIBLE = 0.18;

/** Mélange `hex` avec du blanc (`t` de 0 à 1). */
function eclaircir(hex: string, t: number): string {
	return `#${rgb(hex)
		.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0'))
		.join('')}`;
}

/**
 * Variante sombre automatique d'une couleur de marque : éclaircie juste ce
 * qu'il faut pour se détacher d'un fond sombre ; une couleur déjà claire est
 * gardée telle quelle.
 */
export function couleurSombreAuto(hex: string): string {
	const base = hexComplet(hex);
	if (luminance(base) >= LUMINANCE_CIBLE) return base;
	let bas = 0;
	let haut = 1;
	for (let i = 0; i < 20; i++) {
		const t = (bas + haut) / 2;
		if (luminance(eclaircir(base, t)) < LUMINANCE_CIBLE) bas = t;
		else haut = t;
	}
	return eclaircir(base, haut);
}

/** Couleurs de marque du mode sombre : réglées, sinon calculées depuis celles du mode clair. */
export function marqueSombre(clair: Record<CouleurMarque, string>, sombre: ReglageSombre): Record<CouleurMarque, string> {
	return Object.fromEntries(MARQUE.map((k) => [k, sombre[k] ?? couleurSombreAuto(clair[k])])) as Record<CouleurMarque, string>;
}

/**
 * Variables CSS du mode sombre (dans `themeCss`) : palette et couleurs de
 * marque, sous `html[data-theme="dark"]` ; vide si le mode est désactivé.
 */
export function sombreCss(clair: Record<CouleurMarque, string>, sombre: ReglageSombre): string {
	if (!sombre.enabled) return '';
	const m = marqueSombre(clair, sombre);
	return `:root[data-theme=dark]{--sombre-fond:${sombre.fond};--sombre-surface:${sombre.surface};--sombre-texte:${sombre.texte};--color-primary:${m.primary};--color-secondary:${m.secondary};--color-accent:${m.accent}}`;
}
