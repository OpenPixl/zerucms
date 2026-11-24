/**
 * Trace des diffusions d'un contenu sur les réseaux sociaux (plugin
 * `diffusion`) : champ `diffusion:` de l'en-tête de l'actualité, écrit par
 * le serveur après une diffusion réussie (`enregistrerDiffusion()` de
 * `news-writer.ts`), jamais par le formulaire ni par un fichier déposé.
 *
 *     diffusion:
 *       facebook:
 *         id: "123_456"            # publication Facebook
 *         date: "2026-11-22T…Z"
 *         lien: "https://www.facebook.com/…"
 *         par: "Prénom Nom"
 *
 * Module pur (serveur et navigateur).
 */

/** Réseaux pris en charge (outils du plugin `diffusion`). */
export const RESEAUX = ['facebook'] as const;
export type Reseau = (typeof RESEAUX)[number];

export interface TraceDiffusion {
	/** Identifiant de la publication sur le réseau. */
	id: string;
	/** Date de la diffusion (ISO). */
	date: string;
	/** Adresse de la publication, si le réseau la donne. */
	lien?: string;
	/** Personne qui a diffusé. */
	par?: string;
}

export type Diffusion = Partial<Record<Reseau, TraceDiffusion>>;

/** Lecture tolérante du champ `diffusion:` (valeurs inattendues ignorées). */
export function lireDiffusion(raw: unknown): Diffusion {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const diffusion: Diffusion = {};
	for (const reseau of RESEAUX) {
		const t = (raw as Record<string, unknown>)[reseau];
		if (!t || typeof t !== 'object') continue;
		const { id, date, lien, par } = t as Record<string, unknown>;
		if (typeof id !== 'string' || !id) continue;
		diffusion[reseau] = {
			id,
			date: date instanceof Date ? date.toISOString() : String(date ?? ''),
			...(typeof lien === 'string' && lien ? { lien } : {}),
			...(typeof par === 'string' && par ? { par } : {}),
		};
	}
	return diffusion;
}
