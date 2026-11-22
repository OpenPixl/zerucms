/**
 * Texte d'un contenu découpé aux marqueurs de blocs (`[[bloc:<id>]]` seul sur
 * sa ligne, cf. `src/lib/blocs.ts`) : morceaux de HTML (déjà nettoyé) et blocs,
 * dans l'ordre, rendus par `src/components/blocs/ContenuBlocs.astro`.
 * Pages, actualités, activités.
 */
import type { Bloc } from './blocs';

export type BlocPart = { html: string } | { blocId: string; bloc: Bloc };

/** Marqueur de bloc tel que rendu par le moteur Markdown : un paragraphe seul. */
const RENDERED_MARKER = /<p>\s*\[\[bloc:([a-z0-9][a-z0-9-]{0,39})\]\]\s*<\/p>/g;

/** Découpe le HTML aux marqueurs ; un marqueur sans bloc est retiré. */
export function decouperBlocs(html: string, blocs: Record<string, Bloc>): BlocPart[] {
	const parts: BlocPart[] = [];
	let last = 0;
	for (const match of html.matchAll(RENDERED_MARKER)) {
		parts.push({ html: html.slice(last, match.index) });
		const bloc = blocs[match[1]];
		if (bloc) parts.push({ blocId: match[1], bloc });
		last = match.index! + match[0].length;
	}
	parts.push({ html: html.slice(last) });
	return parts.filter((p) => !('html' in p) || p.html.trim() !== '');
}
