<script setup lang="ts">
/**
 * Photo d'accueil (`images/accueil.*`), dans les modules « Bandeau » (fond)
 * et « Présentation » (illustration) de l'accueil (`HomeModulesEditor.vue`) :
 * aperçu, remplacement, retrait. Ne fait que
 * modifier le brouillon reçu ; l'envoi est fait avec la page d'accueil
 * (`SitePageForm.vue` → `photo`, `src/lib/home-photo.ts`).
 */
import { computed } from 'vue';
import { photoProblem, PHOTO_MAX, PHOTO_TYPES } from '../../context';
import type { HomePhotoDraft } from './home-photo-draft';


/**
 * `libelle` / `aide` : titre et conseil propres au module (défaut : fond du bandeau) ;
 * `types` : formats acceptés (défaut : photos JPEG, PNG, WebP) ; `entiere` :
 * aperçu sans recadrage (illustration, logo).
 */
const props = withDefaults(
	defineProps<{ draft: HomePhotoDraft; idPrefix: string; libelle?: string; aide?: string; types?: string[]; entiere?: boolean }>(),
	{
		libelle: 'Photo de fond',
		aide: 'Photo en paysage (JPEG, PNG ou WebP, 10 Mo max). Si le texte se lit mal, foncez le « voile » ci-dessous.',
		types: () => PHOTO_TYPES,
		entiere: false,
	},
);

function release() {
	if (props.draft.change.action === 'replace') URL.revokeObjectURL(props.draft.change.url);
}

function pick(input: HTMLInputElement) {
	const file = input.files?.[0];
	input.value = '';
	if (!file) return;
	const problem = props.entiere ? imageProblem(file) : photoProblem(file);
	props.draft.error = problem ?? '';
	if (problem) return;
	release();
	props.draft.change = { action: 'replace', file, url: URL.createObjectURL(file) };
}

function set(action: 'keep' | 'remove') {
	release();
	props.draft.error = '';
	props.draft.change = { action };
}

/** Problème d'une image (formats `types`, SVG compris) ; contenu du SVG vérifié par le serveur. */
function imageProblem(file: File): string | null {
	if (!props.types.includes(file.type)) return 'Formats acceptés : JPEG, PNG, WebP ou SVG.';
	if (file.size > PHOTO_MAX) return 'Le fichier est trop lourd (10 Mo max).';
	return null;
}

/** « la photo » ou « l'image » dans les libellés. */
const nom = computed(() => (props.entiere ? { le: "l'image", un: 'une image', Le: "L'image" } : { le: 'la photo', un: 'une photo', Le: 'La photo' }));

const fileButtonClass =
	'bouton bouton-contour bouton-mini cursor-pointer focus-within:ring-2 focus-within:ring-primary/40';
</script>

<template>
	<div class="mb-4 space-y-2 rounded-xl bg-gray-100 p-3">
		<p class="champ-libelle">{{ props.libelle }}</p>
		<div class="flex flex-wrap items-center gap-3">
			<div class="flex aspect-[16/7] w-48 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white">
				<img
					v-if="props.draft.change.action === 'replace'"
					:src="props.draft.change.url"
					:alt="props.entiere ? 'Nouvelle image' : 'Nouvelle photo d\'accueil'"
					:class="['h-full w-full', props.entiere ? 'object-contain p-1' : 'object-cover']"
				/>
				<img
					v-else-if="props.draft.change.action === 'keep' && props.draft.current"
					:src="props.draft.current"
					:alt="props.entiere ? 'Image actuelle' : 'Photo d\'accueil actuelle'"
					:class="['h-full w-full', props.entiere ? 'object-contain p-1' : 'object-cover']"
				/>
				<span v-else class="px-2 text-center text-xs text-gray-500">{{ props.entiere ? 'Aucune image' : 'Aucune photo : fond uni' }}</span>
			</div>
			<div class="min-w-0 flex-1 space-y-2">
				<p v-if="props.draft.change.action === 'replace'" class="text-xs text-gray-700">
					Nouvelle : <strong class="font-medium">{{ props.draft.change.file.name }}</strong>
				</p>
				<p v-else-if="props.draft.change.action === 'remove'" class="text-xs text-gray-700">{{ nom.Le }} sera retirée à l'enregistrement.</p>
				<div class="flex flex-wrap items-center gap-3">
					<label :class="fileButtonClass">
						<i class="fa-solid fa-upload mr-1.5" aria-hidden="true"></i>{{ props.draft.current ? `Remplacer ${nom.le}` : `Ajouter ${nom.un}` }}
						<input :id="`${props.idPrefix}-photo`" type="file" class="sr-only" :accept="props.types.join(',')" @change="pick($event.target as HTMLInputElement)" />
					</label>
					<button
						v-if="props.draft.current && props.draft.change.action === 'keep'"
						type="button"
						class="text-xs text-red-700 hover:underline"
						@click="set('remove')"
					>
						Retirer {{ nom.le }}
					</button>
					<button v-if="props.draft.change.action !== 'keep'" type="button" class="text-xs text-gray-600 hover:underline" @click="set('keep')">
						Annuler
					</button>
				</div>
			</div>
		</div>
		<p v-if="props.draft.error" class="text-xs text-red-700" role="alert">{{ props.draft.error }}</p>
		<p class="text-xs font-light text-gray-500">{{ props.aide }}</p>
	</div>
</template>
