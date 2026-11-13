/**
 * Modules de la page d'accueil : la page est une suite de modules (bandeau,
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

import { checkBlocField, type BlocField } from './blocs.ts';
import { disponible, type PluginId } from '../plugins/index.ts';
import { DEFINITIONS_EXTENSIONS } from './extensions.ts';

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
	fields: HomeField[];
}

/** Module tel qu'il est enregistré : son type et la valeur de chaque champ. */
export interface HomeModule {
	type: HomeModuleType;
	[field: string]: string;
}

const LIEN_HELP = 'Adresse du site (/adherer) ou externe (https://…).';

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

/** Nouveau module, avec les valeurs par défaut de son type. */
export function newHomeModule(type: HomeModuleType): HomeModule {
	const module: HomeModule = { type };
	for (const f of homeModuleDef(type).fields) module[f.name] = f.default;
	return module;
}

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
}

export function validateHomeModule(raw: unknown, position: number, options: ValidationOptions = {}): { module?: HomeModule; errors: string[] } {
	const where = `Accueil, module ${position}`;
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
		const value = checkBlocField(field, rawValue, `${where} (${def.label})`, errors);
		module[field.name] = value ?? '';
	}
	return errors.length ? { errors } : { module, errors };
}

/** Vérifie la liste des modules de l'accueil (types uniques non répétés). */
export function validateHomeModules(raw: unknown, options: ValidationOptions = {}): { modules: HomeModule[]; errors: string[] } {
	if (!Array.isArray(raw)) return { modules: [], errors: ["Accueil : la liste des modules est invalide."] };
	const errors: string[] = [];
	const modules: HomeModule[] = [];
	const seen = new Set<string>();
	raw.forEach((item, i) => {
		const { module, errors: moduleErrors } = validateHomeModule(item, i + 1, options);
		errors.push(...moduleErrors);
		if (!module) return;
		const def = homeModuleDef(module.type);
		if (!def.multiple && seen.has(module.type)) errors.push(`Accueil : le module « ${def.label} » ne peut figurer qu'une fois.`);
		seen.add(module.type);
		modules.push(module);
	});
	return { modules, errors };
}
