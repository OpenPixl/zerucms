/** Règles du plugin diffusion partagées par le serveur et le formulaire (module pur). */

/** Longueur maximale du texte d'une publication (Facebook accepte bien plus : garde-fou). */
export const MESSAGE_MAX = 5000;

/** Texte proposé pour une actualité : titre, ligne vide, résumé. */
export function messagePropose(titre: string, resume: string): string {
	return [titre.trim(), resume.trim()].filter(Boolean).join('\n\n');
}

/**
 * État du jeton Facebook vérifié par le serveur (`etat.facebook` du fichier
 * de connexion, `lib/facebook.ts`). Dates ISO ; `expire_le` absent = le
 * jeton n'expire pas.
 */
export interface EtatJeton {
	verifie_le?: string;
	/** Fin de validité du jeton. */
	expire_le?: string;
	/** Fin de l'accès aux données accordé par la personne qui a créé le jeton (Meta : 90 jours, renouvelable). */
	acces_donnees_expire_le?: string;
	/** Type du jeton selon Facebook (`PAGE` attendu). */
	type?: string;
	page?: string;
	lien_page?: string;
	/** Dernière erreur (jeton refusé, Page introuvable…). */
	erreur?: string;
}

/** Rappel affiché à partir de ce nombre de jours avant l'échéance. */
export const RAPPEL_JOURS = 30;

export type NiveauRappel = 'ok' | 'bientot' | 'expire' | 'erreur' | 'inconnu';

export interface RappelJeton {
	niveau: NiveauRappel;
	message: string;
	/** Première échéance (jeton ou accès aux données), ISO. */
	echeance?: string;
	/** Jours restants avant l'échéance (négatif : dépassée). */
	jours?: number;
}

const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Où renouveler : rappelé dans chaque message. */
export const OU_RENOUVELER = 'super admin, module « Plugins » → « Diffusion sur les réseaux sociaux »';

/** Rappel de renouvellement du jeton d'après son état vérifié. */
export function rappelJeton(etat: EtatJeton | null, maintenant = Date.now()): RappelJeton {
	if (!etat?.verifie_le) return { niveau: 'inconnu', message: 'Jeton pas encore vérifié.' };
	if (etat.erreur) return { niveau: 'erreur', message: etat.erreur };
	const dates = [etat.expire_le, etat.acces_donnees_expire_le].filter((d): d is string => Boolean(d) && !Number.isNaN(Date.parse(d!)));
	if (!dates.length) return { niveau: 'ok', message: 'Jeton de la Page sans date d’expiration.' };
	const echeance = dates.sort()[0];
	const jours = Math.floor((Date.parse(echeance) - maintenant) / 86_400_000);
	const quoi = echeance === etat.expire_le ? 'Le jeton de la Page Facebook' : 'L’accès de l’application Meta aux données de la Page';
	if (jours < 0) {
		return { niveau: 'expire', echeance, jours, message: `${quoi} a expiré le ${jour(echeance)} : générez un nouveau jeton et remplacez-le (${OU_RENOUVELER}).` };
	}
	if (jours <= RAPPEL_JOURS) {
		const dans = jours === 0 ? 'aujourd’hui' : jours === 1 ? 'demain' : `dans ${jours} jours`;
		return { niveau: 'bientot', echeance, jours, message: `${quoi} expire ${dans} (${jour(echeance)}) : pensez à le renouveler (${OU_RENOUVELER}).` };
	}
	return { niveau: 'ok', echeance, jours, message: `Jeton valable jusqu’au ${jour(echeance)}.` };
}
