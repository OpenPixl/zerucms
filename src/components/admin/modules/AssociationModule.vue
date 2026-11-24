<script setup lang="ts">
/**
 * Module « Association » / « Entreprise » (bureau : groupe `admin`) : nom,
 * coordonnées, réseaux sociaux, mentions légales (`association.yaml`,
 * `association/GeneralForm.vue`). S'enregistre et reconstruit le site (suivi
 * par `usePublication`), ou rejoint les modifications en attente. La charte
 * graphique a son propre module (`CharteModule.vue`).
 */
import { computed, inject, onMounted, ref } from 'vue';
import type { Association } from '../../../lib/association';
import PublishStatus from '../PublishStatus.vue';
import { ApiError, associationApi, type SaveResult } from '../client';
import { ADMIN_CONTEXT, takeModuleToReopen } from '../context';
import { usePublication } from '../usePublication';
import GeneralForm from './association/GeneralForm.vue';

const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const association = ref<Association | null>(null);
const availability = ref<{ ok: boolean; reason?: string }>({ ok: true });
const loading = ref(true);
const error = ref('');
/** Remonte le formulaire (données relues) après sa publication. */
const version = ref(0);
let published = false;

function fail(e: unknown) {
	takeModuleToReopen();
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

async function load() {
	try {
		const res = await associationApi.get();
		association.value = res.association;
		availability.value = res.availability;
		receive(res.status);
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

const { status, following, receive, afterSave, publishLot, savedLabel, dismiss: dismissStatus, reloadIn, cancelReload } = usePublication({
	module: 'association',
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
	<p v-if="!availability.ok" class="mb-4 text-sm text-gray-500"><i class="fa-solid fa-lock mr-1" aria-hidden="true"></i>{{ availability.reason }}</p>
	<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>

	<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
	<GeneralForm v-else-if="association" :key="version" :source="association" :locked="locked" @published="onPublished" />
</template>
