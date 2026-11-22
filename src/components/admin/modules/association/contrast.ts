/**
 * Contraste des couleurs du thème (WCAG 2.1, calcul dans
 * `src/lib/mode-sombre.ts`) : boutons, pied de page et bouton « Adhérer »
 * écrivent en blanc sur `primary`, `secondary` et `accent` ; en mode
 * sombre, texte et couleurs de marque se lisent aussi sur le fond.
 */

import { hexComplet } from '../../../../lib/mode-sombre';

/** `#28c` → `#2288cc`. */
export const fullHex = hexComplet;

/** Niveau : `bon` (≥ 4,5 : tout texte), `moyen` (≥ 3 : gros texte seulement), `faible`. */
export function contrastLevel(ratio: number): 'bon' | 'moyen' | 'faible' {
	return ratio >= 4.5 ? 'bon' : ratio >= 3 ? 'moyen' : 'faible';
}
