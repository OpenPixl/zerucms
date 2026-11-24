<script setup lang="ts">
/**
 * Photo du bandeau d'accueil, dans le module « Bandeau » de l'accueil
 * (`HomeModulesEditor.vue`) : aperçu, remplacement, retrait. Ne fait que
 * modifier le brouillon reçu ; l'envoi est fait avec la page d'accueil
 * (`SitePageForm.vue` → `photo`, `src/lib/home-photo.ts`).
 */
import { photoProblem, PHOTO_TYPES } from '../../context';
import type { HomePhotoDraft } from './home-photo-draft';


const props = defineProps<{ draft: HomePhotoDraft; idPrefix: string }>();

function release() {
	if (props.draft.change.action === 'replace') URL.revokeObjectURL(props.draft.change.url);
}

function pick(input: HTMLInputElement) {
	const file = input.files?.[0];
	input.value = '';
	if (!file) return;
	const problem = photoProblem(file);
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

const fileButtonClass =
	'bouton bouton-contour bouton-mini cursor-pointer focus-within:ring-2 focus-within:ring-primary/40';
</script>

<template>
	<div class="mb-4 space-y-2 rounded-xl bg-gray-100 p-3">
		<p class="champ-libelle">Photo de fond</p>
		<div class="flex flex-wrap items-center gap-3">
			<div class="flex aspect-[16/7] w-48 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white">
				<img
					v-if="props.draft.change.action === 'replace'"
					:src="props.draft.change.url"
					alt="Nouvelle photo d'accueil"
					class="h-full w-full object-cover"
				/>
				<img
					v-else-if="props.draft.change.action === 'keep' && props.draft.current"
					:src="props.draft.current"
					alt="Photo d'accueil actuelle"
					class="h-full w-full object-cover"
				/>
				<span v-else class="px-2 text-center text-xs text-gray-500">Aucune photo : fond uni</span>
			</div>
			<div class="min-w-0 flex-1 space-y-2">
				<p v-if="props.draft.change.action === 'replace'" class="text-xs text-gray-700">
					Nouvelle : <strong class="font-medium">{{ props.draft.change.file.name }}</strong>
				</p>
				<p v-else-if="props.draft.change.action === 'remove'" class="text-xs text-gray-700">La photo sera retirée à l'enregistrement.</p>
				<div class="flex flex-wrap items-center gap-3">
					<label :class="fileButtonClass">
						<i class="fa-solid fa-upload mr-1.5" aria-hidden="true"></i>{{ props.draft.current ? 'Remplacer la photo' : 'Ajouter une photo' }}
						<input :id="`${props.idPrefix}-photo`" type="file" class="sr-only" :accept="PHOTO_TYPES.join(',')" @change="pick($event.target as HTMLInputElement)" />
					</label>
					<button
						v-if="props.draft.current && props.draft.change.action === 'keep'"
						type="button"
						class="text-xs text-red-700 hover:underline"
						@click="set('remove')"
					>
						Retirer la photo
					</button>
					<button v-if="props.draft.change.action !== 'keep'" type="button" class="text-xs text-gray-600 hover:underline" @click="set('keep')">
						Annuler
					</button>
				</div>
			</div>
		</div>
		<p v-if="props.draft.error" class="text-xs text-red-700" role="alert">{{ props.draft.error }}</p>
		<p class="text-xs font-light text-gray-500">
			Photo en paysage (JPEG, PNG ou WebP, 10 Mo max). Si le texte se lit mal, foncez le « voile » ci-dessous.
		</p>
	</div>
</template>
