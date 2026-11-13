/**
 * Réglages du site : couleurs, polices, bouton « Adhérer », lien « Je participe »,
 * outils de partage, ouverture/fermeture des formulaires, plugins actifs.
 *
 * Les valeurs ci-dessous (`DEFAULTS`) sont celles du modèle. Chaque
 * association les remplace dans `src/content/reglages.yaml`, fichier qui lui
 * appartient et qu'une mise à jour du modèle ne remplace pas. Tout y est
 * facultatif : une clé absente garde la valeur par défaut — un formulaire
 * ajouté par une mise à jour fonctionne donc sans toucher au YAML. Une clé
 * inconnue (faute de frappe) fait échouer le build avec son chemin.
 *
 * Même principe que `src/lib/association.ts` (`?raw`, lecture synchrone).
 * Pages du site (Accueil, Activités…) : module « Pages », pas ici.
 */

import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';
import raw from '../content/reglages.yaml?raw';
import { catalogueFont, DEFAULT_FONTS, FONT_FILE_PATTERN, FONT_NAME_MAX, FONT_WEIGHTS, type FontRole, type FontWeight } from '../lib/font-catalogue';
import { actifParDefaut, PLUGIN_IDS, resoudrePlugins, type PluginId } from '../plugins/catalogue';
import { STRUCTURES } from '../lib/structure';

export interface FormToggle {
	/** `false` masque le formulaire et affiche `closedTitle` + `closedMessage` à la place. */
	enabled: boolean;
	/** Titre du bloc affiché quand le formulaire est fermé. */
	closedTitle: string;
	/** Message affiché quand le formulaire est fermé. */
	closedMessage: string;
}

/** Police déposée par l'association : fichiers de `src/content/polices/`, par graisse. */
export interface UploadedFont {
	nom: string;
	fichiers: Partial<Record<FontWeight, string>>;
}

/** Polices du site : `titres` / `texte` = id d'une police proposée (`FONT_CATALOGUE`) ou `nom` d'une police déposée. */
export interface SiteFonts extends Record<FontRole, string> {
	deposees: UploadedFont[];
}

interface LinkToggle {
	label: string;
	href: string;
	enabled: boolean;
}

const DEFAULTS = {
	/**
	 * Couleurs du thème. `primary` / `secondary` / `accent` remplacent au
	 * rendu les variables `--color-*` de Tailwind (`themeCss`, injecté par les
	 * layouts : `bg-primary`, `text-accent/80`… suivent) ; `stripe` = bande
	 * de couleurs sous l'en-tête (`BrandStripe.astro`). Valeurs par défaut =
	 * celles de `@theme` dans `src/styles/global.css`, à garder alignées.
	 */
	colors: {
		primary: '#2e2e2e',
		secondary: '#2e2e2e',
		accent: '#2e2e2e',
		stripe: ['#2e2e2e'],
		/** `false` = pas de bande de couleurs (en-tête, PDF des RDV). */
		stripeEnabled: true,
	},

	/**
	 * Polices (`src/lib/font-catalogue.ts`, CSS produit par `src/lib/fonts.ts`
	 * et injecté par les layouts). Défaut : polices proposées par le modèle.
	 */
	polices: { ...DEFAULT_FONTS, deposees: [] } as SiteFonts,

	/**
	 * Bouton d'appel à l'action affiché à droite de la barre de navigation.
	 * Ce n'est jamais une entrée de menu. `enabled: false` le masque complètement.
	 */
	cta: {
		label: 'Adhérer',
		href: '/adherer',
		enabled: true,
	} as LinkToggle,

	/**
	 * Lien rapide vers le dispositif de présence (« Je participe »).
	 * Pensé pour un usage « téléphone en main » pendant un atelier : affiché
	 * uniquement sur mobile/tablette (`lg:hidden` dans `Header.astro`), jamais
	 * dans la navbar desktop ni dans le menu déroulant mobile. Ce n'est pas
	 * une page du menu de navigation.
	 */
	presence: {
		label: 'Je participe',
		href: '/je-participe',
		enabled: true,
	} as LinkToggle,

	/**
	 * Outils de partage affichés en bas des actualités et des pages de
	 * contenu (`src/components/article/ShareTools.astro`). `false` masque
	 * l'outil ; si tous sont à `false`, l'encart disparaît.
	 */
	share: {
		facebook: true,
		/** « Copier le lien » : à coller dans une publication (ex. au nom d'une Page Facebook, que la fenêtre de partage bloque). */
		copy: true,
	},

	/**
	 * Ouverture/fermeture des formulaires du site.
	 *
	 * `enabled: false` → le formulaire est remplacé par un encart informatif
	 * (`closedTitle` + `closedMessage`) via le composant `<FormGate form="…">`
	 * (voir `src/components/forms/FormGate.astro`).
	 *
	 * Pour un futur formulaire : ajouter une clé ici, puis entourer le
	 * formulaire de `<FormGate form="<clé>">…</FormGate>`.
	 */
	forms: {
		adhesion: {
			enabled: true,
			closedTitle: 'Adhésions en ligne momentanément fermées',
			closedMessage:
				"Le formulaire d'adhésion en ligne n'est pas ouvert actuellement. " +
				'Vous pouvez adhérer sur place ou nous écrire, nous vous répondrons rapidement.',
		},
		contact: {
			enabled: true,
			closedTitle: 'Formulaire de contact indisponible',
			closedMessage:
				"Le formulaire de contact n'est pas ouvert actuellement. " +
				'Vous pouvez nous joindre par téléphone ou par e-mail (coordonnées ci-contre).',
		},
		inscription: {
			enabled: true,
			closedTitle: 'Inscriptions en ligne momentanément fermées',
			closedMessage:
				"Le formulaire d'inscription en ligne n'est pas ouvert actuellement. " +
				'Vous pouvez nous contacter directement pour vous inscrire à une activité.',
		},
	} satisfies Record<string, FormToggle>,

	/**
	 * Plugins actifs (`src/plugins/`, catalogue `src/plugins/catalogue.ts`) :
	 * inactifs par défaut sauf `actifParDefaut` du catalogue (adhésion),
	 * l'association active ceux qu'elle veut (`plugins: { rdv: true }`) ou en
	 * désactive (`adhesion: false`). Changer ce réglage demande une reconstruction.
	 */
	plugins: Object.fromEntries(PLUGIN_IDS.map((id) => [id, actifParDefaut(id)])) as Record<PluginId, boolean>,
};

/** Couleurs du modèle (« rétablir » du module « Association », onglet Charte graphique). */
export const DEFAULT_COLORS: Readonly<typeof DEFAULTS.colors> = DEFAULTS.colors;
export type ThemeColors = typeof DEFAULTS.colors;
/** Format accepté pour une couleur (`'#2f7fc1'` ou `'#28c'`). */
export const COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

type FormKey = keyof typeof DEFAULTS.forms;
type ShareKey = keyof typeof DEFAULTS.share;

const text = z.string({ error: 'texte attendu' }).trim().min(1, 'texte vide');
const bool = z.boolean({ error: 'true ou false attendu' });
const color = z
	.string({ error: "couleur attendue, entre apostrophes (ex. '#2f7fc1')" })
	.regex(COLOR_PATTERN, "couleur au format '#2f7fc1'");

const fontFile = z.string({ error: 'nom de fichier attendu' }).regex(FONT_FILE_PATTERN, 'fichier de src/content/polices/ (ex. ma-police-400.woff2)');
const uploadedFontSchema = z.strictObject({
	nom: text.max(FONT_NAME_MAX, `${FONT_NAME_MAX} caractères au plus`),
	fichiers: z
		.strictObject(Object.fromEntries(FONT_WEIGHTS.map((w) => [w, fontFile])) as Record<FontWeight, typeof fontFile>)
		.partial()
		.refine((f) => Object.keys(f).length > 0, 'au moins un fichier'),
});
const fontsSchema = z
	.strictObject({ titres: text, texte: text, deposees: z.array(uploadedFontSchema, { error: 'liste de polices attendue' }) })
	.partial()
	.superRefine((v, ctx) => {
		const names = (v.deposees ?? []).map((d) => d.nom);
		names.forEach((n, i) => {
			if (names.indexOf(n) !== i) ctx.addIssue({ code: 'custom', path: ['deposees', i, 'nom'], message: `police « ${n} » déclarée deux fois` });
			if (catalogueFont(n) || catalogueFont(n.toLowerCase())) ctx.addIssue({ code: 'custom', path: ['deposees', i, 'nom'], message: `« ${n} » est déjà une police proposée` });
		});
		for (const role of ['titres', 'texte'] as const) {
			const value = v[role];
			if (value !== undefined && !catalogueFont(value) && !names.includes(value)) {
				ctx.addIssue({ code: 'custom', path: [role], message: `police inconnue « ${value} » (police proposée ou nom d'une police de « deposees »)` });
			}
		}
	});

const linkSchema = z.strictObject({ label: text, href: text, enabled: bool }).partial();
const formSchema = z.strictObject({ enabled: bool, closedTitle: text, closedMessage: text }).partial();

/** Réglages de l'association : tout facultatif, clés inconnues refusées. */
const overridesSchema = z
	.strictObject({
		colors: z
			.strictObject({
				primary: color,
				secondary: color,
				accent: color,
				stripe: z.array(color, { error: 'liste de couleurs attendue' }).min(1, 'au moins une couleur'),
				stripeEnabled: bool,
			})
			.partial(),
		polices: fontsSchema,
		cta: linkSchema,
		presence: linkSchema,
		share: z.strictObject(Object.fromEntries(Object.keys(DEFAULTS.share).map((k) => [k, bool])) as Record<ShareKey, z.ZodBoolean>).partial(),
		forms: z.strictObject(Object.fromEntries(Object.keys(DEFAULTS.forms).map((k) => [k, formSchema])) as Record<FormKey, typeof formSchema>).partial(),
		plugins: z.strictObject(Object.fromEntries(PLUGIN_IDS.map((id) => [id, bool])) as Record<PluginId, z.ZodBoolean>).partial(),
		/** Type de structure (src/lib/structure.ts) : `association` (défaut) ou `entreprise`. */
		structure: z.enum(STRUCTURES, { error: `${STRUCTURES.join(' ou ')} attendu` }),
	})
	.partial()
	.nullish()
	.transform((v) => v ?? {});

/** Lit et valide le texte de `reglages.yaml` (aussi avant écriture, `brand-writer.ts`) : réglages fusionnés avec `DEFAULTS`. */
export function parseReglages(text: string) {
	const result = overridesSchema.safeParse(parseYaml(text));
	if (!result.success) {
		const details = result.error.issues
			.map((i) => {
				const where = i.path.join('.') || '(fichier)';
				const message = i.code === 'unrecognized_keys' ? `clé inconnue « ${i.keys.join(' », « ')} »` : i.message;
				return `  - ${where} : ${message}`;
			})
			.join('\n');
		throw new Error(`src/content/reglages.yaml invalide :\n${details}`);
	}
	const o = result.data;
	const structure = o.structure ?? 'association';
	return {
		structure,
		colors: { ...DEFAULTS.colors, ...o.colors },
		polices: { ...DEFAULTS.polices, ...o.polices } as SiteFonts,
		cta: { ...DEFAULTS.cta, ...o.cta },
		presence: { ...DEFAULTS.presence, ...o.presence },
		share: { ...DEFAULTS.share, ...o.share },
		forms: Object.fromEntries(
			Object.entries(DEFAULTS.forms).map(([k, d]) => [k, { ...d, ...o.forms?.[k as FormKey] }]),
		) as Record<FormKey, FormToggle>,
		// Valeurs écrites, sinon défauts ; inactif si un plugin requis l'est.
		plugins: resoudrePlugins({ ...DEFAULTS.plugins, ...o.plugins }, structure),
	};
}

export const site = parseReglages(raw);

/** Variables CSS des couleurs du thème, injectées dans `<head>` par les layouts. */
export const themeCss = `:root{--color-primary:${site.colors.primary};--color-secondary:${site.colors.secondary};--color-accent:${site.colors.accent}}`;
