/**
 * SVG servis tels quels par le site (logo, icône, illustration, logos du
 * « Bandeau défilant ») : contenus actifs refusés. Sans dépendance (évite les
 * imports circulaires entre `brand-writer.ts` et `bloc-writer.ts`).
 */

/** Contenus actifs interdits dans un SVG servi tel quel par le site. */
const SVG_DANGER = /<script|<foreignObject|<iframe|<embed|<object|\bon[a-z]+\s*=|javascript:|<!ENTITY|xlink:href\s*=\s*["']?\s*(?!#)|\bhref\s*=\s*["']?\s*(?!#|data:image\/)/i;

export function svgProblem(data: Buffer, what: string): string | null {
	const text = data.toString('utf8');
	if (!/<svg[\s>]/i.test(text)) return `${what} : fichier SVG illisible.`;
	if (SVG_DANGER.test(text)) return `${what} : ce SVG contient du script ou des liens externes, refusé par sécurité. Exportez-le en « SVG simple » ou en PNG.`;
	return null;
}
