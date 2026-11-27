/**
 * Collections de contenu (Content Layer d'Astro) : tout le contenu éditorial
 * vit dans `src/content/` et est validé au build — `npm run build` produit le
 * site complet. Doc : https://docs.astro.build/en/guides/content-collections/
 *
 * Collections : `news` (actualités), `pages` + `pageGroups` (pages
 * éditoriales et menus déroulants), `activites` (fiches d'activité),
 * `annonces` (bannière en haut du site).
 */

import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';
import { parseAccess } from './lib/auth/access';
import { validateBloc, type Bloc } from './lib/blocs';
import { validateHomeModules } from './lib/home-modules';
import { SITE_PAGE_IDS, SITE_PAGES, sitePageTextNames } from './lib/site-pages';
import { categories } from './lib/categories';
import { annonceFields, END_AFTER_START, endAfterStart } from './lib/annonce-schema';

/** Types de blocs ou de modules inconnus (extension retirée ou pas installée) : ignorés, signalés une fois. */
const dejaSignales = new Set<string>();
function avertirTypesInconnus(quoi: string, types: string[]) {
	for (const type of types) {
		if (dejaSignales.has(`${quoi}:${type}`)) continue;
		dejaSignales.add(`${quoi}:${type}`);
		console.warn(`[contenu] ${quoi} de type « ${type} » ignoré : type inconnu (extension absente ou désactivée ? cf. module « Extensions »).`);
	}
}

/**
 * Blocs d'un contenu (pages, actualités, activités), par
 * identifiant, placés dans le texte par `[[bloc:<id>]]` (cf. `src/lib/blocs.ts`).
 * Type inconnu (extension absente) : ignoré avec un avertissement.
 */
function blocsSchema() {
	return z
		.record(z.string(), z.unknown())
		.optional()
		.transform((value, ctx) => {
			const blocs: Record<string, Bloc> = {};
			for (const [id, raw] of Object.entries(value ?? {})) {
				const typesInconnus: string[] = [];
				const { bloc, errors } = validateBloc(id, raw, { typesInconnus });
				avertirTypesInconnus('bloc', typesInconnus);
				for (const message of errors) ctx.addIssue({ code: 'custom', message });
				if (bloc) blocs[id] = bloc;
			}
			return blocs;
		});
}

/**
 * Actualités : un dossier par article, `src/content/news/<AAAA-MM-JJ-slug>/`
 * contenant `index.md` (+ la photo citée par `cover:`). L'identifiant de
 * l'entrée — et donc l'URL `/actualites/<id>` — est le nom du dossier.
 */
const news = defineCollection({
	loader: glob({
		pattern: '*/index.md',
		base: './src/content/news',
		generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
	}),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			/** Date de publication (AAAA-MM-JJ) : tri et affichage. */
			publishAt: z.coerce.date(),
			/** Résumé court : cartes, accueil, flux RSS, aperçu de partage. */
			excerpt: z.string(),
			/** `false` = brouillon : absent du site (listes, accueil, RSS, page de détail). */
			isPublish: z.boolean().default(true),
			tag: z.string().optional(),
			author: z.string().optional(),
			/** Photo de couverture, chemin relatif au dossier (`./cover.jpg`). */
			cover: image().optional(),
			/** Légende de la photo sur la page de détail (défaut : « Photo : <association> »). */
			imageCredit: z.string().optional(),
			/**
			 * Activité liée (nom du dossier de la fiche) : actualité créée depuis
			 * l'onglet « Partage » d'une activité, terminée par « S'inscrire ».
			 */
			activite: z.string().optional(),
			/** Blocs placés dans le texte (photos, vidéo, carrousel…). */
			blocs: blocsSchema(),
			/** Diffusions sur les réseaux sociaux, écrites par le serveur (plugin `diffusion`, `src/lib/diffusion.ts`). */
			diffusion: z.record(z.string(), z.object({ id: z.string(), date: z.union([z.string(), z.date()]), lien: z.string().optional(), par: z.string().optional() })).optional(),
		}),
});

/**
 * Pages éditoriales : `src/content/pages/<chemin>/index.{md,mdx}` → URL
 * `/<chemin>`. Le chemin du dossier pilote l'URL ET le menu (cf.
 * `src/lib/content-pages.ts`, `src/lib/navigation.ts`).
 * Les pages réservées (`access:`) vivent dans `espace-benevoles/` : seule
 * partie rendue à la demande, tout le reste est prérendu.
 */
const pages = defineCollection({
	loader: glob({
		pattern: '**/index.{md,mdx}',
		base: './src/content/pages',
		generateId: ({ entry }) => entry.replace(/\/index\.mdx?$/, ''),
	}),
	schema: ({ image }) =>
		z.object({
			/** Défaut : nom du dossier mis en forme (`notre-histoire` → « Notre Histoire »). */
			title: z.string().optional(),
			description: z.string().optional(),
			/** Absent = page accessible par son URL mais hors du menu. */
			menu: z
				.object({
					show: z.boolean().default(false),
					order: z.number().default(99),
					label: z.string().optional(),
				})
				.optional(),
			/** Lien dans le bas du pied de page (mentions légales, CGV…), cf. `src/lib/pied-pages.ts`. */
			pied: z
				.object({
					show: z.boolean().default(false),
					order: z.number().default(99),
				})
				.optional(),
			cover: image().optional(),
			imageCredit: z.string().optional(),
			/**
			 * `classique` = page simple (texte + blocs) ; `enrichie` = page
			 * composée de **sections** (`sections:`, catalogue
			 * `src/lib/home-modules.ts`, dont « Contenu de la page »). Ancienne
			 * page `enrichie` sans `sections:` (blocs seulement) : page simple.
			 */
			type: z.enum(['classique', 'enrichie']).default('classique'),
			/** Blocs du texte, par identifiant (cf. `src/lib/blocs.ts`) : toute page. */
			blocs: blocsSchema(),
			/** Sections d'une page enrichie, dans l'ordre d'affichage. */
			sections: z
				.array(z.unknown())
				.optional()
				.transform((value, ctx) => {
					if (value === undefined) return undefined;
					const typesInconnus: string[] = [];
					const { modules, errors } = validateHomeModules(value, { contexte: 'page', typesInconnus });
					avertirTypesInconnus('section', typesInconnus);
					for (const message of errors) ctx.addIssue({ code: 'custom', message });
					return modules;
				}),
			/**
			 * Restriction d'accès (pages de `espace-benevoles/` uniquement) :
			 * `true` (toute personne connectée), un groupe ou une liste. Un
			 * groupe inconnu fait échouer le build (cf. `parseAccess`).
			 */
			access: z
				.unknown()
				.optional()
				.transform((value, ctx) => {
					try {
						return parseAccess(value);
					} catch (err) {
						ctx.addIssue({ code: 'custom', message: (err as Error).message });
						return z.NEVER;
					}
				}),
		}),
});

/**
 * Menus déroulants : `src/content/pages/<dossier>/_group.md` (frontmatter
 * seul) donne le libellé et la position du dropdown de ce dossier.
 */
const pageGroups = defineCollection({
	loader: glob({
		pattern: '**/_group.md',
		base: './src/content/pages',
		generateId: ({ entry }) => entry.replace(/\/_group\.md$/, ''),
	}),
	schema: z.object({
		label: z.string().optional(),
		order: z.number().default(50),
	}),
});

/**
 * Pages du site (bibliothèque `src/lib/site-pages.ts` : Accueil, Activités…) :
 * réglages de l'association dans `src/content/pages/_pages-site.md`
 * (frontmatter seul, écrit par le module « Pages », `pages: {}` sans
 * réglage). Page ou texte inconnu, accueil désactivé = build en échec.
 */
const sitePages = defineCollection({
	loader: glob({ pattern: '_pages-site.md', base: './src/content/pages' }),
	schema: z.object({
		pages: z
			.record(
				z.string(),
				z.object({
					active: z.boolean().optional(),
					label: z.string().optional(),
					order: z.number().optional(),
					show: z.boolean().optional(),
					textes: z.record(z.string(), z.string()).optional(),
					/** Page à modules (accueil) : cf. src/lib/home-modules.ts. */
					modules: z.array(z.unknown()).optional(),
				}),
			)
			.default({})
			.superRefine((pages, ctx) => {
				for (const [id, settings] of Object.entries(pages)) {
					const def = SITE_PAGES.find((p) => p.id === id);
					if (!def) {
						ctx.addIssue({ code: 'custom', message: `Page du site inconnue « ${id} » ; attendues : ${SITE_PAGE_IDS.join(', ')}.` });
						continue;
					}
					if (!def.canDisable && settings.active === false) {
						ctx.addIssue({ code: 'custom', message: `La page « ${id} » ne peut pas être désactivée.` });
					}
					if (settings.modules) {
						if (!def.modules) ctx.addIssue({ code: 'custom', message: `La page « ${id} » n'est pas composée de modules.` });
						const typesInconnus: string[] = [];
						for (const message of validateHomeModules(settings.modules, { typesInconnus }).errors) ctx.addIssue({ code: 'custom', message });
						avertirTypesInconnus("module d'accueil", typesInconnus);
					}
					const names = sitePageTextNames(id);
					for (const name of Object.keys(settings.textes ?? {})) {
						if (!names.includes(name)) ctx.addIssue({ code: 'custom', message: `Page « ${id} » : texte inconnu « ${name} ».` });
					}
				}
			}),
	}),
});

/**
 * Fiches d'activité : `src/content/activites/<slug>/index.md` →
 * `/activites/<category>/<slug>`. La catégorie doit exister dans
 * `src/lib/categories.ts`.
 */
const categorySlugs = categories.map((c) => c.slug) as [string, ...string[]];

const activites = defineCollection({
	loader: glob({
		pattern: '*/index.md',
		base: './src/content/activites',
		generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
	}),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			excerpt: z.string(),
			category: z.enum(categorySlugs),
			/** `false` = brouillon, absent du site. */
			isPublish: z.boolean().default(true),
			/** Public visé, affiché sur la carte (ex. « Tous niveaux »). */
			level: z.string().optional(),
			/** Position dans la catégorie (croissant). */
			order: z.number().default(999),
			/** `false` masque le bouton « S'inscrire » (ex. activité sur rendez-vous). */
			inscription: z.boolean().default(true),
			/** Nom(s) `Activite.Nom` dans Grist ciblés par « S'inscrire » ; `*` final = préfixe. */
			activiteGrist: z.union([z.string(), z.array(z.string())]).optional(),
			/** `Activite.Type` dans Grist ciblé par « S'inscrire ». */
			typeGrist: z.string().optional(),
			cover: image().optional(),
			imageCredit: z.string().optional(),
			/** Blocs placés dans le texte (photos, vidéo, carrousel…). */
			blocs: blocsSchema(),
		}),
});

/**
 * Annonces de la bannière : `src/content/annonces.yaml`, une liste d'entrées
 * (`id` obligatoire). Le filtrage par dates est fait dans le navigateur
 * (`AnnonceBanner.astro`) pour rester juste sans reconstruire le site.
 * `position` (rang dans le fichier, ajouté à la lecture) conserve l'ordre de
 * rotation voulu par l'éditeur : `getCollection()` ne le garantit pas.
 */
const annonces = defineCollection({
	loader: file('./src/content/annonces.yaml', {
		parser: (text) => {
			const list = parseYaml(text);
			return Array.isArray(list) ? list.map((entry, position) => ({ ...entry, position })) : list;
		},
	}),
	// Règles partagées avec le module « Annonces » (src/lib/annonce-schema.ts).
	schema: annonceFields.extend({ position: z.number() }).refine(endAfterStart, { message: END_AFTER_START }),
});

export const collections = { news, pages, pageGroups, sitePages, activites, annonces };
