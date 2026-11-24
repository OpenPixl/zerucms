/** Appels du plugin diffusion (routes `/api/admin/diffusion*`, `api/` de ce dossier). */
import { request } from '../../../components/admin/client';
import type { TraceDiffusion } from '../../../lib/diffusion';
import type { RappelJeton } from '../lib/regles';

export interface EtatDiffusion {
	/** Serveur de développement : le lien de l'actualité pointe vers `SITE_URL`, que Facebook ne lit pas forcément. */
	dev: boolean;
	facebook: {
		actif: boolean;
		configure: boolean;
		page: { nom: string; lien: string } | null;
		erreur: string;
		/** Jeton à renouveler bientôt ou expiré. */
		rappel: RappelJeton | null;
	};
}

export const diffusionApi = {
	etat: () => request<EtatDiffusion>('GET', '/api/admin/diffusion'),
	facebook: (slug: string, message: string) =>
		request<{ ok: true; trace: TraceDiffusion; avertissement: string }>('POST', '/api/admin/diffusion/facebook', { slug, message }),
};
