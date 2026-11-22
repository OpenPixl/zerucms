<script setup lang="ts">
/**
 * Éléments d'un bloc à photos (« Photos », « Carrousel ») en grille compacte :
 * 4 vignettes par ligne, ordre par glisser-déposer de la vignette (au doigt :
 * appui prolongé, pour garder le défilement), icône « Retirer » dans un coin.
 * Un clic sur une vignette déroule en dessous les autres champs de l'élément
 * (description, légende…) et le remplacement de la photo ; pour le clavier,
 * « Avancer » / « Reculer » y changent aussi l'ordre. Dernière case :
 * ajout d'une ou plusieurs photos.
 */
import { computed, ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import type { Bloc, BlocTypeDef } from '../../../../lib/blocs';
import BlocFields from './BlocFields.vue';
import { useBlocPhotos } from './bloc-photos';

type Item = NonNullable<Bloc['items']>[number];

const props = defineProps<{ bloc: Bloc; def: BlocTypeDef; idPrefix: string; champ: string }>();
const emit = defineEmits<{ ajouter: [event: Event] }>();

const photos = useBlocPhotos();
const items = computed(() => props.bloc.items ?? []);
const spec = computed(() => props.def.items!);
const autres = computed(() => spec.value.fields.filter((f) => f.name !== props.champ));
const champPhoto = computed(() => spec.value.fields.filter((f) => f.name === props.champ));

/** Élément déroulé (référence : suit l'élément quand l'ordre change). */
const ouvert = ref<Item | null>(null);
const indexOuvert = computed(() => (ouvert.value ? items.value.indexOf(ouvert.value) : -1));

/** Grille : seules les vignettes se déplacent (pas la case d'ajout) ; au doigt, appui prolongé. */
const grilleProps = { draggable: '.tuile', animation: 150, ghostClass: 'opacity-40', delay: 250, delayOnTouchOnly: true } as const;

const apercu = (item: Item) => {
	const v = String(item[props.champ] ?? '');
	return v ? photos?.apercu(v) ?? null : null;
};
/** Champ obligatoire vide (hors photo) : pastille sur la vignette. */
const incomplet = (item: Item) => spec.value.fields.some((f) => f.required && !String(item[f.name] ?? '').trim());

function basculer(item: Item) {
	ouvert.value = ouvert.value === item ? null : item;
}

function retirer(i: number) {
	const [item] = props.bloc.items!.splice(i, 1);
	if (ouvert.value === item) ouvert.value = null;
}

function deplacer(delta: number) {
	const i = indexOuvert.value;
	const liste = props.bloc.items!;
	if (i < 0 || i + delta < 0 || i + delta >= liste.length) return;
	const [item] = liste.splice(i, 1);
	liste.splice(i + delta, 0, item);
}

function reordonner(liste: Item[]) {
	props.bloc.items!.splice(0, props.bloc.items!.length, ...liste);
}
</script>

<template>
	<div>
		<VueDraggable v-bind="grilleProps" :model-value="items" class="grid grid-cols-4 gap-2" @update:model-value="reordonner">
			<div
				v-for="(item, i) in items"
				:key="i"
				:class="[
					'tuile group relative aspect-square cursor-grab overflow-hidden rounded-lg bg-gray-200 active:cursor-grabbing',
					ouvert === item ? 'ring-2 ring-primary ring-offset-2' : '',
				]"
			>
				<button
					type="button"
					class="flex h-full w-full items-center justify-center text-gray-400"
					:aria-expanded="ouvert === item"
					:aria-label="`${spec.label} ${i + 1} : modifier la description`"
					:title="`${spec.label} ${i + 1} — cliquer pour la description, glisser pour déplacer`"
					@click="basculer(item)"
				>
					<img v-if="apercu(item)" :src="apercu(item)!" alt="" class="h-full w-full object-cover" draggable="false" />
					<i v-else-if="item[props.champ]" class="fa-solid fa-image text-xl" aria-hidden="true"></i>
					<i v-else class="fa-regular fa-image text-xl" aria-hidden="true"></i>
				</button>
				<span class="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">{{ i + 1 }}</span>
				<span
					v-if="incomplet(item)"
					class="pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white"
					title="À compléter"
				></span>
				<button
					v-if="items.length > spec.min"
					type="button"
					class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-xs text-red-600 shadow hover:bg-red-600 hover:text-white"
					:aria-label="`Retirer : ${spec.label.toLowerCase()} ${i + 1}`"
					title="Retirer"
					@click.stop="retirer(i)"
				>
					<i class="fa-solid fa-trash" aria-hidden="true"></i>
				</button>
			</div>
			<label
				v-if="photos && items.length < spec.max"
				class="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-center text-xs text-gray-500 hover:border-primary hover:text-primary"
				title="Ajouter une ou plusieurs photos"
			>
				<i class="fa-solid fa-plus text-lg" aria-hidden="true"></i>
				Ajouter
				<input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="emit('ajouter', $event)" />
			</label>
		</VueDraggable>
		<p class="mt-1.5 text-xs font-light text-gray-500">Cliquez sur une photo pour sa description ; glissez-la pour changer l'ordre.</p>

		<div v-if="ouvert && indexOuvert >= 0" class="mt-3 rounded-lg bg-gray-100 p-3">
			<div class="mb-2 flex items-center gap-2 text-sm">
				<span class="font-semibold text-gray-700">{{ spec.label }} {{ indexOuvert + 1 }}</span>
				<span class="ml-auto flex items-center gap-3">
					<button type="button" class="text-primary hover:underline disabled:text-gray-400 disabled:no-underline" :disabled="indexOuvert === 0" @click="deplacer(-1)">
						<i class="fa-solid fa-arrow-left mr-1 text-xs" aria-hidden="true"></i>Reculer
					</button>
					<button
						type="button"
						class="text-primary hover:underline disabled:text-gray-400 disabled:no-underline"
						:disabled="indexOuvert === items.length - 1"
						@click="deplacer(1)"
					>
						Avancer<i class="fa-solid fa-arrow-right ml-1 text-xs" aria-hidden="true"></i>
					</button>
					<button type="button" class="text-gray-600 hover:underline" @click="ouvert = null">Fermer</button>
				</span>
			</div>
			<BlocFields :fields="champPhoto" :values="ouvert" :id-prefix="`${props.idPrefix}-${indexOuvert}`" />
			<div class="mt-3">
				<BlocFields :fields="autres" :values="ouvert" :id-prefix="`${props.idPrefix}-${indexOuvert}`" />
			</div>
		</div>
	</div>
</template>
