/**
 * Fiches d'activité : collection `activites` (`src/content.config.ts`), un
 * dossier par fiche dans `src/content/activites/`. Résolu au build.
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { association } from './association';
import { decouperBlocs, type BlocPart } from './bloc-parts';
import type { Heading } from './headings';
import { estimateReadingTime } from './reading-time';
import { sanitizeNewsHtml } from './sanitize-news';

export type ActivityEntry = CollectionEntry<'activites'>;

export interface Activity {
	slug: string;
	category: string;
	href: string;
	title: string;
	excerpt: string;
	level?: string;
	image?: ActivityEntry['data']['cover'];
	imageCredit: string;
	/** `false` masque le bouton « S'inscrire » (ex. activités sur rendez-vous). Défaut : `true`. */
	inscription: boolean;
	/**
	 * Lien `/inscription` du bouton « S'inscrire », ciblant les activités Grist
	 * de la fiche : frontmatter `activiteGrist` (nom `Activite.Nom` ou liste de
	 * noms, `*` final = préfixe) et/ou `typeGrist` (`Activite.Type`). Sans l'un
	 * ni l'autre : le titre de la fiche.
	 */
	inscriptionHref: string;
	order: number;
	readingTime: number;
	/** Entrée brute de la collection (pour `render()` sur la page de détail). */
	entry: ActivityEntry;
}

function inscriptionHref(data: ActivityEntry['data']): string {
	const params = new URLSearchParams();
	const noms = [data.activiteGrist ?? []].flat().filter(Boolean);
	if (noms.length === 0 && !data.typeGrist) noms.push(data.title);
	noms.forEach((n) => params.append('activite', n));
	if (data.typeGrist) params.set('type', data.typeGrist);
	return `/inscription?${params}`;
}

function toActivity(entry: ActivityEntry): Activity {
	const { data } = entry;
	return {
		slug: entry.id,
		category: data.category,
		href: `/activites/${data.category}/${entry.id}`,
		title: data.title,
		excerpt: data.excerpt,
		level: data.level,
		inscription: data.inscription,
		inscriptionHref: inscriptionHref(data),
		image: data.cover,
		imageCredit: data.imageCredit || `Photo : ${association.name}`,
		order: data.order,
		readingTime: estimateReadingTime(entry.body ?? ''),
		entry,
	};
}

/** Activités publiées (`isPublish` ≠ false), par `order` croissant. */
export async function getAllActivities(): Promise<Activity[]> {
	const entries = await getCollection('activites', ({ data }) => data.isPublish);
	return entries.map(toActivity).sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

export async function getActivitiesByCategory(categorySlug: string): Promise<Activity[]> {
	return (await getAllActivities()).filter((activity) => activity.category === categorySlug);
}

/**
 * Contenu rendu d'une fiche : HTML nettoyé découpé aux blocs (`ContenuBlocs.astro`,
 * dossier `activites/<slug>`) et titres (sommaire). Les fiches
 * se modifient depuis l'Espace Admin : même nettoyage que les actualités
 * (`sanitizeNewsHtml`, HTML autorisé, code exécutable retiré).
 */
export async function renderActivity(activity: Activity): Promise<{ parts: BlocPart[]; headings: Heading[] }> {
	// HTML rendu au build par le Content Layer (loader glob, rendu non différé).
	const rendered = activity.entry.rendered;
	return {
		parts: decouperBlocs(sanitizeNewsHtml(rendered?.html ?? ''), activity.entry.data.blocs ?? {}),
		headings: (rendered?.metadata?.headings as Heading[] | undefined) ?? [],
	};
}
