<script setup lang="ts">
/**
 * Module « Annonces » (groupes `redacteur` / `admin`, menu Contenus) :
 * annonces de la bannière en haut du site, telles qu'elles sont dans
 * `src/content/annonces.yaml` (brouillons compris). Création, modification,
 * suppression ; ordre de défilement par glisser-déposer ou flèches ↑/↓,
 * enregistré à part. Chaque modification reconstruit le site (suivi par
 * `usePublication`) ; serveur : `src/lib/annonce-writer.ts`.
 */
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { ANNONCE_DEFAULT_ICON, ANNONCE_TONE_LABELS } from '../../../lib/annonce-options';
import ConfirmIconButton from '../ConfirmIconButton.vue';
import PublishButtons from '../PublishButtons.vue';
import PublishStatus from '../PublishStatus.vue';
import { annoncesApi, ApiError, type AnnonceItem, type SaveResult } from '../client';
import { ADMIN_CONTEXT, iconButtonClass, rememberOpenModule, sortableProps, takeModuleToReopen } from '../context';
import { isDeferredSubmit } from '../lot';
import { takePendingImport } from '../content-import';
import type { Depot } from '../depot';
import { usePublication } from '../usePublication';
import AnnonceForm from './annonces/AnnonceForm.vue';
import { annonceState, frenchDay, type AnnonceState } from './annonces/dates';
import DragHandle from './pages/DragHandle.vue';
import OrderArrows from './pages/OrderArrows.vue';

const { sessionExpired, onCloseRequest } = inject(ADMIN_CONTEXT)!;

type View = { name: 'list' } | { name: 'form'; source: AnnonceItem | null; file?: Depot };

const view = ref<View>({ name: 'list' });
const annonces = ref<AnnonceItem[]>([]);
const availability = ref<{ ok: boolean; reason?: string }>({ ok: true });
const loading = ref(true);
const busy = ref(false);
const error = ref('');
/** Annonce dont la suppression attend confirmation. */
const confirming = ref<string | null>(null);

function fail(e: unknown) {
	takeModuleToReopen(); // l'enregistrement a échoué : pas de réouverture au prochain chargement
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

async function load() {
	loading.value = true;
	try {
		const res = await annoncesApi.list();
		annonces.value = res.annonces;
		orderDraft.value = null;
		availability.value = res.availability;
		receive(res.status);
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

const { status, following, receive, afterSave, publishLot, savedLabel, dismiss: dismissStatus, reloadIn, cancelReload } = usePublication({
	module: 'annonces',
	onSettled: () => load(),
	onError: fail,
});
const publishLocked = computed(() => !availability.value.ok || following.value || busy.value);

/** Ordre changé (glisser-déposer, flèches), pas encore enregistré : identifiants. */
const orderDraft = ref<string[] | null>(null);
const locked = computed(() => publishLocked.value || orderDraft.value !== null);
const shown = computed(() => {
	const draft = orderDraft.value;
	return draft ? [...annonces.value].sort((a, b) => draft.indexOf(a.id) - draft.indexOf(b.id)) : annonces.value;
});
function move(index: number, delta: -1 | 1) {
	const next = shown.value.map((a) => a.id);
	[next[index], next[index + delta]] = [next[index + delta], next[index]];
	orderDraft.value = next;
}
function reorder(list: AnnonceItem[]) {
	orderDraft.value = list.map((a) => a.id);
}

async function saveOrder(event: Event) {
	if (!orderDraft.value) return;
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('annonces');
		const result = await annoncesApi.saveOrder(orderDraft.value, { deferred: isDeferredSubmit(event) });
		afterSave('Nouvel ordre des annonces', result);
		orderDraft.value = null;
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

function go(next: View) {
	error.value = '';
	confirming.value = null;
	view.value = next;
}

function onPublished(label: string, result: SaveResult) {
	go({ name: 'list' });
	afterSave(label, result);
}

async function remove(a: AnnonceItem, deferred: boolean) {
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('annonces');
		const result = await annoncesApi.remove(a.id, { deferred });
		confirming.value = null;
		afterSave(`Suppression de l'annonce : ${a.title}`, result);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

// ✕ / Échap depuis le formulaire : retour à la liste plutôt que fermeture du panneau.
const stopCloseRequest = onCloseRequest(() => {
	if (view.value.name === 'list') return false;
	go({ name: 'list' });
	return true;
});
onBeforeUnmount(stopCloseRequest);
onMounted(async () => {
	// Fichier déposé dans « Ajouter un contenu » (menu Contenus) : création pré-remplie.
	const pending = takePendingImport('annonce');
	await load();
	if (pending) go({ name: 'form', source: null, file: pending });
});

const STATES: Record<AnnonceState, { label: string; className: string }> = {
	'en-cours': { label: 'en ligne', className: 'bg-green-50 text-green-800' },
	'a-venir': { label: 'à venir', className: 'bg-sky-50 text-sky-800' },
	terminee: { label: 'terminée', className: 'bg-gray-100 text-gray-600' },
	brouillon: { label: 'brouillon', className: 'bg-amber-50 text-amber-800' },
};
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
	<p v-if="!availability.ok" class="mb-4 alerte-attention">{{ availability.reason }}</p>
	<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>

	<template v-if="view.name === 'list'">
		<div class="mb-5 flex flex-wrap gap-3">
			<button type="button" class="bouton bouton-primaire" :disabled="locked" @click="go({ name: 'form', source: null })">
				<i class="fa-solid fa-plus mr-1.5" aria-hidden="true"></i>Nouvelle annonce
			</button>
		</div>

		<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
		<div v-else class="space-y-4">
			<form
				v-if="orderDraft"
				class="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200"
				role="status"
				@submit.prevent="saveOrder"
			>
				<i class="fa-solid fa-arrows-up-down" aria-hidden="true"></i>
				<span class="min-w-0 flex-1">Nouvel ordre de défilement, pas encore enregistré.</span>
				<PublishButtons compact :disabled="publishLocked" />
				<button type="button" class="text-xs font-medium text-gray-700 hover:underline" @click="orderDraft = null">Annuler</button>
			</form>

			<p v-if="!annonces.length" class="text-sm font-light text-gray-500">
				Aucune annonce. Une annonce s'affiche en bannière au-dessus du menu, sur toutes les pages, pendant sa période.
			</p>
			<div v-else class="overflow-hidden rounded-xl border border-gray-200">
				<p class="border-b border-gray-100 bg-gray-100 px-4 py-2 text-xs text-gray-500">Dans l'ordre de défilement de la bannière</p>
				<VueDraggable v-bind="sortableProps" tag="ul" :model-value="shown" class="divide-y divide-gray-100" @update:model-value="reorder">
					<li v-for="(a, i) in shown" :key="a.id" class="flex items-center gap-2 py-2.5 pr-4 pl-2 text-sm transition-colors hover:bg-gray-100">
						<DragHandle :disabled="publishLocked" />
						<span
							:class="['flex h-8 w-8 shrink-0 items-center justify-center rounded-full', ANNONCE_TONE_LABELS[a.tone].className]"
							:title="ANNONCE_TONE_LABELS[a.tone].label"
							aria-hidden="true"
						>
							<i :class="['fa-solid', a.icon || ANNONCE_DEFAULT_ICON, 'text-xs']"></i>
						</span>
						<span class="min-w-0">
							<button
								type="button"
								:class="['block max-w-full truncate text-left font-medium text-gray-900 hover:text-primary disabled:cursor-default disabled:hover:text-gray-900', { 'opacity-60': annonceState(a) !== 'en-cours' }]"
								:disabled="locked"
								:title="`Modifier « ${a.title} »`"
								@click="go({ name: 'form', source: a })"
							>
								{{ a.title }}
							</button>
							<span class="block text-xs font-light text-gray-500">du {{ frenchDay(a.startDate) }} au {{ frenchDay(a.endDate) }}</span>
						</span>
						<span :class="['shrink-0 rounded-full px-2 py-0.5 text-xs', STATES[annonceState(a)].className]">{{ STATES[annonceState(a)].label }}</span>
						<span class="ml-auto flex shrink-0 items-center gap-1">
							<OrderArrows
								:label="a.title"
								:first="i === 0"
								:last="i === shown.length - 1"
								:disabled="publishLocked"
								@up="move(i, -1)"
								@down="move(i, 1)"
							/>
							<button
								type="button"
								:class="[iconButtonClass, 'text-primary']"
								:disabled="locked"
								aria-label="Modifier"
								title="Modifier"
								@click="go({ name: 'form', source: a })"
							>
								<i class="fa-solid fa-pen" aria-hidden="true"></i>
							</button>
							<ConfirmIconButton
								label="Supprimer"
								title="Supprimer l'annonce"
								:confirming="confirming === a.id"
								:disabled="locked"
								deferrable
								@ask="confirming = a.id"
								@confirm="remove(a, $event)"
								@cancel="confirming = null"
							/>
						</span>
					</li>
				</VueDraggable>
			</div>
		</div>
	</template>

	<AnnonceForm v-else :source="view.source" :initial-file="view.file" :disabled="locked" @published="onPublished" @cancel="go({ name: 'list' })" />
</template>
