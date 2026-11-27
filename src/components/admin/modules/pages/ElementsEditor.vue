<script setup lang="ts">
/**
 * Éléments répétés d'un bloc ou d'une section (cartes, photos, formules,
 * personnes, logos…) : ajout / retrait dans les limites de `spec`, ordre par
 * glisser-déposer ou ↑/↓, champs de chaque élément (`BlocFields`). Éléments
 * à champ `photo` (sauf `spec.liste`) : grille compacte de vignettes
 * (`PhotosGrille.vue`), plusieurs photos d'un coup. Modifie `valeur.items`
 * sur place. Utilisé par `BlocsEditor.vue` et `HomeModulesEditor.vue`.
 */
import { computed, ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { emptyValue, type ElementsDef } from '../../../../lib/blocs';
import { iconButtonClass, sortableProps } from '../../context';
import BlocFields from './BlocFields.vue';
import { useBlocPhotos } from './bloc-photos';
import DragHandle from './DragHandle.vue';
import OrderArrows from './OrderArrows.vue';
import PhotosGrille from './PhotosGrille.vue';

type Element = Record<string, string>;
const props = defineProps<{ valeur: { items?: Element[] }; spec: ElementsDef; idPrefix: string }>();

const photos = useBlocPhotos();
/** Champ photo des éléments, pour la grille de vignettes ; aucun si `spec.liste` (photo parmi d'autres champs). */
const champPhoto = computed(() => (props.spec.liste ? undefined : props.spec.fields.find((f) => f.type === 'photo')?.name));
const erreurPhotos = ref('');
const items = computed(() => props.valeur.items ?? []);

function addItem() {
	(props.valeur.items ??= []).push(Object.fromEntries(props.spec.fields.map((f) => [f.name, emptyValue(f)])));
}

/** Une photo par élément : d'abord les éléments sans photo, puis de nouveaux éléments (dans la limite). */
async function ajouterPhotos(event: Event) {
	const input = event.target as HTMLInputElement;
	const files = [...(input.files ?? [])];
	input.value = '';
	const champ = champPhoto.value;
	if (!photos || !champ) return;
	const problemes: string[] = [];
	for (const file of files) {
		let item = props.valeur.items?.find((it) => !it[champ]);
		if (!item) {
			if (items.value.length >= props.spec.max) {
				problemes.push(`${props.spec.max} au plus : les suivantes sont ignorées.`);
				break;
			}
			addItem();
			item = props.valeur.items![props.valeur.items!.length - 1];
		}
		try {
			item[champ] = await photos.choisir(file);
		} catch (e) {
			problemes.push((e as Error).message);
		}
	}
	erreurPhotos.value = problemes.join(' ');
}

function moveItem(index: number, delta: number) {
	const liste = props.valeur.items!;
	const [item] = liste.splice(index, 1);
	liste.splice(index + delta, 0, item);
}

/** Éléments glissés-déposés : nouvel ordre complet. */
function reorderItems(list: Element[]) {
	props.valeur.items!.splice(0, props.valeur.items!.length, ...list);
}
</script>

<template>
	<div v-if="photos && champPhoto" class="mt-4">
		<PhotosGrille :bloc="props.valeur" :def="{ fields: [], items: props.spec }" :id-prefix="props.idPrefix" :champ="champPhoto" @ajouter="ajouterPhotos" />
		<p v-if="erreurPhotos" class="mt-1 text-xs text-red-700" role="alert">{{ erreurPhotos }}</p>
	</div>
	<div v-else class="mt-4 space-y-3">
		<VueDraggable v-bind="sortableProps" :model-value="items" class="space-y-3" @update:model-value="reorderItems">
			<div v-for="(item, i) in items" :key="i" class="rounded-lg bg-gray-100 p-3">
				<div class="mb-2 flex items-center gap-2 text-sm">
					<DragHandle :disabled="false" />
					<span class="font-semibold text-gray-700">{{ props.spec.label }} {{ i + 1 }}</span>
					<span class="ml-auto flex items-center gap-1">
						<OrderArrows
							:label="`${props.spec.label} ${i + 1}`"
							:first="i === 0"
							:last="i === items.length - 1"
							:disabled="false"
							@up="moveItem(i, -1)"
							@down="moveItem(i, 1)"
						/>
						<button
							type="button"
							:class="[iconButtonClass, 'text-red-600']"
							:disabled="items.length <= props.spec.min"
							aria-label="Retirer"
							title="Retirer"
							@click="props.valeur.items!.splice(i, 1)"
						>
							<i class="fa-solid fa-trash" aria-hidden="true"></i>
						</button>
					</span>
				</div>
				<BlocFields :fields="props.spec.fields" :values="item" :id-prefix="`${props.idPrefix}-${i}`" />
			</div>
		</VueDraggable>
		<button v-if="items.length < props.spec.max" type="button" class="text-sm font-medium text-primary hover:underline" @click="addItem">
			<i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>Ajouter : {{ props.spec.label.toLowerCase() }}
		</button>
		<p v-if="erreurPhotos" class="text-xs text-red-700" role="alert">{{ erreurPhotos }}</p>
	</div>
</template>
