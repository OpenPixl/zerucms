<script setup lang="ts">
/**
 * Une couleur du thème (module « Charte graphique ») : nuancier du
 * navigateur + saisie hexadécimale, contraste (par défaut : texte blanc
 * écrit dessus ; `checks` pour d'autres couleurs, ex. fond du mode sombre),
 * retour à la couleur du modèle (`defaultLabel`).
 */
import { computed } from 'vue';
import { COLOR_PATTERN } from '../../../../config/site';
import { compactInputClass } from '../../context';
import { contraste } from '../../../../lib/mode-sombre';
import { contrastLevel, fullHex } from './contrast';

/** Contraste vérifié : couleur comparée (`against`) et libellé du badge. */
export interface ContrastCheck {
	against: string;
	label: string;
}

const props = withDefaults(
	defineProps<{ id: string; label: string; help: string; defaultValue: string; defaultLabel?: string; checks?: ContrastCheck[] }>(),
	{ defaultLabel: "couleur d'origine", checks: () => [{ against: '#ffffff', label: 'Texte blanc' }] },
);
const model = defineModel<string>({ required: true });

const valid = computed(() => COLOR_PATTERN.test(model.value));
const badges = computed(() =>
	valid.value
		? props.checks
				.filter((c) => COLOR_PATTERN.test(c.against))
				.map((c) => {
					const ratio = contraste(model.value, c.against);
					return { label: c.label, ratio, level: contrastLevel(ratio) };
				})
		: [],
);
const LEVELS = {
	bon: { text: 'lisible', class: 'bg-green-50 text-green-700' },
	moyen: { text: 'gros caractères seulement', class: 'bg-amber-50 text-amber-800' },
	faible: { text: 'peu lisible', class: 'bg-red-50 text-red-700' },
};
</script>

<template>
	<div class="px-4 py-3">
		<div class="flex flex-wrap items-baseline gap-x-2">
			<label :for="props.id" class="champ-libelle">{{ props.label }}</label>
			<span class="text-xs font-light text-gray-500">{{ props.help }}</span>
		</div>
		<div class="mt-1 flex flex-wrap items-center gap-2">
			<input
				:id="`${props.id}-picker`"
				type="color"
				:value="valid ? fullHex(model) : '#000000'"
				class="champ-couleur"
				:aria-label="`${props.label} : nuancier`"
				@input="model = ($event.target as HTMLInputElement).value"
			/>
			<input
				:id="props.id"
				v-model.trim="model"
				type="text"
				maxlength="7"
				spellcheck="false"
				:class="[compactInputClass, 'w-28 font-mono', { 'champ-erreur': !valid }]"
			/>
			<template v-if="valid">
				<span
					v-for="b in badges"
					:key="b.label"
					:class="['rounded-full px-2 py-0.5 text-xs', LEVELS[b.level].class]"
					:title="`Contraste ${b.ratio.toFixed(1)}:1`"
				>
					{{ b.label }} : {{ LEVELS[b.level].text }}
				</span>
			</template>
			<span v-else class="text-xs text-red-700">Format attendu : #2f7fc1</span>
			<button
				v-if="model.toLowerCase() !== props.defaultValue.toLowerCase()"
				type="button"
				class="text-xs text-primary hover:underline"
				@click="model = props.defaultValue"
			>
				{{ props.defaultLabel }}
			</button>
		</div>
	</div>
</template>
