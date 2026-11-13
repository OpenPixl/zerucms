/**
 * Référencement : adresse canonique des pages et données structurées
 * (JSON-LD, schema.org) tirées d'`association.yaml`, rendues par
 * `src/components/layout/SeoHead.astro` dans les deux layouts.
 * Adresses toujours SANS `/` final (`trailingSlash: 'never'`
 * d'`astro.config.mjs`), comme les liens du site, le sitemap et le flux RSS.
 */

import { association, SOCIAL_NETWORKS } from './association';

/** Chemin sans `/` final (sauf l'accueil) ni `index.html`. */
export function cleanPath(pathname: string): string {
	const path = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
	return path.length > 1 ? path.replace(/\/+$/, '') : '/';
}

/** Adresse absolue d'un chemin du site (domaine public : `site`, tiré de SITE_URL). */
export function absoluteUrl(path: string, site: URL | undefined): string {
	return new URL(cleanPath(path), site ?? 'http://localhost:4321').href;
}

export type JsonLd = Record<string, unknown>;

/** L'association : nom, coordonnées, logo, réseaux sociaux (accueil). */
export function organizationJsonLd(site: URL | undefined, logoUrl: string): JsonLd {
	const sameAs = SOCIAL_NETWORKS.map(({ key }) => association.social[key]).filter((url): url is string => Boolean(url));
	return {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		'@id': `${absoluteUrl('/', site)}#organisation`,
		name: association.name,
		description: association.description,
		url: absoluteUrl('/', site),
		logo: logoUrl,
		email: association.email,
		telephone: association.phone,
		address: {
			'@type': 'PostalAddress',
			streetAddress: association.address.street.replace(/\n/g, ', '),
			postalCode: association.address.postalCode,
			addressLocality: association.address.city,
			addressCountry: 'FR',
		},
		...(sameAs.length ? { sameAs } : {}),
	};
}

/** Le site lui-même (accueil). */
export function websiteJsonLd(site: URL | undefined): JsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: association.name,
		url: absoluteUrl('/', site),
		inLanguage: 'fr-FR',
		publisher: { '@id': `${absoluteUrl('/', site)}#organisation` },
	};
}

/** Fil d'Ariane : mêmes éléments que `Breadcrumb.astro` (le dernier, sans lien, est la page elle-même). */
export function breadcrumbJsonLd(items: { label: string; href?: string }[], currentPath: string, site: URL | undefined): JsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.label,
			item: absoluteUrl(item.href ?? currentPath, site),
		})),
	};
}

/** Une actualité (image : celle de l'aperçu, ajoutée par `SeoHead.astro`). */
export function newsArticleJsonLd(
	article: { title: string; excerpt: string; publishAt: string; author?: string; href: string },
	site: URL | undefined,
): JsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'NewsArticle',
		headline: article.title,
		description: article.excerpt,
		datePublished: article.publishAt,
		mainEntityOfPage: absoluteUrl(article.href, site),
		author: article.author
			? { '@type': 'Person', name: article.author }
			: { '@type': 'Organization', name: association.name },
		publisher: { '@id': `${absoluteUrl('/', site)}#organisation` },
	};
}

/** JSON dans un `<script type="application/ld+json">` : `<` échappé (pas de `</script>` possible). */
export function jsonLdScript(data: JsonLd): string {
	return JSON.stringify(data).replace(/</g, '\\u003c');
}
