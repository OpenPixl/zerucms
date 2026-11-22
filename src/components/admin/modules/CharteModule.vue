<script setup lang="ts">
/**
 * Module « Charte graphique » (bureau : groupe `admin`, menu « Paramètres ») :
 * couleurs, en-tête (logo, bande de couleurs), polices, mode sombre et icône
 * d'onglet, en onglets (`association/BrandForm.vue`, route
 * `/api/admin/charte`). Une seule publication pour tous les onglets, suivie
 * par `usePublication` ; le formulaire est remonté (valeurs relues) après.
 */
import { computed, inject, onMounted, ref } from 'vue';
import PublishStatus from '../PublishStatus.vue';
import { ApiError, brandApi, type BrandSource, type SaveResult } from '../client';
import { ADMIN_CONTEXT, takeModuleToReopen } from '../context';
import { usePublication } from '../usePublication';
import BrandForm from './association/BrandForm.vue';

const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const source = ref<BrandSource | null>(null);
const availability = ref<{ ok: boolean; reason?: string }>({ ok: true });
const loading = ref(true);
const error = ref('');
/** Remonte le formulaire (données relues) après une publication. */
const version = ref(0);
let published = false;

function fail(e: unknown) {
	takeModuleToReopen();
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

async function load() {
	try {
		const res = await brandApi.get();
		source.value = res.source;
		availability.value = res.availability;
		receive(res.status);
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

const { status, following, receive, afterSave, publishLot, savedLabel, dismiss: dismissStatus, reloadIn, cancelReload } = usePublication({
	module: 'charte',
	onSettled: async () => {
		await load();
		if (published) version.value++;
		published = false;
	},
	onError: fail,
});
const locked = computed(() => !availability.value.ok || following.value);

function onPublished(label: string, result: SaveResult) {
	error.value = '';
	published = true;
	afterSave(label, result);
}

onMounted(load);
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

	<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
	<BrandForm v-else-if="source" :key="version" :source="source" :locked="locked" @published="onPublished" />
</template>
