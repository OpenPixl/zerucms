<script setup lang="ts">
/**
 * Formulaire d'une annonce de la bannière (module « Annonces ») : création
 * ou modification, avec aperçu de la bannière. Le serveur valide tout
 * (src/lib/annonce-writer.ts) et reconstruit le site. Fichier `.md`
 * (./annonce-markdown.ts) : à télécharger ou à recharger en modification
 * (`EditFileBar`) ; en création, `initialFile` (« Ajouter un contenu »)
 * pré-remplit le formulaire.
 */
import { lireDepot, type Depot } from '../../depot';
import { computed, inject, reactive, ref } from 'vue';
import {
	ANNONCE_CTA_LABEL_MAX,
	ANNONCE_DEFAULT_ICON,
	ANNONCE_ICONS,
	ANNONCE_MESSAGE_MAX,
	ANNONCE_TITLE_MAX,
	ANNONCE_TONE_LABELS,
	ANNONCE_TONES,
} from '../../../../lib/annonce-options';
import { ApiError, annoncesApi, type AnnonceInput, type AnnonceItem, type SaveResult } from '../../client';
import { ADMIN_CONTEXT, inputClass, rememberOpenModule } from '../../context';
import EditFileBar from '../../EditFileBar.vue';
import FormHeader from '../../FormHeader.vue';
import LinkPicker from '../../LinkPicker.vue';
import { isDeferredSubmit } from '../../lot';
import { downloadMarkdown, readMarkdownFile } from '../../markdown-file';
import PublishButtons from '../../PublishButtons.vue';
import { annonceMarkdownFile, parseAnnonceMarkdown } from './annonce-markdown';
import { isoDay } from './dates';

const props = defineProps<{
	source: AnnonceItem | null;
	disabled: boolean;
	/** Création à partir d'un fichier déposé dans « Ajouter un contenu » (menu Contenus). */
	initialFile?: Depot;
}>();
const emit = defineEmits<{ published: [label: string, result: SaveResult]; cancel: [] }>();
const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const editing = props.source;
const today = new Date();
const inTwoWeeks = new Date(today.getTime() + 14 * 86_400_000);

const form = reactive<AnnonceInput>({
	title: editing?.title ?? '',
	message: editing?.message ?? '',
	startDate: editing?.startDate ?? isoDay(today),
	endDate: editing?.endDate ?? isoDay(inTwoWeeks),
	tone: editing?.tone ?? 'info',
	icon: editing?.icon ?? ANNONCE_DEFAULT_ICON,
	ctaLabel: editing?.ctaLabel ?? '',
	ctaHref: editing?.ctaHref ?? '',
	active: editing?.active ?? true,
});
/** Icône écrite à la main (annonces.yaml, fichier .md), hors de la liste proposée : gardée en tête. */
const icons = computed(() =>
	form.icon && !ANNONCE_ICONS.some((i) => i.icon === form.icon) ? [{ icon: form.icon, label: 'Icône actuelle' }, ...ANNONCE_ICONS] : ANNONCE_ICONS,
);
const hrefField = ref<HTMLInputElement | null>(null);
const error = ref('');
const busy = ref(false);
/** Dernier fichier chargé et remarques de lecture. */
const imported = ref<{ name: string; warnings: string[] } | null>(null);

function downloadFile() {
	downloadMarkdown(`annonce-${editing?.id ?? 'nouvelle'}.md`, annonceMarkdownFile(form));
}

/** Fichier `.md` chargé (une annonce n'a pas de photo : les autres fichiers sont ignorés). */
async function loadFile(entree: File[] | Depot) {
	error.value = '';
	let depot: Depot;
	if (Array.isArray(entree)) {
		const lu = await lireDepot(entree);
		if (!lu.depot) {
			error.value = lu.error!;
			return;
		}
		depot = lu.depot;
	} else depot = entree;
	const file = depot.markdown;
	const read = await readMarkdownFile(file);
	if (read.error) {
		error.value = read.error;
		return;
	}
	const { fields, warnings, error: problem } = parseAnnonceMarkdown(await file.text());
	if (!fields) {
		error.value = problem!;
		return;
	}
	Object.assign(form, fields);
	imported.value = { name: file.name, warnings };
}

if (props.initialFile && !editing) void loadFile(props.initialFile);

async function submit(event: Event) {
	error.value = '';
	if (form.endDate < form.startDate) {
		error.value = 'La date de fin doit suivre la date de début.';
		return;
	}
	if (Boolean(form.ctaLabel.trim()) !== Boolean(form.ctaHref.trim())) {
		error.value = 'Lien : renseignez le texte ET l’adresse, ou laissez les deux vides.';
		return;
	}
	busy.value = true;
	try {
		rememberOpenModule('annonces');
		const options = { deferred: isDeferredSubmit(event) };
		const annonce = { ...form };
		const result = editing ? await annoncesApi.update(editing.id, annonce, options) : await annoncesApi.create(annonce, options);
		emit('published', `Annonce : ${form.title.trim()}`, result);
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<FormHeader back="Toutes les annonces" :title="form.title.trim() || (editing ? editing.title : 'Nouvelle annonce')" :editing="Boolean(editing)" @back="emit('cancel')" />
	<form class="space-y-5" @submit.prevent="submit">
		<p class="text-sm font-light text-gray-600">
			L'annonce s'affiche en haut de toutes les pages, entre ses deux dates.
		</p>
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>

		<div v-if="imported && !editing" class="rounded-lg bg-primary/5 px-3 py-2 text-sm text-gray-700" role="status">
			<p>
				<i class="fa-solid fa-file-circle-check mr-1 text-primary" aria-hidden="true"></i>
				Formulaire rempli depuis <strong>{{ imported.name }}</strong> : vérifiez les dates puis publiez.
			</p>
			<ul v-if="imported.warnings.length" class="mt-1 list-disc pl-5 text-xs text-amber-800">
				<li v-for="w in imported.warnings" :key="w">{{ w }}</li>
			</ul>
		</div>
		<EditFileBar v-if="editing" :imported="imported" @download="downloadFile" @load="loadFile" />

		<!-- Aperçu de la bannière -->
		<div :class="['flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-lg px-4 py-2 text-center text-sm', ANNONCE_TONE_LABELS[form.tone].className]" aria-hidden="true">
			<i :class="['fa-solid', form.icon || ANNONCE_DEFAULT_ICON, 'shrink-0']"></i>
			<span class="font-heading font-semibold">{{ form.title || 'Titre de l’annonce' }}</span>
			<span class="opacity-90">{{ form.message || 'Message de l’annonce.' }}</span>
			<span v-if="form.ctaLabel && form.ctaHref" class="font-semibold underline underline-offset-2">{{ form.ctaLabel }} →</span>
		</div>

		<div>
			<label for="annonce-title" class="champ-libelle">Titre</label>
			<input id="annonce-title" v-model="form.title" type="text" required :maxlength="ANNONCE_TITLE_MAX" :class="inputClass" />
		</div>
		<div>
			<label for="annonce-message" class="champ-libelle">Message</label>
			<textarea id="annonce-message" v-model="form.message" rows="6" required :maxlength="ANNONCE_MESSAGE_MAX" :class="inputClass"></textarea>
			<p class="champ-aide">Une à deux phrases.</p>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<label for="annonce-start" class="champ-libelle">Afficher à partir du</label>
				<input id="annonce-start" v-model="form.startDate" type="date" required :class="inputClass" />
			</div>
			<div>
				<label for="annonce-end" class="champ-libelle">Jusqu'au (inclus)</label>
				<input id="annonce-end" v-model="form.endDate" type="date" required :min="form.startDate" :class="inputClass" />
			</div>
		</div>

		<fieldset>
			<legend class="text-sm font-semibold text-gray-700">Couleur de la bannière</legend>
			<div class="mt-2 flex flex-wrap gap-2">
				<label
					v-for="tone in ANNONCE_TONES"
					:key="tone"
					:class="[
						'flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 ring-inset has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
						form.tone === tone ? 'ring-gray-900' : 'ring-gray-200 hover:bg-gray-50',
					]"
				>
					<input v-model="form.tone" type="radio" name="annonce-tone" :value="tone" class="sr-only" />
					<span :class="['h-4 w-4 rounded-full', ANNONCE_TONE_LABELS[tone].className]" aria-hidden="true"></span>
					{{ ANNONCE_TONE_LABELS[tone].label }}
				</label>
			</div>
		</fieldset>

		<fieldset>
			<legend class="text-sm font-semibold text-gray-700">Icône</legend>
			<div class="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-9">
				<label
					v-for="i in icons"
					:key="i.icon"
					:title="i.label"
					:class="[
						'flex aspect-square cursor-pointer items-center justify-center rounded-lg text-lg ring-1 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
						form.icon === i.icon ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-100',
					]"
				>
					<input v-model="form.icon" type="radio" name="annonce-icon" :value="i.icon" class="sr-only" :aria-label="i.label" />
					<i :class="['fa-solid', i.icon]" aria-hidden="true"></i>
				</label>
			</div>
		</fieldset>

		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<label for="annonce-cta-label" class="champ-libelle">Texte du lien <span class="font-light text-gray-500">(facultatif)</span></label>
				<input id="annonce-cta-label" v-model="form.ctaLabel" type="text" :maxlength="ANNONCE_CTA_LABEL_MAX" :class="inputClass" placeholder="Voir les détails" />
			</div>
			<div>
				<label for="annonce-cta-href" class="champ-libelle">Adresse du lien</label>
				<input id="annonce-cta-href" ref="hrefField" v-model="form.ctaHref" type="text" inputmode="url" :class="inputClass" placeholder="/actualites/… ou https://…" />
			</div>
		</div>
		<LinkPicker v-model="form.ctaHref" :field="hrefField" mode="url" />

		<label class="flex items-start gap-2 text-sm text-gray-700">
			<input v-model="form.active" type="checkbox" class="mt-0.5" />
			<span>
				Annonce active
				<span class="block text-xs font-light text-gray-500">Décochée : l'annonce reste en brouillon.</span>
			</span>
		</label>

		<div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<PublishButtons :label="editing ? 'Enregistrer et publier' : 'Créer et publier'" :busy="busy" :disabled="props.disabled" />
			<button type="button" class="text-sm text-gray-600 hover:underline" @click="emit('cancel')">Annuler</button>
		</div>
	</form>
</template>
