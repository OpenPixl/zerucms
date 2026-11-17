/**
 * Ce que le plugin activités fournit au reste du site — toujours à travers ce
 * fichier, `pluginActif('activites')` ou `outilActif('activites', …)`, pour
 * qu'un plugin inactif ou un outil éteint n'y laisse aucune trace (planning
 * de `/activites`, bouton « S'inscrire » des fiches).
 *
 * Outils (`outils` du catalogue, interrupteurs du module « Plugins ») :
 * `planning`, `inscription`.
 */
import type { Activity } from '../../lib/activites';
import type { AgendaSession } from '../../lib/agenda';
import { isFormOpen } from '../../lib/forms';
import { outilActif } from '..';
import { fetchPlanningAgenda } from './lib/planning';

/** Page publique de l'outil « inscription » (liens du site, plan du site). */
export const INSCRIPTION_HREF = '/inscription';

/** Calendrier de la semaine sur `/activites` (outil `planning`). */
export function planningAffiche(): boolean {
	return outilActif('activites', 'planning');
}

/**
 * Séances de la semaine lues dans la table Grist `Activite` (planning de
 * `/activites`) : aucune si le plugin est inactif ou l'outil `planning`
 * éteint. Grist injoignable : erreur (la page affiche alors un avertissement).
 */
export async function planningActivites(): Promise<AgendaSession[]> {
	return planningAffiche() ? fetchPlanningAgenda() : [];
}

/** Bouton « S'inscrire » des fiches d'activité et réglages d'inscription du module « Activités » (outil `inscription`). */
export function inscriptionEnLigne(): boolean {
	return outilActif('activites', 'inscription');
}

/**
 * Lien du bouton « S'inscrire » d'une activité (sa fiche, et le pied des
 * actualités qui lui sont dédiées), ou `null` : outil `inscription` éteint,
 * `inscription: false` dans la fiche ou formulaire d'inscription fermé.
 */
export function lienInscription(activity: Activity): string | null {
	return inscriptionEnLigne() && activity.inscription && isFormOpen('inscription') ? activity.inscriptionHref : null;
}
