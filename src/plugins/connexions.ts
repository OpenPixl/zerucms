/**
 * État des connexions des plugins à des services extérieurs (`connexion` du
 * catalogue, fichier `<DATA_DIR>/connexions/<id>.yaml` : `src/lib/connexions.ts`).
 * Chaque plugin qui a une connexion donne ici `statut()` (état enregistré,
 * revérifié s'il est ancien) et `verifier()` (vérification immédiate) ; ils
 * servent à la page de configuration du module « Plugins » et aux **rappels**
 * de la barre d'admin (jeton bientôt expiré…, `GET /api/admin/rappels`).
 *
 * Code serveur uniquement (chargé à la demande).
 */
import type { PluginId } from './catalogue';

export interface StatutConnexion {
	/** Outil concerné (absent = le plugin entier). */
	outil?: string;
	titre: string;
	/** `attention` : à renouveler bientôt ; `erreur` : ne fonctionne plus. */
	niveau: 'ok' | 'attention' | 'erreur' | 'inconnu';
	message: string;
	verifieLe?: string;
	/** Prochaine échéance (renouvellement), ISO. */
	echeance?: string;
	lien?: string;
}

export interface ConnexionPlugin {
	statut(): Promise<StatutConnexion[]>;
	verifier(): Promise<StatutConnexion[]>;
}

const CONNEXIONS: Partial<Record<PluginId, () => Promise<ConnexionPlugin>>> = {
	diffusion: () => import('./diffusion/lib/connexion').then((m) => m.default),
};

export async function connexionPlugin(id: string): Promise<ConnexionPlugin | null> {
	const charger = CONNEXIONS[id as PluginId];
	return charger ? charger() : null;
}
