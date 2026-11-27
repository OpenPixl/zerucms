/**
 * Pages du pied de page : liens du bas du pied (mentions légales, CGV,
 * statuts…), choisis dans le module « Pages » (emplacement « Pied de
 * page ») et ordonnés comme le menu. Frontmatter de la page :
 *
 *   pied:
 *     show: true
 *     order: 10
 *
 * Avant ce réglage, le pied affichait d'office les pages `mentions-legales`,
 * `statuts` et `reglement-interieur` : une de ces pages sans `pied:` (et hors
 * du menu de navigation) y reste, à la même place.
 *
 * Sans dépendance : partagé par le build (`content-pages.ts`), l'écriture
 * (`page-writer.ts`) et l'îlot de l'admin.
 */

/** Pages affichées d'office dans le pied avant le réglage `pied:`, dans cet ordre. */
export const PIED_HISTORIQUES = ['mentions-legales', 'statuts', 'reglement-interieur'] as const;

export interface PiedMeta {
	/** `true` = lien dans le bas du pied de page. */
	show: boolean;
	/** Position parmi les liens du pied. */
	order: number;
}

/** Réglage `pied:` résolu d'une page (`chemin` = id, sans `/`). */
export function piedDeLaPage(chemin: string, pied: unknown, dansLeMenu: boolean): PiedMeta {
	if (pied && typeof pied === 'object') {
		const p = pied as Record<string, unknown>;
		return { show: p.show === true, order: typeof p.order === 'number' ? p.order : 99 };
	}
	const historique = (PIED_HISTORIQUES as readonly string[]).indexOf(chemin);
	if (historique >= 0 && !dansLeMenu) return { show: true, order: (historique + 1) * 10 };
	return { show: false, order: 99 };
}
