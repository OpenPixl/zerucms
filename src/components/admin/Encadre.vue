<script setup lang="ts">
/**
 * Encadré repliable d'un formulaire de l'admin (ex. sections de la charte
 * graphique) : en-tête cliquable (icône, titre, sous-titre, chevron) qui
 * ouvre ou referme le contenu ; slot `actions` à droite de l'en-tête (ex.
 * interrupteur), hors du bouton : il ne replie pas l'encadré. Contenu
 * gardé monté quand il est replié (`v-show`) : une saisie n'est pas perdue.
 * `repliable: false` = toujours ouvert, en-tête fixe sans chevron (le slot
 * `actions` prend sa place, ex. bouton « + » des connecteurs d'un plugin).
 * Style distinct des aperçus (en-tête blanc, pastille d'icône).
 */
import { ref, useId } from 'vue';

const props = withDefaults(
	defineProps<{ titre: string; icone: string; sousTitre?: string; ouvert?: boolean; repliable?: boolean }>(),
	{ ouvert: true, repliable: true },
);
const open = ref(props.ouvert);
const id = useId();
</script>

<template>
	<section class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="flex items-center gap-2 py-1.5 pr-4 pl-2">
			<component
				:is="props.repliable ? 'button' : 'div'"
				:type="props.repliable ? 'button' : undefined"
				class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left"
				:class="{ 'hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none': props.repliable }"
				:aria-expanded="props.repliable ? open : undefined"
				:aria-controls="props.repliable ? id : undefined"
				@click="props.repliable && (open = !open)"
			>
				<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
					<i :class="['fa-solid', props.icone, 'text-sm']"></i>
				</span>
				<span class="min-w-0 flex-1">
					<span class="block font-heading font-semibold text-gray-900">{{ props.titre }}</span>
					<span v-if="props.sousTitre" class="block truncate text-xs text-gray-500">{{ props.sousTitre }}</span>
				</span>
				<i
					v-if="props.repliable"
					:class="['fa-solid fa-chevron-down text-xs text-gray-400 transition-transform', { '-rotate-90': !open }]"
					aria-hidden="true"
				></i>
			</component>
			<slot name="actions" />
		</div>
		<div v-show="open || !props.repliable" :id="id" class="overflow-hidden rounded-b-xl border-t border-gray-100">
			<slot />
		</div>
	</section>
</template>
