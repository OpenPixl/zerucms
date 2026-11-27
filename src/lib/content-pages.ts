import { getCollection, render, type CollectionEntry } from 'astro:content';
import type { MarkdownHeading } from 'astro';
import type { PageAccess } from './auth/access';
import { blocMarkersIn, type Bloc } from './blocs';
import { decouperBlocs, type BlocPart } from './bloc-parts';
import { applyPageVariables } from './page-variables';
import { piedDeLaPage, type PiedMeta } from './pied-pages';
import type { HomeModule } from './home-modules';
import { sanitizeNewsHtml } from './sanitize-news';

/**
 * Pages de contenu : collections `pages` et `pageGroups`
 * (`src/content.config.ts`).
 *
 * Toute page rangée dans `src/content/pages/<...>/index.{md,mdx}` devient
 * automatiquement une route (`/<...>`) et peut apparaître dans la navigation
 * via son frontmatter `menu:`. L'arborescence de dossiers pilote l'URL ET le menu :
 *   src/content/pages/statuts/index.md               -> /statuts
 *   src/content/pages/association/_group.md           -> libellé du menu déroulant « Association »
 *   src/content/pages/association/notre-histoire/...  -> /association/notre-histoire (dans le dropdown)
 *
 * Pages `.md` (texte et blocs, cf. `src/lib/blocs.ts` ; pages enrichies : sections) :
 * HTML nettoyé comme celui des actualités, variables `{{…}}` remplacées
 * (`page-variables.ts`). Pages `.mdx` : écrites dans le code, rendues telles
 * quelles (jamais produites par l'Espace Admin).
 *
 * Pages publiques : prérendues par `src/pages/[...slug].astro`.
 * Pages réservées : rangées dans `RESERVED_FOLDER`, rendues à la demande par
 * `src/pages/espace-benevoles/[...slug].astro` (contrôle d'accès, Node requis).
 */

/** Dossier (et préfixe d'URL) des pages réservées aux personnes connectées. */
export const RESERVED_FOLDER = 'espace-benevoles';

export interface PageMenuMeta {
	/** `true` = la page apparaît dans la barre de navigation. */
	show: boolean;
	/** Position relative dans son niveau (navbar ou dropdown). Défaut : 99. */
	order: number;
	/** Libellé affiché dans le menu. Défaut : le `title` de la page. */
	label: string;
}

export interface ContentPage {
	/** Chemin sans slash initial, ex. `association/notre-histoire`. */
	slug: string;
	/** Segments du slug, ex. `['association', 'notre-histoire']`. */
	segments: string[];
	/** URL absolue, ex. `/association/notre-histoire`. */
	url: string;
	title: string;
	description?: string;
	/** `null` si le frontmatter ne contient pas de bloc `menu:`. */
	menu: PageMenuMeta | null;
	/** Lien du bas du pied de page (`pied:`, cf. `src/lib/pied-pages.ts`). */
	pied: PiedMeta;
	/** Image de couverture (frontmatter `cover:`). */
	image?: CollectionEntry<'pages'>['data']['cover'];
	imageCredit?: string;
	/**
	 * Restriction d'accès ; `null` = page publique. Toute page de
	 * `RESERVED_FOLDER` est réservée (`'connecte'` par défaut, ou les groupes
	 * de `access:`), et n'apparaît jamais dans le menu.
	 */
	access: PageAccess;
	/** `classique` = page simple (texte + blocs) ; `enrichie` = page composée de sections. */
	type: 'classique' | 'enrichie';
	/** Blocs du texte, par identifiant (toute page). */
	blocs: Record<string, Bloc>;
	/** Sections d'une page enrichie (`null` : page simple), cf. `src/lib/home-modules.ts`. */
	sections: HomeModule[] | null;
	/** Source `.mdx` (code) plutôt que `.md`. */
	mdx: boolean;
	/** Entrée brute de la collection (pour `render()`). */
	entry: CollectionEntry<'pages'>;
}

export interface GroupMeta {
	label: string;
	order: number;
}

function titleCase(segment: string): string {
	return segment
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

function toPage(entry: CollectionEntry<'pages'>): ContentPage {
	const { data } = entry;
	const slug = entry.id;
	const segments = slug.split('/');
	const title = data.title ?? titleCase(segments[segments.length - 1]);
	const reserved = segments[0] === RESERVED_FOLDER;

	if (data.access !== null && !reserved) {
		// Une page publique ne peut pas être protégée : elle est prérendue, donc lisible par tous.
		throw new Error(
			`Page "${slug}" : \`access:\` n'est possible que pour les pages rangées dans src/content/pages/${RESERVED_FOLDER}/.`,
		);
	}

	const blocs = data.blocs ?? {};
	const mdx = Boolean(entry.filePath?.endsWith('.mdx'));
	if (!mdx) {
		const unknown = blocMarkersIn(entry.body ?? '').filter((id) => !blocs[id]);
		if (unknown.length > 0) {
			throw new Error(`Page "${slug}" : marqueur(s) sans bloc correspondant dans \`blocs:\` : ${unknown.join(', ')}.`);
		}
	}

	return {
		slug,
		segments,
		url: `/${slug}`,
		title,
		description: data.description,
		menu: data.menu ? { show: data.menu.show, order: data.menu.order, label: data.menu.label ?? title } : null,
		pied: piedDeLaPage(slug, data.pied, data.menu?.show === true),
		image: data.cover,
		imageCredit: data.imageCredit,
		access: reserved ? (data.access ?? 'connecte') : null,
		// Ancienne page « enrichie » (blocs seulement, sans `sections:`) : page simple.
		type: data.type === 'enrichie' && data.sections ? 'enrichie' : 'classique',
		blocs,
		sections: data.type === 'enrichie' && data.sections ? data.sections : null,
		mdx,
		entry,
	};
}

/** Toutes les pages de contenu, triées par slug. */
export async function getContentPages(): Promise<ContentPage[]> {
	const entries = await getCollection('pages');
	return entries.map(toPage).sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Contenu rendu d'une page : composant `Content` et titres (sommaire). */
export async function renderPage(page: ContentPage) {
	return render(page.entry);
}

/** Morceau du contenu d'une page `.md` : HTML nettoyé, ou bloc à rendre par son composant. */
export type PagePart = BlocPart;

/**
 * Contenu d'une page `.md` prêt à afficher (HTML nettoyé et variables
 * remplacées, découpé aux marqueurs de blocs) + titres pour le sommaire.
 * `null` pour une page `.mdx` : rendue par `renderPage()` (composant `Content`).
 */
export function pageParts(page: ContentPage): { parts: PagePart[]; headings: MarkdownHeading[] } | null {
	if (page.mdx) return null;
	const rendered = page.entry.rendered;
	const html = applyPageVariables(sanitizeNewsHtml(rendered?.html ?? ''));
	return {
		parts: decouperBlocs(html, page.blocs),
		headings: (rendered?.metadata?.headings as MarkdownHeading[] | undefined) ?? [],
	};
}

/** Métadonnées des menus déroulants, indexées par nom de dossier. */
export async function getGroups(): Promise<Map<string, GroupMeta>> {
	const entries = await getCollection('pageGroups');
	return new Map(
		entries.map((entry) => {
			const folder = entry.id.split('/').pop() ?? entry.id;
			return [folder, { label: entry.data.label ?? titleCase(folder), order: entry.data.order }];
		}),
	);
}

/** Libellé + ordre d'un dropdown ; valeurs déduites du nom de dossier si aucun `_group.md`. */
export function groupMetaOf(groups: Map<string, GroupMeta>, folder: string): GroupMeta {
	return groups.get(folder) ?? { label: titleCase(folder), order: 50 };
}
