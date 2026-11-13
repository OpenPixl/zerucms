/**
 * Modules de l'Espace Admin : chacun apparaît comme un bouton de la
 * barre d'administration (ou du menu du nom, `placement: 'user'`) et s'ouvre
 * dans le panneau latéral.
 *
 * Ajouter un module = un composant dans `./modules/` + une entrée ici
 * (+ ses routes `/api/admin/<…>`, gardées par `GUARDS` dans
 * `src/middleware.ts` si elles sont réservées à un groupe). `groups` vide = toute personne connectée ;
 * `admin` et `superadmin` voient tous les modules, sauf `exclusive` (réservé
 * aux seuls `groups`). Le contrôle réel est côté serveur. `menu` range le
 * bouton dans un menu déroulant de la barre (`ADMIN_MENUS`, sous-liens côte à
 * côte), seulement si au moins deux de ses modules sont visibles. Module
 * apporté par un plugin (`plugin`, composant dans `src/plugins/<id>/admin/`) :
 * absent si le plugin est inactif sur le site en ligne. Module d'une
 * extension : déclaré par son `admin.ts` (export par défaut, liste
 * d'`AdminModule` sans `extension`, posé ici), placé avant « Facturation ».
 */
import { defineAsyncComponent, type Component } from 'vue';
import { hasAdminRights, type AuthGroup } from '../../lib/auth/groups';
import { disponible, type PluginId } from '../../plugins';
import { site } from '../../config/site';
import { vocabulaire } from '../../lib/structure';
import { idDuChemin } from '../../lib/extensions';

/** Menus déroulants de la barre : libellé et icône du bouton qui regroupe les modules. */
export const ADMIN_MENUS = {
	contenu: { label: 'Contenus', icon: 'fa-pen-to-square' },
	parametres: { label: 'Paramètres', icon: 'fa-sliders' },
} as const;
export type AdminMenuId = keyof typeof ADMIN_MENUS;

export interface AdminModule {
	id: string;
	label: string;
	/** Icône Font Awesome (solid). */
	icon: string;
	groups: AuthGroup[];
	component: Component;
	/** `user` = rangé dans le menu déroulant du nom (compte personnel) plutôt que dans la barre. */
	placement?: 'bar' | 'user';
	/** Réservé aux seuls `groups`, même pour `admin` (ex. journal → `superadmin`). */
	exclusive?: true;
	/** Menu déroulant de la barre qui contient ce module. */
	menu?: AdminMenuId;
	/** Masqué pour qui voit aussi ce module-là, qui le contient déjà (ex. pages réservées → module « Pages »). */
	replacedBy?: string;
	/** Props passées au composant (ex. module « Comptes » ouvert sur son propre compte). */
	props?: Record<string, unknown>;
	/** Apporté par ce plugin : masqué s'il est inactif. */
	plugin?: PluginId;
	/** Apporté par cette extension : masqué si elle est inactive. */
	extension?: string;
}

/** Modules des extensions installées (`extensions/<id>/admin.ts`). */
const MODULES_EXTENSIONS: AdminModule[] = Object.entries(
	import.meta.glob<AdminModule[]>('/extensions/*/admin.ts', { eager: true, import: 'default' }),
).flatMap(([chemin, modules]) => modules.map((m) => ({ ...m, extension: idDuChemin(chemin) })));

export const ADMIN_MODULES: AdminModule[] = [
	{
		id: 'pages',
		label: 'Pages réservées',
		icon: 'fa-lock',
		groups: [],
		replacedBy: 'pages-site',
		component: defineAsyncComponent(() => import('./modules/PagesModule.vue')),
	},
	{
		id: 'pages-site',
		label: 'Pages',
		icon: 'fa-sitemap',
		groups: ['redacteur'],
		menu: 'contenu',
		component: defineAsyncComponent(() => import('./modules/SitePagesModule.vue')),
	},
	{
		id: 'activites',
		label: 'Activités',
		icon: 'fa-person-chalkboard',
		groups: ['redacteur'],
		menu: 'contenu',
		component: defineAsyncComponent(() => import('./modules/ActivitiesModule.vue')),
	},
	{
		id: 'actualites',
		label: 'Actualités',
		icon: 'fa-newspaper',
		groups: ['redacteur'],
		menu: 'contenu',
		component: defineAsyncComponent(() => import('./modules/NewsModule.vue')),
	},
	{
		id: 'annonces',
		label: 'Annonces',
		icon: 'fa-bullhorn',
		groups: ['redacteur'],
		menu: 'contenu',
		component: defineAsyncComponent(() => import('./modules/AnnoncesModule.vue')),
	},
	...MODULES_EXTENSIONS,
	{
		id: 'facturation',
		label: 'Facturation',
		icon: 'fa-file-invoice-dollar',
		groups: ['admin'],
		plugin: 'facturation',
		component: defineAsyncComponent(() => import('../../plugins/facturation/admin/FacturationModule.vue')),
	},
	{
		id: 'association',
		label: vocabulaire(site.structure).titre,
		icon: 'fa-landmark',
		groups: ['admin'],
		menu: 'parametres',
		component: defineAsyncComponent(() => import('./modules/AssociationModule.vue')),
	},
	{
		id: 'comptes',
		label: 'Comptes',
		icon: 'fa-users',
		groups: ['admin'],
		menu: 'parametres',
		component: defineAsyncComponent(() => import('./modules/AccountsModule.vue')),
	},
	{
		id: 'sauvegardes',
		label: 'Sauvegardes',
		icon: 'fa-box-archive',
		groups: ['admin'],
		menu: 'parametres',
		component: defineAsyncComponent(() => import('./modules/SauvegardesModule.vue')),
	},
	{
		id: 'site',
		label: 'Site',
		icon: 'fa-globe',
		groups: ['admin'],
		menu: 'parametres',
		component: defineAsyncComponent(() => import('./modules/SiteModule.vue')),
	},
	{
		id: 'journal',
		label: 'Journal',
		icon: 'fa-clock-rotate-left',
		groups: ['superadmin'],
		exclusive: true,
		component: defineAsyncComponent(() => import('./modules/JournalModule.vue')),
	},
	{
		id: 'plugins',
		label: 'Plugins',
		icon: 'fa-puzzle-piece',
		groups: ['superadmin'],
		exclusive: true,
		component: defineAsyncComponent(() => import('./modules/PluginsModule.vue')),
	},
	{
		id: 'extensions',
		label: 'Extensions',
		icon: 'fa-plug',
		groups: ['superadmin'],
		exclusive: true,
		props: { genre: 'extension' },
		component: defineAsyncComponent(() => import('./modules/PluginsModule.vue')),
	},
	{
		id: 'mon-compte',
		label: 'Mon compte',
		icon: 'fa-user-pen',
		groups: [],
		placement: 'user',
		props: { self: true },
		component: defineAsyncComponent(() => import('./modules/AccountsModule.vue')),
	},
];

export function modulesFor(groups: AuthGroup[]): AdminModule[] {
	const visible = ADMIN_MODULES.filter(disponible).filter(
		(m) =>
			m.groups.length === 0 ||
			(hasAdminRights(groups) && !m.exclusive) ||
			m.groups.some((g) => groups.includes(g)),
	);
	return visible.filter((m) => !m.replacedBy || !visible.some((other) => other.id === m.replacedBy));
}

/** Entrée de la barre : un module seul, ou un menu déroulant qui en regroupe plusieurs. */
export type BarEntry =
	| { kind: 'module'; module: AdminModule }
	| { kind: 'menu'; id: AdminMenuId; label: string; icon: string; modules: AdminModule[] };

/** Boutons de la barre (hors menu du nom), dans l'ordre du registre ; un menu prend la place de son premier module. */
export function barEntries(modules: AdminModule[]): BarEntry[] {
	const bar = modules.filter((m) => m.placement !== 'user');
	const entries: BarEntry[] = [];
	for (const m of bar) {
		const grouped = m.menu ? bar.filter((o) => o.menu === m.menu) : [];
		if (grouped.length < 2) entries.push({ kind: 'module', module: m });
		else if (grouped[0] === m) entries.push({ kind: 'menu', id: m.menu!, ...ADMIN_MENUS[m.menu!], modules: grouped });
	}
	return entries;
}
