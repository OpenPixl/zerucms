/**
 * Actualités : collection `news` (`src/content.config.ts`), un dossier par
 * article dans `src/content/news/`. Tout est résolu au build : les pages
 * qui les affichent sont prérendues.
 */

import { getCollection, type CollectionEntry } from 'astro:content';
import { association } from './association';
import { decouperBlocs, type BlocPart } from './bloc-parts';
import type { Heading } from './headings';
import { estimateReadingTime } from './reading-time';
import { sanitizeNewsHtml } from './sanitize-news';

export type NewsEntry = CollectionEntry<'news'>;

export interface NewsArticle {
	slug: string;
	href: string;
	/** Date affichée, ex. « 6 octobre 2026 ». */
	date: string;
	/** Date de publication au format AAAA-MM-JJ. */
	publishAt: string;
	author?: string;
	title: string;
	excerpt: string;
	tag?: string;
	image?: NewsEntry['data']['cover'];
	imageCredit: string;
	readingTime: number;
	/** Fiche d'activité liée (`activite:`, nom de son dossier) : « S'inscrire » en pied d'actualité. */
	activite?: string;
	/** Entrée brute de la collection (HTML rendu : `entry.rendered`). */
	entry: NewsEntry;
}

function toArticle(entry: NewsEntry): NewsArticle {
	const { data } = entry;
	return {
		slug: entry.id,
		href: `/actualites/${entry.id}`,
		date: data.publishAt.toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC',
		}),
		publishAt: data.publishAt.toISOString().slice(0, 10),
		author: data.author,
		title: data.title,
		excerpt: data.excerpt,
		tag: data.tag,
		image: data.cover,
		imageCredit: data.imageCredit || `Photo : ${association.name}`,
		readingTime: estimateReadingTime(entry.body ?? ''),
		activite: data.activite,
		entry,
	};
}

/** Actualités publiées (`isPublish` ≠ false), plus récentes d'abord. */
export async function getAllNews(): Promise<NewsArticle[]> {
	const entries = await getCollection('news', ({ data }) => data.isPublish);
	return entries
		.map(toArticle)
		.sort((a, b) => b.publishAt.localeCompare(a.publishAt) || a.slug.localeCompare(b.slug));
}

/**
 * Contenu d'une actualité prêt à afficher : HTML NETTOYÉ (balisage gardé,
 * code exécutable retiré, cf. `sanitize-news.ts`) découpé aux marqueurs de
 * blocs (`ContenuBlocs.astro`, dossier `news/<slug>`) et titres (sommaire).
 */
export async function renderNews(article: NewsArticle): Promise<{ parts: BlocPart[]; headings: Heading[] }> {
	// HTML rendu au build par le Content Layer (loader glob, rendu non différé).
	const rendered = article.entry.rendered;
	return {
		parts: decouperBlocs(sanitizeNewsHtml(rendered?.html ?? ''), article.entry.data.blocs ?? {}),
		headings: (rendered?.metadata?.headings as Heading[] | undefined) ?? [],
	};
}
