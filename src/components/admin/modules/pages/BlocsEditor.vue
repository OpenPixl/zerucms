<script setup lang="ts">
/**
 * Blocs d'un contenu (page, actualité, activité) : ajout depuis le catalogue
 * (`src/lib/blocs.ts`), champs de chaque bloc, éléments répétés
 * (`ElementsEditor.vue`), et insertion du marqueur `[[bloc:<id>]]` dans le texte (`insert`).
 */
import { computed, ref } from 'vue';
import { disponible } from '../../../../plugins';
import { BLOC_TYPES, blocMarkersIn, emptyBloc, type Bloc, type BlocType, type BlocTypeDef } from '../../../../lib/blocs';
import { inputClass } from '../../context';
import BlocFields from './BlocFields.vue';
import ElementsEditor from './ElementsEditor.vue';

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
</script>

<template>
	<fieldset class="space-y-4">
		<legend class="text-sm font-semibold text-gray-700">Blocs <span class="font-light text-gray-500">(photos, vidéo, carrousel…)</span></legend>
		<p class="text-xs font-light text-gray-500">
			Chaque bloc s'affiche dans le texte là où se trouve son repère <code>[[bloc:…]]</code>.
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

			<ElementsEditor v-if="def(bloc.type).items" :valeur="bloc" :spec="def(bloc.type).items!" :id-prefix="`bloc-${id}`" />
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
