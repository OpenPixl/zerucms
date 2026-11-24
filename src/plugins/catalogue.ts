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
import type { ChampConnexion, ChampPlugin } from './champs';
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

/**
 * Outil d'un plugin : partie qui s'allume ou s'éteint seule, plugin actif
 * (interrupteurs de sa page de configuration, `outils.<plugin>.<outil>` de
 * `reglages.yaml`, absent = allumé). Éteint, ses pages et routes ne sont pas
 * construites (`outil` des routes du manifeste) et le site masque ce qu'il
 * y ajoute (`outilActif()` de `src/plugins/index.ts`).
 */
export interface OutilPlugin {
	id: string;
	label: string;
	description: string;
	/** Icône Font Awesome (style plein ; `fa-brands fa-…` pour une marque). */
	icon: string;
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
	 * Plugin issu d'un autre (0.5.23 : activités et présence sortis de
	 * l'adhésion) : sans valeur écrite pour lui dans `reglages.yaml`, il prend
	 * celle écrite pour `heriteDe` (un site qui avait coupé l'adhésion ne voit
	 * pas apparaître les deux autres).
	 */
	heriteDe?: string;
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
	/** Outils allumés ou éteints un à un, le plugin actif (absent = aucun). */
	outils?: readonly OutilPlugin[];
	/** Nom de l'encart des outils dans la page de configuration (défaut « Outils », ex. « Réseaux »). */
	outilsTitre?: string;
	/** Texte sous ce titre (défaut : ce que fait l'interrupteur d'un outil). */
	outilsAide?: string;
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
	/**
	 * Identifiants de connexion à un service extérieur, saisis dans la page de
	 * configuration du plugin puis masqués, écrits dans
	 * `<DATA_DIR>/connexions/<id>.yaml` (jamais dans le `.env`) : cf.
	 * `src/lib/connexions.ts`. Pris en compte sans reconstruire le site.
	 */
	connexion?: { champs: ChampConnexion[]; aide?: string };
	/** Secrets demandés par l'assistant d'installation (ensuite : `.env` seulement). */
	secrets?: SecretPlugin[];
	/** Fichier de `src/content/` créé à l'activation par l'assistant s'il manque, copié de ce modèle (chemin du projet). */
	modele?: { fichier: string; source: string };
}

export const PLUGINS = {
	adhesion: {
		label: 'Adhésion',
		description:
			'Adhésion en ligne (/adherer) : nouvelle adhésion ou renouvellement, membres rattachés, cotisation, bulletin PDF, bouton « Adhérer » de la barre de navigation. Lit le document Grist de l’association.',
		actifParDefaut: true,
		structures: ['association'],
		icon: 'fa-id-card',
		doc: 'src/plugins/adhesion/README.md',
		env: [
			{ nom: 'GRIST_API_KEY', aide: 'Clé d’API Grist du document de l’association, dans le .env.' },
			{ nom: 'GRIST_DOC_ID', aide: 'Identifiant du document Grist de l’association (adhésion, activités, présence), dans le .env.' },
		],
		secrets: [
			{ nom: 'GRIST_BASE_URL', label: 'Adresse de l’instance Grist', type: 'url', obligatoire: true, aide: 'Ex. https://grist.exemple.fr' },
			{ nom: 'GRIST_DOC_ID', label: 'Identifiant du document de l’association', type: 'identifiant', obligatoire: true, aide: 'Dans l’adresse du document Grist : https://…/o/…/<identifiant>/… (le même pour l’adhésion, les activités et la présence)' },
			{ nom: 'GRIST_API_KEY', label: 'Clé d’API Grist', type: 'cle', obligatoire: true, aide: 'Grist → Paramètres du compte → Clé d’API.' },
			{ nom: 'GOTENBERG_URL', label: 'Adresse du service PDF (Gotenberg)', type: 'url', aide: 'Facultatif : bulletin d’adhésion en PDF. Ex. http://gotenberg:3000' },
			{ nom: 'BULLETIN_SECRET', label: 'Secret du lien de bulletin', type: 'cle', genere: true },
		],
	},
	activites: {
		label: 'Activités',
		description:
			'Planning de la semaine sur la page /activites et inscription en ligne aux activités, lus dans le document Grist de l’association. Chaque outil s’allume ou s’éteint ici.',
		actifParDefaut: true,
		heriteDe: 'adhesion',
		structures: ['association'],
		icon: 'fa-calendar-week',
		doc: 'src/plugins/activites/README.md',
		outils: [
			{
				id: 'planning',
				label: 'Planning des activités',
				description: 'Calendrier de la semaine sur la page /activites, lu dans la table Grist « Activite ».',
				icon: 'fa-calendar-week',
			},
			{
				id: 'inscription',
				label: 'Inscription aux activités',
				description: 'Page /inscription et bouton « S’inscrire » des fiches d’activité : adhérent·e ou personne extérieure, liste d’attente, préinscription.',
				icon: 'fa-clipboard-list',
			},
		],
		env: [
			{ nom: 'GRIST_API_KEY', aide: 'Clé d’API Grist du document de l’association, dans le .env.' },
			{ nom: 'GRIST_DOC_ID', aide: 'Identifiant du document Grist de l’association (adhésion, activités, présence), dans le .env.' },
		],
		secrets: [
			{ nom: 'GRIST_BASE_URL', label: 'Adresse de l’instance Grist', type: 'url', obligatoire: true, aide: 'Ex. https://grist.exemple.fr' },
			{ nom: 'GRIST_DOC_ID', label: 'Identifiant du document de l’association', type: 'identifiant', obligatoire: true, aide: 'Dans l’adresse du document Grist : https://…/o/…/<identifiant>/… (le même pour l’adhésion, les activités et la présence)' },
			{ nom: 'GRIST_API_KEY', label: 'Clé d’API Grist', type: 'cle', obligatoire: true, aide: 'Grist → Paramètres du compte → Clé d’API.' },
		],
	},
	presence: {
		label: 'Présence « Je participe »',
		description:
			'Page /je-participe et son lien rapide sur téléphone : pendant une séance, chaque membre inscrit·e signale sa présence (ou son absence), écrite dans la table Grist « Presence ».',
		actifParDefaut: true,
		heriteDe: 'adhesion',
		structures: ['association'],
		icon: 'fa-hand',
		doc: 'src/plugins/presence/README.md',
		env: [
			{ nom: 'GRIST_API_KEY', aide: 'Clé d’API Grist du document de l’association, dans le .env.' },
			{ nom: 'GRIST_DOC_ID', aide: 'Identifiant du document Grist de l’association (adhésion, activités, présence), dans le .env.' },
		],
		secrets: [
			{ nom: 'GRIST_BASE_URL', label: 'Adresse de l’instance Grist', type: 'url', obligatoire: true, aide: 'Ex. https://grist.exemple.fr' },
			{ nom: 'GRIST_DOC_ID', label: 'Identifiant du document de l’association', type: 'identifiant', obligatoire: true, aide: 'Dans l’adresse du document Grist : https://…/o/…/<identifiant>/… (le même pour l’adhésion, les activités et la présence)' },
			{ nom: 'GRIST_API_KEY', label: 'Clé d’API Grist', type: 'cle', obligatoire: true, aide: 'Grist → Paramètres du compte → Clé d’API.' },
		],
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
	diffusion: {
		label: 'Diffusion sur les réseaux sociaux',
		description:
			'Publie vos actualités sur vos réseaux sociaux, depuis l’onglet « Diffusion » de chaque actualité.',
		icon: 'fa-share-nodes',
		doc: 'src/plugins/diffusion/README.md',
		outilsTitre: 'Réseaux',
		outilsAide: 'Les réseaux sur lesquels publier vos actualités.',
		outils: [
			{
				id: 'facebook',
				label: 'Page Facebook',
				description: 'Publie sur la Page Facebook de votre structure.',
				icon: 'fa-brands fa-facebook',
			},
		],
		connexion: {
			aide: 'Ces informations s’obtiennent une fois depuis votre compte Facebook (voir le guide du plugin).',
			champs: [
				{
					cle: 'facebook.page_id',
					label: 'Identifiant de la Page Facebook',
					type: 'identifiant',
					obligatoire: true,
					outil: 'facebook',
					aide: 'Sur Facebook : votre Page → À propos → Transparence de la Page.',
				},
				{
					cle: 'facebook.jeton',
					label: 'Jeton d’accès de la Page',
					type: 'cle',
					obligatoire: true,
					outil: 'facebook',
					aide: 'Sa date d’expiration est vérifiée à l’enregistrement ; un rappel vous prévient avant qu’il expire.',
				},
				{
					cle: 'facebook.version',
					label: 'Version de l’API Graph',
					type: 'version',
					clair: true,
					outil: 'facebook',
					aide: 'Facultatif : laissez vide en cas de doute.',
				},
			],
		},
	},
} as const satisfies Record<string, PluginInfo>;

export type PluginId = keyof typeof PLUGINS;

/**
 * Anciens plugins devenus extensions (`extensions/<id>/`, cf.
 * `src/lib/extensions.ts`) : leur clé sous `plugins:` de `reglages.yaml`,
 * laissée par les sites qui les utilisaient, est ignorée.
 */
export const PLUGINS_DEVENUS_EXTENSIONS: readonly string[] = ['rdv'];

/**
 * Anciens plugins devenus outils d'un autre (0.5.23 : `inscription` → outil
 * du plugin `activites`) : leur clé sous `plugins:` de `reglages.yaml` vaut
 * pour l'outil tant que `outils:` n'en dit rien ; réécrite à l'enregistrement
 * du plugin dans le module « Plugins ».
 */
export const PLUGINS_DEVENUS_OUTILS: Readonly<Record<string, { plugin: PluginId; outil: string }>> = {
	inscription: { plugin: 'activites', outil: 'inscription' },
};

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

/** Outils du plugin `id` (catalogue). */
export function outilsDe(id: PluginId): readonly OutilPlugin[] {
	return (PLUGINS[id] as PluginInfo).outils ?? [];
}

/** Plugins requis par `id` (`requiert`). */
export function requis(id: PluginId): PluginId[] {
	return [...((PLUGINS[id] as PluginInfo).requiert ?? [])] as PluginId[];
}

/**
 * Plugins réellement actifs d'après `plugins:` de `reglages.yaml` : valeur
 * écrite, sinon celle de `heriteDe`, sinon `actifParDefaut` ; inactif s'il n'est pas proposé au type
 * de structure (`structure:`) ou si un plugin requis l'est.
 */
export function resoudrePlugins(lus: Partial<Record<string, unknown>>, structure: Structure = 'association'): Record<PluginId, boolean> {
	const ecrit = (id: string) => (typeof lus[id] === 'boolean' ? (lus[id] as boolean) : undefined);
	const voulu = (id: PluginId) => {
		const parent = (PLUGINS[id] as PluginInfo).heriteDe;
		return proposePour(id, structure) && (ecrit(id) ?? (parent ? ecrit(parent) : undefined) ?? actifParDefaut(id));
	};
	const actif = (id: PluginId, vus: PluginId[] = []): boolean =>
		voulu(id) && requis(id).every((r) => !vus.includes(r) && actif(r, [...vus, id]));
	return Object.fromEntries(PLUGIN_IDS.map((id) => [id, actif(id)])) as Record<PluginId, boolean>;
}

/**
 * Outils allumés de chaque plugin : `outils.<plugin>.<outil>` de
 * `reglages.yaml`, sinon l'ancienne clé `plugins.<ancien>`
 * (`PLUGINS_DEVENUS_OUTILS`), sinon allumé ; tous éteints si le plugin est
 * inactif (`actifs`, cf. `resoudrePlugins()`).
 */
export function resoudreOutils(
	lusPlugins: Partial<Record<string, unknown>>,
	lusOutils: Partial<Record<string, unknown>>,
	actifs: Record<PluginId, boolean>,
): Record<PluginId, Record<string, boolean>> {
	const ancienne = (plugin: PluginId, outil: string) => {
		const cle = Object.keys(PLUGINS_DEVENUS_OUTILS).find((k) => PLUGINS_DEVENUS_OUTILS[k].plugin === plugin && PLUGINS_DEVENUS_OUTILS[k].outil === outil);
		return cle && typeof lusPlugins[cle] === 'boolean' ? (lusPlugins[cle] as boolean) : undefined;
	};
	return Object.fromEntries(
		PLUGIN_IDS.map((id) => {
			const lus = (lusOutils[id] && typeof lusOutils[id] === 'object' ? lusOutils[id] : {}) as Record<string, unknown>;
			return [
				id,
				Object.fromEntries(
					outilsDe(id).map((o) => [o.id, actifs[id] && (typeof lus[o.id] === 'boolean' ? (lus[o.id] as boolean) : (ancienne(id, o.id) ?? true))]),
				),
			];
		}),
	) as Record<PluginId, Record<string, boolean>>;
}
