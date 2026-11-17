<script setup lang="ts">
import { computed } from 'vue';
import type { CotisationOption, Genre } from '../../../../lib/grist-asso/types';
import { formatPrix } from '../../../../lib/grist-asso/format';

const props = defineProps<{
	options: CotisationOption[];
	active: boolean;
	done: boolean;
	busy: boolean;
	membreLabel: string;
	genre: Genre | null;
}>();

const emit = defineEmits<{ submit: [] }>();
const selected = defineModel<number | null>({ required: true });

// Une association ne voit que les cotisations « personne morale », et inversement.
const visibles = computed(() => {
	if (!props.genre) return props.options;
	const morale = props.genre === 'Association';
	return props.options.filter((o) => o.personneMorale === morale);
});
</script>

<template>
	<li
		class="rounded-2xl border bg-white p-6 shadow-sm"
		:class="active ? 'border-primary' : 'border-gray-100'"
	>
		<div class="flex items-center gap-3">
			<span
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-sm"
				:class="done ? 'bg-primary text-white' : 'bg-primary/10 text-primary'"
			>
				<i v-if="done" class="fa-solid fa-check" aria-hidden="true"></i>
				<span v-else>2</span>
			</span>
			<h2 class="font-heading text-lg text-gray-900">Type de cotisation</h2>
		</div>

		<p v-if="active && membreLabel" class="mt-2 text-sm text-gray-500">
			Adhésion de <span class="font-medium text-gray-700">{{ membreLabel }}</span>.
		</p>

		<form v-if="active" class="mt-5" @submit.prevent="emit('submit')">
			<p v-if="busy && !options.length" class="text-sm text-gray-500">Chargement…</p>
			<p v-else-if="!visibles.length" class="text-sm text-gray-500">
				Aucune cotisation disponible pour cette saison.
			</p>
			<div v-else class="space-y-2">
				<label
					v-for="o in visibles"
					:key="o.id"
					class="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 px-4 py-3 hover:border-primary"
					:class="{ 'border-primary bg-primary/5': selected === o.id }"
				>
					<span class="flex items-center gap-3">
						<input type="radio" :value="o.id" v-model="selected" name="cotisation" />
						<span class="text-sm text-gray-900">{{ o.label }}</span>
					</span>
					<span class="font-heading font-semibold text-gray-900">{{ formatPrix(o.prix) }}</span>
				</label>
			</div>

			<button
				type="submit"
				class="bouton bouton-accent mt-6"
				:disabled="busy || selected === null"
			>
				{{ busy ? 'Envoi…' : 'Continuer' }}
			</button>
		</form>

		<p v-else-if="done" class="mt-3 text-sm text-gray-600">
			{{ options.find((o) => o.id === selected)?.label }}
			<span class="text-gray-400">— enregistré</span>
		</p>
	</li>
</template>
