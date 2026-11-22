/**
 * Contrôle du texte Markdown saisi dans l'Espace Admin (actualités, pages,
 * activités, textes des blocs) : liens et images Markdown. Le HTML, lui, est
 * nettoyé à l'affichage (`src/lib/sanitize-news.ts`).
 *
 * Module à part (sans `astro:env`) : partagé par les écritures de contenu
 * (`news-writer.ts`, `bloc-writer.ts`…) sans dépendance circulaire.
 */
import type { Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { isSafeUrl } from './safe-url';

/** Contrôle du corps (liens et images Markdown ; le HTML est nettoyé à l'affichage). Renvoie les problèmes trouvés. */
export function checkBody(body: string): string[] {
	const problems = new Set<string>();
	const walk = (node: Nodes) => {
		const line = node.position?.start.line;
		const where = line ? ` (ligne ${line} du texte)` : '';
		if ((node.type === 'link' || node.type === 'definition') && !isSafeUrl(node.url)) {
			problems.add(`Lien refusé${where} : seuls les liens http(s), mailto:, tel: et internes sont acceptés.`);
		}
		if (node.type === 'image' && !/^https?:\/\//i.test(node.url.trim())) {
			problems.add(`Image refusée${where} : seule la photo de couverture se dépose ici ; dans le texte, utilisez une adresse http(s).`);
		}
		if ('children' in node) node.children.forEach((child) => walk(child as Nodes));
	};
	walk(fromMarkdown(body));
	return [...problems];
}
