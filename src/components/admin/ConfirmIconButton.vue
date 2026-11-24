<script setup lang="ts">
/**
 * Bouton icône « corbeille » à confirmation : au clic, le fond du bouton
 * s'étire vers la gauche en une pastille (par-dessus les boutons voisins)
 * qui porte l'action et « Annuler ». Échap ou « Annuler » referme. L'état
 * ouvert est piloté par le parent (`confirming`), une seule confirmation à la fois.
 * `deferrable` : bouton « Sans publier » en plus (`confirm` reçoit alors
 * `true` : la suppression rejoint les modifications en attente, cf. `lot.ts`).
 */
import { nextTick, ref, watch } from 'vue';
import { iconButtonClass } from './context';

const props = defineProps<{
	/** Libellé de l'icône (`aria-label`, `title`) et de l'action dans la pastille. */
	label: string;
	/** Infobulle de l'icône si elle doit en dire plus que `label`. */
	title?: string;
	confirming: boolean;
	disabled?: boolean;
	deferrable?: boolean;
}>();
const emit = defineEmits<{ ask: []; confirm: [deferred: boolean]; cancel: [] }>();

const confirmButton = ref<HTMLButtonElement | null>(null);
watch(
	() => props.confirming,
	async (open) => {
		if (!open) return;
		await nextTick();
		confirmButton.value?.focus();
	},
);
</script>

<template>
	<span class="relative inline-flex text-sm">
		<!-- text-sm : même rendu quelle que soit la taille de texte de la ligne (Pages, Actualités…). -->
		<button
			type="button"
			:class="[iconButtonClass, 'text-red-600']"
			:disabled="props.disabled"
			:aria-label="props.label"
			:title="props.title ?? props.label"
			:aria-expanded="props.confirming"
			@click="emit('ask')"
		>
			<i class="fa-solid fa-trash" aria-hidden="true"></i>
		</button>
		<Transition
			enter-active-class="transition duration-150 ease-out"
			enter-from-class="scale-x-50 opacity-0"
			leave-active-class="transition duration-100 ease-in"
			leave-to-class="scale-x-50 opacity-0"
		>
			<span
				v-if="props.confirming"
				role="group"
				:aria-label="props.label"
				class="absolute top-1/2 right-0 z-10 flex h-8 origin-right -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-md bg-red-50 pl-1 shadow-sm ring-1 ring-red-200"
				@keydown.esc.stop="emit('cancel')"
			>
				<button type="button" class="rounded px-2 py-1 text-gray-600 hover:bg-white" @click="emit('cancel')">Annuler</button>
				<button
					v-if="props.deferrable"
					type="button"
					class="rounded px-2 py-1 font-medium text-red-700 ring-1 ring-red-200 hover:bg-white disabled:opacity-50"
					:disabled="props.disabled"
					title="Supprimer sans publier tout de suite (rejoint les modifications à publier)"
					@click="emit('confirm', true)"
				>
					Sans publier
				</button>
				<button
					ref="confirmButton"
					type="button"
					class="rounded bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
					:disabled="props.disabled"
					@click="emit('confirm', false)"
				>
					{{ props.label }}
				</button>
				<i class="fa-solid fa-trash w-7 text-center text-red-600" aria-hidden="true"></i>
			</span>
		</Transition>
	</span>
</template>
