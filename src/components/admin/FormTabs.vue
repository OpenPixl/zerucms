<script setup lang="ts">
/**
 * Barre d'onglets réutilisable de l'Espace Admin (motif ARIA « tabs ») :
 * `v-model` = onglet actif, panneaux rendus par le parent (`v-show`,
 * `id="<prefix>-panel-<id>"`, `aria-labelledby="<prefix>-tab-<id>"`).
 *
 * Onglets toujours sur **une seule ligne** : s'ils dépassent la largeur,
 * la barre défile (sans ascenseur visible) et des chevrons apparaissent du
 * côté où il reste des onglets ; l'onglet actif est ramené dans la vue.
 * Flèches gauche/droite du clavier entre onglets ; `marks` = pastille
 * « modifications pas encore publiées » ; `counts` = compteur (ex. demandes
 * à traiter). Utilisée par les modules Association (charte), Actualités,
 * Pages, Activités et Facturation (cf. `form-tabs.ts`).
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { FormTab } from './form-tabs';

const props = defineProps<{
	tabs: readonly FormTab[];
	prefix: string;
	marks?: Record<string, boolean>;
	counts?: Record<string, number>;
}>();
const active = defineModel<string>({ required: true });

const scroller = ref<HTMLElement | null>(null);
const canLeft = ref(false);
const canRight = ref(false);

function update() {
	const el = scroller.value;
	if (!el) return;
	canLeft.value = el.scrollLeft > 1;
	canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

/** Défile d'environ deux tiers de la largeur visible. */
function scrollBy(direction: -1 | 1) {
	const el = scroller.value;
	if (el) el.scrollBy({ left: direction * Math.max(80, el.clientWidth * 0.66), behavior: 'smooth' });
}

function showActive() {
	const el = document.getElementById(`${props.prefix}-tab-${active.value}`);
	el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

let observer: ResizeObserver | null = null;
onMounted(() => {
	update();
	if (typeof ResizeObserver !== 'undefined' && scroller.value) {
		observer = new ResizeObserver(update);
		observer.observe(scroller.value);
	}
	nextTick(showActive);
});
onBeforeUnmount(() => observer?.disconnect());
watch(active, () => nextTick(showActive));
watch(() => props.tabs.length, () => nextTick(update));

function onKey(event: KeyboardEvent) {
	if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
	const i = props.tabs.findIndex((t) => t.id === active.value);
	const next = props.tabs[(i + (event.key === 'ArrowRight' ? 1 : props.tabs.length - 1)) % props.tabs.length];
	active.value = next.id;
	(document.getElementById(`${props.prefix}-tab-${next.id}`) as HTMLElement | null)?.focus();
}

// Trait gris sous les onglets = ombre intérieure du conteneur (une bordure
// serait rognée par le défilement), recouverte par le soulignement actif.
const chevronClass =
	'absolute inset-y-0 z-10 flex w-8 items-center justify-center bg-white text-gray-500 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none';
</script>

<template>
	<div class="relative mb-5">
		<button v-show="canLeft" type="button" :class="[chevronClass, 'left-0 shadow-[inset_0_-1px_0_var(--color-gray-200),6px_0_6px_-4px_rgb(0_0_0/0.12)]']" aria-label="Onglets précédents" tabindex="-1" @click="scrollBy(-1)">
			<i class="fa-solid fa-chevron-left text-xs" aria-hidden="true"></i>
		</button>
		<div ref="scroller" role="tablist" aria-label="Rubriques" class="scrollbar-aucune flex gap-x-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-gray-200)]" @keydown="onKey" @scroll.passive="update">
			<button
				v-for="t in props.tabs"
				:id="`${props.prefix}-tab-${t.id}`"
				:key="t.id"
				type="button"
				role="tab"
				:aria-selected="active === t.id"
				:aria-controls="`${props.prefix}-panel-${t.id}`"
				:tabindex="active === t.id ? 0 : -1"
				:class="[
					'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 font-heading text-sm font-semibold transition-colors',
					active === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800',
				]"
				@click="active = t.id"
			>
				<i v-if="t.icon" :class="['fa-solid', t.icon]" aria-hidden="true"></i>
				{{ t.label }}
				<span v-if="props.counts?.[t.id]" class="rounded-full bg-amber-400 px-1.5 text-xs text-amber-950">{{ props.counts[t.id] }}</span>
				<span v-if="props.marks?.[t.id]" class="h-2 w-2 rounded-full bg-amber-400" title="Modifications pas encore publiées"></span>
			</button>
		</div>
		<button v-show="canRight" type="button" :class="[chevronClass, 'right-0 shadow-[inset_0_-1px_0_var(--color-gray-200),-6px_0_6px_-4px_rgb(0_0_0/0.12)]']" aria-label="Onglets suivants" tabindex="-1" @click="scrollBy(1)">
			<i class="fa-solid fa-chevron-right text-xs" aria-hidden="true"></i>
		</button>
	</div>
</template>
