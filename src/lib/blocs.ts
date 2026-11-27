/**
 * Catalogue des blocs des pages « enrichies » (collection `pages`,
 * `type: enrichie`).
 *
 * Une page enrichie déclare ses blocs dans le frontmatter et les place dans
 * le texte par un marqueur seul sur sa ligne :
 *
 *   ---
 *   type: enrichie
 *   blocs:
 *     cartes-1:
 *       type: cartes
 *       items:
 *         - { icone: cloud, titre: "Stockage", texte: "100 Go **hébergés en Europe**" }
 *   ---
 *   Texte…
 *
 *   [[bloc:cartes-1]]
 *
 * Aucun code n'est saisi : chaque type a des champs décrits ici (formulaire
 * du module « Pages », validation au build par `src/content.config.ts` et
 * avant écriture par `src/lib/page-writer.ts`) et un composant Astro
 * (`src/components/blocs/BlocView.astro`). Ajouter un type de bloc = une
 * entrée dans `BLOC_TYPES` + son composant dans `BlocView.astro`. Types
 * apportés par un plugin : `src/plugins/<id>/sections/definitions.ts`
 * (champ `plugin`) ; par une extension : son `definitions.ts` (champ
 * `extension`, composant fourni par son `site.ts`).
 *
 * Module sans dépendance à Astro ni à Node : aussi utilisé par l'îlot Vue.
 */

import { isSafeUrl } from './safe-url.ts';
import type { PluginId } from '../plugins/catalogue.ts';
import { DEFINITIONS_EXTENSIONS } from './extensions.ts';

/**
 * `photo` : fichier du dossier de la page (`./photo_<n>.jpg`, cf.
 * `src/lib/bloc-images.ts`) ; `video` : lien YouTube, Vimeo ou PeerTube
 * (`videoEmbed`) ; `interrupteur` : `oui` / `non` (défaut : `defaut`).
 */
export type BlocFieldType = 'text' | 'textarea' | 'markdown' | 'url' | 'icon' | 'select' | 'photo' | 'video' | 'interrupteur';

export interface BlocField {
	name: string;
	label: string;
	type: BlocFieldType;
	required?: boolean;
	/** Choix d'un champ `select` (le premier est la valeur par défaut). */
	options?: { value: string; label: string }[];
	/** Valeur par défaut d'un champ `interrupteur`. */
	defaut?: boolean;
	/** Champ affiché seulement si un autre champ (interrupteur) vaut `oui`. */
	si?: string;
	/** Champ `photo` : SVG accepté en plus (logos ; contenus actifs refusés, cf. `svgProblem()`). */
	svg?: boolean;
	help?: string;
}

/** Photo d'un bloc : fichier du dossier de la page, écrit par `page-writer.ts`. */
export const BLOC_PHOTO = /^\.\/photo_\d{1,4}\.(?:jpg|jpeg|png|webp|svg)$/;

/** Photo choisie dans le formulaire, pas encore envoyée (`nouvelle:<clé>`), remplacée par le serveur. */
export const BLOC_PHOTO_NOUVELLE = /^nouvelle:[a-z0-9]{1,40}$/;

/** Hôtes PeerTube acceptés (mêmes que les iframes des actualités, `IFRAME_HOSTS`). */
const PEERTUBE = ['framatube.org', 'peertube.fr'];

/**
 * Adresse d'intégration d'une vidéo, ou `null` si le lien n'est pas reconnu :
 * YouTube (sans cookie : youtube-nocookie.com), Vimeo, PeerTube (hôtes
 * connus). Aucun autre site n'est intégré.
 */
export function videoEmbed(lien: string): { src: string; source: 'YouTube' | 'Vimeo' | 'PeerTube' } | null {
	let url: URL;
	try {
		url = new URL(lien.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	const host = url.hostname.replace(/^(?:www|m)\./, '');
	const id = (v: string | null | undefined, re: RegExp) => (v && re.test(v) ? v : null);
	const YT = /^[\w-]{6,20}$/;
	if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
		const parts = url.pathname.split('/').filter(Boolean);
		const v =
			host === 'youtu.be'
				? id(parts[0], YT)
				: parts[0] === 'watch'
					? id(url.searchParams.get('v'), YT)
					: ['embed', 'shorts', 'live', 'v'].includes(parts[0])
						? id(parts[1], YT)
						: null;
		return v ? { src: `https://www.youtube-nocookie.com/embed/${v}`, source: 'YouTube' } : null;
	}
	if (host === 'vimeo.com' || host === 'player.vimeo.com') {
		const v = url.pathname.match(/(?:^|\/)(\d{5,12})(?:\/|$)/)?.[1];
		return v ? { src: `https://player.vimeo.com/video/${v}`, source: 'Vimeo' } : null;
	}
	if (PEERTUBE.some((h) => host === h || host.endsWith(`.${h}`))) {
		const v = url.pathname.match(/^\/(?:w|videos\/watch|videos\/embed)\/([\w-]{6,40})\/?$/)?.[1];
		return v ? { src: `https://${url.hostname}/videos/embed/${v}`, source: 'PeerTube' } : null;
	}
	return null;
}

export interface BlocTypeDef {
	label: string;
	description: string;
	/** Icône Font Awesome (solid) du type, dans le module. */
	icon: string;
	/** Apporté par un plugin : absent de l'éditeur et du rendu si celui-ci est inactif. */
	plugin?: PluginId;
	/** Apporté par une extension (posé par `src/lib/extensions.ts`) : de même. */
	extension?: string;
	fields: BlocField[];
	/** Liste d'éléments répétés (ex. cartes). */
	items?: ElementsDef;
}

/**
 * Éléments répétés d'un bloc ou d'une section (cartes, photos, formules,
 * personnes…). Éléments à champ `photo` : grille de vignettes dans le module
 * (`PhotosGrille.vue`), sauf `liste: true` (photo facultative parmi d'autres
 * champs, ex. section « L'équipe »).
 */
export interface ElementsDef {
	label: string;
	fields: BlocField[];
	min: number;
	max: number;
	liste?: boolean;
}

/** Ce qui porte des champs et, peut-être, des éléments : type de bloc ou de section. */
export interface ChampsDef {
	fields: BlocField[];
	items?: ElementsDef;
}

const STYLE_BOUTON = [
	{ value: 'primary', label: 'Plein (couleur principale)' },
	{ value: 'secondary', label: 'Plein (couleur secondaire)' },
	{ value: 'outline', label: 'Contour' },
];

const BLOCS_DU_CMS = {
	cartes: {
		label: 'Grille de cartes',
		description: 'Cartes avec icône, titre et texte, sur 2 ou 3 colonnes.',
		icon: 'fa-table-cells-large',
		fields: [
			{
				name: 'colonnes',
				label: 'Colonnes (écran large)',
				type: 'select',
				options: [
					{ value: '2', label: '2 colonnes' },
					{ value: '3', label: '3 colonnes' },
				],
			},
		],
		items: {
			label: 'Carte',
			min: 1,
			max: 12,
			fields: [
				{ name: 'icone', label: 'Icône', type: 'icon', help: 'Nom Font Awesome sans « fa- » : cloud, server, users…' },
				{ name: 'titre', label: 'Titre', type: 'text', required: true },
				{ name: 'texte', label: 'Texte', type: 'markdown', required: true, help: '**gras**, [liens](/contact) et listes « - » acceptés.' },
			],
		},
	},
	tarif: {
		label: 'Encadré tarif',
		description: 'Un libellé à gauche, un montant mis en valeur à droite.',
		icon: 'fa-euro-sign',
		fields: [
			{ name: 'libelle', label: 'Libellé', type: 'text', required: true },
			{ name: 'montant', label: 'Montant', type: 'text', required: true, help: 'Ex. « 110 € / an »' },
		],
	},
	bouton: {
		label: 'Bouton',
		description: 'Un bouton-lien vers une page du site ou une adresse externe.',
		icon: 'fa-hand-pointer',
		fields: [
			{ name: 'texte', label: 'Texte du bouton', type: 'text', required: true },
			{ name: 'lien', label: 'Lien', type: 'url', required: true, help: 'Ex. /contact ou https://…' },
			{ name: 'style', label: 'Style', type: 'select', options: STYLE_BOUTON },
		],
	},
	photos: {
		label: 'Photos',
		description: 'Une ou plusieurs photos, en grille, avec légende facultative.',
		icon: 'fa-images',
		fields: [
			{
				name: 'colonnes',
				label: 'Disposition (écran large)',
				type: 'select',
				options: [
					{ value: 'auto', label: 'Automatique (selon le nombre de photos)' },
					{ value: '1', label: 'Une photo par ligne' },
					{ value: '2', label: '2 colonnes' },
					{ value: '3', label: '3 colonnes' },
				],
			},
		],
		items: {
			label: 'Photo',
			min: 1,
			max: 12,
			fields: [
				{ name: 'photo', label: 'Photo', type: 'photo', required: true },
				{ name: 'alt', label: 'Description de la photo', type: 'text', required: true, help: 'Lue par les personnes malvoyantes : ce que montre la photo.' },
				{ name: 'legende', label: 'Légende', type: 'text' },
			],
		},
	},
	video: {
		label: 'Vidéo',
		description: 'Une vidéo YouTube, Vimeo ou PeerTube, intégrée à la page.',
		icon: 'fa-circle-play',
		fields: [
			{
				name: 'lien',
				label: 'Lien de la vidéo',
				type: 'video',
				required: true,
				help: 'Adresse de la vidéo copiée depuis YouTube, Vimeo ou PeerTube (Framatube, peertube.fr).',
			},
			{ name: 'titre', label: 'Titre de la vidéo', type: 'text', required: true, help: 'Lu par les personnes malvoyantes ; aussi affiché sous la vidéo.' },
			{ name: 'legende', label: 'Légende', type: 'text' },
		],
	},
	carrousel: {
		label: 'Carrousel',
		description: 'Plusieurs photos qui défilent une à une.',
		icon: 'fa-panorama',
		fields: [
			{ name: 'fleches', label: 'Flèches de navigation', type: 'interrupteur', defaut: true },
			{ name: 'points', label: 'Points de navigation (une pastille par photo)', type: 'interrupteur', defaut: true },
			{ name: 'auto', label: 'Défilement automatique', type: 'interrupteur', defaut: false },
			{
				name: 'delai',
				label: 'Durée de chaque photo',
				type: 'select',
				si: 'auto',
				options: [
					{ value: '5', label: '5 secondes' },
					{ value: '3', label: '3 secondes' },
					{ value: '8', label: '8 secondes' },
					{ value: '12', label: '12 secondes' },
				],
			},
		],
		items: {
			label: 'Photo',
			min: 2,
			max: 20,
			fields: [
				{ name: 'photo', label: 'Photo', type: 'photo', required: true },
				{ name: 'alt', label: 'Description de la photo', type: 'text', required: true, help: 'Lue par les personnes malvoyantes : ce que montre la photo.' },
				{ name: 'legende', label: 'Légende', type: 'text' },
			],
		},
	},
	encart: {
		label: 'Encadré',
		description: 'Message mis en avant : information, attention ou réussite.',
		icon: 'fa-circle-info',
		fields: [
			{
				name: 'style',
				label: 'Style',
				type: 'select',
				options: [
					{ value: 'info', label: 'Information (bleu)' },
					{ value: 'attention', label: 'Attention (orange)' },
					{ value: 'succes', label: 'Réussite (vert)' },
				],
			},
			{ name: 'titre', label: 'Titre', type: 'text' },
			{ name: 'texte', label: 'Texte', type: 'markdown', required: true },
		],
	},
} satisfies Record<string, BlocTypeDef>;

/** Types de bloc : ceux du CMS, puis ceux des extensions installées. */
export const BLOC_TYPES: Record<string, BlocTypeDef> = { ...DEFINITIONS_EXTENSIONS.blocs, ...BLOCS_DU_CMS };

export type BlocType = keyof typeof BLOCS_DU_CMS | (string & {});

/** Bloc tel qu'il est stocké dans le frontmatter (`type` + valeurs des champs, `items` éventuels). */
export interface Bloc {
	type: BlocType;
	[field: string]: unknown;
	items?: Record<string, string>[];
}

/** Identifiant d'un bloc (clé de `blocs:`, repris dans le marqueur). */
export const BLOC_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Marqueur d'un bloc, seul sur sa ligne : `[[bloc:<id>]]`. */
export const BLOC_MARKER = /^\[\[bloc:([a-z0-9][a-z0-9-]{0,39})\]\]$/;

export function blocMarker(id: string): string {
	return `[[bloc:${id}]]`;
}

/** Identifiants cités par les marqueurs du texte, dans l'ordre. */
export function blocMarkersIn(body: string): string[] {
	return body
		.split('\n')
		.map((line) => line.trim().match(BLOC_MARKER)?.[1])
		.filter((id): id is string => Boolean(id));
}

export function isBlocType(value: unknown): value is BlocType {
	return typeof value === 'string' && Object.hasOwn(BLOC_TYPES, value);
}

const ICON = /^[a-z0-9-]{1,40}$/;

/**
 * `photosEnAttente` (formulaire du module, fichier `.md` lu dans le
 * navigateur) : un champ `photo` peut être vide ou valoir `nouvelle:<clé>`
 * (photo choisie, pas encore envoyée) ; le serveur reste strict.
 */
export function checkBlocField(field: BlocField, value: unknown, where: string, errors: string[], options: { photosEnAttente?: boolean } = {}): string | undefined {
	if (field.type === 'photo' && options.photosEnAttente) {
		const texte = typeof value === 'string' ? value.trim() : '';
		if (texte && !BLOC_PHOTO.test(texte) && !BLOC_PHOTO_NOUVELLE.test(texte)) errors.push(`${where} : photo invalide (« ${texte} »).`);
		if (texte.endsWith('.svg') && !field.svg) errors.push(`${where} : SVG accepté seulement pour les logos (« ${field.label} » : JPEG, PNG ou WebP).`);
		return texte;
	}
	if (field.type === 'interrupteur') {
		if (value === undefined || value === null || value === '') return field.defaut ? 'oui' : 'non';
		if (value === true || value === 'oui') return 'oui';
		if (value === false || value === 'non') return 'non';
		errors.push(`${where} : « ${field.label} » vaut oui ou non.`);
		return undefined;
	}
	if (value === undefined || value === null || value === '') {
		if (field.required) errors.push(`${where} : « ${field.label} » est obligatoire.`);
		return field.type === 'select' ? field.options?.[0]?.value : undefined;
	}
	if (typeof value !== 'string' && typeof value !== 'number') {
		errors.push(`${where} : « ${field.label} » doit être un texte.`);
		return undefined;
	}
	const text = String(value).trim();
	if (text.length > 5000) errors.push(`${where} : « ${field.label} » est trop long.`);
	if (field.type === 'url' && !isSafeUrl(text)) {
		errors.push(`${where} : lien refusé (http(s), mailto:, tel: ou adresse du site).`);
	}
	if (field.type === 'icon' && !ICON.test(text.replace(/^fa-/, ''))) {
		errors.push(`${where} : icône invalide (ex. « cloud »).`);
	}
	if (field.type === 'photo' && !BLOC_PHOTO.test(text)) {
		errors.push(`${where} : photo invalide (« ${text} »).`);
	}
	if (field.type === 'photo' && text.endsWith('.svg') && !field.svg) {
		errors.push(`${where} : SVG accepté seulement pour les logos (« ${field.label} » : JPEG, PNG ou WebP).`);
	}
	if (field.type === 'video' && !videoEmbed(text)) {
		errors.push(`${where} : lien de vidéo non reconnu (YouTube, Vimeo ou PeerTube : Framatube, peertube.fr).`);
	}
	if (field.type === 'select' && !field.options?.some((o) => o.value === text)) {
		errors.push(`${where} : valeur inconnue pour « ${field.label} ».`);
	}
	return field.type === 'icon' ? text.replace(/^fa-/, '') : text;
}

/**
 * Vérifie un bloc du frontmatter et le normalise (champs connus seulement,
 * valeurs par défaut des `select`). Les liens Markdown des champs `markdown`
 * sont vérifiés par l'appelant (cf. `markdownLinkProblems`).
 */
/**
 * `typesInconnus` (lecture du contenu au build) : un bloc de type inconnu
 * (extension retirée) est gardé tel quel, sans erreur, et noté dans la
 * liste ; il n'est pas affiché (`BlocView.astro`). Sans elle, refusé.
 */
export function validateBloc(
	id: string,
	raw: unknown,
	options: { typesInconnus?: string[]; photosEnAttente?: boolean } = {},
): { bloc?: Bloc; errors: string[] } {
	const errors: string[] = [];
	const where = `Bloc « ${id} »`;
	if (!BLOC_ID.test(id)) errors.push(`${where} : identifiant invalide (minuscules, chiffres et tirets).`);
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: [...errors, `${where} : description invalide.`] };
	const data = { ...(raw as Record<string, unknown>) };
	// Type renommé depuis (contenu enregistré avec l'ancien nom).
	if (typeof data.type === 'string' && Object.hasOwn(DEFINITIONS_EXTENSIONS.typesRenommes, data.type)) data.type = DEFINITIONS_EXTENSIONS.typesRenommes[data.type];
	if (!isBlocType(data.type)) {
		if (options.typesInconnus && typeof data.type === 'string') {
			options.typesInconnus.push(data.type);
			return { bloc: { type: data.type }, errors };
		}
		return { errors: [...errors, `${where} : type inconnu « ${String(data.type)} » (connus : ${Object.keys(BLOC_TYPES).join(', ')}).`] };
	}
	const def: BlocTypeDef = BLOC_TYPES[data.type];
	const bloc: Bloc = { type: data.type };
	for (const field of def.fields) {
		const value = checkBlocField(field, data[field.name], where, errors, options);
		if (value !== undefined) bloc[field.name] = value;
	}
	if (def.items) bloc.items = validerElements(def.items, data.items, where, errors, options);
	return errors.length ? { errors } : { bloc, errors };
}

/** Vérifie et normalise les éléments répétés d'un bloc ou d'une section (nombre, champs). */
export function validerElements(
	spec: ElementsDef,
	raw: unknown,
	where: string,
	errors: string[],
	options: { photosEnAttente?: boolean } = {},
): Record<string, string>[] {
	const items = Array.isArray(raw) ? raw : [];
	if (items.length < spec.min) errors.push(`${where} : au moins ${spec.min} ${spec.label.toLowerCase()}.`);
	if (items.length > spec.max) errors.push(`${where} : ${spec.max} ${spec.label.toLowerCase()}s au plus.`);
	return items.slice(0, spec.max).map((item, i) => {
		const out: Record<string, string> = {};
		const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
		for (const field of spec.fields) {
			const value = checkBlocField(field, source[field.name], `${where}, ${spec.label.toLowerCase()} ${i + 1}`, errors, options);
			if (value !== undefined) out[field.name] = value;
		}
		return out;
	});
}

/** Textes Markdown d'un bloc (champs `markdown`, y compris dans les éléments), pour le contrôle des liens. */
export function blocMarkdownTexts(bloc: Bloc): string[] {
	const def: BlocTypeDef = BLOC_TYPES[bloc.type];
	const texts = def.fields.filter((f) => f.type === 'markdown').map((f) => String(bloc[f.name] ?? ''));
	for (const item of bloc.items ?? []) {
		for (const f of def.items?.fields ?? []) if (f.type === 'markdown') texts.push(item[f.name] ?? '');
	}
	return texts.filter(Boolean);
}

/** Photos d'un bloc (champs `photo`, y compris dans les éléments) : valeurs telles qu'enregistrées. */
export function blocPhotos(bloc: Bloc): string[] {
	const def: BlocTypeDef | undefined = BLOC_TYPES[bloc.type];
	return def ? photosDesChamps(def, bloc) : [];
}

/** Photos citées par une valeur (bloc ou section) d'après sa définition : champs `photo` et ceux de ses éléments. */
export function photosDesChamps(def: ChampsDef, valeur: { [champ: string]: unknown; items?: unknown }): string[] {
	const photos = def.fields.filter((f) => f.type === 'photo').map((f) => String(valeur[f.name] ?? ''));
	for (const item of Array.isArray(valeur.items) ? (valeur.items as Record<string, unknown>[]) : []) {
		for (const f of def.items?.fields ?? []) if (f.type === 'photo') photos.push(String(item?.[f.name] ?? ''));
	}
	return photos.filter(Boolean);
}

/**
 * Applique `fn` à chaque champ `photo` d'une valeur brute (bloc ou section),
 * éléments compris ; copie, l'original n'est pas modifié. `where` nomme le
 * champ dans les messages.
 */
export function remplacerPhotos(def: ChampsDef, raw: unknown, ou: string, fn: (valeur: unknown, where: string) => unknown): unknown {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
	const copie = { ...(raw as Record<string, unknown>) };
	for (const f of def.fields) if (f.type === 'photo') copie[f.name] = fn(copie[f.name], ou);
	if (def.items && Array.isArray(copie.items)) {
		copie.items = copie.items.map((item, i) => {
			if (!item || typeof item !== 'object') return item;
			const it = { ...(item as Record<string, unknown>) };
			for (const f of def.items!.fields) if (f.type === 'photo') it[f.name] = fn(it[f.name], `${ou}, ${def.items!.label.toLowerCase()} ${i + 1}`);
			return it;
		});
	}
	return copie;
}

/** Valeur de départ d'un champ (formulaire du module). */
export function emptyValue(f: BlocField): string {
	if (f.type === 'select') return f.options?.[0]?.value ?? '';
	if (f.type === 'interrupteur') return f.defaut ? 'oui' : 'non';
	return '';
}

/** Valeurs de départ d'un nouveau bloc (formulaire du module). */
export function emptyBloc(type: BlocType): Bloc {
	const def: BlocTypeDef = BLOC_TYPES[type];
	const bloc: Bloc = { type };
	for (const f of def.fields) bloc[f.name] = emptyValue(f);
	if (def.items) bloc.items = elementsVides(def.items);
	return bloc;
}

/** Éléments de départ (le minimum demandé, champs vides). */
export function elementsVides(spec: ElementsDef): Record<string, string>[] {
	const item = Object.fromEntries(spec.fields.map((f) => [f.name, emptyValue(f)]));
	return Array.from({ length: spec.min }, () => ({ ...item }));
}
