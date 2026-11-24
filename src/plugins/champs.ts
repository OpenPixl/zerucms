/**
 * Champs de réglage d'un plugin, modifiables depuis le module « Plugins » de
 * l'Espace Admin (`reglages.champs` du catalogue). Module pur : partagé
 * par le catalogue, les manifestes (config Astro), la validation au build
 * (`lib/config.ts` du plugin), l'écriture (`src/lib/plugin-writer.ts`) et
 * l'îlot d'administration.
 */

/** `/rendez-vous`, `/services/rdv`… : minuscules, chiffres, tirets, sans « / » final. */
export const ADRESSE_RE = /^(\/[a-z0-9]+(-[a-z0-9]+)*)+$/;

export type TypeChamp = 'adresse' | 'url' | 'identifiant' | 'table' | 'email';

/** Format de chaque type de champ et message si la valeur ne le respecte pas. */
export const FORMATS: Record<TypeChamp, { re: RegExp; message: string }> = {
	adresse: { re: ADRESSE_RE, message: 'adresse au format /rendez-vous : commence par « / », minuscules, chiffres et tirets' },
	url: { re: /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/, message: 'adresse web au format https://grist.exemple.fr' },
	identifiant: { re: /^[A-Za-z0-9_-]+$/, message: 'lettres, chiffres, « - » et « _ » seulement' },
	table: {
		re: /^[A-Za-z][A-Za-z0-9_]*$/,
		message: 'identifiant de la table dans Grist (ex. Demarches) : lettres sans accent, chiffres et « _ », commence par une lettre',
	},
	email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, message: 'adresse e-mail au format nom@exemple.fr' },
};

/**
 * Saisie mise en forme avant validation et écriture : espaces retirés,
 * adresse en minuscules sans « / » final, et nom de table converti en
 * identifiant comme le fait Grist (« Démarches » → `Demarches`, « mes rdv »
 * → `Mes_rdv`) : la personne tape souvent le nom affiché, accentué.
 */
export function normaliserChamp(type: TypeChamp, brut: unknown): string {
	let v = typeof brut === 'string' ? brut.trim() : '';
	if (type === 'adresse' || type === 'email') v = v.toLowerCase();
	if (type === 'adresse' || type === 'url') v = v.replace(/\/+$/, '');
	if (type === 'table' && v) {
		v = v
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^A-Za-z0-9_]+/g, '_')
			.replace(/^_+|_+$/g, '');
		v = v.charAt(0).toUpperCase() + v.slice(1);
	}
	return v;
}

export interface ChampPlugin {
	/** Chemin de la clé dans le fichier de réglages, séparé par des points (ex. `grist.tables.rdv`). */
	cle: string;
	label: string;
	/** Rubrique de la page de configuration (ex. « Page publique », « Document Grist »). */
	groupe: string;
	type: TypeChamp;
	aide?: string;
	/** Valeur du modèle quand le champ est vide (et sans variable `env`). */
	defaut?: string;
	/** Variable du `.env` utilisée quand le champ est vide. */
	env?: string;
	/** Signalé si vide partout (fichier, `.env`, défaut) : le plugin ne peut pas fonctionner. */
	obligatoire?: boolean;
}

/**
 * Champ de **connexion** d'un plugin (`connexion.champs` du catalogue) :
 * identifiant, clé ou jeton d'un service extérieur. Jamais dans le `.env` ni
 * dans `src/content/` : écrit dans `<DATA_DIR>/connexions/<plugin>.yaml`
 * (`src/lib/connexions.ts`), saisi une fois puis **masqué** (`****`) dans la
 * page de configuration ; on ne peut que le remplacer ou l'effacer, jamais le
 * relire depuis le navigateur.
 */
export type TypeConnexion = 'identifiant' | 'cle' | 'version' | 'url' | 'hote' | 'port' | 'email' | 'texte' | 'motdepasse';

export const FORMATS_CONNEXION: Record<TypeConnexion, { re: RegExp; message: string }> = {
	identifiant: { re: /^[A-Za-z0-9_-]+$/, message: 'lettres, chiffres, « - » et « _ » seulement' },
	cle: { re: /^\S{8,}$/, message: 'au moins 8 caractères, sans espace' },
	version: { re: /^v\d+\.\d+$/, message: 'version au format v23.0' },
	url: { re: /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/, message: 'adresse web au format https://exemple.fr' },
	hote: { re: /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/, message: 'nom de serveur, ex. smtp.exemple.fr' },
	port: { re: /^([1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/, message: 'numéro de port, ex. 587' },
	email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'adresse e-mail, ex. contact@exemple.fr' },
	texte: { re: /^[^\r\n]{1,200}$/, message: 'une ligne de texte (200 caractères au plus)' },
	motdepasse: { re: /^[^\r\n]{1,500}$/, message: 'mot de passe sur une ligne' },
};

export interface ChampConnexion {
	/** Chemin de la clé dans le fichier de connexion, séparé par des points (ex. `facebook.jeton`). */
	cle: string;
	label: string;
	type: TypeConnexion;
	aide?: string;
	/** Affiché en clair une fois saisi (réglage sans secret, ex. version d'une API) ; défaut : masqué. */
	clair?: boolean;
	/** Sans lui, la connexion ne fonctionne pas (signalé dans la page de configuration). */
	obligatoire?: boolean;
	/** Outil du plugin auquel le champ sert (absent = le plugin entier). */
	outil?: string;
}
