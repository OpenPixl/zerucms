/**
 * Plugins du modèle : outils courants, livrés avec le CMS et proposés selon
 * le type de structure, que chacune active ou non (`plugins:` de
 * `src/content/reglages.yaml` ; inactifs par défaut, sauf `actifParDefaut`).
 * Un développement propre à une structure est une **extension**
 * (`extensions/<id>/`, `src/lib/extensions.ts`), jamais un plugin.
 *
 * Module pur (seulement des modules purs importés) : chargé par la config Astro, par
 * `src/config/site.ts` et dans le navigateur. Nouveau plugin = une entrée
 * ici + son dossier `src/plugins/<id>/` + son manifeste dans `manifests.ts`
 * (cf. `src/plugins/README.md`).
 */
import type { ChampPlugin } from './champs';
import type { Structure } from '../lib/structure';
import { ADRESSE_DEFAUT as DEVIS_ADRESSE_DEFAUT } from './facturation/lib/adresse';

/**
 * Secret demandé par l'assistant d'installation (écrit dans
 * `<DATA_DIR>/installation/secrets.env`, cf. `scripts/installation.mjs`).
 * `genere` : jamais demandé, créé au hasard s'il manque.
 */
export interface SecretPlugin {
	nom: string;
	label: string;
	type: 'url' | 'identifiant' | 'cle';
	aide?: string;
	obligatoire?: boolean;
	genere?: boolean;
}

export interface PluginInfo {
	label: string;
	description: string;
	/**
	 * Actif sans rien écrire dans `reglages.yaml` (volet que la plupart des
	 * associations utilisent) ; `plugins: { <id>: false }` le désactive.
	 */
	actifParDefaut?: boolean;
	/**
	 * Plugins dont celui-ci se sert (routes, code) : il n'est actif que s'ils le
	 * sont tous, et c'est le seul dossier d'un autre plugin qu'il peut importer.
	 */
	requiert?: readonly string[];
	/**
	 * Types de structure à qui le plugin est proposé (absent = tous) ; pour un
	 * autre type, il est inactif et caché (module « Plugins », assistant).
	 */
	structures?: readonly Structure[];
	/** Icône Font Awesome (module « Plugins » de l'Espace Admin). */
	icon: string;
	/** Documentation du plugin (chemin dans le projet). */
	doc: string;
	/** Fichiers de `src/content/` sans lesquels le plugin ne peut pas être activé. */
	requis?: { fichier: string; aide: string }[];
	/**
	 * Secrets du `.env` (jamais réglables depuis le site) : signalés si absents
	 * (`repli` compris), sans bloquer l'activation ; la page de configuration
	 * dit lequel est utilisé.
	 */
	env?: { nom: string; aide: string; repli?: string }[];
	/**
	 * Réglages modifiables dans la page de configuration du module « Plugins »,
	 * écrits dans `fichier` (de `src/content/`). Un champ `type: 'adresse'` est
	 * l'adresse de la page publique (contrôlée contre les pages du site).
	 */
	reglages?: { fichier: string; champs: ChampPlugin[] };
	/** Secrets demandés par l'assistant d'installation (ensuite : `.env` seulement). */
	secrets?: SecretPlugin[];
	/** Fichier de `src/content/` créé à l'activation par l'assistant s'il manque, copié de ce modèle (chemin du projet). */
	modele?: { fichier: string; source: string };
}

export const PLUGINS = {
	adhesion: {
		label: 'Adhésion et activités',
		description:
			'Adhésion en ligne et bulletin PDF, présence (« Je participe »), planning des activités lu dans Grist.',
		actifParDefaut: true,
		structures: ['association'],
		icon: 'fa-id-card',
		doc: 'src/plugins/adhesion/README.md',
		env: [
			{ nom: 'GRIST_API_KEY', aide: 'Clé d’API Grist du document de l’adhésion, dans le .env. Sans clé, les formulaires (adhésion, inscription, présence) et le planning Grist ne fonctionnent pas.' },
			{ nom: 'GRIST_DOC_ID', aide: 'Identifiant du document Grist de l’adhésion, dans le .env.' },
		],
		secrets: [
			{ nom: 'GRIST_BASE_URL', label: 'Adresse de l’instance Grist', type: 'url', obligatoire: true, aide: 'Ex. https://grist.exemple.fr' },
			{ nom: 'GRIST_DOC_ID', label: 'Identifiant du document de l’adhésion', type: 'identifiant', obligatoire: true, aide: 'Dans l’adresse du document Grist : https://…/o/…/<identifiant>/…' },
			{ nom: 'GRIST_API_KEY', label: 'Clé d’API Grist', type: 'cle', obligatoire: true, aide: 'Grist → Paramètres du compte → Clé d’API.' },
			{ nom: 'GOTENBERG_URL', label: 'Adresse du service PDF (Gotenberg)', type: 'url', aide: 'Facultatif : bulletin d’adhésion en PDF. Ex. http://gotenberg:3000' },
			{ nom: 'BULLETIN_SECRET', label: 'Secret du lien de bulletin', type: 'cle', genere: true },
		],
	},
	inscription: {
		label: 'Inscription aux activités',
		description:
			'Page /inscription et bouton « S’inscrire » des fiches d’activité : adhérent·e ou personne extérieure, liste d’attente, préinscription. Requiert le plugin Adhésion (même document Grist).',
		actifParDefaut: true,
		requiert: ['adhesion'],
		structures: ['association'],
		icon: 'fa-clipboard-list',
		doc: 'src/plugins/inscription/README.md',
	},
	facturation: {
		label: 'Devis et facturation',
		description:
			'Clients, devis et factures dans un document Grist : numérotation continue, PDF avec les mentions de l’auto-entrepreneur, page publique « Demander un devis » (réglages : src/content/facturation.yaml).',
		structures: ['entreprise'],
		icon: 'fa-file-invoice-dollar',
		doc: 'src/plugins/facturation/README.md',
		requis: [{ fichier: 'facturation.yaml', aide: 'Copier le modèle src/plugins/facturation/facturation.exemple.yaml puis l’adapter.' }],
		modele: { fichier: 'facturation.yaml', source: 'src/plugins/facturation/facturation.exemple.yaml' },
		env: [
			{ nom: 'GRIST_DOC_ID_FACTURATION', aide: 'Identifiant du document Grist de la facturation, dans le .env.' },
			{
				nom: 'GRIST_API_KEY_FACTURATION',
				repli: 'GRIST_API_KEY',
				aide: 'Clé d’API Grist, dans le .env : GRIST_API_KEY_FACTURATION (ou, à défaut, GRIST_API_KEY).',
			},
		],
		reglages: {
			fichier: 'facturation.yaml',
			champs: [
				{
					cle: 'adresse',
					label: 'Adresse de la page « Demander un devis »',
					groupe: 'Page publique',
					type: 'adresse',
					defaut: DEVIS_ADRESSE_DEFAUT,
				},
			],
		},
		secrets: [
			{ nom: 'GRIST_BASE_URL', label: 'Adresse de l’instance Grist', type: 'url', obligatoire: true, aide: 'Ex. https://grist.exemple.fr' },
			{
				nom: 'GRIST_DOC_ID_FACTURATION',
				label: 'Identifiant du document de facturation',
				type: 'identifiant',
				obligatoire: true,
				aide: 'Document Grist créé d’après le schéma du plugin (README) : https://…/o/…/<identifiant>/…',
			},
			{ nom: 'GRIST_API_KEY_FACTURATION', label: 'Clé d’API Grist', type: 'cle', obligatoire: true, aide: 'Grist → Paramètres du compte → Clé d’API.' },
			{ nom: 'GOTENBERG_URL', label: 'Adresse du service PDF (Gotenberg)', type: 'url', aide: 'Facultatif, mais nécessaire pour les PDF des devis et factures. Ex. http://gotenberg:3000' },
		],
	},
} as const satisfies Record<string, PluginInfo>;

export type PluginId = keyof typeof PLUGINS;

/**
 * Anciens plugins devenus extensions (`extensions/<id>/`, cf.
 * `src/lib/extensions.ts`) : leur clé sous `plugins:` de `reglages.yaml`,
 * laissée par les sites qui les utilisaient, est ignorée.
 */
export const PLUGINS_DEVENUS_EXTENSIONS: readonly string[] = ['rdv'];

export const PLUGIN_IDS = Object.keys(PLUGINS) as PluginId[];

/** État d'un plugin quand `reglages.yaml` n'en dit rien. */
export function actifParDefaut(id: PluginId): boolean {
	return (PLUGINS[id] as PluginInfo).actifParDefaut === true;
}

/** Plugin proposé au type de structure `structure` ? */
export function proposePour(id: PluginId, structure: Structure): boolean {
	const structures = (PLUGINS[id] as PluginInfo).structures;
	return !structures || structures.includes(structure);
}

/** Plugins requis par `id` (`requiert`). */
export function requis(id: PluginId): PluginId[] {
	return [...((PLUGINS[id] as PluginInfo).requiert ?? [])] as PluginId[];
}

/**
 * Plugins réellement actifs d'après `plugins:` de `reglages.yaml` : valeur
 * écrite, sinon `actifParDefaut` ; inactif s'il n'est pas proposé au type
 * de structure (`structure:`) ou si un plugin requis l'est.
 */
export function resoudrePlugins(lus: Partial<Record<string, unknown>>, structure: Structure = 'association'): Record<PluginId, boolean> {
	const voulu = (id: PluginId) =>
		proposePour(id, structure) && (typeof lus[id] === 'boolean' ? (lus[id] as boolean) : actifParDefaut(id));
	const actif = (id: PluginId, vus: PluginId[] = []): boolean =>
		voulu(id) && requis(id).every((r) => !vus.includes(r) && actif(r, [...vus, id]));
	return Object.fromEntries(PLUGIN_IDS.map((id) => [id, actif(id)])) as Record<PluginId, boolean>;
}
