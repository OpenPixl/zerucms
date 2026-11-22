/**
 * Ajout direct d'un contenu par fichier `.md` (premier bouton du menu
 * « Contenus », modale `ContentImportModal.vue`). Chaque fichier `.md`
 * d'échange (modèles, « Télécharger le fichier » des formulaires) porte en
 * tête `contenu: actualite | page | activite | annonce` : la modale y lit le type,
 * puis ouvre le module correspondant dont le formulaire de création se
 * remplit avec le fichier (`takePendingImport()` au montage du module).
 * Rien n'est publié avant l'enregistrement dans le formulaire.
 *
 * La clé `contenu` n'existe que dans ces fichiers : le serveur ne l'écrit
 * jamais dans `src/content/` (frontmatter reconstruit champ par champ).
 */
import { shallowRef } from 'vue';
import type { Depot } from './depot';

/** Clé de l'en-tête qui donne le type de contenu. */
export const CONTENT_KEY = 'contenu';

export const CONTENT_KINDS = {
	actualite: { label: 'Actualité', une: 'une actualité', module: 'actualites', moduleLabel: 'Actualités', icon: 'fa-newspaper' },
	page: { label: 'Page', une: 'une page', module: 'pages-site', moduleLabel: 'Pages', icon: 'fa-sitemap' },
	activite: { label: 'Activité', une: 'une activité', module: 'activites', moduleLabel: 'Activités', icon: 'fa-person-chalkboard' },
	annonce: { label: 'Annonce', une: 'une annonce', module: 'annonces', moduleLabel: 'Annonces', icon: 'fa-bullhorn' },
} as const;
export type ContentKind = keyof typeof CONTENT_KINDS;
export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS) as ContentKind[];

/** Type déclaré dans l'en-tête (accents, casse et pluriel tolérés) ; `null` = absent ou inconnu. */
export function contentKindOf(data: Record<string, unknown>): ContentKind | null {
	const raw = data[CONTENT_KEY];
	if (typeof raw !== 'string') return null;
	const v = raw
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toLowerCase()
		.replace(/s$/, '');
	return (CONTENT_KIND_IDS as string[]).includes(v) ? (v as ContentKind) : null;
}

/** Fichier d'un autre type chargé dans un formulaire : message d'erreur, sinon `undefined`. */
export function contentKindProblem(data: Record<string, unknown>, expected: ContentKind): string | undefined {
	const kind = contentKindOf(data);
	if (!kind || kind === expected) return undefined;
	return `Ce fichier décrit ${CONTENT_KINDS[kind].une} (« ${CONTENT_KEY}: ${kind} »), pas ${CONTENT_KINDS[expected].une} : chargez-le depuis le module « ${CONTENT_KINDS[kind].moduleLabel} ».`;
}

/** Dépôt choisi dans la modale (`.md` + photos, cf. ./depot.ts), en attente du module qui va s'ouvrir. */
const pending = shallowRef<{ kind: ContentKind; depot: Depot } | null>(null);

export function setPendingImport(kind: ContentKind, depot: Depot): void {
	pending.value = { kind, depot };
}

/** Récupère (une seule fois) le dépôt destiné à ce type de contenu. */
export function takePendingImport(kind: ContentKind): Depot | null {
	if (pending.value?.kind !== kind) return null;
	const { depot } = pending.value;
	pending.value = null;
	return depot;
}
