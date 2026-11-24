<script setup lang="ts">
/**
 * Modale « Ajouter un contenu » (premier bouton du menu « Contenus »,
 * `AdminRoot.vue`) : dépôt d'un fichier `.md`, avec ses photos ou en `.zip`
 * (./depot.ts), type lu dans `contenu:` de
 * l'en-tête (à choisir s'il manque), puis `open` → le parent ouvre le module
 * du type, dont le formulaire de création se remplit avec le fichier
 * (`setPendingImport` / `takePendingImport`, ./content-import.ts).
 * Rien n'est publié ici.
 */
import { computed, ref } from 'vue';
import { CONTENT_KEY, CONTENT_KIND_IDS, CONTENT_KINDS, contentKindOf, setPendingImport, type ContentKind } from './content-import';
import { lireDepot, DEPOT_ACCEPT, type Depot } from './depot';
import { readMarkdownFile, textField } from './markdown-file';
import { downloadActivityTemplate } from './modules/activites/activity-markdown';
import { downloadAnnonceTemplate } from './modules/annonces/annonce-markdown';
import { downloadNewsTemplate } from './modules/actualites/news-markdown';
import { downloadPageTemplate } from './modules/pages/page-markdown';

const props = defineProps<{ kinds: ContentKind[] }>();
const emit = defineEmits<{ open: [moduleId: string] }>();

const file = ref<File | null>(null);
const depot = ref<Depot | null>(null);
const title = ref('');
/** Type déclaré dans le fichier (`null` = absent : à choisir). */
const declared = ref<ContentKind | null>(null);
const chosen = ref<ContentKind | null>(null);
const error = ref('');
const dragOver = ref(false);

const kind = computed(() => declared.value ?? chosen.value);
const kindAllowed = computed(() => Boolean(kind.value && props.kinds.includes(kind.value)));

async function pick(fichiers: File[]) {
	error.value = '';
	file.value = null;
	depot.value = null;
	declared.value = null;
	chosen.value = null;
	if (!fichiers.length) return;
	const lu = await lireDepot(fichiers);
	if (!lu.depot) {
		error.value = lu.error!;
		return;
	}
	const f = lu.depot.markdown;
	const read = await readMarkdownFile(f);
	if (!read.data) {
		error.value = read.error ?? 'Fichier illisible.';
		return;
	}
	file.value = f;
	depot.value = lu.depot;
	title.value = textField(read.data.title);
	declared.value = contentKindOf(read.data);
	if (read.data[CONTENT_KEY] !== undefined && !declared.value) {
		error.value = `« ${CONTENT_KEY}: ${String(read.data[CONTENT_KEY])} » inconnu (attendu : ${CONTENT_KIND_IDS.join(', ')}) : choisissez le type ci-dessous.`;
	}
	if (declared.value && !props.kinds.includes(declared.value)) {
		error.value = `Vous n'avez pas accès au module « ${CONTENT_KINDS[declared.value].moduleLabel} ».`;
	}
}

function onInput(event: Event) {
	const input = event.target as HTMLInputElement;
	const fichiers = [...(input.files ?? [])];
	input.value = ''; // recharger le même fichier après l'avoir corrigé
	void pick(fichiers);
}

function onDrop(event: DragEvent) {
	dragOver.value = false;
	void pick([...(event.dataTransfer?.files ?? [])]);
}

function open() {
	if (!depot.value || !kind.value || !kindAllowed.value) return;
	setPendingImport(kind.value, depot.value);
	emit('open', CONTENT_KINDS[kind.value].module);
}
</script>

<template>
	<div class="space-y-4">
		<p class="text-sm font-light text-gray-600">
			Déposez un fichier préparé à partir d'un modèle (avec ses photos, ou le tout en .zip) : le formulaire s'ouvre, déjà
			rempli. Rien n'est publié avant l'enregistrement.
		</p>

		<label
			class="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition-colors"
			:class="dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50'"
			@dragover.prevent="dragOver = true"
			@dragleave="dragOver = false"
			@drop.prevent="onDrop"
		>
			<i class="fa-solid fa-file-import text-3xl text-gray-400" aria-hidden="true"></i>
			<span v-if="file" class="font-medium text-gray-900">{{ file.name }}<template v-if="depot?.photos.length"> + {{ depot.photos.length }} photo(s)</template></span>
			<span v-else class="text-gray-600">Glissez le fichier ici ou <span class="text-primary underline">parcourez</span></span>
			<span class="text-xs font-light text-gray-500">Fichier .md, avec ses photos ou en .zip</span>
			<input type="file" :accept="DEPOT_ACCEPT" multiple class="sr-only" @change="onInput" />
		</label>

		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>

		<div v-if="file" class="rounded-xl bg-gray-100 p-4 text-sm">
			<p class="font-heading font-semibold text-gray-900">{{ title || '(sans titre)' }}</p>
			<p v-if="depot?.photos.length" class="mt-0.5 text-xs text-gray-500">
				<i class="fa-solid fa-images mr-1" aria-hidden="true"></i>{{ depot.photos.length }} photo(s) jointe(s)
			</p>
			<p v-if="declared" class="mt-1 flex items-center gap-2 text-gray-700">
				<i :class="['fa-solid', CONTENT_KINDS[declared].icon, 'text-primary']" aria-hidden="true"></i>
				{{ CONTENT_KINDS[declared].label }}
			</p>
			<fieldset v-else class="mt-2">
				<legend class="champ-libelle">Type de contenu (absent du fichier)</legend>
				<div class="mt-1 flex flex-wrap gap-2">
					<label
						v-for="k in props.kinds"
						:key="k"
						class="flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-1.5"
						:class="chosen === k ? 'border-primary text-primary' : 'border-gray-200 text-gray-700'"
					>
						<input v-model="chosen" type="radio" name="content-kind" :value="k" class="sr-only" />
						<i :class="['fa-solid', CONTENT_KINDS[k].icon]" aria-hidden="true"></i>
						{{ CONTENT_KINDS[k].label }}
					</label>
				</div>
			</fieldset>
		</div>

		<button type="button" class="bouton bouton-primaire w-full" :disabled="!file || !kindAllowed" @click="open">
			<i class="fa-solid fa-arrow-right mr-1.5" aria-hidden="true"></i>
			{{ kind && kindAllowed ? `Créer ${CONTENT_KINDS[kind].une}` : 'Créer le contenu' }}
		</button>

		<p class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-3 text-sm">
			<span class="text-gray-600"><i class="fa-solid fa-download mr-1 text-xs text-gray-400" aria-hidden="true"></i>Modèles :</span>
			<button v-if="props.kinds.includes('actualite')" type="button" class="font-medium text-primary hover:underline" @click="downloadNewsTemplate">actualité</button>
			<template v-if="props.kinds.includes('page')">
				<button type="button" class="font-medium text-primary hover:underline" @click="downloadPageTemplate('classique')">page</button>
				<button type="button" class="font-medium text-primary hover:underline" @click="downloadPageTemplate('enrichie')">page enrichie</button>
			</template>
			<button v-if="props.kinds.includes('activite')" type="button" class="font-medium text-primary hover:underline" @click="downloadActivityTemplate">activité</button>
			<button v-if="props.kinds.includes('annonce')" type="button" class="font-medium text-primary hover:underline" @click="downloadAnnonceTemplate">annonce</button>
		</p>
	</div>
</template>
