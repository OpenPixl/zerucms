/**
 * Appels du navigateur vers les routes communes au document Grist de
 * l'association (`./api/`, construites dès qu'un des plugins adhésion,
 * activités ou présence est actif) : retrouver un·e membre, en chercher un·e
 * par son nom, inscrire à une activité. Plus `get` / `post`, utilisés par
 * les clients des plugins. On ne parle jamais à Grist depuis le navigateur
 * (cf. docs/api.md).
 */
import type { ActivitePayload, InscriptionResult, MembrePayload, MembreRecherche, MembreResult, RenouvellementPayload } from './types';

/** Réponse JSON d'une route du site ; erreur = message renvoyé par la route. */
async function lire<T>(res: Response): Promise<T> {
	const data = await res.json().catch(() => null);
	if (!res.ok) throw new Error((data && data.error) || `Erreur ${res.status}`);
	return data as T;
}

/** POST JSON vers une route du site. */
export async function post<T>(url: string, body: unknown): Promise<T> {
	return lire<T>(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}

export async function get<T>(url: string): Promise<T> {
	return lire<T>(await fetch(url));
}

/** Routes communes (`/api/adhesion/membre`, `membres`, `inscription` : adresses historiques, gardées). */
export const membresApi = {
	creerMembre: (payload: MembrePayload) => post<MembreResult>('/api/adhesion/membre', { mode: 'nouveau', ...payload }),
	retrouverMembre: (payload: RenouvellementPayload) => post<MembreResult>('/api/adhesion/membre', { mode: 'renouvellement', ...payload }),
	rechercherMembres: (q: string) => get<MembreRecherche[]>(`/api/adhesion/membres?q=${encodeURIComponent(q)}`),
	enregistrerActivite: (payload: ActivitePayload) => post<InscriptionResult>('/api/adhesion/inscription', payload),
};
