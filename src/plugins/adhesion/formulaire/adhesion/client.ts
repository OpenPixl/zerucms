/**
 * Fines enveloppes typées autour des routes /api/adhesion/* (celles du
 * plugin et les routes communes de `src/lib/grist-asso/`).
 * Côté navigateur : on ne parle jamais à Grist directement (cf. docs/api.md).
 */
import type {
	ActiviteOption,
	AdhesionResult,
	AdresseSuggestion,
	CoMembrePayload,
	CoMembreResult,
	ContactPayload,
	CotisationOption,
	CotisationPayload,
	DetacherMembrePayload,
	RenouvPreferencesPayload,
} from '../../../../lib/grist-asso/types';
import { get, membresApi, post } from '../../../../lib/grist-asso/client';

export const adhesionApi = {
	cotisations: () => get<CotisationOption[]>('/api/adhesion/cotisations'),
	activites: () => get<ActiviteOption[]>('/api/adhesion/activites'),

	...membresApi,

	majPreferences: (payload: RenouvPreferencesPayload) =>
		post<{ ok: true }>('/api/adhesion/preferences', payload),

	inscrireContact: (payload: ContactPayload) =>
		post<{ membreId: number }>('/api/adhesion/contact', payload),


	ajouterCoMembre: (payload: CoMembrePayload) =>
		post<CoMembreResult>('/api/adhesion/co-membre', payload),

	detacherMembre: (payload: DetacherMembrePayload) =>
		post<{ ok: true }>('/api/adhesion/detacher-membre', payload),

	chercherAdresse: (q: string) =>
		get<AdresseSuggestion[]>(`/api/adhesion/adresse?q=${encodeURIComponent(q)}`),

	enregistrerCotisation: (payload: CotisationPayload) =>
		post<AdhesionResult>('/api/adhesion/cotisation', payload),
};
