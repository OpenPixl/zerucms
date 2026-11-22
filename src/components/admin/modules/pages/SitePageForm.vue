<script setup lang="ts">
/**
 * Formulaire d'une page du site (bibliothèque `src/lib/site-pages.ts` :
 * Accueil, Activités…) dans le module « Pages » : lien dans le menu
 * (libellé, visibilité) et textes de la page, section par section — ou,
 * pour l'accueil, ses modules (`HomeModulesEditor.vue`). Un texte
 * vidé reprend sa valeur par défaut ; le serveur n'enregistre que les écarts.
 * Activer / désactiver se fait depuis la liste.
 */
import { computed, inject, onBeforeUnmount, reactive, ref } from 'vue';
import { PAGE_VARIABLES } from '../../../../lib/page-variables';
import { SITE_PAGES } from '../../../../lib/site-pages';
import { ApiError, sitePagesApi, type SaveResult, type SitePageView } from '../../client';
import { isDeferredSubmit } from '../../lot';
import PublishButtons from '../../PublishButtons.vue';
import { ADMIN_CONTEXT, fileToBase64, inputClass, rememberOpenModule } from '../../context';
import type { HomePhotoDraft } from './home-photo-draft';
import HomeModulesEditor from './HomeModulesEditor.vue';
import SeoLength from '../../SeoLength.vue';

/** `homePhoto` : aperçu de la photo du bandeau (accueil). */
const props = defineProps<{ page: SitePageView; disabled: boolean; homePhoto?: string | null }>();
const emit = defineEmits<{ published: [label: string, result: SaveResult]; cancel: [] }>();
const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const def = SITE_PAGES.find((p) => p.id === props.page.id)!;
const form = reactive({
	label: props.page.label,
	show: props.page.show,
	textes: { ...props.page.textes },
	modules: (props.page.modules ?? []).map((m) => ({ ...m })),
});
const error = ref('');
const busy = ref(false);
/** Photo du bandeau (accueil) : modifiée depuis le module « Bandeau », envoyée avec la page. */
const photo = reactive<HomePhotoDraft>({ current: props.homePhoto ?? null, change: { action: 'keep' }, error: '' });
onBeforeUnmount(() => {
	if (photo.change.action === 'replace') URL.revokeObjectURL(photo.change.url);
});

const defaults = Object.fromEntries(def.sections.flatMap((s) => s.texts.map((t) => [t.name, t.default])));
/** Textes différents de l'origine (un texte vide compte comme l'origine). */
const changed = computed(
	() =>
		Object.keys(defaults).filter((name) => {
			const value = (form.textes[name] ?? '').trim();
			return value !== '' && value !== defaults[name];
		}).length,
);

function resetTexts() {
	Object.assign(form.textes, defaults);
}

async function submit(event: Event) {
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('pages-site');
		const result = await sitePagesApi.update(
			props.page.id,
			{
			label: form.label,
			show: form.show,
			active: props.page.active,
			textes: form.textes,
			...(def.modules ? { modules: form.modules } : {}),
			...(photo.change.action === 'remove' ? { photo: 'remove' as const } : {}),
			...(photo.change.action === 'replace'
				? { photo: { type: photo.change.file.type, data: await fileToBase64(photo.change.file) } }
				: {}),
			},
			{ deferred: isDeferredSubmit(event) },
		);
		emit('published', `Page du site : ${form.label}`, result);
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		busy.value = false;
	}
}

const variables = Object.entries(PAGE_VARIABLES).map(([name, v]) => ({ token: `{{${name}}}`, label: v.label }));
</script>

<template>
	<form class="space-y-5" @submit.prevent="submit">
		<p class="text-sm font-light text-gray-600">
			Page du site <strong class="font-medium text-gray-800">{{ def.label }}</strong> ({{ props.page.href }}) : sa mise en
			page est fournie par le site ; vous réglez son lien dans le menu et {{ def.modules ? 'ses modules' : 'ses textes' }}.
		</p>
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>

		<!-- Lien dans le menu -->
		<fieldset class="space-y-3 rounded-xl bg-gray-100 p-4">
			<legend class="sr-only">Lien dans le menu de navigation</legend>
			<div>
				<label for="sp-label" class="champ-libelle">Libellé dans le menu de navigation</label>
				<input id="sp-label" v-model="form.label" type="text" required :placeholder="def.label" :class="inputClass" />
			</div>
			<div>
				<label class="flex items-center gap-2 text-sm text-gray-700">
					<input v-model="form.show" type="checkbox" class="rounded border-gray-300" />
					Visible dans le menu de navigation
				</label>
				<p class="champ-aide">Décoché : la page reste accessible par son adresse.</p>
			</div>
		</fieldset>

		<!-- Page à modules (accueil) -->
		<HomeModulesEditor v-if="def.modules" :modules="form.modules" :photo="photo" />

		<!-- Textes, par section -->
		<fieldset v-for="section in def.sections" :key="section.title" class="space-y-3">
			<legend class="font-heading text-sm font-semibold text-gray-900">{{ section.title }}</legend>
			<div v-for="t in section.texts" :key="t.name">
				<label :for="`sp-${t.name}`" class="champ-libelle">{{ t.label }}</label>
				<textarea
					v-if="t.multiline"
					:id="`sp-${t.name}`"
					v-model="form.textes[t.name]"
					rows="6"
					:placeholder="t.default"
					:class="inputClass"
				></textarea>
				<input v-else :id="`sp-${t.name}`" v-model="form.textes[t.name]" type="text" :placeholder="t.default" :class="inputClass" />
				<SeoLength v-if="t.seo" :text="form.textes[t.name] || t.default" :kind="t.seo.kind" :suffix="t.seo.suffix" />
				<p v-if="t.help" class="champ-aide">{{ t.help }}</p>
			</div>
		</fieldset>

		<details class="text-sm">
			<summary class="cursor-pointer text-primary">Informations de l'association utilisables dans les textes</summary>
			<ul class="mt-2 space-y-1 text-xs text-gray-600">
				<li v-for="v in variables" :key="v.token"><code class="text-gray-900">{{ v.token }}</code> — {{ v.label }}</li>
			</ul>
		</details>

		<p v-if="def.sections.length" class="text-xs font-light text-gray-500">
			Un texte vidé reprend sa valeur d'origine.
			<template v-if="changed">
				{{ changed }} texte{{ changed > 1 ? 's' : '' }} modifié{{ changed > 1 ? 's' : '' }} —
				<button type="button" class="text-primary hover:underline" @click="resetTexts">rétablir les textes d'origine</button>
			</template>
		</p>

		<div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<PublishButtons :busy="busy" :disabled="props.disabled" />
			<button type="button" class="text-sm text-gray-600 hover:underline" @click="emit('cancel')">Annuler</button>
		</div>
	</form>
</template>
