/**
 * Fines enveloppes typées autour des routes /api/presence/*.
 * La recherche de membre passe par la route commune /api/adhesion/membres
 * (`membresApi` de src/lib/grist-asso/client.ts).
 */
import { get, post } from '../../../lib/grist-asso/client';
import type { PresencePayload, PresenceResult, SeanceCourante } from '../../../lib/grist-asso/types';

export const presenceApi = {
	seances: (membreId: number) =>
		get<SeanceCourante[]>(`/api/presence/seances?membreId=${membreId}`),
	inscrire: (payload: PresencePayload) => post<PresenceResult>('/api/presence/inscrire', payload),
};
