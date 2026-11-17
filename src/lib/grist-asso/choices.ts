/**
 * Valeurs exactes des listes de choix du document Grist, partagées
 * **client + serveur**.
 *
 * Module PUR : aucun import, aucune dépendance à `process.env` / `node:*`.
 * C'est ce qui le rend sûr à charger dans le bundle navigateur (via
 * `validation.ts`), contrairement à `grist.ts`. `grist.ts` les ré-exporte
 * pour le code serveur — ne pas les redéclarer là-bas.
 */

/** Liste de choix `Membres.Genre`. */
export const GENRE_CHOICES = ['Homme', 'Femme', 'Autre', 'Association'] as const;
export type GenreGrist = (typeof GENRE_CHOICES)[number];

/** Rôle déduit du genre (le formulaire public ne demande pas le rôle interne). */
export const ROLE_PHYSIQUE = 'Adhérent.e physique';
export const ROLE_MORAL = 'Adherent.e Moral.e';
export const ROLE_CONTACT = 'Contact';

export const STATUT_IMPAYE = 'Impayé';
export const DISPO_INSCRIT = 'Inscrit';
export const DISPO_ATTENTE = "Liste d'attente";

/** Liste de choix `Activite.Type` proposés à l'étape « activité » du parcours d'adhésion. */
export const TYPES_ACTIVITE_ADHESION = ['Séances', 'Modules'] as const;

/** Liste de choix `Activite.Type` proposés par l'inscription en ligne (`/inscription`). */
export const TYPES_ACTIVITE_INSCRIPTION = ['Séances', 'Ateliers', 'Atelier CN'] as const;
