<script setup lang="ts">
/**
 * Module « Sauvegardes » (bureau ; restauration : super admin seul), façon
 * Grav : archives ZIP de ce qui appartient à l'association — `src/content/`
 * + `extensions/` + comptes et journal de l'Espace Admin — rangées sur le serveur
 * (`<DATA_DIR>/sauvegardes/`). Créer, télécharger, déposer une archive venue
 * d'ailleurs, supprimer, restaurer (remplace tout puis republie le site ;
 * l'état courant est sauvegardé d'abord). Serveur : `scripts/sauvegarde.mjs`
 * (aussi `./sauvegarde.sh` / `./restauration.sh` sur le serveur).
 */
import { computed, inject, onMounted, ref } from 'vue';
import ConfirmIconButton from '../ConfirmIconButton.vue';
import PublishStatus from '../PublishStatus.vue';
import { ApiError, sauvegardesApi, type SauvegardeItem } from '../client';
import { ADMIN_CONTEXT, iconButtonClass, inputClass, rememberOpenModule, takeModuleToReopen } from '../context';
import { usePublication } from '../usePublication';

const { user, sessionExpired } = inject(ADMIN_CONTEXT)!;
const superadmin = computed(() => Boolean(user.value?.groups.includes('superadmin')));

const sauvegardes = ref<SauvegardeItem[]>([]);
/** Raison qui empêche de restaurer maintenant (publication, lot en attente), sinon `null`. */
const restaurationBloquee = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const motif = ref('');
/** Archive dont la suppression attend confirmation. */
const confirming = ref<string | null>(null);
/** Archive dont la restauration attend confirmation. */
const restoring = ref<string | null>(null);
const dragOver = ref(false);
/** Super admin : une archive déposée est restaurée aussitôt (migration d'un site). */
const restaurerAuDepot = ref(true);
const restaurerDirectement = computed(() => superadmin.value && restaurerAuDepot.value && !restaurationBloquee.value);

function fail(e: unknown) {
	takeModuleToReopen();
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

async function load() {
	loading.value = true;
	try {
		const res = await sauvegardesApi.list();
		sauvegardes.value = res.sauvegardes;
		restaurationBloquee.value = res.restauration;
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

const { status, following, afterSave, publishLot, savedLabel, dismiss, reloadIn, cancelReload } = usePublication({
	module: 'sauvegardes',
	onSettled: () => load(),
	onError: fail,
});
const locked = computed(() => busy.value || following.value);

async function act(action: () => Promise<void>) {
	error.value = '';
	notice.value = '';
	busy.value = true;
	try {
		await action();
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

const create = () =>
	act(async () => {
		const { nom } = await sauvegardesApi.create(motif.value);
		motif.value = '';
		notice.value = `Sauvegarde créée : ${nom}. Téléchargez-la pour en garder une copie hors du serveur.`;
		await load();
	});

const upload = (file: File | undefined) =>
	file &&
	act(async () => {
		if (!/\.zip$/i.test(file.name)) throw new Error('Choisissez un fichier .zip créé par une sauvegarde du site.');
		const auDepot = restaurerDirectement.value;
		const { nom } = await sauvegardesApi.upload(file);
		if (auDepot) return lancerRestauration(nom);
		notice.value = `Archive déposée : ${nom}. Rien n'est restauré tant que vous ne cliquez pas sur « Restaurer ».`;
		await load();
	});

function onPick(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = '';
	void upload(file);
}
function onDrop(event: DragEvent) {
	dragOver.value = false;
	void upload(event.dataTransfer?.files?.[0]);
}

const remove = (s: SauvegardeItem) =>
	act(async () => {
		await sauvegardesApi.remove(s.nom);
		confirming.value = null;
		await load();
	});

/** Restaure puis, en production, rejoint la page de maintenance (barre de progression) jusqu'au retour du site. */
async function lancerRestauration(nom: string) {
	rememberOpenModule('sauvegardes');
	const result = await sauvegardesApi.restore(nom);
	restoring.value = null;
	if (result.maintenance) {
		window.location.assign('/');
		return;
	}
	afterSave(`Restauration : ${nom}`, result);
}

const restore = (s: SauvegardeItem) => act(() => lancerRestauration(s.nom));

onMounted(load);

const dateFr = (iso: string) =>
	new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const taille = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
</script>

<template>
	<PublishStatus
		:status="status"
		:following="following"
		:reload-in="reloadIn"
		:saved-label="savedLabel"
		:locked="locked"
		@dismiss="dismiss"
		@cancel-reload="cancelReload"
		@publish-lot="publishLot"
	/>
	<p class="mb-4 text-sm font-light text-gray-600">
		Une sauvegarde est une archive <strong>.zip</strong> de tout ce qui appartient à l'association : contenu du site (pages,
		actualités, activités, images, réglages), extensions installées et comptes + journal de l'Espace Admin. Les secrets du serveur (fichier
		<code>.env</code>) n'y sont jamais. Gardez-en une copie hors du serveur.
	</p>
	<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>
	<p v-if="notice" class="mb-4 alerte-succes" role="status">{{ notice }}</p>

	<!-- Créer -->
	<form class="mb-4 flex flex-wrap items-end gap-2" @submit.prevent="create">
		<div class="min-w-0 flex-1">
			<label for="sauvegarde-motif" class="champ-libelle">Motif <span class="font-light text-gray-500">(facultatif)</span></label>
			<input id="sauvegarde-motif" v-model="motif" type="text" maxlength="80" placeholder="ex. avant la mise à jour" :class="inputClass" />
		</div>
		<button type="submit" class="bouton bouton-primaire" :disabled="locked">
			<i class="fa-solid fa-box-archive mr-1.5" aria-hidden="true"></i>Créer une sauvegarde
		</button>
	</form>

	<!-- Déposer -->
	<label
		class="mb-6 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-sm transition-colors"
		:class="dragOver ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:border-primary/50'"
		@dragover.prevent="dragOver = true"
		@dragleave="dragOver = false"
		@drop.prevent="onDrop"
	>
		<i class="fa-solid fa-file-arrow-up text-primary" aria-hidden="true"></i>
		<template v-if="restaurerDirectement">Déposer une sauvegarde (.zip) pour la <strong>restaurer aussitôt</strong></template>
		<template v-else>Déposer une sauvegarde (.zip) venue d'un autre serveur ou de votre ordinateur</template>
		<input type="file" accept=".zip,application/zip" class="sr-only" :disabled="locked" @change="onPick" />
	</label>
	<div v-if="superadmin" class="-mt-4 mb-6">
		<label class="flex items-start gap-2 text-sm text-gray-700">
			<input v-model="restaurerAuDepot" type="checkbox" class="mt-1" :disabled="Boolean(restaurationBloquee)" />
			<span>
				Restaurer l'archive dès son dépôt (migration d'un site)
				<span class="block text-xs font-light text-gray-500">
					Le contenu, les extensions, les comptes et le journal sont remplacés sans autre confirmation ; le site passe en maintenance le temps
					de sa reconstruction. L'état actuel est sauvegardé d'abord, sauf s'il l'est déjà ou s'il s'agit du contenu de
					démonstration d'un site neuf.
				</span>
			</span>
		</label>
	</div>

	<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
	<p v-else-if="!sauvegardes.length" class="text-sm font-light text-gray-500">Aucune sauvegarde sur le serveur pour l'instant.</p>
	<ul v-else class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
		<li v-for="s in sauvegardes" :key="s.nom" class="px-4 py-3 text-sm">
			<div class="flex items-center gap-2">
				<i class="fa-solid fa-file-zipper shrink-0 text-gray-400" aria-hidden="true"></i>
				<span class="min-w-0">
					<span class="block truncate font-medium text-gray-900" :title="s.nom">{{ s.nom }}</span>
					<span class="block text-xs font-light text-gray-500">
						{{ dateFr(s.date) }} · {{ taille(s.taille) }}
						<template v-if="s.valide"> · {{ s.association }} · modèle {{ s.modele }}<template v-if="s.motif"> · {{ s.motif }}</template></template>
						<span v-else class="text-red-700"> · pas une sauvegarde du site</span>
					</span>
				</span>
				<span class="ml-auto flex shrink-0 items-center gap-1">
					<a
						:href="`/api/admin/sauvegardes/${s.nom}`"
						:download="s.nom"
						:class="[iconButtonClass, 'text-primary']"
						aria-label="Télécharger"
						title="Télécharger"
					>
						<i class="fa-solid fa-download" aria-hidden="true"></i>
					</a>
					<button
						v-if="superadmin && s.valide"
						type="button"
						:class="[iconButtonClass, 'text-amber-700']"
						:disabled="locked || Boolean(restaurationBloquee)"
						aria-label="Restaurer"
						:title="restaurationBloquee || 'Restaurer cette sauvegarde'"
						@click="restoring = restoring === s.nom ? null : s.nom"
					>
						<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
					</button>
					<ConfirmIconButton
						label="Supprimer"
						title="Supprimer la sauvegarde du serveur"
						:confirming="confirming === s.nom"
						:disabled="locked"
						@ask="confirming = s.nom"
						@confirm="remove(s)"
						@cancel="confirming = null"
					/>
				</span>
			</div>
			<!-- Confirmation de la restauration -->
			<div v-if="restoring === s.nom" class="mt-3 alerte-attention" role="alert">
				<p class="font-semibold">Restaurer « {{ s.nom }} » ?</p>
				<p class="mt-1">
					Tout le contenu du site, les extensions, les comptes et le journal de l'Espace Admin seront <strong>remplacés</strong> par ceux de
					l'archive ({{ s.association }}, {{ dateFr(s.date) }}), puis le site sera reconstruit : il est en maintenance
					pendant ce temps (page avec barre de progression). L'état actuel est d'abord sauvegardé (« avant-restauration »,
					qui apparaîtra dans la liste ; sauf s'il l'est déjà) : vous pourrez y revenir. Les comptes étant ceux de
					l'archive, vous serez <strong>déconnecté·e</strong> si votre compte n'y existe pas ou si son mot de passe y est
					différent : reconnectez-vous avec le mot de passe de l'archive.
				</p>
				<div class="mt-3 flex flex-wrap gap-3">
					<button type="button" class="bouton bouton-danger" :disabled="locked" @click="restore(s)">
						<i class="fa-solid fa-clock-rotate-left mr-1.5" aria-hidden="true"></i>Restaurer et publier
					</button>
					<button type="button" class="text-sm text-gray-700 hover:underline" @click="restoring = null">Annuler</button>
				</div>
			</div>
		</li>
	</ul>
	<p v-if="superadmin && restaurationBloquee" class="mt-3 text-xs font-light text-gray-500">Restauration indisponible : {{ restaurationBloquee }}</p>
	<p class="mt-4 text-xs font-light text-gray-500">
		Sur le serveur : <code>./sauvegarde.sh</code> et <code>./restauration.sh &lt;archive.zip&gt;</code> (voir docs/sauvegarde.md).
	</p>
</template>
