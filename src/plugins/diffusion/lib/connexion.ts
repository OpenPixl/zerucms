/** État de la connexion du plugin diffusion (cf. `src/plugins/connexions.ts`). Serveur seul. */
import type { ConnexionPlugin, StatutConnexion } from '../../connexions';
import { etatFacebook, FacebookError, verifierFacebook } from './facebook';
import { rappelJeton, type EtatJeton } from './regles';

const NIVEAUX = { ok: 'ok', bientot: 'attention', expire: 'erreur', erreur: 'erreur', inconnu: 'inconnu' } as const;

function statutFacebook(etat: EtatJeton | null): StatutConnexion[] {
	if (!etat) return [];
	const rappel = rappelJeton(etat);
	return [
		{
			outil: 'facebook',
			titre: etat.page ? `Page Facebook « ${etat.page} »` : 'Page Facebook',
			niveau: NIVEAUX[rappel.niveau],
			message: rappel.message,
			verifieLe: etat.verifie_le,
			echeance: rappel.echeance,
			lien: etat.lien_page,
		},
	];
}

export default {
	statut: async () => statutFacebook(await etatFacebook()),
	verifier: async () => {
		try {
			return statutFacebook(await verifierFacebook());
		} catch (err) {
			if (!(err instanceof FacebookError)) throw err;
			return [{ outil: 'facebook', titre: 'Page Facebook', niveau: 'erreur', message: err.message }];
		}
	},
} satisfies ConnexionPlugin;
