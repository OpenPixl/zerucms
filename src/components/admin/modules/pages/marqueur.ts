/**
 * Insertion du marqueur d'un bloc (`[[bloc:<id>]]`, seul sur sa ligne) dans
 * le texte d'un contenu, à la position du curseur de la zone de saisie
 * (sinon à la fin), puis curseur placé juste après. Formulaires de page,
 * d'actualité et d'activité (`BlocsEditor` émet `insert`).
 */
import { nextTick } from 'vue';
import { blocMarker } from '../../../../lib/blocs';

export async function insererMarqueur(texte: string, ecrire: (texte: string) => void, champ: HTMLTextAreaElement | null, id: string): Promise<void> {
	const marker = blocMarker(id);
	const at = champ ? champ.selectionStart : texte.length;
	const before = texte.slice(0, at).replace(/\s*$/, '');
	const after = texte.slice(at).replace(/^\s*/, '');
	ecrire(`${before}${before ? '\n\n' : ''}${marker}\n\n${after}`);
	await nextTick();
	if (champ) {
		const pos = before.length + (before ? 2 : 0) + marker.length;
		champ.focus();
		champ.setSelectionRange(pos, pos);
	}
}
