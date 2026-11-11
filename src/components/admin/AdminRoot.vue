<script setup lang="ts">
/**
 * Racine de l'Espace Admin, montée par `mount.ts` (jamais pour un simple
 * visiteur, cf. `AdminLoader.astro`) :
 *  - personne connectée → barre fixe en haut + modules en panneau latéral ;
 *  - sinon → modale de connexion à la demande (`numerik:auth-open`).
 * Connexion et déconnexion rechargent la page : les pages réservées et le
 * contenu rendu côté serveur reflètent ainsi le nouvel état.
 * Menu « Contenus » : premier bouton « Ajouter un contenu » → modale
 * `ContentImportModal` puis module du type de contenu, formulaire pré-rempli.
 * Bouton « À publier (N) » de la barre (rédaction, bureau) : modifications
 * enregistrées sans publier (`lot.ts`), à publier en une fois ou à annuler.
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue';
import AdminOverlay from './AdminOverlay.vue';
import LoginForm from './LoginForm.vue';
import { hasAdminRights } from '../../lib/auth/groups';
import type { ModelVersionInfo } from '../../lib/model-version';
import { ApiError, authApi, installationApi, lotApi, versionApi, type AdminUser, type ReservedPage } from './client';
import { CONTENT_KIND_IDS, CONTENT_KINDS } from './content-import';
import { ADMIN_CONTEXT, takeModuleToReopen } from './context';
import { loadLot, lot, publishing } from './lot';
import { chargerMaintenance, enMaintenance } from './maintenance';
import { barEntries, modulesFor } from './modules';
import { usePublication } from './usePublication';

// Chargés à la demande (mot de passe provisoire, ajout par fichier .md), comme dans le registre des modules.
const PasswordModule = defineAsyncComponent(() => import('./modules/PasswordModule.vue'));
const ContentImportModal = defineAsyncComponent(() => import('./ContentImportModal.vue'));

const props = defineProps<{ openOnMount?: boolean }>();

const user = ref<AdminUser | null>(null);
const pages = ref<ReservedPage[]>([]);
const loginOpen = ref(false);
const activeId = ref<string | null>(null);

/**
 * Mode du serveur, affiché dans la barre : en développement (`astro dev`), le
 * contenu est relu à chaud et les publications ne reconstruisent pas le site.
 */
const isDev = import.meta.env.DEV;

/**
 * Version du modèle (bureau seulement) : badge « mise à jour disponible »
 * quand une version plus récente est publiée (`src/lib/model-version.ts`).
 * Simple information, jamais bloquante.
 */
const version = ref<ModelVersionInfo | null>(null);
async function loadVersion() {
	if (!user.value || !hasAdminRights(user.value.groups) || mustChangePassword.value) return;
	try {
		version.value = await versionApi.get();
	} catch {
		version.value = null;
	}
}

/**
 * Assistant d'installation (super admin, site neuf) : ouvert d'office tant
 * qu'il n'est pas fait, sauf « Plus tard » (jusqu'à la fermeture de l'onglet) ;
 * repris depuis le module « Site » (évènement `numerik:installation`).
 */
const InstallationWizard = defineAsyncComponent(() => import('./InstallationWizard.vue'));
const installationOuverte = ref(false);
const PLUS_TARD = 'numerik-installation-plus-tard';
async function verifierInstallation() {
	if (!user.value?.groups.includes('superadmin') || mustChangePassword.value) return;
	try {
		if (sessionStorage.getItem(PLUS_TARD)) return;
	} catch {
		// sessionStorage indisponible : on propose l'assistant.
	}
	try {
		installationOuverte.value = (await installationApi.requise()).requise;
	} catch {
		// Information seulement.
	}
}
function installationPlusTard() {
	installationOuverte.value = false;
	try {
		sessionStorage.setItem(PLUS_TARD, '1');
	} catch {
		// Rien à garder.
	}
}
const ouvrirInstallation = () => {
	activeId.value = null;
	installationOuverte.value = true;
};

/** Mot de passe provisoire : rien d'autre n'est accessible avant de l'avoir changé. */
const mustChangePassword = computed(() => Boolean(user.value?.mustChangePassword));
const modules = computed(() => (user.value && !mustChangePassword.value ? modulesFor(user.value.groups) : []));
const activeModule = computed(() => modules.value.find((m) => m.id === activeId.value) ?? null);
const barModules = computed(() => modules.value.filter((m) => m.placement !== 'user'));
const bar = computed(() => barEntries(modules.value));
const userModules = computed(() => modules.value.filter((m) => m.placement === 'user'));

/**
 * Menu déroulant ouvert : `user` (menu du nom : modules personnels + déconnexion) ou l'id d'un menu de
 * la barre (`ADMIN_MENUS`). Un seul à la fois ; clic ailleurs ou Échap le referme.
 */
const openMenu = ref<string | null>(null);
/** Sous-liens d'un menu de la barre : sous son bouton, hors de la `<nav>` qui défile (elle les rognerait). */
const menuLeft = ref(0);
const openBarMenu = computed(() => bar.value.find((e) => e.kind === 'menu' && e.id === openMenu.value) ?? null);
function toggleBarMenu(id: string, event: MouseEvent) {
	menuLeft.value = (event.currentTarget as HTMLElement).getBoundingClientRect().left;
	openMenu.value = openMenu.value === id ? null : id;
}
function openModuleFromMenu(id: string) {
	openMenu.value = null;
	activeId.value = id;
}

/**
 * « Ajouter un contenu » : premier bouton du menu « Contenus », modale
 * centrée (`ContentImportModal`) qui ouvre ensuite le module du type de
 * contenu lu dans le fichier, formulaire de création pré-rempli.
 */
const importOpen = ref(false);
const importKinds = computed(() => CONTENT_KIND_IDS.filter((k) => modules.value.some((m) => m.id === CONTENT_KINDS[k].module)));
function openImport() {
	openMenu.value = null;
	activeId.value = null; // un seul calque à la fois
	importOpen.value = true;
}
async function onImportOpen(moduleId: string) {
	importOpen.value = false;
	// Module déjà ouvert : on le remonte pour qu'il prenne le fichier.
	activeId.value = null;
	await nextTick();
	activeId.value = moduleId;
}
function onDocumentClick(e: MouseEvent) {
	if (openMenu.value && !(e.target as Element).closest?.('[data-bar-menu]')) openMenu.value = null;
}
function onDocumentKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape') openMenu.value = null;
}

/**
 * Modifications en attente (rédaction et bureau, comme `/api/admin/publication`) :
 * publiées depuis la barre, la page se recharge ensuite sur le module ouvert.
 */
const canPublishLot = computed(
	() => Boolean(user.value) && !mustChangePassword.value && (hasAdminRights(user.value!.groups) || user.value!.groups.includes('redacteur')),
);
const lotError = ref('');
const confirmingCancel = ref(false);
const lotBusy = ref(false);
const barPublication = usePublication({
	module: () => activeId.value,
	onSettled: () => {},
	onError: (e) => {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		lotError.value = (e as Error).message;
		openMenu.value = 'lot';
	},
});
watch(barPublication.status, (s) => {
	if (s.state === 'failed' && !barPublication.following.value) {
		lotError.value = s.message ?? 'La publication a échoué.';
		openMenu.value = 'lot';
	}
});
function toggleLotMenu() {
	lotError.value = '';
	confirmingCancel.value = false;
	openMenu.value = openMenu.value === 'lot' ? null : 'lot';
	if (openMenu.value === 'lot') void loadLot();
}
async function publishLotFromBar() {
	lotError.value = '';
	openMenu.value = null;
	await barPublication.publishLot();
}
async function cancelLot() {
	lotError.value = '';
	lotBusy.value = true;
	try {
		await lotApi.cancel();
		// Sources remises en l'état : on recharge pour retrouver modules et page à jour.
		reload();
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		lotError.value = (e as Error).message;
	} finally {
		lotBusy.value = false;
	}
}
const formatTime = (iso: string) =>
	new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function sessionExpired() {
	user.value = null;
	activeId.value = null;
	loginOpen.value = true;
}
/** Interception de la fermeture par le module ouvert (cf. `AdminContext.onCloseRequest`). */
const closeHandler = shallowRef<(() => boolean) | null>(null);
function onCloseRequest(handler: () => boolean) {
	closeHandler.value = handler;
	return () => {
		if (closeHandler.value === handler) closeHandler.value = null;
	};
}
function closeModule() {
	if (closeHandler.value?.()) return;
	activeId.value = null;
}

provide(ADMIN_CONTEXT, { user, pages, sessionExpired, onCloseRequest });

/** Lien « Espace Admin » : connexion, ou premier module si déjà connecté·e. */
function open() {
	if (user.value) activeId.value = barModules.value[0]?.id ?? null;
	else loginOpen.value = true;
}

function reload() {
	window.location.reload();
}

async function logout() {
	try {
		await authApi.logout();
	} finally {
		reload();
	}
}

watch(user, (u) => document.documentElement.classList.toggle('has-admin-bar', Boolean(u)));

onMounted(async () => {
	window.addEventListener('numerik:auth-open', open);
	window.addEventListener('numerik:installation', ouvrirInstallation);
	document.addEventListener('click', onDocumentClick);
	document.addEventListener('keydown', onDocumentKeydown);
	if (document.cookie.split('; ').includes('numerik_connecte=1')) {
		try {
			const me = await authApi.me();
			user.value = me.user;
			pages.value = me.pages;
			lot.value = me.lot;
		} catch (e) {
			if (!(e instanceof ApiError && e.status === 401)) console.error(e);
			user.value = null;
		}
	}
	// `AdminLoader.astro` a pu poser la classe d'avance (indicateur présent) : on la confirme ou on la retire.
	document.documentElement.classList.toggle('has-admin-bar', Boolean(user.value));
	void loadVersion();
	if (user.value) void chargerMaintenance();
	void verifierInstallation();
	if (props.openOnMount) open();
	// Rechargement après une publication (fin de publication réussie, ou Vite en dev) : on rouvre le module.
	const reopen = takeModuleToReopen();
	if (reopen && modules.value.some((m) => m.id === reopen)) activeId.value = reopen;
});

onBeforeUnmount(() => {
	window.removeEventListener('numerik:auth-open', open);
	window.removeEventListener('numerik:installation', ouvrirInstallation);
	document.removeEventListener('click', onDocumentClick);
	document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
	<!-- Au-dessus des calques (z-[70]) : la barre reste cliquable, module ouvert ou non. -->
	<div v-if="user" class="fixed inset-x-0 top-0 z-[80] h-10 bg-gray-900 text-sm text-white shadow">
		<div class="flex h-full w-full items-center gap-1 px-2 sm:px-4">
			<span class="mr-6 hidden shrink-0 items-center gap-2 font-heading font-semibold md:flex">
				<i class="fa-solid fa-gear text-gray-400" aria-hidden="true"></i>
				Espace Admin
			</span>
			<nav class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Modules d'administration">
				<template v-for="entry in bar" :key="entry.kind === 'menu' ? `menu:${entry.id}` : entry.module.id">
					<button
						v-if="entry.kind === 'module'"
						type="button"
						class="flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 hover:bg-white/10"
						:class="activeId === entry.module.id ? 'bg-white/15' : ''"
						:aria-pressed="activeId === entry.module.id"
						:title="entry.module.label"
						@click="activeId = activeId === entry.module.id ? null : entry.module.id"
					>
						<i :class="['fa-solid', entry.module.icon, 'text-gray-300']" aria-hidden="true"></i>
						<span class="hidden sm:inline">{{ entry.module.label }}</span>
					</button>
					<!-- Menu déroulant (ex. « Contenus ») : en surbrillance quand l'un de ses modules est ouvert. -->
					<button
						v-else
						type="button"
						data-bar-menu
						class="flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 hover:bg-white/10"
						:class="openMenu === entry.id || entry.modules.some((m) => m.id === activeId) ? 'bg-white/15' : ''"
						aria-haspopup="menu"
						:aria-expanded="openMenu === entry.id"
						:title="`${entry.label} : ${entry.modules.map((m) => m.label).join(', ')}`"
						@click="toggleBarMenu(entry.id, $event)"
					>
						<i :class="['fa-solid', entry.icon, 'text-gray-300']" aria-hidden="true"></i>
						<span class="hidden sm:inline">{{ entry.label }}</span>
						<i class="fa-solid fa-chevron-down text-[0.65rem] transition-transform" :class="openMenu === entry.id ? 'rotate-180' : ''" aria-hidden="true"></i>
					</button>
				</template>
			</nav>
			<div
				v-if="openBarMenu?.kind === 'menu'"
				data-bar-menu
				class="fixed top-[2.625rem] flex max-w-[calc(100vw-1rem)] items-stretch gap-1 overflow-x-auto whitespace-nowrap rounded-md bg-gray-900 p-1 shadow-lg ring-1 ring-white/10"
				:style="{ left: `${Math.max(8, menuLeft)}px` }"
				role="menu"
				aria-orientation="horizontal"
				:aria-label="openBarMenu.label"
			>
				<template v-if="openBarMenu.id === 'contenu' && importKinds.length">
					<button
						type="button"
						role="menuitem"
						class="flex items-center gap-2 rounded bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary/80"
						title="Créer une page, une activité, une actualité ou une annonce à partir d'un fichier .md"
						@click="openImport"
					>
						<i class="fa-solid fa-file-import w-4 text-center" aria-hidden="true"></i>
						Ajouter un contenu
					</button>
					<div class="my-1 border-l border-white/15" aria-hidden="true"></div>
				</template>
				<button
					v-for="m in openBarMenu.modules"
					:key="m.id"
					type="button"
					role="menuitem"
					class="flex items-center gap-2 rounded px-3 py-1.5 hover:bg-white/10"
					:class="activeId === m.id ? 'bg-white/15' : ''"
					@click="openModuleFromMenu(m.id)"
				>
					<i :class="['fa-solid', m.icon, 'w-4 text-center text-gray-300']" aria-hidden="true"></i>
					{{ m.label }}
				</button>
			</div>
			<div v-if="canPublishLot && (lot.length || publishing)" data-bar-menu class="relative ml-1 shrink-0">
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-80"
					:disabled="publishing"
					aria-haspopup="dialog"
					:aria-expanded="openMenu === 'lot'"
					:title="publishing ? 'Publication en cours' : `${lot.length} modification(s) enregistrée(s), pas encore publiée(s)`"
					@click="toggleLotMenu"
				>
					<template v-if="publishing">
						<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
						<span v-if="barPublication.reloadIn.value != null" class="hidden sm:inline">Publié, actualisation…</span>
						<span v-else class="hidden sm:inline">Publication…</span>
					</template>
					<template v-else>
						<i class="fa-solid fa-clock" aria-hidden="true"></i>
						<span class="hidden sm:inline">À publier</span>
						<span>({{ lot.length }})</span>
					</template>
				</button>
				<div
					v-if="openMenu === 'lot'"
					class="fixed right-2 top-[2.625rem] w-[min(24rem,calc(100vw-1rem))] rounded-lg bg-white p-4 text-sm text-gray-800 shadow-lg ring-1 ring-black/10"
					role="dialog"
					aria-label="Modifications en attente de publication"
				>
					<p class="font-heading font-semibold text-gray-900">Modifications en attente de publication</p>
					<p class="mt-1 text-xs font-light text-gray-600">
						Enregistrées mais pas encore visibles sur le site. Une seule reconstruction (environ une minute) les publie
						toutes.
					</p>
					<p v-if="lotError" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{{ lotError }}</p>
					<ul v-if="lot.length" class="mt-3 max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
						<li v-for="change in lot" :key="change.at + change.label" class="px-3 py-2">
							<a v-if="change.href" :href="change.href" class="block truncate font-medium text-gray-900 hover:text-primary">{{ change.label }}</a>
							<span v-else class="block truncate font-medium text-gray-900">{{ change.label }}</span>
							<span class="block text-xs font-light text-gray-500">
								{{ formatTime(change.at) }}<template v-if="change.by"> · {{ change.by.fullname }}</template>
							</span>
						</li>
					</ul>
					<p v-else class="mt-3 text-xs font-light text-gray-500">Plus rien en attente.</p>
					<div v-if="lot.length" class="mt-4 flex flex-wrap items-center gap-3">
						<button
							type="button"
							class="bouton bouton-primaire bouton-mini"
							:disabled="lotBusy || publishing"
							@click="publishLotFromBar"
						>
							<i class="fa-solid fa-rocket mr-1.5" aria-hidden="true"></i>Publier les modifications ({{ lot.length }})
						</button>
						<button
							v-if="!confirmingCancel"
							type="button"
							class="text-xs font-medium text-red-700 hover:underline"
							:disabled="lotBusy || publishing"
							@click="confirmingCancel = true"
						>
							Tout annuler…
						</button>
					</div>
					<div v-if="confirmingCancel && lot.length" class="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800" role="alert">
						<p>
							Les {{ lot.length }} modification{{ lot.length > 1 ? 's' : '' }} ci-dessus seront défaite{{ lot.length > 1 ? 's' : '' }}
							(contenu remis dans l'état du site en ligne). Action définitive.
						</p>
						<div class="mt-2 flex items-center gap-3">
							<button
								type="button"
								class="rounded bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
								:disabled="lotBusy"
								@click="cancelLot"
							>
								Oui, tout annuler
							</button>
							<button type="button" class="text-gray-700 hover:underline" @click="confirmingCancel = false">Non</button>
						</div>
					</div>
				</div>
			</div>
			<button
				v-if="enMaintenance"
				type="button"
				class="ml-1 shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-400"
				title="Le site est en maintenance : les visiteurs voient la page de maintenance, les membres connectés voient le site. Cliquer pour gérer."
				@click="modules.some((m) => m.id === 'site') ? (activeId = 'site') : undefined"
			>
				<i class="fa-solid fa-screwdriver-wrench mr-1" aria-hidden="true"></i><span class="hidden sm:inline">Maintenance</span>
			</button>
			<a
				v-if="version?.updateAvailable"
				:href="version.url ?? undefined"
				target="_blank"
				rel="noopener"
				class="ml-1 shrink-0 rounded-full bg-sky-400 px-2 py-0.5 text-xs font-semibold text-sky-950 hover:bg-sky-300"
				:title="`Version ${version.latest} disponible (site en version ${version.current}). Sur le serveur : ./update.sh — cliquer pour voir les nouveautés.`"
			>
				<i class="fa-solid fa-circle-arrow-up mr-1" aria-hidden="true"></i><span class="hidden sm:inline">Mise à jour {{ version.latest }}</span><span class="sm:hidden">{{ version.latest }}</span>
			</a>
			<span
				v-if="isDev"
				class="ml-1 shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-amber-950"
				title="Serveur de développement : les modifications sont visibles aussitôt, sans reconstruction du site."
			>
				<i class="fa-solid fa-flask mr-1" aria-hidden="true"></i><span class="hidden sm:inline">Développement</span><span class="sm:hidden">Dév.</span><span v-if="version" class="ml-1 font-normal opacity-80">v{{ version.current }}</span>
			</span>
			<span
				v-else
				class="ml-1 shrink-0 rounded-full bg-green-400 px-2 py-0.5 text-xs font-semibold text-green-950"
				:title="`Serveur de production : chaque publication reconstruit le site.${version ? ` Version ${version.current}.` : ''}`"
			>
				<i class="fa-solid fa-server mr-1" aria-hidden="true"></i><span class="hidden sm:inline">Production</span><span class="sm:hidden">Prod.</span><span v-if="version" class="ml-1 font-normal opacity-80">v{{ version.current }}</span>
			</span>
			<div data-bar-menu class="relative ml-1 shrink-0">
				<button
					type="button"
					class="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
					:class="openMenu === 'user' ? 'bg-white/15 text-white' : ''"
					aria-haspopup="menu"
					:aria-expanded="openMenu === 'user'"
					:title="user.fullname"
					@click="openMenu = openMenu === 'user' ? null : 'user'"
				>
					<i class="fa-solid fa-circle-user" aria-hidden="true"></i>
					<span class="hidden max-w-[12rem] truncate sm:inline">{{ user.fullname }}</span>
					<i class="fa-solid fa-chevron-down text-[0.65rem] transition-transform" :class="openMenu === 'user' ? 'rotate-180' : ''" aria-hidden="true"></i>
				</button>
				<div
					v-if="openMenu === 'user'"
					class="absolute right-0 top-full mt-1.5 flex items-stretch gap-1 overflow-hidden whitespace-nowrap rounded-md bg-gray-900 p-1 shadow-lg ring-1 ring-white/10"
					role="menu"
					aria-orientation="horizontal"
				>
					<button
						v-for="m in userModules"
						:key="m.id"
						type="button"
						role="menuitem"
						class="flex items-center gap-2 rounded px-3 py-1.5 hover:bg-white/10"
						:class="activeId === m.id ? 'bg-white/15' : ''"
						@click="openModuleFromMenu(m.id)"
					>
						<i :class="['fa-solid', m.icon, 'w-4 text-center text-gray-300']" aria-hidden="true"></i>
						{{ m.label }}
					</button>
					<div v-if="userModules.length" class="my-1 border-l border-white/15" aria-hidden="true"></div>
					<button
						type="button"
						role="menuitem"
						class="flex items-center gap-2 rounded px-3 py-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
						@click="logout"
					>
						<i class="fa-solid fa-right-from-bracket w-4 text-center" aria-hidden="true"></i>
						Déconnexion
					</button>
				</div>
			</div>
		</div>
	</div>

	<AdminOverlay v-if="activeModule" :key="activeModule.id" :title="activeModule.label" @close="closeModule">
		<component :is="activeModule.component" v-bind="activeModule.props" />
	</AdminOverlay>

	<AdminOverlay v-if="importOpen" title="Ajouter un contenu à partir d'un fichier .md" variant="modal" wide @close="importOpen = false">
		<ContentImportModal :kinds="importKinds" @open="onImportOpen" />
	</AdminOverlay>

	<AdminOverlay v-if="mustChangePassword" title="Choisissez votre mot de passe" variant="modal" :closable="false">
		<PasswordModule forced @done="reload" />
		<button type="button" class="mt-4 w-full text-center text-xs text-gray-500 underline hover:text-gray-900" @click="logout">
			Me déconnecter
		</button>
	</AdminOverlay>

	<AdminOverlay v-if="installationOuverte && user && !mustChangePassword" title="Installation du site" variant="modal" wide opaque @close="installationPlusTard">
		<InstallationWizard @later="installationPlusTard" @done="reload" />
	</AdminOverlay>

	<AdminOverlay v-if="loginOpen && !user" title="Espace Admin" variant="modal" @close="loginOpen = false">
		<LoginForm @success="reload" />
	</AdminOverlay>
</template>
