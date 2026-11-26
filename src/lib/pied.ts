/**
 * Couleurs du pied de page (`Footer.astro`), indépendantes des couleurs de
 * marque : réglage `pied:` de `src/content/reglages.yaml` (lu par
 * `src/config/site.ts`, écrit par `src/lib/brand-writer.ts` depuis le module
 * « Charte graphique », onglet « Pied de page »).
 *
 * ```yaml
 * pied:
 *   fond: '#1f2937'
 *   texte: '#ffffff'
 *   sombre:            # mode sombre (facultatif)
 *     fond: '#161b22'  # absent = surfaces de la palette sombre
 *     texte: '#e6edf3' # absent = texte de la palette sombre
 * ```
 *
 * `fond` absent (sites d'avant ce réglage) = couleur secondaire, comme avant ;
 * il est écrit au premier enregistrement de la charte, le pied ne suit plus
 * ensuite la couleur secondaire. `texte` absent = blanc.
 *
 * Variables CSS `--color-pied` / `--color-pied-texte` (`bg-pied`,
 * `text-pied-texte/80`…), dans `themeCss`. Sans dépendance : build et îlot Vue.
 */

import type { ReglageSombre } from './mode-sombre';

export interface ReglagePied {
	fond?: string;
	texte?: string;
	sombre?: { fond?: string; texte?: string };
}

/** Couleurs effectives du pied de page, en clair et en sombre. */
export interface PiedResolu {
	fond: string;
	texte: string;
	sombreFond: string;
	sombreTexte: string;
}

export const PIED_TEXTE_DEFAUT = '#ffffff';

export function piedResolu(pied: ReglagePied, secondaire: string, sombre: Pick<ReglageSombre, 'surface' | 'texte'>): PiedResolu {
	return {
		fond: pied.fond ?? secondaire,
		texte: pied.texte ?? PIED_TEXTE_DEFAUT,
		sombreFond: pied.sombre?.fond ?? sombre.surface,
		sombreTexte: pied.sombre?.texte ?? sombre.texte,
	};
}

/** Variables CSS du pied de page ; celles du mode sombre seulement s'il est proposé. */
export function piedCss(p: PiedResolu, sombreActif: boolean): string {
	return (
		`:root{--color-pied:${p.fond};--color-pied-texte:${p.texte}}` +
		(sombreActif ? `:root[data-theme=dark]{--color-pied:${p.sombreFond};--color-pied-texte:${p.sombreTexte}}` : '')
	);
}
