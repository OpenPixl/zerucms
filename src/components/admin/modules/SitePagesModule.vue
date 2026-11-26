<script setup lang="ts">
/**
 * Module « Pages » (groupes `redacteur` / `admin`) : pages de contenu et
 * menus déroulants de la barre de navigation, tels qu'ils sont dans les
 * sources (`src/content/pages/`). Création (page classique ou enrichie de
 * blocs), modification, déplacement, suppression ; menus déroulants :
 * création (en dernière position), libellé, suppression d'un menu déroulant
 * vide ; ordre du menu par glisser-déposer ou flèches ↑/↓. Chaque modification reconstruit le
 * site (suivi par `usePublication`), comme le module « Actualités ».
 */
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import ConfirmIconButton from '../ConfirmIconButton.vue';
import PublishButtons from '../PublishButtons.vue';
import PublishStatus from '../PublishStatus.vue';
import {
	ApiError,
	dropdownsApi,
	menuOrderApi,
	pagesApi,
	sitePagesApi,
	type DropdownView,
	type PageSourceView,
	type SaveResult,
	type SitePageView,
} from '../client';
import { ADMIN_CONTEXT, iconButtonClass, inputClass, rememberOpenModule, sortableProps, takeModuleToReopen } from '../context';
import { isDeferredSubmit } from '../lot';
import { usePublication } from '../usePublication';
import DragHandle from './pages/DragHandle.vue';
import OrderArrows from './pages/OrderArrows.vue';
import { takePendingImport } from '../content-import';
import type { Depot } from '../depot';
import PageForm from './pages/PageForm.vue';
import PageRow from './pages/PageRow.vue';
import SitePageForm from './pages/SitePageForm.vue';
import { SITE_PAGES } from '../../../lib/site-pages';

const { sessionExpired, onCloseRequest } = inject(ADMIN_CONTEXT)!;

type View =
	| { name: 'list' }
	| { name: 'page'; source: PageSourceView | null; file?: Depot }
	| { name: 'dropdown'; dropdown: DropdownView | null }
	| { name: 'site'; page: SitePageView };

const view = ref<View>({ name: 'list' });
const sitePages = ref<SitePageView[]>([]);
const dropdowns = ref<DropdownView[]>([]);
const pages = ref<PageSourceView[]>([]);
/** Aperçu de la photo du bandeau d'accueil (formulaire de l'Accueil). */
const homePhoto = ref<string | null>(null);
/** Aperçu de l'illustration du module « Présentation » (formulaire de l'Accueil). */
const homeIllustration = ref<string | null>(null);
const availability = ref<{ ok: boolean; reason?: string }>({ ok: true });
const loading = ref(true);
const busy = ref(false);
const error = ref('');
/** Élément dont la suppression attend confirmation (`page:<chemin>` / `dropdown:<dossier>` / `link:<id>`). */
const confirming = ref<string | null>(null);

function fail(e: unknown) {
	takeModuleToReopen(); // l'enregistrement a échoué : pas de réouverture au prochain chargement
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

async function load() {
	loading.value = true;
	try {
		const res = await pagesApi.list();
		sitePages.value = res.sitePages;
		dropdowns.value = res.dropdowns;
		pages.value = res.pages;
		homePhoto.value = res.homePhoto;
		homeIllustration.value = res.homeIllustration;
		orderDraft.value = {};
		availability.value = res.availability;
		receive(res.status);
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

const { status, following, receive, afterSave, publishLot, savedLabel, dismiss: dismissStatus, reloadIn, cancelReload } = usePublication({
	module: 'pages-site',
	onSettled: () => load(),
	onError: fail,
});
/** Publication impossible ou en cours. */
const publishLocked = computed(() => !availability.value.ok || following.value || busy.value);

/**
 * Ordre changé par glisser-déposer ou flèches ↑/↓, pas encore enregistré : clés des éléments
 * par niveau (`racine`, `dropdown:<dossier>`). Tant qu'il est en attente, les
 * autres actions sont bloquées (une publication enregistre tout l'ordre d'un coup).
 */
const orderDraft = ref<Record<string, string[]>>({});
const orderPending = computed(() => Object.keys(orderDraft.value).length > 0);
const locked = computed(() => publishLocked.value || orderPending.value);

function inDraftOrder<T>(level: string, items: T[], key: (item: T) => string): T[] {
	const draft = orderDraft.value[level];
	return draft ? [...items].sort((a, b) => draft.indexOf(key(a)) - draft.indexOf(key(b))) : items;
}

function move(level: string, keys: string[], index: number, delta: -1 | 1) {
	const next = [...keys];
	[next[index], next[index + delta]] = [next[index + delta], next[index]];
	orderDraft.value = { ...orderDraft.value, [level]: next };
}
/** Liste glissée-déposée : nouvel ordre complet d'un niveau. */
function reorder(level: string, keys: string[]) {
	orderDraft.value = { ...orderDraft.value, [level]: keys };
}

async function saveOrder(event: Event) {
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('pages-site');
		const result = await menuOrderApi.save(orderDraft.value, { deferred: isDeferredSubmit(event) });
		orderDraft.value = {};
		afterSave('Nouvel ordre du menu', result);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

const byPath = computed(() => new Map(pages.value.map((p) => [p.path, p])));
/** Pages à la racine absentes du menu de navigation (accessibles par leur adresse seulement). */
const freePages = computed(() => pages.value.filter((p) => p.placement.kind === 'racine' && !p.menu.show));
const reservedPages = computed(() => pages.value.filter((p) => p.placement.kind === 'reservee'));
const dropdownPages = (dropdown: DropdownView) =>
	inDraftOrder(
		`dropdown:${dropdown.folder}`,
		dropdown.pages
			.map((path) => byPath.value.get(path))
			.filter((p): p is PageSourceView => Boolean(p))
			.sort((a, b) => a.menu.order - b.menu.order),
		(p) => `page:${p.path}`,
	);

/** Menu de navigation tel qu'il s'affiche : pages applicatives, liens directs et menus déroulants, par position. */
type NavItem =
	| { kind: 'site'; order: number; site: SitePageView }
	| { kind: 'page'; order: number; page: PageSourceView }
	| { kind: 'dropdown'; order: number; dropdown: DropdownView };
const navItems = computed<NavItem[]>(() =>
	inDraftOrder(
		'racine',
		[
			...sitePages.value.filter((p) => p.active).map((site): NavItem => ({ kind: 'site', order: site.order, site })),
			...pages.value
				.filter((p) => p.placement.kind === 'racine' && p.menu.show)
				.map((page): NavItem => ({ kind: 'page', order: page.menu.order, page })),
			...dropdowns.value.map((dropdown): NavItem => ({ kind: 'dropdown', order: dropdown.order, dropdown })),
		].sort((a, b) => a.order - b.order),
		(item) => navKey(item),
	),
);
/** Menus déroulants dépliés dans la liste (accordéon ; tous repliés à l'ouverture). */
const expanded = ref(new Set<string>());
function toggleDropdown(folder: string) {
	if (expanded.value.has(folder)) expanded.value.delete(folder);
	else expanded.value.add(folder);
}

const dropdownKeys = (dropdown: DropdownView) => dropdownPages(dropdown).map((p) => `page:${p.path}`);

const navKey = (item: NavItem) =>
	item.kind === 'site' ? `site:${item.site.id}` : item.kind === 'page' ? `page:${item.page.path}` : `dropdown:${item.dropdown.folder}`;

function go(next: View) {
	error.value = '';
	confirming.value = null;
	view.value = next;
}

async function openPage(page: PageSourceView | null) {
	if (!page) return go({ name: 'page', source: null });
	busy.value = true;
	try {
		go({ name: 'page', source: await pagesApi.get(page.path) });
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

function onPublished(label: string, result: SaveResult) {
	go({ name: 'list' });
	afterSave(label, result);
}

async function removePage(page: PageSourceView, deferred: boolean) {
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('pages-site');
		const result = await pagesApi.remove(page.path, { deferred });
		confirming.value = null;
		afterSave(`Suppression : ${page.title}`, result);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

// --- Menus déroulants ---

const dropdownForm = reactive({ label: '', folder: '' });
function openDropdown(dropdown: DropdownView | null) {
	Object.assign(dropdownForm, { label: dropdown?.label ?? '', folder: dropdown?.folder ?? '' });
	go({ name: 'dropdown', dropdown });
}

async function saveDropdown(event: Event) {
	if (view.value.name !== 'dropdown') return;
	const current = view.value.dropdown;
	const options = { deferred: isDeferredSubmit(event) };
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('pages-site');
		const result = current
			? await dropdownsApi.update(current.folder, { label: dropdownForm.label }, options)
			: await dropdownsApi.create({ label: dropdownForm.label, folder: dropdownForm.folder }, options);
		onPublished(`Menu déroulant : ${dropdownForm.label}`, result);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

async function removeDropdown(dropdown: DropdownView, deferred: boolean) {
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('pages-site');
		const result = await dropdownsApi.remove(dropdown.folder, { deferred });
		confirming.value = null;
		afterSave(`Suppression du menu déroulant : ${dropdown.label}`, result);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

// --- Pages du site (bibliothèque : Accueil, Activités…) ---

/** Pages du site désactivées : proposées à l'activation (bloc « Bibliothèque »). */
const inactiveSitePages = computed(() => sitePages.value.filter((p) => !p.active));

/** Changement rapide depuis la liste (menu, activation), réglages actuels gardés pour le reste. */
async function updateSitePage(page: SitePageView, change: { show?: boolean; active?: boolean }, label: string, deferred = false) {
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('pages-site');
		const result = await sitePagesApi.update(
			page.id,
			{ label: page.label, show: page.show, active: page.active, textes: page.textes, ...change },
			{ deferred },
		);
		confirming.value = null;
		afterSave(`${label} : ${page.label}`, result);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

// ✕ / Échap depuis un formulaire : retour à la liste plutôt que fermeture du panneau.
const stopCloseRequest = onCloseRequest(() => {
	if (view.value.name === 'list') return false;
	go({ name: 'list' });
	return true;
});
onBeforeUnmount(stopCloseRequest);

onMounted(() => {
	// Fichier déposé dans « Ajouter un contenu » (menu Contenus) : création pré-remplie.
	const pending = takePendingImport('page');
	if (pending) go({ name: 'page', source: null, file: pending });
	void load();
});
</script>

<template>
	<PublishStatus
		:status="status"
		:following="following"
		:reload-in="reloadIn"
		:saved-label="savedLabel"
		:locked="locked"
		@dismiss="dismissStatus"
		@cancel-reload="cancelReload"
		@publish-lot="publishLot"
	/>
	<p v-if="!availability.ok" class="mb-4 text-sm text-gray-500"><i class="fa-solid fa-lock mr-1" aria-hidden="true"></i>{{ availability.reason }}</p>
	<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>

	<!-- Liste -->
	<template v-if="view.name === 'list'">
		<div class="mb-5 flex flex-wrap gap-3">
			<button
				type="button"
				class="bouton bouton-primaire"
				:disabled="locked"
				@click="openPage(null)"
			>
				<i class="fa-solid fa-plus mr-1.5" aria-hidden="true"></i>Nouvelle page
			</button>
			<button
				type="button"
				class="bouton bouton-contour"
				:disabled="locked"
				@click="openDropdown(null)"
			>
				<i class="fa-solid fa-bars mr-1.5" aria-hidden="true"></i>Nouveau menu déroulant
			</button>
		</div>

		<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
		<div v-else class="space-y-6">
			<!-- Ordre changé (glisser-déposer, flèches) : enregistré en une seule publication -->
			<form
				v-if="orderPending"
				class="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200"
				role="status"
				@submit.prevent="saveOrder"
			>
				<i class="fa-solid fa-arrows-up-down" aria-hidden="true"></i>
				<span class="min-w-0 flex-1">Nouvel ordre du menu, pas encore enregistré.</span>
				<PublishButtons compact :disabled="publishLocked" />
				<button type="button" class="text-xs font-medium text-gray-700 hover:underline" @click="orderDraft = {}">Annuler</button>
			</form>

			<!-- 1. Menu de navigation : pages du site, liens directs, menus déroulants -->
			<section class="overflow-hidden rounded-xl border border-gray-200">
				<header class="flex items-center gap-2 rounded-t-xl border-b border-gray-100 bg-gray-100 px-4 py-2.5">
					<i class="fa-solid fa-compass text-gray-400" aria-hidden="true"></i>
					<span class="font-heading font-semibold text-gray-900">Menu de navigation</span>
					<span class="text-xs text-gray-500">dans l'ordre d'affichage</span>
				</header>
				<VueDraggable
					v-bind="sortableProps"
					tag="ul"
					:model-value="navItems"
					class="divide-y divide-gray-100"
					@update:model-value="(list: NavItem[]) => reorder('racine', list.map(navKey))"
				>
					<template v-for="(item, i) in navItems" :key="navKey(item)">
						<li v-if="item.kind === 'site'" class="flex flex-wrap items-center gap-2 py-2.5 pr-4 pl-2 text-sm transition-colors hover:bg-gray-100">
							<DragHandle :disabled="publishLocked" />
							<span :class="['min-w-0', { 'opacity-60': !item.site.show }]">
								<button
									type="button"
									class="text-left font-medium text-gray-900 hover:text-primary disabled:cursor-default disabled:hover:text-gray-900"
									:disabled="locked"
									:title="`Modifier « ${item.site.label} »`"
									@click="go({ name: 'site', page: item.site })"
								>
									{{ item.site.label }}
								</button>
							</span>
							<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs ring-1 ring-inset ring-gray-200 text-gray-600" title="Page fournie par le site : vous réglez son lien et ses textes">
								page du site
							</span>
							<span v-if="!item.site.show" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs ring-1 ring-inset ring-gray-200 text-gray-600">masquée du menu</span>
							<span class="ml-auto flex items-center gap-1">
								<OrderArrows
									:label="item.site.label"
									:first="i === 0"
									:last="i === navItems.length - 1"
									:disabled="publishLocked"
									@up="move('racine', navItems.map(navKey), i, -1)"
									@down="move('racine', navItems.map(navKey), i, 1)"
								/>
								<a
									:href="item.site.href"
									:class="[iconButtonClass, 'text-gray-400 hover:text-gray-700']"
									:aria-label="`Voir « ${item.site.label} » sur le site`"
									title="Voir sur le site"
								>
									<i class="fa-solid fa-eye" aria-hidden="true"></i>
								</a>
								<button
									type="button"
									:class="[iconButtonClass, 'text-primary']"
									:disabled="locked"
									aria-label="Modifier"
									title="Modifier le lien et les textes"
									@click="go({ name: 'site', page: item.site })"
								>
									<i class="fa-solid fa-pen" aria-hidden="true"></i>
								</button>
								<ConfirmIconButton
									v-if="item.site.canDisable"
									label="Désactiver"
									title="Désactiver la page (retirée du site, réactivable depuis la bibliothèque)"
									:confirming="confirming === `site:${item.site.id}`"
									:disabled="locked"
									deferrable
									@ask="confirming = `site:${item.site.id}`"
									@confirm="updateSitePage(item.site, { active: false }, 'Page désactivée', $event)"
									@cancel="confirming = null"
								/>
								<span v-else class="w-7" aria-hidden="true" title="Toujours active"></span>
							</span>
						</li>
						<PageRow
							v-else-if="item.kind === 'page'"
							:page="item.page"
							:locked="locked"
							:confirming="confirming === `page:${item.page.path}`"
							@edit="openPage(item.page)"
							@ask-delete="confirming = `page:${item.page.path}`"
							@confirm-delete="removePage(item.page, $event)"
							@cancel-delete="confirming = null"
						>
							<span class="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">lien direct</span>
							<template #handle><DragHandle :disabled="publishLocked" /></template>
							<template #order>
								<OrderArrows
									:label="item.page.title"
									:first="i === 0"
									:last="i === navItems.length - 1"
									:disabled="publishLocked"
									@up="move('racine', navItems.map(navKey), i, -1)"
									@down="move('racine', navItems.map(navKey), i, 1)"
								/>
							</template>
						</PageRow>
						<li v-else>
							<!-- Menu déroulant déplié : la ligne reste grisée. -->
							<div :class="['flex flex-wrap items-center gap-2 py-2.5 pr-4 pl-2 text-sm transition-colors hover:bg-gray-100', { 'bg-gray-100': expanded.has(item.dropdown.folder) }]">
								<DragHandle :disabled="publishLocked" />
								<button
									type="button"
									class="flex items-center gap-2 font-medium text-gray-900 hover:text-primary"
									:aria-expanded="expanded.has(item.dropdown.folder)"
									:aria-controls="`dropdown-pages-${item.dropdown.folder}`"
									@click="toggleDropdown(item.dropdown.folder)"
								>
									{{ item.dropdown.label }}
									<i
										:class="[
											'fa-solid fa-chevron-down text-xs text-gray-400 transition-transform duration-200',
											{ 'rotate-180': expanded.has(item.dropdown.folder) },
										]"
										aria-hidden="true"
									></i>
									<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs ring-1 ring-inset ring-gray-200 font-normal text-gray-600">
										{{ item.dropdown.pages.length }} page{{ item.dropdown.pages.length > 1 ? 's' : '' }}
									</span>
								</button>
								<span class="text-xs text-gray-500">menu déroulant</span>
								<span class="ml-auto flex items-center gap-1">
									<OrderArrows
										:label="item.dropdown.label"
										:first="i === 0"
										:last="i === navItems.length - 1"
										:disabled="publishLocked"
										@up="move('racine', navItems.map(navKey), i, -1)"
										@down="move('racine', navItems.map(navKey), i, 1)"
									/>
									<button
										type="button"
										:class="[iconButtonClass, 'text-primary']"
										:disabled="locked"
										aria-label="Modifier"
										title="Modifier"
										@click="openDropdown(item.dropdown)"
									>
										<i class="fa-solid fa-pen" aria-hidden="true"></i>
									</button>
									<span v-if="item.dropdown.pages.length" class="w-7" aria-hidden="true"></span>
									<template v-if="!item.dropdown.pages.length">
										<ConfirmIconButton
											label="Supprimer"
											title="Supprimer le menu déroulant"
											:confirming="confirming === `dropdown:${item.dropdown.folder}`"
											:disabled="locked"
											deferrable
											@ask="confirming = `dropdown:${item.dropdown.folder}`"
											@confirm="removeDropdown(item.dropdown, $event)"
											@cancel="confirming = null"
										/>
									</template>
								</span>
							</div>
							<div
								:id="`dropdown-pages-${item.dropdown.folder}`"
								:class="[
									'grid transition-[grid-template-rows] duration-200 ease-out',
									expanded.has(item.dropdown.folder) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
								]"
								:inert="!expanded.has(item.dropdown.folder)"
							>
								<div class="min-h-0 overflow-hidden">
									<VueDraggable
										v-bind="sortableProps"
										tag="ul"
										:model-value="dropdownPages(item.dropdown)"
										class="divide-y divide-gray-100"
										@update:model-value="(list: PageSourceView[]) => reorder(`dropdown:${item.dropdown.folder}`, list.map((p) => `page:${p.path}`))"
									>
										<PageRow
											v-for="(p, j) in dropdownPages(item.dropdown)"
											:key="p.path"
											nested
											:page="p"
											:locked="locked"
											:confirming="confirming === `page:${p.path}`"
											@edit="openPage(p)"
											@ask-delete="confirming = `page:${p.path}`"
											@confirm-delete="removePage(p, $event)"
											@cancel-delete="confirming = null"
										>
											<span v-if="!p.menu.show" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs ring-1 ring-inset ring-gray-200 text-gray-600">masquée du menu</span>
											<template #handle><DragHandle :disabled="publishLocked" /></template>
											<template #order>
												<OrderArrows
													:label="p.title"
													:first="j === 0"
													:last="j === item.dropdown.pages.length - 1"
													:disabled="publishLocked"
													@up="move(`dropdown:${item.dropdown.folder}`, dropdownKeys(item.dropdown), j, -1)"
													@down="move(`dropdown:${item.dropdown.folder}`, dropdownKeys(item.dropdown), j, 1)"
												/>
											</template>
										</PageRow>
									</VueDraggable>
									<!-- Hors de la liste déplaçable : SortableJS n'y voit que les pages. -->
									<p
										v-if="!dropdownPages(item.dropdown).some((p) => p.menu.show)"
										:class="['py-2.5 pr-4 pl-8 text-sm font-light text-gray-500', { 'border-t border-gray-100': item.dropdown.pages.length }]"
									>
										{{ item.dropdown.pages.length ? 'Aucune page visible' : 'Aucune page' }} : pas encore affiché sur le site.
									</p>
								</div>
							</div>
						</li>
					</template>
				</VueDraggable>
			</section>

			<!-- 2. Pages libres, 3. pages réservées -->
			<section
				v-for="group in [
					{
						key: 'libre',
						title: 'Pages libres',
						hint: 'hors du menu, accessibles par leur adresse',
						icon: 'fa-file-lines',
						list: freePages,
					},
					{ key: 'reservee', title: 'Pages réservées', hint: 'Espace Admin, connexion requise', icon: 'fa-lock', list: reservedPages },
				]"
				:key="group.key"
				class="overflow-hidden rounded-xl border border-gray-200"
			>
				<header class="flex flex-wrap items-center gap-2 rounded-t-xl border-b border-gray-100 bg-gray-100 px-4 py-2.5">
					<i :class="['fa-solid', group.icon, 'text-gray-400']" aria-hidden="true"></i>
					<span class="font-heading font-semibold text-gray-900">{{ group.title }}</span>
					<span class="text-xs text-gray-500">{{ group.hint }}</span>
				</header>
				<ul class="divide-y divide-gray-100">
					<PageRow
						v-for="p in group.list"
						:key="p.path"
						:page="p"
						:locked="locked"
						:confirming="confirming === `page:${p.path}`"
						@edit="openPage(p)"
						@ask-delete="confirming = `page:${p.path}`"
						@confirm-delete="removePage(p, $event)"
						@cancel-delete="confirming = null"
					>
						<span v-if="group.key === 'reservee'" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs ring-1 ring-inset ring-gray-200 text-gray-600">
							{{ p.access.length ? p.access.join(', ') : 'toute personne connectée' }}
						</span>
					</PageRow>
					<li v-if="!group.list.length" class="px-4 py-2.5 text-sm font-light text-gray-500">Aucune page.</li>
				</ul>
			</section>

			<!-- 4. Bibliothèque : pages du site désactivées -->
			<section class="overflow-hidden rounded-xl border border-dashed border-gray-300">
				<header class="flex flex-wrap items-center gap-2 rounded-t-xl border-b border-gray-100 px-4 py-2.5">
					<i class="fa-solid fa-book-open text-gray-400" aria-hidden="true"></i>
					<span class="font-heading font-semibold text-gray-900">Bibliothèque de pages du site</span>
					<span class="text-xs text-gray-500">pages prêtes à l'emploi, à activer</span>
				</header>
				<ul class="divide-y divide-gray-100">
					<li v-for="p in inactiveSitePages" :key="p.id" class="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100">
						<span class="min-w-0 flex-1">
							<span class="font-medium text-gray-900">{{ p.defaultLabel }}</span>
							<span class="block text-xs font-light text-gray-500">{{ SITE_PAGES.find((d) => d.id === p.id)?.summary }}</span>
						</span>
						<button
							type="button"
							class="bouton bouton-contour bouton-mini"
							:disabled="locked"
							@click="updateSitePage(p, { active: true }, 'Page activée')"
						>
							<i class="fa-solid fa-power-off mr-1" aria-hidden="true"></i>Activer
						</button>
						<button
							type="button"
							class="text-xs font-medium text-primary hover:underline disabled:opacity-50"
							:disabled="locked"
							title="Activer sans publier tout de suite (rejoint les modifications à publier)"
							@click="updateSitePage(p, { active: true }, 'Page activée', true)"
						>
							sans publier
						</button>
					</li>
					<li v-if="!inactiveSitePages.length" class="px-4 py-2.5 text-sm font-light text-gray-500">
						Toutes les pages du site sont actives.
					</li>
				</ul>
			</section>
		</div>
	</template>

	<!-- Page : création / modification -->
	<PageForm
		v-else-if="view.name === 'page'"
		:dropdowns="dropdowns"
		:source="view.source"
		:initial-file="view.file"
		:disabled="locked"
		@published="onPublished"
		@cancel="go({ name: 'list' })"
	/>

	<!-- Page du site : lien et textes -->
	<SitePageForm
		v-else-if="view.name === 'site'"
		:key="view.page.id"
		:page="view.page"
		:home-photo="homePhoto"
		:home-illustration="homeIllustration"
		:disabled="locked"
		@published="onPublished"
		@cancel="go({ name: 'list' })"
	/>

	<!-- Menu déroulant : création / modification -->
	<form v-else-if="view.name === 'dropdown'" class="space-y-4" @submit.prevent="saveDropdown">
		<p class="text-sm font-light text-gray-600">
			Un menu déroulant (comme « Association ») regroupe plusieurs pages sous un même titre du menu.
		</p>
		<div>
			<label for="dropdown-label" class="champ-libelle">Libellé</label>
			<input id="dropdown-label" v-model="dropdownForm.label" type="text" required :class="inputClass" />
		</div>
		<div v-if="!view.dropdown">
			<label for="dropdown-folder" class="champ-libelle">
				Adresse <span class="font-light text-gray-500">(facultative, déduite du libellé)</span>
			</label>
			<input id="dropdown-folder" v-model="dropdownForm.folder" type="text" pattern="[a-z0-9]+(-[a-z0-9]+)*" :class="inputClass" />
			<p class="champ-aide">Début de l'adresse de ses pages. Ne change plus ensuite.</p>
		</div>
		<p v-if="!view.dropdown" class="text-xs font-light text-gray-500">
			Il se place en fin de menu.
		</p>
		<div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<PublishButtons :label="view.dropdown ? 'Enregistrer et publier' : 'Créer et publier'" :disabled="locked" />
			<button type="button" class="text-sm text-gray-600 hover:underline" @click="go({ name: 'list' })">Annuler</button>
		</div>
	</form>
</template>
