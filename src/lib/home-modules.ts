/**
 * **Sections** des pages (code : « modules », historique de l'accueil) :
 * bandes pleine largeur qui enrichissent une *page* — à ne pas confondre avec
 * les **blocs** (`src/lib/blocs.ts`), qui enrichissent un *contenu* (dans son
 * texte). Un seul catalogue pour l'accueil et les pages enrichies (frontmatter
 * `sections:` d'une page `type: enrichie`) ; `contexte: 'page'` = section des
 * pages enrichies seulement (« Contenu de la page »). Rendu commun :
 * `src/components/sections/Sections.astro`.
 *
 * Page d'accueil : suite de modules (bandeau,
 * actualités, appel à l'action…) que l'association ajoute, retire, ordonne
 * et dont elle modifie le contenu depuis le module « Pages » (crayon de
 * l'Accueil). Chaque type décrit ses champs (même format que les blocs des
 * pages enrichies, `src/lib/blocs.ts`, édités par `BlocFields.vue`) avec
 * leur valeur par défaut ; le rendu est dans `src/pages/index.astro`.
 *
 * Enregistrement : `pages.accueil.modules` de `src/content/pages/_pages-site.md`
 * (liste complète, valeurs explicites ; un champ facultatif vide masque
 * l'élément, ex. second bouton). Absent = `DEFAULT_HOME`.
 *
 * Ajouter un type = une entrée dans `HOME_MODULES` + sa branche dans
 * `src/pages/index.astro`. Types apportés par un plugin : définis dans
 * `src/plugins/<id>/sections/definitions.ts` (champ `plugin`) ; par une
 * extension : son `definitions.ts` (champ `extension`, composant fourni par
 * son `site.ts`, cf. `src/lib/extensions.ts`).
 *
 * Module sans dépendance à Astro ni à Node : aussi utilisé par l'îlot Vue.
 */

import { checkBlocField, elementsVides, photosDesChamps, validerElements, type BlocField, type ElementsDef } from './blocs.ts';
import { disponible, type PluginId } from '../plugins/index.ts';
import { DEFINITIONS_EXTENSIONS } from './extensions.ts';
import { OPTIONS_FOND, type FondSection } from './section-fonds.ts';

export interface HomeField extends BlocField {
	default: string;
}

export interface HomeModuleDef {
	label: string;
	description: string;
	/** Icône Font Awesome (solid). */
	icon: string;
	/** Peut figurer plusieurs fois sur la page. */
	multiple?: boolean;
	/** Apporté par un plugin : absent de l'éditeur et du rendu si celui-ci est inactif. */
	plugin?: PluginId;
	/** Apporté par une extension (posé par `src/lib/extensions.ts`) : de même. */
	extension?: string;
	/** `page` : section des pages enrichies seulement (pas de l'accueil). */
	contexte?: 'page';
	fields: HomeField[];
	/** Éléments répétés (formules, personnes, logos…), comme ceux des blocs. */
	items?: ElementsDef;
}

/** Élément répété d'une section (valeur de chaque champ). */
export type ElementSection = Record<string, string>;

/** Module (section) tel qu'il est enregistré : son type, la valeur de chaque champ, ses éléments éventuels. */
export interface HomeModule {
	type: HomeModuleType;
	items?: ElementSection[];
	[field: string]: string | ElementSection[] | undefined;
}

/** Valeur texte d'un champ d'une section (`''` si absente). */
export function champ(module: HomeModule, name: string): string {
	const value = module[name];
	return typeof value === 'string' ? value : '';
}

/** Photos citées par une section (champs `photo` de ses éléments). */
export function sectionPhotos(module: HomeModule): string[] {
	const def = HOME_MODULES[module.type];
	return def ? photosDesChamps(def, module) : [];
}

const LIEN_HELP = 'Adresse du site (/adherer) ou externe (https://…).';

/** Champ « Couleur du fond » d'une section (teintes de la charte, `src/lib/section-fonds.ts`). */
function champFond(defaut: FondSection): HomeField {
	return {
		name: 'fond',
		label: 'Couleur du fond',
		type: 'select',
		default: defaut,
		help: 'Teintes de la charte graphique : elles suivent ses couleurs et le mode sombre.',
		// Le défaut en premier : valeur d'un champ vide (cf. `checkBlocField`).
		options: [...OPTIONS_FOND.filter((o) => o.value === defaut), ...OPTIONS_FOND.filter((o) => o.value !== defaut)],
	};
}

const MODULES_DU_CMS = {
	bandeau: {
		label: 'Bandeau',
		description: "Photo d'accueil avec grand titre, accroche et deux boutons.",
		icon: 'fa-image',
		fields: [
			{ name: 'titre', label: 'Titre', type: 'text', required: true, default: 'Le numérique, ensemble et pour toutes et tous' },
			{ name: 'mot', label: 'Mot mis en couleur', type: 'text', default: 'ensemble', help: 'Doit figurer tel quel dans le titre ; vide = aucun.' },
			{
				name: 'accroche',
				label: 'Accroche',
				type: 'textarea',
				help: 'Mots clés en gras : **mot** ; italique : *mot*.',
				default:
					"{{association.nom}} accompagne les habitant·e·s, les associations et les écoles dans la découverte et l'appropriation des outils numériques.",
			},
			{ name: 'bouton1-texte', label: 'Bouton principal', type: 'text', default: 'Découvrir nos activités', help: 'Vide = pas de bouton.' },
			{ name: 'bouton1-lien', label: 'Lien du bouton principal', type: 'url', default: '/activites', help: LIEN_HELP },
			{ name: 'bouton2-texte', label: 'Second bouton', type: 'text', default: 'Nous rejoindre', help: 'Vide = pas de bouton.' },
			{ name: 'bouton2-lien', label: 'Lien du second bouton', type: 'url', default: '/adherer', help: LIEN_HELP },
			{
				name: 'voile',
				label: 'Voile sur la photo',
				type: 'select',
				default: 'black',
				options: [
					{ value: 'black', label: 'Sombre (texte blanc)' },
					{ value: 'white', label: 'Clair (texte foncé)' },
					{ value: 'none', label: 'Aucun' },
				],
			},
		],
	},
	presentation: {
		label: 'Présentation',
		description: 'Surtitre, grand titre, accroche et deux boutons, avec une illustration à droite, sur un fond de couleur au choix.',
		icon: 'fa-table-columns',
		fields: [
			{ name: 'surtitre', label: 'Surtitre', type: 'text', default: '', help: 'Petite ligne en capitales au-dessus du titre (ex. « Logiciels libres · Numérique éthique »). Vide = aucune.' },
			{ name: 'titre', label: 'Titre', type: 'text', required: true, default: '{{association.nom}}' },
			{
				name: 'accroche',
				label: 'Accroche',
				type: 'textarea',
				help: 'Mots clés en gras : **mot** ; italique : *mot*.',
				default: '',
			},
			{ name: 'bouton1-texte', label: 'Bouton principal', type: 'text', default: 'Nous contacter', help: 'Vide = pas de bouton.' },
			{ name: 'bouton1-lien', label: 'Lien du bouton principal', type: 'url', default: '/contact', help: LIEN_HELP },
			{ name: 'bouton2-texte', label: 'Second bouton', type: 'text', default: '', help: 'Vide = pas de bouton.' },
			{ name: 'bouton2-lien', label: 'Lien du second bouton', type: 'url', default: '', help: LIEN_HELP },
			{
				name: 'illustration',
				label: 'Illustration à droite',
				type: 'select',
				default: 'logo',
				options: [
					{ value: 'logo', label: 'Logo du site' },
					{ value: 'image', label: 'Illustration propre au module' },
					{ value: 'photo', label: "Photo d'accueil (fond du bandeau)" },
					{ value: 'aucune', label: 'Aucune (texte seul)' },
				],
			},
			champFond('gris'),
		],
	},
	actualites: {
		label: 'Dernières actualités',
		description: 'Les dernières actualités publiées, en cartes.',
		icon: 'fa-newspaper',
		fields: [
			{ name: 'surtitre', label: 'Surtitre', type: 'text', default: 'Actualités' },
			{ name: 'titre', label: 'Titre', type: 'text', required: true, default: "Les dernières actus de l'association" },
			{ name: 'lien-texte', label: 'Lien vers la page Actualités', type: 'text', default: 'Voir toutes les actualités', help: 'Vide = pas de lien.' },
			{
				name: 'nombre',
				label: "Nombre d'actualités",
				type: 'select',
				default: '3',
				options: [
					{ value: '3', label: '3 (une ligne)' },
					{ value: '6', label: '6 (deux lignes)' },
				],
			},
		],
	},
	activites: {
		label: 'Activités',
		description: "Les catégories d'activités, en cartes.",
		icon: 'fa-shapes',
		fields: [
			{ name: 'titre', label: 'Titre', type: 'text', required: true, default: 'Nos activités' },
			{ name: 'lien-texte', label: 'Lien vers la page Activités', type: 'text', default: 'Accéder à la page', help: 'Vide = pas de lien.' },
		],
	},
	appel: {
		label: "Appel à l'action",
		description: 'Bandeau coloré avec un titre, un texte et un bouton (ex. « Envie de nous rejoindre ? »).',
		icon: 'fa-bullhorn',
		multiple: true,
		fields: [
			{ name: 'titre', label: 'Titre', type: 'text', required: true, default: 'Envie de nous rejoindre ?' },
			{
				name: 'texte',
				label: 'Texte',
				type: 'textarea',
				default: 'Bénévoles, adhérent·e·s ou partenaires : chacun·e a sa place chez {{association.nom}}.',
			},
			{ name: 'bouton-texte', label: 'Bouton', type: 'text', default: "Adhérer à l'association", help: 'Vide = pas de bouton.' },
			{ name: 'bouton-lien', label: 'Lien du bouton', type: 'url', default: '/adherer', help: LIEN_HELP },
		],
	},
	partenaires: {
		label: 'Partenaires',
		description: "Les partenaires de l'association, en cartes.",
		icon: 'fa-handshake',
		fields: [
			{ name: 'titre', label: 'Titre', type: 'text', required: true, default: "Les partenaires de l'association" },
			{
				name: 'texte',
				label: 'Texte',
				type: 'textarea',
				default: "{{association.nom}} agit aux côtés d'institutions et de réseaux qui soutiennent la médiation et l'inclusion numériques.",
			},
		],
	},
	contenu: {
		label: 'Contenu de la page',
		description: 'Le texte de la page et ses blocs (photos, vidéo, cartes…), saisis dans l’onglet « Contenu ».',
		icon: 'fa-file-lines',
		contexte: 'page',
		fields: [],
	},
	tarifs: {
		label: 'Grille de tarifs',
		description: 'Formules ou offres côte à côte : prix, détails, bouton, une formule mise en avant.',
		icon: 'fa-tags',
		multiple: true,
		fields: [
			{ name: 'surtitre', label: 'Surtitre', type: 'text', default: '' },
			{ name: 'titre', label: 'Titre', type: 'text', default: 'Nos tarifs' },
			{ name: 'texte', label: 'Texte d’introduction', type: 'textarea', default: '' },
			{ name: 'note', label: 'Mention sous la grille', type: 'text', default: '', help: 'Ex. « Tarifs TTC, adhésion comprise. »' },
			champFond('gris'),
		],
		items: {
			label: 'Formule',
			min: 1,
			max: 6,
			fields: [
				{ name: 'titre', label: 'Nom de la formule', type: 'text', required: true },
				{ name: 'prix', label: 'Prix', type: 'text', required: true, help: 'Ex. « 25 € », « Gratuit », « Sur devis »' },
				{ name: 'periode', label: 'Période', type: 'text', help: 'Ex. « / an », « / séance »' },
				{ name: 'description', label: 'Phrase de présentation', type: 'text' },
				{ name: 'details', label: 'Ce qui est compris', type: 'markdown', help: 'Une ligne « - » par point : affichée en liste cochée.' },
				{ name: 'bouton', label: 'Texte du bouton', type: 'text', help: 'Ex. « Je m’inscris » ; sans lien, pas de bouton.' },
				{ name: 'lien', label: 'Lien du bouton', type: 'url', help: LIEN_HELP },
				{ name: 'avant', label: 'Mettre cette formule en avant', type: 'interrupteur', defaut: false },
				{ name: 'mention', label: 'Pastille de la formule mise en avant', type: 'text', si: 'avant', help: 'Ex. « La plus choisie »' },
			],
		},
	},
	equipe: {
		label: "L'équipe",
		description: 'Les membres de l’équipe : photo, nom, rôle et quelques mots.',
		icon: 'fa-people-group',
		multiple: true,
		fields: [
			{ name: 'surtitre', label: 'Surtitre', type: 'text', default: '' },
			{ name: 'titre', label: 'Titre', type: 'text', default: "L'équipe" },
			{ name: 'texte', label: 'Texte d’introduction', type: 'textarea', default: '' },
			{
				name: 'colonnes',
				label: 'Personnes par ligne (écran large)',
				type: 'select',
				default: '3',
				options: [
					{ value: '3', label: '3 par ligne' },
					{ value: '4', label: '4 par ligne' },
					{ value: '2', label: '2 par ligne' },
				],
			},
			champFond('fond'),
		],
		items: {
			label: 'Personne',
			min: 1,
			max: 30,
			liste: true,
			fields: [
				{ name: 'photo', label: 'Photo', type: 'photo', help: 'Facultative : sans photo, les initiales s’affichent.' },
				{ name: 'nom', label: 'Nom', type: 'text', required: true },
				{ name: 'role', label: 'Rôle', type: 'text', help: 'Ex. « Présidente », « Animateur numérique »' },
				{ name: 'texte', label: 'Quelques mots', type: 'markdown' },
				{ name: 'lien', label: 'Lien', type: 'url', help: 'Facultatif : adresse e-mail (mailto:…), site ou réseau social.' },
			],
		},
	},
	defilement: {
		label: 'Bandeau défilant',
		description: 'Logos ou illustrations qui défilent en continu : partenaires, soutiens, logiciels, marques…',
		icon: 'fa-arrows-left-right',
		multiple: true,
		fields: [
			{ name: 'surtitre', label: 'Surtitre', type: 'text', default: '' },
			{ name: 'titre', label: 'Titre', type: 'text', default: 'Ils nous soutiennent', help: 'Vide = aucun.' },
			{ name: 'texte', label: 'Texte d’introduction', type: 'textarea', default: '' },
			{
				name: 'vitesse',
				label: 'Vitesse',
				type: 'select',
				default: 'normale',
				options: [
					{ value: 'normale', label: 'Normale' },
					{ value: 'lente', label: 'Lente' },
					{ value: 'rapide', label: 'Rapide' },
				],
			},
			{ name: 'gris', label: 'Logos en gris (couleur au survol)', type: 'interrupteur', defaut: false, default: 'non' },
			champFond('fond'),
		],
		items: {
			label: 'Logo',
			min: 2,
			max: 30,
			fields: [
				{ name: 'photo', label: 'Logo ou illustration', type: 'photo', required: true, svg: true, help: 'SVG ou PNG transparent conseillés.' },
				{ name: 'nom', label: 'Nom', type: 'text', required: true, help: 'Lu par les personnes malvoyantes ; affiché au survol.' },
				{ name: 'lien', label: 'Lien', type: 'url', help: 'Facultatif : site du partenaire, du logiciel…' },
			],
		},
	},
	texte: {
		label: 'Texte libre',
		description: 'Un titre et un texte mis en forme (paragraphes, listes, liens).',
		icon: 'fa-align-left',
		multiple: true,
		fields: [
			{ name: 'titre', label: 'Titre', type: 'text', default: '' },
			{
				name: 'texte',
				label: 'Texte',
				type: 'markdown',
				required: true,
				default: '',
				help: '**gras**, *italique*, [liens](/contact), listes « - ».',
			},
		],
	},
} satisfies Record<string, HomeModuleDef>;

/** Modules de l'accueil : ceux du CMS, puis ceux des extensions installées (ajoutés après le module « Activités »). */
export const HOME_MODULES: Record<string, HomeModuleDef> = (() => {
	const entrees = Object.entries(MODULES_DU_CMS) as [string, HomeModuleDef][];
	const i = entrees.findIndex(([type]) => type === 'activites');
	entrees.splice(i, 0, ...Object.entries(DEFINITIONS_EXTENSIONS.accueil).filter(([type]) => !Object.hasOwn(MODULES_DU_CMS, type)));
	return Object.fromEntries(entrees);
})();

export type HomeModuleType = keyof typeof MODULES_DU_CMS | (string & {});

export function isHomeModuleType(value: unknown): value is HomeModuleType {
	return typeof value === 'string' && Object.hasOwn(HOME_MODULES, value);
}

export function homeModuleDef(type: HomeModuleType): HomeModuleDef {
	return HOME_MODULES[type];
}

/** Nouveau module, avec les valeurs par défaut de son type (éléments : le minimum, vides). */
export function newHomeModule(type: HomeModuleType): HomeModule {
	const def = homeModuleDef(type);
	const module: HomeModule = { type };
	for (const f of def.fields) module[f.name] = f.default;
	if (def.items) module.items = elementsVides(def.items);
	return module;
}

/** Section proposée là où l'on compose (accueil ou page enrichie). */
export function sectionPossible(def: HomeModuleDef, contexte: 'accueil' | 'page'): boolean {
	return !def.contexte || def.contexte === contexte;
}

/** Sections d'une nouvelle page enrichie : son contenu. */
export const SECTIONS_NOUVELLE_PAGE: HomeModule[] = [{ type: 'contenu' }];

/** Accueil d'origine (sans réglage enregistré) ; module d'un plugin inactif omis. */
export const DEFAULT_HOME: HomeModule[] = ['bandeau', 'actualites', ...Object.keys(DEFINITIONS_EXTENSIONS.accueil), 'activites', 'appel']
	.filter((type) => isHomeModuleType(type) && disponible(homeModuleDef(type)))
	.map(newHomeModule);

/**
 * Vérifie un module enregistré et le normalise : champs connus seulement,
 * champ absent = valeur par défaut (type enrichi depuis), champ facultatif
 * vide gardé vide. Liens vérifiés (`isSafeUrl`) ; le contrôle des variables et
 * des liens Markdown est fait à l'écriture (`page-writer.ts`).
 */
/**
 * `typesInconnus` : liste des types inconnus rencontrés, ignorés sans erreur
 * (lecture du contenu au build : module d'une extension retirée ou pas
 * encore installée). Sans elle (enregistrement), un type inconnu est refusé.
 */
export interface ValidationOptions {
	typesInconnus?: string[];
	/** Où sont les sections : accueil (défaut) ou page enrichie. */
	contexte?: 'accueil' | 'page';
	/** Lecture dans le navigateur : photo vide ou `nouvelle:<clé>` admise (cf. `checkBlocField`). */
	photosEnAttente?: boolean;
}

export function validateHomeModule(raw: unknown, position: number, options: ValidationOptions = {}): { module?: HomeModule; errors: string[] } {
	const where = options.contexte === 'page' ? `Section ${position}` : `Accueil, module ${position}`;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: [`${where} : description invalide.`] };
	const data = { ...(raw as Record<string, unknown>) };
	// Type renommé depuis (contenu enregistré avec l'ancien nom).
	if (typeof data.type === 'string' && Object.hasOwn(DEFINITIONS_EXTENSIONS.typesRenommes, data.type)) data.type = DEFINITIONS_EXTENSIONS.typesRenommes[data.type];
	if (!isHomeModuleType(data.type)) {
		if (options.typesInconnus && typeof data.type === 'string') {
			options.typesInconnus.push(data.type);
			return { errors: [] };
		}
		return { errors: [`${where} : type inconnu « ${String(data.type)} » (connus : ${Object.keys(HOME_MODULES).join(', ')}).`] };
	}
	const def = homeModuleDef(data.type);
	const errors: string[] = [];
	const module: HomeModule = { type: data.type };
	for (const field of def.fields) {
		const rawValue = data[field.name];
		if (rawValue === undefined || rawValue === null) {
			module[field.name] = field.default;
			continue;
		}
		if (rawValue === '' && !field.required && field.type !== 'select') {
			module[field.name] = '';
			continue;
		}
		const value = checkBlocField(field, rawValue, `${where} (${def.label})`, errors, options);
		module[field.name] = value ?? '';
	}
	if (def.items) module.items = validerElements(def.items, data.items, `${where} (${def.label})`, errors, options);
	return errors.length ? { errors } : { module, errors };
}

/** Vérifie la liste des modules de l'accueil (types uniques non répétés). */
export function validateHomeModules(raw: unknown, options: ValidationOptions = {}): { modules: HomeModule[]; errors: string[] } {
	const ou = options.contexte === 'page' ? 'Sections' : 'Accueil';
	if (!Array.isArray(raw)) return { modules: [], errors: [`${ou} : la liste des modules est invalide.`] };
	const errors: string[] = [];
	const modules: HomeModule[] = [];
	const seen = new Set<string>();
	raw.forEach((item, i) => {
		const { module, errors: moduleErrors } = validateHomeModule(item, i + 1, options);
		errors.push(...moduleErrors);
		if (!module) return;
		const def = homeModuleDef(module.type);
		if (!sectionPossible(def, options.contexte ?? 'accueil')) errors.push(`${ou} : la section « ${def.label} » n'est possible que sur une page enrichie.`);
		if (!def.multiple && seen.has(module.type)) errors.push(`${ou} : la section « ${def.label} » ne peut figurer qu'une fois.`);
		seen.add(module.type);
		modules.push(module);
	});
	return { modules, errors };
}
