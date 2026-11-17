<script setup lang="ts">
/**
 * Interrupteur (on / off) de l'Espace Admin : bouton `role="switch"`,
 * `v-model` booléen. Le libellé est donné par `aria-labelledby` (élément
 * voisin) ou `label` (lu seulement par les lecteurs d'écran).
 */
const model = defineModel<boolean>({ required: true });
defineProps<{ label?: string; labelledby?: string; disabled?: boolean }>();
</script>

<template>
	<button
		type="button"
		role="switch"
		:aria-checked="model"
		:aria-label="label"
		:aria-labelledby="labelledby"
		:disabled="disabled"
		class="relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
		:class="model ? 'bg-primary' : 'bg-gray-300'"
		@click="model = !model"
	>
		<span
			class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
			:class="model ? 'translate-x-3.5' : 'translate-x-0.5'"
			aria-hidden="true"
		></span>
	</button>
</template>
