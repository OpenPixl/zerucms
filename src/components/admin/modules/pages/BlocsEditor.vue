<script setup lang="ts">
/**
 * Blocs d'une page enrichie : ajout depuis le catalogue (`src/lib/blocs.ts`),
 * champs de chaque bloc, éléments répétés (cartes…, ordre par glisser-déposer ou ↑/↓), et insertion du
 * marqueur `[[bloc:<id>]]` dans le texte (`insert`).
 */
import { computed, ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { disponible } from '../../../../plugins';
import { BLOC_TYPES, blocMarkersIn, emptyBloc, emptyValue, type Bloc, type BlocType, type BlocTypeDef } from '../../../../lib/blocs';
import { iconButtonClass, inputClass, sortableProps } from '../../context';
import BlocFields from './BlocFields.vue';
import { useBlocPhotos } from './bloc-photos';
import DragHandle from './DragHandle.vue';
import OrderArrows from './OrderArrows.vue';

const props = defineProps<{ blocs: Record<string, Bloc>; body: string }>();
const emit = defineEmits<{ insert: [id: string] }>();

// Types d'un plugin inactif : non proposés (un bloc déjà présent reste modifiable).
const types = (Object.entries(BLOC_TYPES) as [BlocType, BlocTypeDef][]).filter(([, d]) => disponible(d));
const def = (type: BlocType): BlocTypeDef => BLOC_TYPES[type];
const newType = ref<BlocType>(types[0][0]);
const placed = computed(() => new Set(blocMarkersIn(props.body)));

function add() {
	let n = 1;
	while (props.blocs[`${newType.value}-${n}`]) n++;
	const id = `${newType.value}-${n}`;
	props.blocs[id] = emptyBloc(newType.value);
	emit('insert', id);
}

function remove(id: string) {
	delete props.blocs[id];
}

function addItem(bloc: Bloc) {
	const fields = def(bloc.type).items!.fields;
	(bloc.items ??= []).push(Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)])));
}

// --- Plusieurs photos d'un coup (blocs dont les éléments ont un champ photo) ---

const photos = useBlocPhotos();
const champPhoto = (bloc: Bloc) => def(bloc.type).items?.fields.find((f) => f.type === 'photo')?.name;
const erreurPhotos = ref<Record<string, string>>({});

/** Une photo par élément : d'abord les éléments sans photo, puis de nouveaux éléments (dans la limite du bloc). */
async function ajouterPhotos(id: string, bloc: Bloc, event: Event) {
	const input = event.target as HTMLInputElement;
	const files = [...(input.files ?? [])];
	input.value = '';
	const champ = champPhoto(bloc);
	if (!photos || !champ) return;
	const max = def(bloc.type).items!.max;
	const problemes: string[] = [];
	for (const file of files) {
		let item = bloc.items?.find((it) => !it[champ]);
		if (!item) {
			if ((bloc.items?.length ?? 0) >= max) {
				problemes.push(`${max} photos au plus : les suivantes sont ignorées.`);
				break;
			}
			addItem(bloc);
			item = bloc.items![bloc.items!.length - 1];
		}
		try {
			item[champ] = await photos.choisir(file);
		} catch (e) {
			problemes.push((e as Error).message);
		}
	}
	erreurPhotos.value = { ...erreurPhotos.value, [id]: problemes.join(' ') };
}

function moveItem(bloc: Bloc, index: number, delta: number) {
	const items = bloc.items!;
	const [item] = items.splice(index, 1);
	items.splice(index + delta, 0, item);
}

/** Éléments glissés-déposés : nouvel ordre complet. */
function reorderItems(bloc: Bloc, list: NonNullable<Bloc['items']>) {
	bloc.items!.splice(0, bloc.items!.length, ...list);
}
</script>

<template>
	<fieldset class="space-y-4">
		<legend class="text-sm font-semibold text-gray-700">Blocs de la page</legend>
		<p class="text-xs font-light text-gray-500">
			Chaque bloc s'affiche à l'endroit de son marqueur <code>[[bloc:…]]</code> dans le texte (seul sur sa ligne).
		</p>

		<div v-for="(bloc, id) in props.blocs" :key="id" class="rounded-xl border border-gray-200 p-4">
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<i :class="['fa-solid', def(bloc.type).icon, 'text-primary']" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">{{ def(bloc.type).label }}</span>
				<code class="text-xs text-gray-500">{{ id }}</code>
				<span
					v-if="!placed.has(String(id))"
					class="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
					title="Le marqueur de ce bloc n'est pas dans le texte : le bloc ne s'affichera pas."
				>non placé</span>
				<span class="ml-auto flex gap-3 text-sm">
					<button type="button" class="text-primary hover:underline" @click="emit('insert', String(id))">
						<i class="fa-solid fa-arrow-turn-down mr-1" aria-hidden="true"></i>Insérer dans le texte
					</button>
					<button type="button" class="text-red-600 hover:underline" @click="remove(String(id))">Retirer</button>
				</span>
			</div>

			<BlocFields :fields="def(bloc.type).fields" :values="bloc" :id-prefix="`bloc-${id}`" />

			<div v-if="def(bloc.type).items" class="mt-4 space-y-3">
				<VueDraggable
					v-bind="sortableProps"
					:model-value="bloc.items ?? []"
					class="space-y-3"
					@update:model-value="(list: NonNullable<Bloc['items']>) => reorderItems(bloc, list)"
				>
					<div v-for="(item, i) in bloc.items" :key="i" class="rounded-lg bg-gray-100 p-3">
						<div class="mb-2 flex items-center gap-2 text-sm">
							<DragHandle :disabled="false" />
							<span class="font-semibold text-gray-700">{{ def(bloc.type).items!.label }} {{ i + 1 }}</span>
							<span class="ml-auto flex items-center gap-1">
								<OrderArrows
									:label="`${def(bloc.type).items!.label} ${i + 1}`"
									:first="i === 0"
									:last="i === (bloc.items?.length ?? 0) - 1"
									:disabled="false"
									@up="moveItem(bloc, i, -1)"
									@down="moveItem(bloc, i, 1)"
								/>
								<button
									type="button"
									:class="[iconButtonClass, 'text-red-600']"
									:disabled="(bloc.items?.length ?? 0) <= def(bloc.type).items!.min"
									aria-label="Retirer"
									title="Retirer"
									@click="bloc.items!.splice(i, 1)"
								>
									<i class="fa-solid fa-trash" aria-hidden="true"></i>
								</button>
							</span>
						</div>
						<BlocFields :fields="def(bloc.type).items!.fields" :values="item" :id-prefix="`bloc-${id}-${i}`" />
					</div>
				</VueDraggable>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
					<button
						v-if="(bloc.items?.length ?? 0) < def(bloc.type).items!.max"
						type="button"
						class="text-sm font-medium text-primary hover:underline"
						@click="addItem(bloc)"
					>
						<i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>Ajouter : {{ def(bloc.type).items!.label.toLowerCase() }}
					</button>
					<label v-if="photos && champPhoto(bloc)" class="cursor-pointer text-sm font-medium text-primary hover:underline">
						<i class="fa-solid fa-images mr-1" aria-hidden="true"></i>Ajouter plusieurs photos d'un coup
						<input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" @change="ajouterPhotos(String(id), bloc, $event)" />
					</label>
				</div>
				<p v-if="erreurPhotos[String(id)]" class="text-xs text-red-700" role="alert">{{ erreurPhotos[String(id)] }}</p>
			</div>
		</div>

		<div class="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-gray-300 p-4">
			<div class="min-w-48 flex-1">
				<label for="bloc-new-type" class="champ-libelle">Ajouter un bloc</label>
				<select id="bloc-new-type" v-model="newType" :class="inputClass">
					<option v-for="[type, d] in types" :key="type" :value="type">{{ d.label }} — {{ d.description }}</option>
				</select>
			</div>
			<button
				type="button"
				class="bouton bouton-contour"
				@click="add"
			>
				<i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>Ajouter
			</button>
		</div>
	</fieldset>
</template>
