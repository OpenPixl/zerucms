/**
 * Actualité dédiée à une activité (onglet « Partage » du formulaire d'une
 * fiche, module « Activités ») : reprend la fiche telle qu'elle est dans les
 * sources — titre, résumé, catégorie, texte, photo et crédit — datée du jour,
 * avec `activite: <adresse de la fiche>` dans son en-tête. La page de
 * l'actualité se termine alors par « S'inscrire » et un lien vers la fiche
 * (`src/pages/actualites/[slug].astro`).
 *
 * L'actualité reste une actualité ordinaire, modifiable ensuite dans le
 * module « Actualités » (le lien vers l'activité est gardé).
 *
 * Code serveur uniquement.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { activitesSourceDir, readActivitySource } from './activity-writer';
import { getCategory } from './categories';
import { listNewsSources, writeNews, type NewsSource } from './news-writer';

/** Date du jour (AAAA-MM-JJ), heure de Paris : celle que lit l'équipe. */
function today(): string {
	return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

/** Actualités (sources, brouillons compris) liées à une fiche, plus récentes d'abord. */
export async function newsOfActivity(slug: string): Promise<NewsSource[]> {
	return (await listNewsSources())
		.filter((n) => n.activite === slug)
		.sort((a, b) => b.publishAt.localeCompare(a.publishAt) || a.slug.localeCompare(b.slug));
}

export async function writeActivityNews(activitySlug: string): Promise<{ slug?: string; title?: string; errors: string[] }> {
	const activity = await readActivitySource(activitySlug);
	if (!activity) return { errors: ['Activité introuvable dans les sources.'] };
	if (!activity.title || !activity.excerpt || !activity.body) {
		return { errors: ["La fiche doit avoir un titre, un résumé et un texte enregistrés avant d'en faire une actualité."] };
	}

	const data: Record<string, unknown> = {
		title: activity.title,
		publishAt: today(),
		excerpt: activity.excerpt,
		tag: getCategory(activity.category)?.label,
		imageCredit: activity.cover ? activity.imageCredit || undefined : undefined,
		activite: activity.slug,
	};
	const yaml = stringifyYaml(
		Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== '')),
		{ defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN', lineWidth: 0 },
	);
	const markdown = `---\n${yaml}---\n\n${activity.body}\n`;

	const cover = activity.cover
		? await readFile(join(activitesSourceDir(), activity.slug, activity.cover)).catch(() => undefined)
		: undefined;
	return writeNews(markdown, cover);
}
