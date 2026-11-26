<script setup lang="ts">
/**
 * Modules de la page d'accueil (catalogue `src/lib/home-modules.ts`) :
 * ajout, retrait, ordre (glisser-déposer ou ↑/↓) et contenu de chaque module, replié en
 * accordéon, photo du bandeau comprise (`HomePhotoField.vue`). Modifie la liste reçue sur place ; l'enregistrement est fait par
 * le formulaire parent (`SitePageForm.vue`).
 */
import { computed, nextTick, ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { disponible } from '../../../../plugins';
import { DEFAULT_HOME, HOME_MODULES, homeModuleDef, newHomeModule, type HomeModule, type HomeModuleDef, type HomeModuleType } from '../../../../lib/home-modules';
import { iconButtonClass, inputClass, sortableProps } from '../../context';
import BlocFields from './BlocFields.vue';
import HomePhotoField from './HomePhotoField.vue';

/** Formats de l'illustration du module « Présentation » (SVG accepté, cf. `src/lib/home-photo.ts`). */
const ILLUSTRATION_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
import type { HomePhotoDraft } from './home-photo-draft';
import DragHandle from './DragHandle.vue';
import OrderArrows from './OrderArrows.vue';

/**
 * `photo` : brouillon de la photo d'accueil (fond du module « Bandeau ») ;
 * `illustration` : celui de l'illustration propre au module « Présentation ».
 */
const props = defineProps<{ modules: HomeModule[]; photo?: HomePhotoDraft; illustration?: HomePhotoDraft }>();

/**
 * Module déplié, par objet (l'index change quand on déplace) : un seul à la
 * fois, ouvrir un module referme le précédent.
 */
const open = ref<HomeModule | null>(null);
function toggle(m: HomeModule, event: MouseEvent) {
	open.value = open.value === m ? null : m;
	// Refermer un module plus haut décale la liste : garder l'en-tête cliqué en vue.
	const header = event.currentTarget as HTMLElement;
	nextTick(() => header.scrollIntoView({ block: 'nearest' }));
}

// Types d'un plugin inactif : non proposés (rendu ignoré par index.astro).
const types = (Object.entries(HOME_MODULES) as [HomeModuleType, HomeModuleDef][]).filter(([, d]) => disponible(d));
/** Types encore ajoutables (un module unique déjà présent ne se rajoute pas). */
const available = computed(() => types.filter(([type, def]) => def.multiple || !props.modules.some((m) => m.type === type)));
const newType = ref<HomeModuleType | ''>('');

function add() {
	if (!newType.value) return;
	const m = newHomeModule(newType.value);
	props.modules.push(m);
	open.value = props.modules[props.modules.length - 1];
	newType.value = '';
}

function move(index: number, delta: -1 | 1) {
	const [m] = props.modules.splice(index, 1);
	props.modules.splice(index + delta, 0, m);
}

/** Modules glissés-déposés : nouvel ordre complet. */
function reorder(list: HomeModule[]) {
	props.modules.splice(0, props.modules.length, ...list);
}

function remove(index: number) {
	const [m] = props.modules.splice(index, 1);
	if (open.value === m) open.value = null;
}

function resetHome() {
	props.modules.splice(0, props.modules.length, ...DEFAULT_HOME.map((m) => ({ ...m })));
	open.value = null;
}

/** Résumé d'un module replié : son titre. */
const summary = (m: HomeModule) => m.titre || '';
</script>

<template>
	<fieldset class="space-y-3">
		<legend class="font-heading text-sm font-semibold text-gray-900">Modules de la page</legend>
		<p class="text-xs font-light text-gray-500">
			Dans l'ordre d'affichage. Cliquez sur un module pour le modifier.
		</p>

		<VueDraggable
			v-bind="sortableProps"
			tag="ol"
			:model-value="props.modules"
			class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200"
			@update:model-value="reorder"
		>
			<li v-for="(m, i) in props.modules" :key="i + m.type">
				<div :class="['flex items-center gap-2 py-2 pr-3 pl-1.5 text-sm transition-colors hover:bg-gray-100', { 'bg-gray-100': open === m }]">
					<DragHandle :disabled="false" />
					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-2 text-left"
						:aria-expanded="open === m"
						@click="toggle(m, $event)"
					>
						<i :class="['fa-solid', homeModuleDef(m.type).icon, 'w-5 text-center text-primary']" aria-hidden="true"></i>
						<span class="font-medium text-gray-900">{{ homeModuleDef(m.type).label }}</span>
						<span class="min-w-0 truncate text-xs font-light text-gray-500">{{ summary(m) }}</span>
						<i
							:class="['fa-solid fa-chevron-down ml-auto text-xs text-gray-400 transition-transform', { 'rotate-180': open === m }]"
							aria-hidden="true"
						></i>
					</button>
					<span class="flex items-center">
						<OrderArrows
							:label="homeModuleDef(m.type).label"
							:first="i === 0"
							:last="i === props.modules.length - 1"
							:disabled="false"
							@up="move(i, -1)"
							@down="move(i, 1)"
						/>
						<button
							type="button"
							:class="[iconButtonClass, 'text-red-600']"
							:aria-label="`Retirer « ${homeModuleDef(m.type).label} »`"
							title="Retirer de la page"
							@click="remove(i)"
						>
							<i class="fa-solid fa-trash" aria-hidden="true"></i>
						</button>
					</span>
				</div>
				<div v-if="open === m" class="border-t border-gray-100 px-4 py-4">
					<p class="mb-3 text-xs font-light text-gray-500">{{ homeModuleDef(m.type).description }}</p>
					<HomePhotoField v-if="m.type === 'bandeau' && props.photo" :draft="props.photo" :id-prefix="`hm-${i}`" />
					<HomePhotoField
						v-if="m.type === 'presentation' && m.illustration === 'image' && props.illustration"
						:draft="props.illustration"
						:id-prefix="`hm-${i}`"
						libelle="Illustration"
						aide="JPEG, PNG, WebP ou SVG, 10 Mo max ; fond transparent conservé (PNG, WebP, SVG). Affichée entière, sans recadrage."
						:types="ILLUSTRATION_TYPES"
						entiere
					/>
					<HomePhotoField
						v-if="m.type === 'presentation' && m.illustration === 'photo' && props.photo"
						:draft="props.photo"
						:id-prefix="`hm-${i}`"
						libelle="Photo d'accueil"
						aide="Même photo que le fond du module « Bandeau » (JPEG, PNG ou WebP, 10 Mo max)."
					/>
					<BlocFields :fields="homeModuleDef(m.type).fields" :values="m" :id-prefix="`hm-${i}`" />
				</div>
			</li>
			<li v-if="!props.modules.length" class="px-4 py-3 text-sm font-light text-gray-500">
				Aucun module : la page d'accueil sera vide.
			</li>
		</VueDraggable>

		<div class="flex flex-wrap items-center gap-2">
			<label for="hm-new" class="sr-only">Module à ajouter</label>
			<select id="hm-new" v-model="newType" :class="[inputClass, 'mt-0 w-auto min-w-0 flex-1']">
				<option value="" disabled>Ajouter un module…</option>
				<option v-for="[type, def] in available" :key="type" :value="type">{{ def.label }} — {{ def.description }}</option>
			</select>
			<button
				type="button"
				class="bouton bouton-contour"
				:disabled="!newType"
				@click="add"
			>
				<i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>Ajouter
			</button>
		</div>
		<p class="text-xs font-light text-gray-500">
			<button type="button" class="text-primary hover:underline" @click="resetHome">Revenir à l'accueil d'origine</button>
		</p>
	</fieldset>
</template>
