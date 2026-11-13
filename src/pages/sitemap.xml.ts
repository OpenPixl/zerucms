/**
 * Plan du site pour les moteurs de recherche, produit à chaque construction
 * (donc à chaque publication) : pages du site actives, pages de service
 * (adhésion, inscription, RDV si le plugin est actif), pages de contenu publiques, catégories et
 * fiches d'activité publiées (catégorie listée si elle en a au moins une),
 * actualités publiées (avec leur date).
 * Jamais : pages réservées, brouillons, pages désactivées. Adresses sans
 * « / » final, comme l'adresse canonique des pages (`src/lib/seo.ts`).
 */
import type { APIRoute } from 'astro';
import { site as settings } from '../config/site';
import { getAllActivities } from '../lib/activites';
import { categories } from '../lib/categories';
import { getContentPages } from '../lib/content-pages';
import { getAllNews } from '../lib/news';
import { absoluteUrl } from '../lib/seo';
import { getSitePagesState } from '../lib/site-pages-content';
import { pluginActif } from '../plugins';
import { RDV_HREF } from '../plugins/rdv';
import { ADHESION_HREF } from '../plugins/adhesion';
import { INSCRIPTION_HREF } from '../plugins/inscription';

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async ({ site }) => {
	const sitePages = (await getSitePagesState()).filter((p) => p.active);
	const activitiesActive = sitePages.some((p) => p.id === 'activites');
	const activities = activitiesActive ? await getAllActivities() : [];
	const entries: { path: string; lastmod?: string }[] = [
		...sitePages.map((p) => ({ path: p.href })),
		...(pluginActif('adhesion') ? [{ path: ADHESION_HREF }] : []),
		...(pluginActif('inscription') && settings.forms.inscription.enabled ? [{ path: INSCRIPTION_HREF }] : []),
		...(pluginActif('rdv') ? [{ path: RDV_HREF }] : []),
		...(await getContentPages()).filter((p) => p.access === null).map((p) => ({ path: p.url })),
		...(activitiesActive
			? [
					// Catégorie sans fiche (site neuf sans exemples) : page vide, non référencée.
					...categories.filter((c) => activities.some((a) => a.category === c.slug)).map((c) => ({ path: `/activites/${c.slug}` })),
					...activities.map((a) => ({ path: `/activites/${a.category}/${a.slug}` })),
				]
			: []),
		...(await getAllNews()).map((n) => ({ path: n.href, lastmod: n.publishAt })),
	];
	const seen = new Set<string>();
	const urls = entries
		.map((e) => ({ ...e, loc: absoluteUrl(e.path, site) }))
		.filter((e) => !seen.has(e.loc) && seen.add(e.loc));

	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...urls.map((u) => `<url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`),
		'</urlset>',
		'',
	].join('\n');
	return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
