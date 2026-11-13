/**
 * Ce que les extensions actives apportent aux pages du site, lu dans leur
 * `site.ts` (export par défaut `ExtensionSite`) : composants des modules
 * d'accueil et des blocs qu'elles définissent (`definitions.ts`), séances du
 * planning hebdomadaire, pages publiques (plan du site, sélecteur de liens
 * de l'Espace Admin). Cf. `src/lib/extensions.ts`.
 *
 * Code serveur et build uniquement (composants Astro).
 */
import type { AgendaSession } from './agenda';
import { extensionActive, idDuChemin } from './extensions';

/** Composant Astro (module d'accueil ou bloc). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Composant = (...args: any[]) => any;

/** Page publique d'une extension : plan du site et liens de l'Espace Admin. */
export interface PageExtension {
	title: string;
	href: string;
	/** Fermée pour l'instant (formulaire fermé) : signalé dans le sélecteur de liens, absent du plan du site. */
	closed?: boolean;
}

export interface ExtensionSite {
	/**
	 * Composant de chaque module d'accueil de son `definitions.ts`. Props :
	 * `champs` (valeurs des champs, variables `{{association.…}}` remplacées).
	 */
	accueil?: Record<string, Composant>;
	/** Composant de chaque bloc de son `definitions.ts`. Props : `bloc` (valeurs enregistrées). */
	blocs?: Record<string, Composant>;
	/** Séances ajoutées au planning de `/activites` (`kind` : familles de son `definitions.ts`). */
	agenda?: () => AgendaSession[] | Promise<AgendaSession[]>;
	/** Pages publiques qu'elle ajoute. */
	pages?: () => PageExtension[];
}

const sites = Object.entries(import.meta.glob<ExtensionSite>('/extensions/*/site.ts', { eager: true, import: 'default' }))
	.map(([chemin, site]) => ({ id: idDuChemin(chemin), site }))
	.filter(({ id }) => extensionActive(id));

/** Composant d'un module d'accueil apporté par une extension active. */
export function composantAccueil(type: string): Composant | undefined {
	return sites.find(({ site }) => site.accueil?.[type])?.site.accueil?.[type];
}

/** Composant d'un bloc apporté par une extension active. */
export function composantBloc(type: string): Composant | undefined {
	return sites.find(({ site }) => site.blocs?.[type])?.site.blocs?.[type];
}

/** Séances des extensions actives pour le planning. */
export async function seancesExtensions(): Promise<AgendaSession[]> {
	return (await Promise.all(sites.map(({ site }) => site.agenda?.() ?? []))).flat();
}

/** Pages publiques des extensions actives. */
export function pagesExtensions(): PageExtension[] {
	return sites.flatMap(({ site }) => site.pages?.() ?? []);
}
