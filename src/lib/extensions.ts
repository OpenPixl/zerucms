/**
 * Extensions : développements propres à une structure (ex. prise de RDV
 * d'un dispositif), installés à part dans `extensions/<id>/` à la racine du
 * site — jamais livrés avec le CMS, contrairement aux plugins
 * (`src/plugins/`, outils communs proposés selon le type de structure).
 * Dossier ignoré par git, conservé par les mises à jour comme
 * `src/content/` ; installation : module « Extensions » (archive .zip) ou
 * `npm run extension -- install <zip>` (`scripts/extension.mjs`).
 *
 * Le cœur n'importe jamais une extension nommément : il découvre ses
 * fichiers par `import.meta.glob` (chemins fixés par le contrat ci-dessous,
 * détaillé dans docs/extensions.md) :
 *  - `extension.json` — identité et fiche (`ExtensionInfo`) ;
 *  - `manifest.ts`    — routes et variables d'environnement, lu par la config
 *                       Astro (`src/integrations/extensions.ts`) ;
 *  - `definitions.ts` — modules d'accueil, blocs, types d'agenda (données
 *                       pures, aussi dans le navigateur) ;
 *  - `site.ts`        — composants, séances du planning, liens (serveur,
 *                       `src/lib/extensions-site.ts`) ;
 *  - `admin.ts`       — modules de l'Espace Admin (`src/components/admin/modules.ts`).
 * Une extension importe le cœur par l'alias `@cms/…` (= `src/…`).
 *
 * Module utilisable au build, côté serveur et dans le navigateur.
 */
import type { PluginInfo } from '../plugins/catalogue';
import type { AuthGroup } from './auth/groups';
import type { HomeModuleDef } from './home-modules';
import type { BlocTypeDef } from './blocs';
import type { AgendaKindMeta } from './agenda';
import { site } from '../config/site';

/** Identifiant d'extension = nom de son dossier : minuscules, chiffres, tirets. */
export const EXTENSION_ID = /^[a-z][a-z0-9-]{1,39}$/;

/**
 * `extension.json` : même fiche qu'un plugin du catalogue (libellé, icône,
 * fichiers requis, secrets du `.env`, réglages de la page de configuration,
 * modèle de fichier), plus son identité.
 */
export interface ExtensionInfo extends Omit<PluginInfo, 'actifParDefaut' | 'requiert' | 'structures' | 'secrets'> {
	id: string;
	/** Version de l'extension (X.Y.Z). */
	version: string;
	/** Version minimale du CMS (X.Y.Z) : plus ancienne = construction refusée. */
	cms: string;
	auteur?: string;
	/** Routes `/api/admin/<…>` réservées à des groupes (ajoutées à `GUARDS` de `src/middleware.ts`). */
	gardes?: { prefixe: string; groupes: AuthGroup[]; message: string }[];
}

/** `definitions.ts` d'une extension (export par défaut) : ce qu'elle ajoute aux catalogues du site. */
export interface ExtensionDefinitions {
	/** Modules de l'accueil, par type (`extension` posé par le cœur). */
	accueil?: Record<string, HomeModuleDef>;
	/** Blocs de page enrichie, par type. */
	blocs?: Record<string, BlocTypeDef>;
	/** Anciens noms de type encore acceptés à la lecture du contenu. */
	typesRenommes?: Record<string, string>;
	/** Familles du planning hebdomadaire (`kind` de ses séances). */
	agenda?: Record<string, AgendaKindMeta>;
	/** Libellés de ses actions dans le journal (`<id>.<action>` passé à `logEvent()`). */
	journal?: Record<string, { label: string; icon: string }>;
}

/** `/extensions/<id>/<fichier>` → `<id>`. */
export function idDuChemin(chemin: string): string {
	return chemin.split('/').at(-2) ?? '';
}

const infos = import.meta.glob<ExtensionInfo>('/extensions/*/extension.json', { eager: true, import: 'default' });
const definitions = import.meta.glob<ExtensionDefinitions>('/extensions/*/definitions.ts', { eager: true, import: 'default' });

/** Extensions installées (fiche lue ; validée à l'installation et par la config Astro). */
export const EXTENSIONS: ExtensionInfo[] = Object.entries(infos)
	.map(([chemin, info]) => ({ ...info, id: idDuChemin(chemin) }))
	.sort((a, b) => a.label.localeCompare(b.label, 'fr'));

export function extensionInstallee(id: string): boolean {
	return EXTENSIONS.some((e) => e.id === id);
}

/** Installée et non désactivée (`extensions: { <id>: false }` de `reglages.yaml`). */
export function extensionActive(id: string): boolean {
	return extensionInstallee(id) && site.extensions[id] !== false;
}

/** Ce que les extensions installées ajoutent aux catalogues, chaque élément marqué de son `extension`. */
export const DEFINITIONS_EXTENSIONS = Object.entries(definitions).reduce(
	(acc, [chemin, d]) => {
		const extension = idDuChemin(chemin);
		for (const [type, def] of Object.entries(d.accueil ?? {})) acc.accueil[type] = { ...def, extension };
		for (const [type, def] of Object.entries(d.blocs ?? {})) acc.blocs[type] = { ...def, extension };
		Object.assign(acc.typesRenommes, d.typesRenommes);
		Object.assign(acc.agenda, d.agenda);
		Object.assign(acc.journal, d.journal);
		return acc;
	},
	{
		accueil: {} as Record<string, HomeModuleDef>,
		blocs: {} as Record<string, BlocTypeDef>,
		typesRenommes: {} as Record<string, string>,
		agenda: {} as Record<string, AgendaKindMeta>,
		journal: {} as Record<string, { label: string; icon: string }>,
	},
);
