<script setup lang="ts">
/**
 * Champs d'un bloc (ou d'un élément de bloc), d'après leur description dans `src/lib/blocs.ts`.
 * Champs `markdown` et `url` : bloc « Insérer un lien » / « Choisir une page du site » (`LinkPicker`).
 * `photo` : vignette + choix du fichier (`bloc-photos.ts`) ; `video` : lien vérifié
 * (`videoEmbed`) ; `interrupteur` : `Interrupteur.vue` (`oui` / `non`) ; `si` : champ
 * affiché seulement quand l'interrupteur nommé est allumé.
 */
import { ref, shallowReactive } from 'vue';
import { videoEmbed, type BlocField } from '../../../../lib/blocs';
import Interrupteur from '../../Interrupteur.vue';
import LinkPicker from '../../LinkPicker.vue';
import { inputClass } from '../../context';
import { useBlocPhotos } from './bloc-photos';

const props = defineProps<{ fields: BlocField[]; values: Record<string, unknown>; idPrefix: string }>();

const value = (name: string) => String(props.values[name] ?? '');
function set(name: string, event: Event) {
	props.values[name] = (event.target as HTMLInputElement).value;
}

const photos = useBlocPhotos();
const erreurPhoto = ref('');
async function choisirPhoto(name: string, event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = '';
	erreurPhoto.value = '';
	if (!file || !photos) return;
	try {
		props.values[name] = await photos.choisir(file);
	} catch (e) {
		erreurPhoto.value = (e as Error).message;
	}
}
const visible = (f: BlocField) => !f.si || props.values[f.si] === 'oui';

/** Zones de saisie par champ (curseur, pour `LinkPicker`). */
const elements = shallowReactive<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({});
const keep = (name: string) => (el: unknown) => {
	elements[name] = el as HTMLTextAreaElement | HTMLInputElement | null;
};
</script>

<template>
	<div class="space-y-3">
		<template v-for="f in props.fields" :key="f.name">
		<!-- Champ masqué tant que son interrupteur (`si`) est éteint -->
		<template v-if="!visible(f)"></template>
		<!-- Interrupteur : libellé à gauche, bascule à droite -->
		<div v-else-if="f.type === 'interrupteur'" class="flex items-center justify-between gap-3">
			<span :id="`${props.idPrefix}-${f.name}`" class="text-sm text-gray-700">{{ f.label }}</span>
			<Interrupteur
				:model-value="value(f.name) === 'oui'"
				:labelledby="`${props.idPrefix}-${f.name}`"
				@update:model-value="(v: boolean) => (props.values[f.name] = v ? 'oui' : 'non')"
			/>
		</div>
		<!-- Photo : vignette + choix du fichier -->
		<div v-else-if="f.type === 'photo'" class="flex items-center gap-3">
			<span class="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-200 text-gray-400">
				<img v-if="value(f.name) && photos?.apercu(value(f.name))" :src="photos!.apercu(value(f.name))!" alt="" class="h-full w-full object-cover" />
				<i v-else-if="value(f.name)" class="fa-solid fa-image" aria-hidden="true" title="Photo enregistrée (aperçu après publication)"></i>
				<i v-else class="fa-regular fa-image" aria-hidden="true"></i>
			</span>
			<span class="min-w-0 flex-1 text-sm">
				<label class="cursor-pointer font-medium text-primary hover:underline">
					{{ value(f.name) ? 'Remplacer la photo' : 'Choisir une photo' }}
					<input
						:id="`${props.idPrefix}-${f.name}`"
						type="file"
						:accept="f.svg ? 'image/jpeg,image/png,image/webp,image/svg+xml' : 'image/jpeg,image/png,image/webp'"
						class="sr-only"
						@change="choisirPhoto(f.name, $event)"
					/>
				</label>
				<span v-if="!value(f.name)" class="block text-xs font-light text-gray-500">{{ f.svg ? 'SVG, PNG, JPEG ou WebP' : 'JPEG, PNG ou WebP' }}</span>
				<span v-if="erreurPhoto" class="block text-xs text-red-700" role="alert">{{ erreurPhoto }}</span>
			</span>
		</div>
		<div v-else>
			<label :for="`${props.idPrefix}-${f.name}`" class="champ-libelle">
				{{ f.label }}
				<span v-if="!f.required && f.type !== 'select'" class="font-light text-gray-500">(facultatif)</span>
			</label>
			<select
				v-if="f.type === 'select'"
				:id="`${props.idPrefix}-${f.name}`"
				:value="value(f.name)"
				:class="inputClass"
				@change="set(f.name, $event)"
			>
				<option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
			</select>
			<textarea
				v-else-if="f.type === 'textarea' || f.type === 'markdown'"
				:id="`${props.idPrefix}-${f.name}`"
				:ref="keep(f.name)"
				:value="value(f.name)"
				:required="f.required"
				rows="6"
				:class="[inputClass, f.type === 'markdown' ? 'font-mono text-sm leading-relaxed' : '']"
				@input="set(f.name, $event)"
			></textarea>
			<div v-else class="relative">
				<i
					v-if="f.type === 'icon' && value(f.name)"
					:class="['fa-solid', `fa-${value(f.name).replace(/^fa-/, '')}`, 'pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-primary']"
					aria-hidden="true"
				></i>
				<input
					:id="`${props.idPrefix}-${f.name}`"
					:ref="keep(f.name)"
					:value="value(f.name)"
					type="text"
					:required="f.required"
					:inputmode="f.type === 'url' || f.type === 'video' ? 'url' : undefined"
					:class="[inputClass, f.type === 'icon' ? 'pr-9' : '']"
					@input="set(f.name, $event)"
				/>
			</div>
			<p v-if="f.type === 'video' && value(f.name)" class="mt-1 text-xs" :class="videoEmbed(value(f.name)) ? 'text-green-700' : 'text-red-700'">
				<template v-if="videoEmbed(value(f.name))">
					<i class="fa-solid fa-check mr-1" aria-hidden="true"></i>Vidéo {{ videoEmbed(value(f.name))!.source }} reconnue.
				</template>
				<template v-else>Lien non reconnu : copiez l'adresse de la vidéo depuis YouTube, Vimeo ou PeerTube.</template>
			</p>
			<p v-if="f.help" class="champ-aide">{{ f.help }}</p>
			<LinkPicker
				v-if="f.type === 'markdown' || f.type === 'url'"
				:model-value="value(f.name)"
				:field="elements[f.name] ?? null"
				:mode="f.type"
				@update:model-value="(v) => (props.values[f.name] = v)"
			/>
		</div>
		</template>
	</div>
</template>
