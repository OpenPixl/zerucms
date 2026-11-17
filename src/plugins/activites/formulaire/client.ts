/**
 * Appels du formulaire d'inscription : routes `/api/inscription/*` de ce
 * plugin, plus les routes communes (retrouver l'adhérent·e, enregistrer
 * l'inscription : `membresApi` de src/lib/grist-asso/client.ts).
 */
import { get, post } from '../../../lib/grist-asso/client';
import type { ExterieurPayload, ExterieurResult, OffreInscription, PreinscriptionPayload } from '../../../lib/grist-asso/types';

export { membresApi } from '../../../lib/grist-asso/client';

export const inscriptionApi = {
	/** `cible` : la query string reçue par /inscription (`activite=…&type=…`), relayée telle quelle. */
	offre: (cible: URLSearchParams) => get<OffreInscription>(`/api/inscription/offre?${cible}`),
	preinscrire: (payload: PreinscriptionPayload) => post<{ ok: true }>('/api/inscription/preinscription', payload),
	creerParticipantExterieur: (payload: ExterieurPayload) =>
		post<ExterieurResult>('/api/inscription/participant-exterieur', payload),
};
