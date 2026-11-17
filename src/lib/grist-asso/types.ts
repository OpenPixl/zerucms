/**
 * Types partagés entre l'îlot Vue (front) et les routes API (serveur).
 * Aucun secret ici — uniquement les formes de données échangées.
 */

/** Valeurs = celles de la liste de choix Grist `Membres.Genre`. */
export type Genre = 'Homme' | 'Femme' | 'Autre' | 'Association';
export type Mode = 'nouveau' | 'renouvellement';

/** Étape 1 — informations transmises à la table Membres. */
export interface MembrePayload {
	genre: Genre;
	nom: string;
	prenom: string;
	dateNaissance: string; // ISO yyyy-mm-dd ('' si genre = Association)
	email: string;
	adresse: string;
	codePostal: string;
	commune: string;
	telFixe: string;
	telMobile: string;
	newsletter: boolean;
	droitImage: boolean; // -> colonne Membres.Droit_image (Bool)
}

/** Étape 1 — renouvellement : la recherche ne transmet que l'identité. */
export interface RenouvellementPayload {
	nom: string;
	prenom: string;
}

/** Renouvellement — mise à jour des préférences de la fiche retrouvée. */
export interface RenouvPreferencesPayload {
	membreId: number;
	newsletter: boolean;
	droitImage: boolean;
}

/** Inscription « actualités seules ». */
export interface ContactPayload {
	nom: string;
	prenom: string;
	email: string;
}

/**
 * Formulaire simplifié d'inscription à une activité — profil « extérieur »
 * (non-adhérent) : on ne demande qu'un moyen de le/la recontacter.
 */
export interface ExterieurPayload {
	genre: Genre;
	nom: string;
	prenom: string;
	telephone: string;
}

export interface ExterieurResult {
	membreId: number;
	prenom: string;
	nom: string;
}

export type Profil = 'adherent' | 'exterieur' | '';

/** Membre supplémentaire d'une adhésion multiple (ex. Couple) : nouveau ou existant. */
export type CoMembrePayload =
	| ({ responsableId: number; adhesionId: number } & MembrePayload)
	| { responsableId: number; adhesionId: number; membreExistantId: number };

export interface CoMembreResult {
	membreId: number;
	prenom: string;
	nom: string;
}

export interface DetacherMembrePayload {
	responsableId: number;
	adhesionId: number;
	membreId: number;
}

export type MembreResult =
	| ({
			status: 'ok';
			/** Fiche qui porte l'adhésion : le·la responsable du foyer si la fiche trouvée est rattachée. */
			membreId: number;
			/** Fiche réellement trouvée par nom + prénom (= `membreId` si elle n'est pas rattachée). */
			ficheId: number;
			prenom: string;
			nom: string;
			genre: Genre | null;
	  } & MembreEtat)
	| { status: 'ambigu'; candidats: MembreCandidat[] }
	| { status: 'introuvable' };

/**
 * État d'une fiche retrouvée au renouvellement : préférences modifiables +
 * adhésion déjà à jour pour la saison en cours (`Membres.Adhesion_en_cours`).
 */
export interface MembreEtat {
	newsletter: boolean;
	droitImage: boolean;
	adhesionEnCours: boolean;
	/** Responsable + membres rattachés si adhésion multiple ; `[]` si fiche seule. */
	groupe: GroupeMembre[];
}

export interface MembreCandidat extends MembreEtat {
	membreId: number;
	prenom: string;
	nom: string;
	genre: Genre | null;
	indice: string; // ex. "né·e en 19•• · ville"
}

/** Étape 2 — choix de la cotisation (crée un enregistrement dans Adhesions). */
export interface CotisationPayload {
	membreId: number;
	cotisationId: number;
}

/** Étape 3 — choix de l'activité (crée un enregistrement dans Inscription). */
export interface ActivitePayload {
	membreId: number;
	activiteId: number;
}

export interface GroupeMembre {
	membreId: number;
	label: string;
}

export interface AdhesionResult {
	adhesionId: number;
	groupe: GroupeMembre[]; // membres déjà rattachés (via Responsable_de), responsable en tête
	/** Jeton signé pour /api/adhesion/bulletin ; absent si la génération PDF n'est pas configurée. */
	bulletinToken?: string;
}

/** Résultat d'une recherche de membre (rattachement d'un membre existant). */
export interface MembreRecherche {
	membreId: number;
	prenom: string;
	nom: string;
	indice: string;
}

/** Suggestion de l'autocomplétion d'adresse (API Adresse / BAN). */
export interface AdresseSuggestion {
	label: string; // libellé complet affiché dans la liste
	adresse: string; // n° + voie
	codePostal: string;
	commune: string;
}

export interface InscriptionResult {
	inscriptionId: number;
	disponibilite: string; // "Inscrit" | "Liste d'attente"
}

/** Une inscription activité enregistrée pendant le parcours (affichage étape 3 + récap). */
export interface InscriptionLigne {
	membreId: number;
	membreLabel: string;
	activiteId: number;
	activiteLabel: string;
	prix: number | null;
	disponibilite: string; // "Inscrit" | "Liste d'attente"
}

/** Options de select, servies par les routes GET. */
export interface CotisationOption {
	id: number;
	label: string;
	prix: number | null;
	personneMorale: boolean;
	multiple: boolean;
}

export interface ActiviteOption {
	id: number;
	label: string;
	prix: number | null;
	/** `Tarif_non_adherent` : prix total pour un·e non-adhérent·e ; null = pas de tarif distinct. */
	prixNonAdherent: number | null;
	/** `Adhesion_requise` : le prix adhérent·e affiché inclut l'adhésion (adhésion + `prix`). */
	adhesionRequise: boolean;
	placesRestantes: number | null; // null = non plafonnée / inconnu
}

/** Inscription en ligne — activités proposées à l'étape 2 (`/api/inscription/offre`, outil « inscription »). */
export interface OffreInscription {
	/**
	 * `inscription` : activités ouvertes (publiées) à choisir.
	 * `preinscription` : l'activité visée existe mais n'est pas publiée — on note l'intérêt.
	 */
	mode: 'inscription' | 'preinscription';
	activites: ActiviteOption[];
	/** La fiche visait une activité (ou un type) sans correspondance : liste complète par défaut. */
	cibleIntrouvable: boolean;
	/** Prix de l'adhésion individuelle de la saison, inclus dans le total adhérent·e affiché ; null si introuvable. */
	prixAdhesion: number | null;
}

/** Inscription en ligne — intérêt pour une activité non publiée (note dans `Membres.Commentaires`). */
export interface PreinscriptionPayload {
	membreId: number;
	activiteId: number;
}

export interface ApiError {
	error: string;
}

/** Dispositif « Je participe » (planning en direct, cf. src/plugins/presence/lib/presence.ts). */
export interface SeanceCourante {
	activiteId: number;
	label: string;
}

export type PresenceStatut = 'present' | 'absent';

export interface PresencePayload {
	membreId: number;
	activiteId: number;
	statut: PresenceStatut;
}

export interface PresenceResult {
	status: 'ok' | 'deja' | 'non-inscrit';
}
