/**
 * Fines enveloppes typées autour des routes /api/auth/* et /api/admin/*.
 * Une erreur porte le message renvoyé par le serveur et son code HTTP
 * (`status === 401` : session expirée).
 */
import type { FontRole, FontWeight } from '../../lib/font-catalogue';
import type { Structure } from '../../lib/structure';
import type { TypeChamp } from '../../plugins/champs';
import type { Association } from '../../lib/association';
import type { AuthGroup } from '../../lib/auth/groups';
import type { LinkToggle, ThemeColors } from '../../config/site';
import type { ReglageSombre } from '../../lib/mode-sombre';
import type { PiedResolu, ReglagePied } from '../../lib/pied';
import type { Diffusion } from '../../lib/diffusion';
import type { Bloc } from '../../lib/blocs';
import type { HomeModule } from '../../lib/home-modules';
import type { ModelVersionInfo } from '../../lib/model-version';
import type { EtatMiseAJour } from '../../lib/mise-a-jour';
import type { SitePageState } from '../../lib/site-pages';
import type { SiteLinkGroup } from '../../lib/site-links';

export interface AdminUser {
	login: string;
	fullname: string;
	email: string | null;
	groups: AuthGroup[];
	/** Mot de passe provisoire : à remplacer avant tout le reste. */
	mustChangePassword: boolean;
}

export interface ReservedPage {
	title: string;
	url: string;
	description: string | null;
}

export interface AccountView {
	login: string;
	fullname: string;
	email: string | null;
	groups: AuthGroup[];
	state: 'enabled' | 'disabled';
	created: string;
	updated: string;
}

export interface NewsItem {
	slug: string;
	href: string;
	title: string;
	publishAt: string;
	isPublish: boolean;
	tag: string | null;
	thumbnail: string | null;
}

/** Actualité telle qu'elle est dans les sources (formulaire d'édition). */
export interface NewsSource {
	slug: string;
	title: string;
	publishAt: string;
	excerpt: string;
	isPublish: boolean;
	tag: string;
	author: string;
	imageCredit: string;
	body: string;
	/** Blocs placés dans le texte (`[[bloc:<id>]]`). */
	blocs: Record<string, Bloc>;
	cover: string | null;
	/** Aperçu de la photo actuelle (site construit). */
	coverUrl: string | null;
	/** Vignettes des photos des blocs déjà publiées, par valeur (`./photo_1.jpg`). */
	blocPhotoUrls?: Record<string, string>;
	/** Diffusions sur les réseaux sociaux (plugin `diffusion`). */
	diffusion: Diffusion;
}

/** Photos des blocs envoyées avec un contenu, sous la valeur du champ qui les cite (`nouvelle:<clé>`, nom de fichier). */
export type BlocPhotosEnvoi = Record<string, { type: string; data: string }>;

export type NewsFields = Pick<NewsSource, 'title' | 'publishAt' | 'excerpt' | 'isPublish' | 'tag' | 'author' | 'imageCredit'>;

/** Fiche d'activité telle qu'elle se saisit dans le module « Activités » (cf. src/lib/activity-writer.ts). */
export interface ActivityInput {
	slug: string;
	title: string;
	excerpt: string;
	category: string;
	isPublish: boolean;
	level: string;
	inscription: boolean;
	activiteGrist: string[];
	typeGrist: string;
	imageCredit: string;
	body: string;
	/** Blocs placés dans le texte (`[[bloc:<id>]]`). */
	blocs: Record<string, Bloc>;
	/** Photos des blocs à envoyer (enregistrement seulement). */
	photos?: BlocPhotosEnvoi;
}

/** Ligne de la liste du module (sans le texte). */
export interface ActivityItem extends Omit<ActivityInput, 'body' | 'blocs' | 'photos'> {
	order: number;
	cover: string | null;
	href: string;
	thumbnail: string | null;
}

/** Fiche des sources (formulaire d'édition). */
export interface ActivitySourceView extends ActivityInput {
	order: number;
	cover: string | null;
	/** Aperçu de la photo actuelle (site construit). */
	coverUrl: string | null;
	/** Vignettes des photos des blocs déjà publiées, par valeur (`./photo_1.jpg`). */
	blocPhotoUrls?: Record<string, string>;
	/** Actualités créées depuis l'onglet « Partage » (sources, brouillons compris). */
	actualites: { slug: string; title: string; publishAt: string; isPublish: boolean; href: string }[];
}

/** Catégorie d'activités (`src/content/activites/_categories.yaml`), cf. src/lib/categories.ts. */
export interface ActivityCategory {
	slug: string;
	label: string;
	icon: string;
	description: string;
}

export type CoverUpdate = { action: 'keep' } | { action: 'remove' } | { action: 'replace'; type: string; data: string };

/** État de la dernière publication (reconstruction du site), cf. src/lib/site-build.ts. */
export interface PublishStatus {
	state: 'idle' | 'running' | 'succeeded' | 'failed';
	label?: string;
	href?: string;
	startedAt?: string;
	finishedAt?: string;
	message?: string;
}

/** Événement du journal des modifications, cf. src/lib/journal.ts. */
export interface JournalEntry {
	at: string;
	by?: { login: string; fullname: string };
	action: string;
	label?: string;
	href?: string;
	outcome?: 'ok' | 'echec';
	message?: string;
}

export type PagePlacement = { kind: 'racine' } | { kind: 'dropdown'; dropdown: string } | { kind: 'reservee' };

/** Page à créer ou modifier (module « Pages »), cf. src/lib/page-writer.ts. */
export interface PageInput {
	placement: PagePlacement;
	slug: string;
	title: string;
	description: string;
	type: 'classique' | 'enrichie';
	menu: { show: boolean; order: number; label: string };
	access: AuthGroup[];
	body: string;
	blocs: Record<string, Bloc>;
	imageCredit: string;
	/** Photos des blocs envoyées avec la page (cf. `BlocPhotosEnvoi`). */
	photos?: BlocPhotosEnvoi;
}

/** Page telle qu'elle est dans les sources. */
export interface PageSourceView extends PageInput {
	path: string;
	cover: string | null;
	/** Page `.mdx` écrite dans le code : lecture seule. */
	technique: boolean;
	/** Aperçu de la photo actuelle (GET d'une page seulement). */
	coverUrl?: string | null;
	/** Vignettes des photos des blocs déjà publiées, par valeur (`./bloc-….jpg`) (GET d'une page seulement). */
	blocPhotoUrls?: Record<string, string>;
}

/** Page du site (bibliothèque Accueil, Activités…) avec ses réglages, cf. src/lib/site-pages.ts. */
export type SitePageView = SitePageState;

export interface SitePageInput {
	label: string;
	show: boolean;
	active: boolean;
	textes: Record<string, string>;
	/** Accueil : liste complète des modules (absent = inchangée). */
	modules?: HomeModule[];
	/** Accueil : nouvelle photo du bandeau, `'remove'` pour la retirer (absent = inchangée). */
	photo?: { type: string; data: string } | 'remove';
	/** Accueil : nouvelle illustration du module « Présentation », `'remove'` pour la retirer (absent = inchangée). */
	illustration?: { type: string; data: string } | 'remove';
}

/** Menu déroulant de la barre de navigation (`_group.md`). */
export interface DropdownView {
	folder: string;
	label: string;
	order: number;
	pages: string[];
}

export interface AccountInput {
	fullname: string;
	email: string;
	groups: AuthGroup[];
}

/** Modification enregistrée sans publier, en attente dans le lot (cf. src/lib/publication-lot.ts). */
export interface LotChange {
	at: string;
	by?: { login: string; fullname: string };
	label: string;
	href?: string;
}

/** `deferred` : enregistrer sans publier (la modification rejoint le lot en attente). */
export interface SaveOptions {
	deferred?: boolean;
}

/** Réponse d'un enregistrement : `deferred` si la modification attend dans le lot (rien n'est reconstruit). */
export interface SaveResult {
	ok: true;
	href?: string | null;
	deferred?: true;
}

/** Adresse de la route d'enregistrement, avec `?publier=non` pour enregistrer sans publier. */
function saveUrl(url: string, options?: SaveOptions): string {
	return options?.deferred ? `${url}?publier=non` : url;
}

export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

/** Appel JSON d'une route `/api/admin/*` (exporté pour les modules des plugins). */
export async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
	const res = await fetch(url, {
		method,
		headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) {
		const fallback =
			res.status === 413
				? "Envoi trop volumineux pour le serveur (erreur 413). Essayez une photo plus légère ; l'administrateur·rice du serveur peut aussi relever la limite (nginx : client_max_body_size)."
				: `Erreur ${res.status}`;
		throw new ApiError((data && data.error) || fallback, res.status);
	}
	return data as T;
}

export const authApi = {
	me: () => request<{ user: AdminUser; pages: ReservedPage[]; lot: LotChange[] }>('GET', '/api/auth/me'),
	login: (login: string, password: string) => request<{ user: AdminUser }>('POST', '/api/auth/login', { login, password }),
	logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
	changePassword: (current: string, next: string) =>
		request<{ ok: true }>('POST', '/api/admin/mot-de-passe', { current, next }),
	myAccount: () => request<{ account: AccountView }>('GET', '/api/admin/mon-compte'),
	updateMyAccount: (input: { fullname: string; email: string }) =>
		request<{ account: AccountView; user: AdminUser }>('PUT', '/api/admin/mon-compte', input),
};

export const accountsApi = {
	list: () => request<{ accounts: AccountView[] }>('GET', '/api/admin/comptes'),
	create: (input: AccountInput & { login: string; password: string }) =>
		request<{ account: AccountView; password: string | null }>('POST', '/api/admin/comptes', input),
	update: (login: string, input: AccountInput & { state: AccountView['state'] }) =>
		request<{ account: AccountView }>('PATCH', `/api/admin/comptes/${encodeURIComponent(login)}`, input),
	resetPassword: (login: string) =>
		request<{ password: string }>('POST', `/api/admin/comptes/${encodeURIComponent(login)}`),
	remove: (login: string, confirm: string) =>
		request<{ ok: true }>('DELETE', `/api/admin/comptes/${encodeURIComponent(login)}`, { confirm }),
};

export const newsApi = {
	list: () =>
		request<{ news: NewsItem[]; status: PublishStatus; availability: { ok: boolean; reason?: string } }>(
			'GET',
			'/api/admin/actualites',
		),
	create: (markdown: string, cover: { type: string; data: string } | null, options?: SaveOptions, photos: BlocPhotosEnvoi = {}) =>
		request<SaveResult>('POST', saveUrl('/api/admin/actualites', options), { markdown, cover: cover ?? undefined, photos }),
	status: () => request<PublishStatus>('GET', '/api/admin/publication'),
	dismissStatus: () => request<{ ok: true }>('DELETE', '/api/admin/publication'),
	get: (slug: string) => request<NewsSource>('GET', `/api/admin/actualites/${encodeURIComponent(slug)}`),
	update: (
		slug: string,
		fields: NewsFields,
		body: string,
		cover: CoverUpdate,
		options?: SaveOptions,
		blocs: Record<string, Bloc> = {},
		photos: BlocPhotosEnvoi = {},
	) => request<SaveResult>('PUT', saveUrl(`/api/admin/actualites/${encodeURIComponent(slug)}`, options), { fields, body, blocs, photos, cover }),
	remove: (slug: string, options?: SaveOptions) =>
		request<SaveResult>('DELETE', saveUrl(`/api/admin/actualites/${encodeURIComponent(slug)}`, options), { confirm: slug }),
};

export const pagesApi = {
	list: () =>
		request<{
			sitePages: SitePageView[];
			dropdowns: DropdownView[];
			pages: PageSourceView[];
			/** Aperçu de la photo du bandeau d'accueil, `null` sans photo. */
			homePhoto: string | null;
			/** Aperçu de l'illustration du module « Présentation », `null` sans illustration. */
			homeIllustration: string | null;
			status: PublishStatus;
			availability: { ok: boolean; reason?: string };
		}>('GET', '/api/admin/pages'),
	get: (path: string) => request<PageSourceView>('GET', `/api/admin/pages/${path}`),
	create: (page: PageInput, cover: { type: string; data: string } | null, options?: SaveOptions) =>
		request<SaveResult>('POST', saveUrl('/api/admin/pages', options), { page, cover: cover ?? undefined }),
	update: (path: string, page: PageInput, cover: CoverUpdate, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl(`/api/admin/pages/${path}`, options), { page, cover }),
	remove: (path: string, options?: SaveOptions) =>
		request<SaveResult>('DELETE', saveUrl(`/api/admin/pages/${path}`, options), { confirm: path }),
};

/** Nouvel ordre d'un ou plusieurs niveaux du menu (`racine`, `dropdown:<dossier>`), cf. saveMenuOrder(). */
export const menuOrderApi = {
	save: (levels: Record<string, string[]>, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl('/api/admin/ordre-menu', options), { levels }),
};

export const sitePagesApi = {
	update: (id: string, input: SitePageInput, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl(`/api/admin/pages-du-site/${encodeURIComponent(id)}`, options), input),
};

export const dropdownsApi = {
	create: (input: { label: string; folder: string }, options?: SaveOptions) =>
		request<SaveResult>('POST', saveUrl('/api/admin/menus-deroulants', options), input),
	update: (folder: string, input: { label: string }, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl(`/api/admin/menus-deroulants/${encodeURIComponent(folder)}`, options), input),
	remove: (folder: string, options?: SaveOptions) =>
		request<SaveResult>('DELETE', saveUrl(`/api/admin/menus-deroulants/${encodeURIComponent(folder)}`, options), { confirm: folder }),
};

/** Plugin du catalogue (ou extension installée) tel que le montre le module « Plugins » / « Extensions » (cf. src/lib/plugin-writer.ts). */
export interface PluginItem {
	genre: 'plugin' | 'extension';
	id: string;
	/** Extension : version installée et auteur. */
	version?: string;
	auteur?: string;
	label: string;
	description: string;
	icon: string;
	doc: string;
	actif: boolean;
	enLigne: boolean;
	requisInactifs: { id: string; label: string }[];
	dependants: { id: string; label: string }[];
	manquants: { fichier: string; aide: string }[];
	avertissements: { nom: string; aide: string }[];
	secrets: { nom: string; utilise: string | null }[];
	fichierReglages: string | null;
	/** Outils du plugin, allumés ou éteints un à un (cf. `OutilState`). */
	outils: PluginOutil[];
	champs: PluginChamp[];
	/** Connexion à un service extérieur : rubrique « Connexion » (`pluginsApi.connexion`). */
	connexion: boolean;
}

/** Champ de connexion d'un plugin (cf. `ChampConnexionEtat`, src/lib/connexions.ts) : jamais la valeur d'un champ masqué. */
export interface ConnexionChamp {
	cle: string;
	label: string;
	type: string;
	aide?: string;
	clair?: boolean;
	obligatoire?: boolean;
	outil?: string;
	renseigne: boolean;
	valeur: string;
}

/** État vérifié d'une connexion (cf. `StatutConnexion`, src/plugins/connexions.ts). */
export interface ConnexionStatut {
	outil?: string;
	titre: string;
	niveau: 'ok' | 'attention' | 'erreur' | 'inconnu';
	message: string;
	verifieLe?: string;
	echeance?: string;
	lien?: string;
}

export interface ConnexionEtat {
	champs: ConnexionChamp[];
	fichier: string;
	statut: ConnexionStatut[];
}

/** Rappel de la barre d'admin (connexion à renouveler…) : cf. src/pages/api/admin/rappels.ts. */
export interface RappelAdmin {
	plugin: string;
	label: string;
	titre: string;
	niveau: 'attention' | 'erreur';
	message: string;
	echeance?: string;
}

export const rappelsApi = {
	list: () => request<{ rappels: RappelAdmin[] }>('GET', '/api/admin/rappels'),
};

/** Outil d'un plugin (interrupteur de sa page de configuration). */
export interface PluginOutil {
	id: string;
	label: string;
	description: string;
	icon: string;
	actif: boolean;
	enLigne: boolean;
}

/** Réglage d'un plugin (cf. `ChampState`, src/lib/plugin-writer.ts) : `valeur` du fichier, `repli` si vide. */
export interface PluginChamp {
	cle: string;
	label: string;
	groupe: string;
	type: TypeChamp;
	aide?: string;
	env?: string;
	valeur: string;
	repli: string;
	source: 'env' | 'defaut' | 'aucune';
}

export const pluginsApi = {
	list: () =>
		request<{ plugins: PluginItem[]; status: PublishStatus; availability: { ok: boolean; reason?: string } }>('GET', '/api/admin/plugins'),
	update: (id: string, actif: boolean, valeurs: Record<string, string>, options?: SaveOptions, outils?: Record<string, boolean>) =>
		request<SaveResult>('PUT', saveUrl('/api/admin/plugins', options), { id, actif, valeurs, outils }),
	/** Connexion (sans reconstruction) : état, enregistrement (`null` = effacer), nouvelle vérification. */
	connexion: (id: string) => request<ConnexionEtat>('GET', `/api/admin/plugins/connexion?id=${encodeURIComponent(id)}`),
	enregistrerConnexion: (id: string, valeurs: Record<string, string | null>) =>
		request<ConnexionEtat>('PUT', '/api/admin/plugins/connexion', { id, valeurs }),
	verifierConnexion: (id: string) => request<ConnexionEtat>('POST', '/api/admin/plugins/connexion', { id }),
};

/** Compte e-mail du site (module « Site », bureau) : cf. src/pages/api/admin/email.ts. */
export const emailApi = {
	charger: () => request<ConnexionEtat>('GET', '/api/admin/email'),
	enregistrer: (valeurs: Record<string, string | null>) => request<ConnexionEtat>('PUT', '/api/admin/email', { valeurs }),
	verifier: () => request<ConnexionEtat>('POST', '/api/admin/email', { action: 'verifier' }),
	tester: (a: string) => request<{ ok: true }>('POST', '/api/admin/email', { action: 'test', a }),
};

/** Extensions installées (module « Extensions », super admin) : cf. src/pages/api/admin/extensions.ts. */
export const extensionsApi = {
	list: () =>
		request<{
			extensions: PluginItem[];
			invalides: { id: string; erreurs: string[] }[];
			versionCms: string;
			status: PublishStatus;
			availability: { ok: boolean; reason?: string };
		}>('GET', '/api/admin/extensions'),
	update: (id: string, actif: boolean, valeurs: Record<string, string>, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl('/api/admin/extensions', options), { id, actif, valeurs }),
	/** Corps = l'archive .zip telle quelle ; le site est reconstruit. */
	install: async (file: File): Promise<SaveResult> => {
		const res = await fetch('/api/admin/extensions', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
		const data = await res.json().catch(() => null);
		if (!res.ok) {
			const fallback = res.status === 413 ? 'Archive trop volumineuse pour le serveur (erreur 413) : installez-la en ligne de commande (npm run extension -- install).' : `Erreur ${res.status}`;
			throw new ApiError((data && data.error) || fallback, res.status);
		}
		return data as SaveResult;
	},
	remove: (id: string) => request<SaveResult>('DELETE', `/api/admin/extensions?id=${encodeURIComponent(id)}`),
	/** Dernières versions publiées (GitHub) des extensions qui déclarent leur dépôt. */
	misesAJour: (rafraichir = false) =>
		request<{ misesAJour: MiseAJourExtension[] }>('GET', `/api/admin/extensions/mises-a-jour${rafraichir ? '?rafraichir=1' : ''}`),
	/** Télécharge et installe la dernière version ; le site est reconstruit. */
	mettreAJour: (id: string) => request<SaveResult>('POST', '/api/admin/extensions/mises-a-jour', { id }),
};

export interface MiseAJourExtension {
	id: string;
	installee: string;
	derniere: string | null;
	url: string | null;
	disponible: boolean;
	cms: string | null;
	compatible: boolean;
	archive: boolean;
}

export const associationApi = {
	get: () =>
		request<{ association: Association; status: PublishStatus; availability: { ok: boolean; reason?: string } }>(
			'GET',
			'/api/admin/association',
		),
	update: (association: Association, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl('/api/admin/association', options), { association }),
};

export interface BrandImage {
	file: string;
	preview: string;
}

export interface BrandFonts {
	titres: string;
	texte: string;
	deposees: { nom: string; fichiers: { graisse: FontWeight; fichier: string; preview: string | null }[] }[];
}

export interface BrandSource {
	colors: ThemeColors;
	defaults: ThemeColors;
	/** Mode sombre : couleurs de marque présentes seulement si réglées (absentes = automatiques). */
	sombre: ReglageSombre;
	/** Pied de page : couleurs effectives (src/lib/pied.ts). */
	pied: PiedResolu;
	/** Couleurs du mode sombre du pied réglées à part (sinon : palette sombre). */
	piedSombreRegle: { fond: boolean; texte: boolean };
	/** Bouton d'action de l'en-tête, son réglage d'origine, pages de plugin inactives (bouton masqué si son lien y mène). */
	cta: LinkToggle;
	ctaDefaults: LinkToggle;
	pagesIndisponibles: string[];
	logo: BrandImage | null;
	logoSombre: BrandImage | null;
	favicons: BrandImage[];
	fonts: BrandFonts;
	fontDefaults: Record<FontRole, string>;
	catalogue: { id: string; label: string; family: string; weight: string; url: string }[];
}

/** Polices envoyées : rôles, polices déposées à ajouter (fichiers en base64) et à retirer. */
export interface BrandFontsInput {
	titres: string;
	texte: string;
	ajouts: { nom: string; fichiers: { graisse: FontWeight; data: string }[] }[];
	retraits: string[];
}

export const brandApi = {
	get: () =>
		request<{ source: BrandSource; status: PublishStatus; availability: { ok: boolean; reason?: string } }>('GET', '/api/admin/charte'),
	update: (
		input: {
			colors: ThemeColors;
			sombre: ReglageSombre;
			pied: ReglagePied;
			cta: LinkToggle;
			fonts: BrandFontsInput;
			logo?: { type: string; data: string };
			logoSombre?: { type: string; data: string };
			retirerLogoSombre?: boolean;
			favicon?: { type: string; data: string };
		},
		options?: SaveOptions,
	) => request<SaveResult>('PUT', saveUrl('/api/admin/charte', options), input),
};

export const activitiesApi = {
	list: () =>
		request<{
			activities: ActivityItem[];
			categories: ActivityCategory[];
			status: PublishStatus;
			availability: { ok: boolean; reason?: string };
		}>('GET', '/api/admin/activites'),
	get: (slug: string) => request<ActivitySourceView>('GET', `/api/admin/activites/${slug}`),
	create: (activity: ActivityInput, cover: { type: string; data: string } | null, options?: SaveOptions) =>
		request<SaveResult>('POST', saveUrl('/api/admin/activites', options), { activity, cover: cover ?? undefined }),
	update: (slug: string, activity: ActivityInput, cover: CoverUpdate, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl(`/api/admin/activites/${slug}`, options), { activity, cover }),
	remove: (slug: string, options?: SaveOptions) =>
		request<SaveResult>('DELETE', saveUrl(`/api/admin/activites/${slug}`, options), { confirm: slug }),
	/** Onglet « Partage » : actualité créée depuis la fiche enregistrée. */
	createNews: (slug: string, options?: SaveOptions) =>
		request<SaveResult>('POST', saveUrl(`/api/admin/activites/${slug}/actualite`, options)),
	/** Nouvel ordre des fiches (par catégorie) et/ou des catégories, en une publication. */
	saveOrder: (levels: Record<string, string[]>, categories: string[] | null, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl('/api/admin/activites/ordre', options), { levels, categories: categories ?? undefined }),
};

export const activityCategoriesApi = {
	create: (category: ActivityCategory, options?: SaveOptions) =>
		request<SaveResult>('POST', saveUrl('/api/admin/activites/categories', options), { category }),
	update: (slug: string, category: ActivityCategory, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl(`/api/admin/activites/categories/${slug}`, options), { category }),
	remove: (slug: string, options?: SaveOptions) =>
		request<SaveResult>('DELETE', saveUrl(`/api/admin/activites/categories/${slug}`, options), { confirm: slug }),
};

/** Annonce de la bannière, telle qu'écrite dans `src/content/annonces.yaml` (cf. src/lib/annonce-schema.ts). */
export interface AnnonceItem {
	id: string;
	title: string;
	message: string;
	startDate: string;
	endDate: string;
	tone: 'info' | 'accent' | 'urgent';
	icon: string;
	ctaLabel?: string;
	ctaHref?: string;
	active: boolean;
}
export type AnnonceInput = Omit<AnnonceItem, 'id' | 'ctaLabel' | 'ctaHref'> & { ctaLabel: string; ctaHref: string };

export const annoncesApi = {
	list: () =>
		request<{ annonces: AnnonceItem[]; status: PublishStatus; availability: { ok: boolean; reason?: string } }>('GET', '/api/admin/annonces'),
	create: (annonce: AnnonceInput, options?: SaveOptions) => request<SaveResult>('POST', saveUrl('/api/admin/annonces', options), { annonce }),
	update: (id: string, annonce: AnnonceInput, options?: SaveOptions) =>
		request<SaveResult>('PUT', saveUrl(`/api/admin/annonces/${id}`, options), { annonce }),
	remove: (id: string, options?: SaveOptions) => request<SaveResult>('DELETE', saveUrl(`/api/admin/annonces/${id}`, options), { confirm: id }),
	saveOrder: (order: string[], options?: SaveOptions) => request<SaveResult>('PUT', saveUrl('/api/admin/annonces/ordre', options), { order }),
};

/** Archive de sauvegarde (`<DATA_DIR>/sauvegardes/`, cf. scripts/sauvegarde.mjs). */
export interface SauvegardeItem {
	nom: string;
	taille: number;
	date: string;
	association: string | null;
	modele: string | null;
	motif: string;
	par: string;
	/** `false` = fichier ZIP qui n'est pas une sauvegarde du site. */
	valide: boolean;
}

export const sauvegardesApi = {
	list: () => request<{ sauvegardes: SauvegardeItem[]; restauration: string | null }>('GET', '/api/admin/sauvegardes'),
	create: (motif: string) => request<{ ok: true; nom: string }>('POST', '/api/admin/sauvegardes', { motif }),
	remove: (nom: string) => request<{ ok: true }>('DELETE', `/api/admin/sauvegardes/${nom}`, { confirm: nom }),
	/** `maintenance` : site en maintenance pendant la reconstruction (production) → aller sur la page de progression. */
	restore: (nom: string) =>
		request<SaveResult & { maintenance: boolean; securite: string | null; securiteExistante: string | null; demo: boolean }>(
			'POST',
			'/api/admin/sauvegardes/restauration',
			{ nom, confirm: nom },
		),
	/** Corps = le fichier ZIP tel quel (pas de JSON). */
	upload: async (file: File) => {
		const res = await fetch('/api/admin/sauvegardes/depot', {
			method: 'POST',
			headers: { 'Content-Type': 'application/zip', 'X-Nom-Fichier': encodeURIComponent(file.name) },
			body: file,
		});
		const data = await res.json().catch(() => null);
		if (!res.ok) {
			const fallback = res.status === 413 ? "Archive trop volumineuse pour le serveur (erreur 413) : relever la limite (nginx : client_max_body_size) ou la restaurer en ligne de commande (./restauration.sh)." : `Erreur ${res.status}`;
			throw new ApiError((data && data.error) || fallback, res.status);
		}
		return data as { ok: true; nom: string };
	},
};

/** Assistant d'installation (super admin, premier déploiement) : cf. src/lib/installation.ts. */
export interface InstallationSecret {
	nom: string;
	label: string;
	type: 'url' | 'identifiant' | 'cle';
	aide?: string;
	obligatoire?: boolean;
	/** Déjà défini par le .env : ni demandé ni écrit. */
	dejaDefini: boolean;
}
export interface InstallationPlugin {
	id: string;
	label: string;
	description: string;
	icon: string;
	/** Types de structure à qui il est proposé (vide = tous). */
	structures: Structure[];
	requiert: string[];
	secrets: InstallationSecret[];
	champs: (PluginChamp & { obligatoire?: boolean; defaut?: string })[];
}
export interface InstallationEtat {
	requise: boolean;
	structure: Structure;
	compte: { login: string; fullname: string } | null;
	/** Identifiants déjà utilisés (ex. le super admin). */
	loginsPris: string[];
	association: { name: string; email: string; phone: string; address: { street: string; postalCode: string; city: string } };
	logo: string | null;
	plugins: InstallationPlugin[];
	exemples: number;
	dev: boolean;
}
export interface InstallationSaisie {
	structure: Structure;
	compte: { login: string; fullname: string; email: string; password: string } | null;
	association: { name: string; email: string; phone: string; street: string; postalCode: string; city: string };
	logo: { type: string; data: string } | null;
	plugins: Record<string, boolean>;
	reglages: Record<string, Record<string, string>>;
	secrets: Record<string, string>;
	exemples: boolean;
}
export const installationApi = {
	get: () => request<InstallationEtat>('GET', '/api/admin/installation'),
	requise: () => request<{ requise: boolean }>('GET', '/api/admin/installation?requise'),
	installer: (saisie: InstallationSaisie) =>
		request<{ ok: true; maintenance: boolean; compte: string | null }>('POST', '/api/admin/installation', saisie),
};

/** Mode maintenance (module « Site »). */
export interface MaintenanceEtat {
	maintenance: {
		manuel: boolean;
		message: string;
		par: string;
		debut: string;
		motif: string;
		etape: string;
		progression: number;
	} | null;
	messageParDefaut: string;
	dev: boolean;
}
export const maintenanceApi = {
	get: () => request<MaintenanceEtat>('GET', '/api/admin/maintenance'),
	activer: (message: string) => request<MaintenanceEtat>('PUT', '/api/admin/maintenance', { actif: true, message }),
	lever: (forcer = false) => request<MaintenanceEtat>('PUT', '/api/admin/maintenance', { actif: false, forcer }),
};

/** Modifications enregistrées sans publier (lot en attente). */
export const lotApi = {
	list: () => request<{ changes: LotChange[] }>('GET', '/api/admin/publication/lot'),
	publish: () => request<{ ok: true; label: string }>('POST', '/api/admin/publication/lot'),
	cancel: () => request<{ ok: true }>('DELETE', '/api/admin/publication/lot', { confirm: true }),
};

export const versionApi = {
	get: () => request<ModelVersionInfo>('GET', '/api/admin/version'),
};

/** Mise à jour du modèle (super admin, `src/lib/mise-a-jour.ts`). */
export const miseAJourApi = {
	get: () => request<EtatMiseAJour>('GET', '/api/admin/mise-a-jour'),
	lancer: (version: string) => request<{ ok: true }>('POST', '/api/admin/mise-a-jour', { version, confirm: version }),
};

export const journalApi = {
	list: (year?: string) =>
		request<{ years: string[]; year: string; entries: JournalEntry[] }>(
			'GET',
			`/api/admin/journal${year ? `?annee=${encodeURIComponent(year)}` : ''}`,
		),
};

export const linksApi = {
	get: () => request<{ groups: SiteLinkGroup[] }>('GET', '/api/admin/liens'),
};
