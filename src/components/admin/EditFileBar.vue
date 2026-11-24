<script setup lang="ts">
/**
 * Au-dessus des onglets d'un formulaire en modification : « Télécharger le
 * fichier » (`.md` construit depuis le formulaire, `download`) et « Charger
 * un fichier modifié » (bouton ou glisser-déposer, `load` : le `.md`, avec
 * ses photos ou en `.zip`, cf. ./depot.ts) — le parent remplit le
 * formulaire, rien n'est publié avant « Enregistrer ».
 * `imported` = dernier fichier chargé et remarques de lecture. Encadré grisé
 * entre le titre et les onglets ; slot par défaut affiché en tête (ex. adresse
 * de l'actualité).
 */
import { ref } from 'vue';
import { DEPOT_ACCEPT } from './depot';

const props = defineProps<{ imported: { name: string; warnings: string[] } | null; disabled?: boolean }>();
const emit = defineEmits<{ download: []; load: [fichiers: File[]] }>();

const dragOver = ref(false);
const buttonClass =
	'flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-primary hover:text-primary';

function pick(event: Event) {
	const input = event.target as HTMLInputElement;
	const fichiers = [...(input.files ?? [])];
	input.value = ''; // recharger le même fichier après l'avoir corrigé
	if (fichiers.length) emit('load', fichiers);
}

function drop(event: DragEvent) {
	dragOver.value = false;
	const fichiers = [...(event.dataTransfer?.files ?? [])];
	if (fichiers.length) emit('load', fichiers);
}
</script>

<template>
	<div class="mb-4 rounded-xl border border-gray-200 bg-gray-100 p-4">
		<slot />
		<div class="grid grid-cols-2 gap-2">
			<button type="button" :class="buttonClass" :disabled="props.disabled" @click="emit('download')">
				<i class="fa-solid fa-file-arrow-down text-primary" aria-hidden="true"></i>
				Télécharger le fichier
			</button>
			<label
				:class="[buttonClass, 'cursor-pointer', dragOver ? 'border-primary bg-primary/5 text-primary' : '']"
				@dragover.prevent="dragOver = true"
				@dragleave="dragOver = false"
				@drop.prevent="drop"
			>
				<i class="fa-solid fa-file-arrow-up text-primary" aria-hidden="true"></i>
				Charger un fichier modifié
				<input type="file" :accept="DEPOT_ACCEPT" multiple class="sr-only" :disabled="props.disabled" @change="pick" />
			</label>
		</div>
		<p class="mt-1.5 text-xs font-light text-gray-500">
			Pour travailler hors ligne : téléchargez le fichier, modifiez-le, puis rechargez-le ici. Rien n'est publié avant
			l'enregistrement.
		</p>
		<div v-if="props.imported" class="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700" role="status">
			<p>
				<i class="fa-solid fa-file-circle-check mr-1 text-primary" aria-hidden="true"></i>
				Formulaire rempli depuis <strong>{{ props.imported.name }}</strong> : vérifiez puis enregistrez.
			</p>
			<ul v-if="props.imported.warnings.length" class="mt-1 list-disc pl-5 text-xs text-amber-800">
				<li v-for="w in props.imported.warnings" :key="w">{{ w }}</li>
			</ul>
		</div>
	</div>
</template>
