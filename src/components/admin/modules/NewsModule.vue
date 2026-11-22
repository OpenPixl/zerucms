<script setup lang="ts">
/**
 * Module « Actualités » (groupes `redacteur` / `admin`) : liste des
 * actualités (brouillons compris), ajout par dépôt d'un fichier `.md`
 * (frontmatter habituel, cf. docs/actualites.md) et d'une photo de
 * couverture, édition dans un formulaire en onglets Informations / Contenu /
 * Image, fichier `.md` à télécharger ou à recharger (`EditFileBar`,
 * ./actualites/news-markdown.ts) ; le dossier, donc l'URL, ne change
 * pas ; suppression (confirmée dans la ligne par la pastille de `ConfirmIconButton`, sans boîte de dialogue).
 *
 * Le serveur écrit `src/content/news/<AAAA-MM-JJ-slug>/` puis reconstruit le
 * site (≈ 1 min, cf. src/lib/site-build.ts) : le module suit la publication
 * (`/api/admin/publication`) jusqu'à sa mise en ligne, y compris pendant le
 * bref redémarrage du serveur. « Enregistrer sans publier » : rien n'est
 * reconstruit, la modification rejoint le lot en attente (`../lot.ts`).
 * L'aperçu du frontmatter est indicatif ; le serveur fait la vraie validation.
 */
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, toRaw } from 'vue';
import type { Bloc } from '../../../lib/blocs';
import BlocsEditor from './pages/BlocsEditor.vue';
import { fournirBlocPhotos } from './pages/bloc-photos';
import { insererMarqueur } from './pages/marqueur';
import ConfirmIconButton from '../ConfirmIconButton.vue';
import EditFileBar from '../EditFileBar.vue';
import FormHeader from '../FormHeader.vue';
import FormTabs from '../FormTabs.vue';
import LinkPicker from '../LinkPicker.vue';
import PublishButtons from '../PublishButtons.vue';
import PublishStatus from '../PublishStatus.vue';
import SeoLength from '../SeoLength.vue';
import { ApiError, newsApi, type CoverUpdate, type NewsFields, type NewsItem } from '../client';
import { ADMIN_CONTEXT, inputClass, rememberOpenModule, takeModuleToReopen } from '../context';
import { EDIT_TABS, useFormTabs, type EditTab } from '../form-tabs';
import { isDeferredSubmit, isPendingHref } from '../lot';
import { contentKindProblem, takePendingImport } from '../content-import';
import { parseMarkdownFile, readMarkdownFile, textField } from '../markdown-file';
import { DEPOT_ACCEPT, lireDepot, photosDuDepot, remarquesDepot, trouverPhoto, type Depot } from '../depot';
import { lireBlocsFichier } from '../blocs-fichier';
import { photoPourEnvoi } from './pages/bloc-photos';
import { telechargerContenu } from '../zip-contenu';
import { usePublication } from '../usePublication';
import { downloadNewsTemplate as downloadTemplate, newsMarkdownFile, parseNewsMarkdown } from './actualites/news-markdown';

const { sessionExpired, onCloseRequest } = inject(ADMIN_CONTEXT)!;

const view = ref<'list' | 'add' | 'edit'>('list');
const news = ref<NewsItem[]>([]);
const loading = ref(true);
const error = ref('');
const availability = ref<{ ok: boolean; reason?: string }>({ ok: true });
const mdFile = ref<File | null>(null);
const mdText = ref('');
const photo = ref<File | null>(null);
const photoUrl = ref('');
const busy = ref(false);
/** Actualité dont la suppression attend confirmation (slug). */
const confirmingDelete = ref<string | null>(null);
const dragOver = ref<'md' | 'photo' | null>(null);

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX = 10 * 1024 * 1024;

function fail(e: unknown) {
	takeModuleToReopen(); // l'enregistrement a échoué : pas de réouverture au prochain chargement
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

async function load() {
	loading.value = true;
	try {
		const res = await newsApi.list();
		news.value = res.news;
		availability.value = res.availability;
		receive(res.status);
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

// --- Suivi de la publication ---

const { status, following, receive, afterSave, publishLot, savedLabel, dismiss: dismissStatus, reloadIn, cancelReload } = usePublication({
	module: 'actualites',
	onSettled: () => load(),
	onError: fail,
});

// ✕ / Échap depuis un formulaire : retour à la liste plutôt que fermeture du panneau.
const stopCloseRequest = onCloseRequest(() => {
	if (view.value === 'list') return false;
	backToList();
	return true;
});

onBeforeUnmount(stopCloseRequest);

// --- Dépôt ---

/** Aperçu indicatif : lignes `clé: valeur` du frontmatter. */
const preview = computed(() => {
	const match = mdText.value.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const fields: Record<string, string> = {};
	for (const line of match[1].split('\n')) {
		const m = line.match(/^(\w+):\s*(.*)$/);
		if (m) fields[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
	}
	return fields;
});
const missing = computed(() =>
	preview.value ? ['title', 'publishAt', 'excerpt'].filter((k) => !preview.value![k]) : [],
);

/** Dépôt d'ajout : photos des blocs citées par le `.md` (nom cité → fichier) et remarques. */
const depotAjout = ref<{ photos: Map<string, File>; remarques: string[]; nbPhotos: number } | null>(null);

/** Fichier `.md` déposé, seul, avec ses photos ou en `.zip` (cf. `depot.ts`). */
async function pickMarkdown(entree: File[] | Depot | undefined) {
	error.value = '';
	if (!entree || (Array.isArray(entree) && !entree.length)) return;
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
	const text = await file.text();
	const { data } = parseMarkdownFile(text);
	const wrongKind = data && contentKindProblem(data, 'actualite');
	if (wrongKind) {
		error.value = wrongKind;
		return;
	}
	// Photos citées par les blocs : envoyées sous le nom cité ; le serveur les range (photo_<n>.jpg).
	const photos = new Map<string, File>();
	const citees = new Set<File>();
	const { warnings } = lireBlocsFichier(data?.blocs, (nom) => {
		const f = trouverPhoto(depot, nom);
		if (!f) return null;
		photos.set(nom, f);
		citees.add(f);
		return 'nouvelle:depot';
	});
	const cover = textField(data?.cover);
	const photoCouverture = cover ? trouverPhoto(depot, cover) : undefined;
	if (photoCouverture) {
		citees.add(photoCouverture);
		if (!photo.value) pickPhoto(photoCouverture);
	} else if (cover) warnings.push(`Photo de couverture « ${cover} » absente : déposez-la avec le fichier, ou ci-dessous.`);
	depotAjout.value = { photos, remarques: [...warnings, ...remarquesDepot(depot, citees)], nbPhotos: depot.photos.length };
	mdFile.value = file;
	mdText.value = text;
}

function pickPhoto(file: File | undefined) {
	error.value = '';
	if (!file) return;
	if (!PHOTO_TYPES.includes(file.type)) {
		error.value = 'Photo : formats acceptés JPEG, PNG ou WebP.';
		return;
	}
	if (file.size > PHOTO_MAX) {
		error.value = 'La photo est trop lourde (10 Mo max).';
		return;
	}
	if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
	photo.value = file;
	photoUrl.value = URL.createObjectURL(file);
}

function onDrop(kind: 'md' | 'photo', event: DragEvent) {
	dragOver.value = null;
	const files = [...(event.dataTransfer?.files ?? [])];
	if (kind === 'md') pickMarkdown(files);
	else pickPhoto(files[0]);
}

function reset() {
	mdFile.value = null;
	depotAjout.value = null;
	mdText.value = '';
	photo.value = null;
	if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
	photoUrl.value = '';
}

function toBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
		reader.onerror = () => reject(new Error('Lecture de la photo impossible.'));
		reader.readAsDataURL(file);
	});
}

async function submit(event: Event) {
	error.value = '';
	busy.value = true;
	try {
		const cover = photo.value ? { type: photo.value.type, data: await toBase64(photo.value) } : null;
		rememberOpenModule('actualites');
		const photos: Record<string, { type: string; data: string }> = {};
		for (const [nom, f] of depotAjout.value?.photos ?? []) photos[nom] = await photoPourEnvoi(f);
		const result = await newsApi.create(mdText.value, cover, { deferred: isDeferredSubmit(event) }, photos);
		afterSave(preview.value?.title || 'Nouvelle actualité', result);
		reset();
		view.value = 'list';
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

async function remove(item: NewsItem, deferred: boolean) {
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('actualites');
		const result = await newsApi.remove(item.slug, { deferred });
		confirmingDelete.value = null;
		afterSave(`Suppression : ${item.title}`, result);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

// --- Édition ---

/** Actualité en cours d'édition (slug = dossier, inchangé). */
const editing = ref<{ slug: string; title: string; coverUrl: string | null; hasCover: boolean; cover: string | null } | null>(null);
/** Zone du texte (curseur, pour `LinkPicker`). */
const bodyField = ref<HTMLTextAreaElement | null>(null);
const editForm = reactive<NewsFields & { body: string }>({
	title: '',
	publishAt: '',
	excerpt: '',
	isPublish: true,
	tag: '',
	author: '',
	imageCredit: '',
	body: '',
});
const coverAction = ref<'keep' | 'replace' | 'remove'>('keep');
const { tab: editTab, onInvalid } = useFormTabs<EditTab>('ed', 'infos');
/** Blocs placés dans le texte (photos, vidéo, carrousel…), vignettes des photos publiées. */
const blocs = reactive<Record<string, Bloc>>({});
const apercus = reactive<Record<string, string>>({});
const blocPhotos = fournirBlocPhotos(apercus);
onBeforeUnmount(blocPhotos.liberer);
function remplacerBlocs(nouveaux: Record<string, Bloc>) {
	for (const id of Object.keys(blocs)) delete blocs[id];
	Object.assign(blocs, structuredClone(toRaw(nouveaux)));
}
function insertMarker(id: string) {
	return insererMarqueur(editForm.body, (texte) => (editForm.body = texte), bodyField.value, id);
}
/** Dernier fichier chargé dans le formulaire et remarques de lecture. */
const imported = ref<{ name: string; warnings: string[] } | null>(null);

function downloadFile() {
	if (!editing.value) return;
	error.value = '';
	const { slug, hasCover } = editing.value;
	// `.md` d'après le formulaire, en `.zip` avec ses photos s'il y en a (`zip-contenu.ts`).
	telechargerContenu({
		nom: slug,
		dossier: `news/${slug}`,
		blocs,
		photos: blocPhotos.api,
		couverture: {
			actuelle: hasCover ? (editing.value.cover ?? './cover.jpg') : null,
			nouvelle: coverAction.value === 'replace' ? photo.value : null,
			retiree: coverAction.value === 'remove',
		},
		construire: (b, cover) => newsMarkdownFile({ ...editForm, blocs: b }, cover),
	}).catch((e: Error) => (error.value = e.message));
}

async function loadFile(fichiers: File[]) {
	error.value = '';
	const lu = await lireDepot(fichiers);
	if (!lu.depot) {
		error.value = lu.error!;
		return;
	}
	const depot = lu.depot;
	const file = depot.markdown;
	const read = await readMarkdownFile(file);
	if (read.error) {
		error.value = read.error;
		return;
	}
	const citees = new Set<File>();
	const { fields, warnings, error: problem } = parseNewsMarkdown(await file.text(), photosDuDepot(depot, blocPhotos.api, citees));
	if (!fields) {
		error.value = problem!;
		return;
	}
	const { blocs: lus, cover, ...champs } = fields;
	Object.assign(editForm, { ...champs, publishAt: fields.publishAt || editForm.publishAt });
	remplacerBlocs(lus);
	if (cover) {
		const photoCouverture = trouverPhoto(depot, cover);
		if (photoCouverture) {
			citees.add(photoCouverture);
			pickEditPhoto(photoCouverture);
		} else warnings.push(`Photo de couverture « ${cover} » absente : déposez-la avec le fichier, ou choisissez-la dans l'onglet « Image ».`);
	}
	warnings.push(...remarquesDepot(depot, citees));
	if (!fields.title) warnings.unshift('Titre absent du fichier : à saisir dans « Informations ».');
	imported.value = { name: depot.photos.length ? `${file.name} + ${depot.photos.length} photo(s)` : file.name, warnings };
}

async function openEdit(item: NewsItem) {
	error.value = '';
	confirmingDelete.value = null;
	busy.value = true;
	try {
		const source = await newsApi.get(item.slug);
		Object.assign(editForm, {
			title: source.title,
			publishAt: source.publishAt,
			excerpt: source.excerpt,
			isPublish: source.isPublish,
			tag: source.tag,
			author: source.author,
			imageCredit: source.imageCredit,
			body: source.body,
		});
		remplacerBlocs((source.blocs ?? {}) as Record<string, Bloc>);
		blocPhotos.liberer();
		for (const k of Object.keys(apercus)) delete apercus[k];
		Object.assign(apercus, source.blocPhotoUrls ?? {});
		editing.value = { slug: source.slug, title: source.title, coverUrl: source.coverUrl, hasCover: Boolean(source.cover), cover: source.cover };
		coverAction.value = 'keep';
		editTab.value = 'infos';
		imported.value = null;
		reset();
		view.value = 'edit';
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

function pickEditPhoto(file: File | undefined) {
	pickPhoto(file);
	if (photo.value) coverAction.value = 'replace';
}

async function saveEdit(event: Event) {
	if (!editing.value) return;
	error.value = '';
	busy.value = true;
	try {
		const { body, ...fields } = editForm;
		let cover: CoverUpdate = { action: 'keep' };
		if (coverAction.value === 'remove') cover = { action: 'remove' };
		if (coverAction.value === 'replace' && photo.value) {
			cover = { action: 'replace', type: photo.value.type, data: await toBase64(photo.value) };
		}
		rememberOpenModule('actualites');
		const result = await newsApi.update(editing.value.slug, fields, body, cover, { deferred: isDeferredSubmit(event) }, blocs, await blocPhotos.envoi(blocs));
		afterSave(`Modification : ${editForm.title}`, result);
		reset();
		editing.value = null;
		view.value = 'list';
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

function backToList() {
	error.value = '';
	reset();
	editing.value = null;
	view.value = 'list';
}

function openAdd() {
	error.value = '';
	reset();
	view.value = 'add';
}

const formatDate = (iso: string) =>
	new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

onMounted(async () => {
	// Fichier déposé dans « Ajouter un contenu » (menu Contenus) : formulaire d'ajout pré-rempli.
	const pending = takePendingImport('actualite');
	if (pending) {
		openAdd();
		void pickMarkdown(pending);
	}
	await load();
});
</script>

<template>
	<!-- Publication en cours / dernier résultat -->
	<PublishStatus
		:status="status"
		:following="following"
		:reload-in="reloadIn"
		:saved-label="savedLabel"
		:locked="!availability.ok || following || busy"
		@dismiss="dismissStatus"
		@cancel-reload="cancelReload"
		@publish-lot="publishLot"
	/>

	<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>

	<!-- Liste -->
	<template v-if="view === 'list'">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<button
				type="button"
				class="bouton bouton-primaire"
				:disabled="!availability.ok || following"
				@click="openAdd"
			>
				<i class="fa-solid fa-plus mr-1.5" aria-hidden="true"></i>
				Ajouter une actualité
			</button>
			<a href="/actualites" class="text-sm font-medium text-primary hover:underline">
				Voir la page Actualités <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i>
			</a>
		</div>
		<p v-if="!availability.ok" class="mb-4 alerte-attention">
			{{ availability.reason }}
		</p>

		<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
		<p v-else-if="news.length === 0" class="text-sm font-light text-gray-500">Aucune actualité pour l'instant.</p>
		<ul v-else class="divide-y divide-gray-100 rounded-xl border border-gray-100">
			<li v-for="a in news" :key="a.slug" class="px-4 py-3">
				<div class="flex items-center gap-3">
					<span class="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-primary/10 to-secondary/10">
						<img v-if="a.thumbnail" :src="a.thumbnail" alt="" class="h-full w-full object-cover" loading="lazy" />
					</span>
					<span class="min-w-0 flex-1">
						<!-- Le titre ouvre l'édition ; l'icône 👁 mène à la page publique. -->
						<button
							type="button"
							class="block max-w-full truncate text-left text-sm font-medium hover:text-primary disabled:cursor-default disabled:hover:text-inherit"
							:class="a.isPublish ? 'text-gray-900' : 'text-gray-500'"
							:disabled="!availability.ok || following || busy"
							:title="`Modifier « ${a.title} »`"
							@click="openEdit(a)"
						>
							{{ a.title }}
						</button>
						<span class="block truncate text-xs font-light text-gray-500">
							{{ formatDate(a.publishAt) }}<template v-if="a.tag"> · {{ a.tag }}</template>
						</span>
					</span>
					<span v-if="isPendingHref(a.href)" class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800" title="Modification enregistrée, pas encore publiée">À publier</span>
					<span v-if="!a.isPublish" class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Brouillon</span>
					<a
						v-if="a.isPublish"
						:href="a.href"
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
						:aria-label="`Voir « ${a.title} » sur le site`"
						:title="`Voir « ${a.title} » sur le site`"
					>
						<i class="fa-solid fa-eye text-sm" aria-hidden="true"></i>
					</a>
					<ConfirmIconButton
						class="shrink-0"
						label="Supprimer"
						:title="`Supprimer « ${a.title} » (définitif)`"
						:confirming="confirmingDelete === a.slug"
						:disabled="!availability.ok || following || busy"
						deferrable
						@ask="confirmingDelete = a.slug"
						@confirm="remove(a, $event)"
						@cancel="confirmingDelete = null"
					/>
				</div>
			</li>
		</ul>
	</template>

	<!-- Ajout -->
	<form v-else-if="view === 'add'" class="space-y-5" @submit.prevent="submit">
		<FormHeader back="Toutes les actualités" :title="preview?.title || 'Nouvelle actualité'" :editing="false" @back="backToList" />

		<!-- Fichier Markdown -->
		<div>
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<p class="champ-libelle">1. Le texte (fichier .md)</p>
				<button type="button" class="text-sm font-medium text-primary hover:underline" @click="downloadTemplate">
					<i class="fa-solid fa-download mr-1 text-xs" aria-hidden="true"></i>
					Télécharger un modèle
				</button>
			</div>
			<p class="champ-aide">
				Le modèle est daté du jour : complétez-le dans un éditeur de texte puis déposez-le ici, avec les photos qu'il cite
				(ou le tout en .zip).
			</p>
			<label
				class="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors"
				:class="dragOver === 'md' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50'"
				@dragover.prevent="dragOver = 'md'"
				@dragleave="dragOver = null"
				@drop.prevent="onDrop('md', $event)"
			>
				<i class="fa-solid fa-file-lines text-2xl text-gray-400" aria-hidden="true"></i>
				<span v-if="mdFile" class="font-medium text-gray-900">{{ mdFile.name }}<template v-if="depotAjout?.nbPhotos"> + {{ depotAjout.nbPhotos }} photo(s)</template></span>
				<span v-else class="text-gray-600">Glissez le fichier ici ou <span class="text-primary underline">parcourez</span></span>
				<input type="file" :accept="DEPOT_ACCEPT" multiple class="sr-only" @change="pickMarkdown([...(($event.target as HTMLInputElement).files ?? [])])" />
			</label>

			<div v-if="mdFile" class="mt-3 rounded-xl bg-gray-100 p-4 text-sm">
				<p v-if="!preview" class="text-red-700">
					En-tête (frontmatter) introuvable : le fichier doit commencer par un bloc <code>---</code> … <code>---</code>.
				</p>
				<template v-else>
					<p class="font-heading font-semibold text-gray-900">{{ preview.title || '(sans titre)' }}</p>
					<p class="mt-0.5 text-xs text-gray-500">
						{{ preview.publishAt || 'date ?' }}
						<template v-if="preview.tag"> · {{ preview.tag }}</template>
						<template v-if="preview.author"> · {{ preview.author }}</template>
						<template v-if="preview.isPublish === 'false'"> · <strong>brouillon</strong></template>
					</p>
					<p v-if="preview.excerpt" class="mt-2 font-light text-gray-600">{{ preview.excerpt }}</p>
					<p v-if="missing.length" class="mt-2 text-red-700">Champ(s) manquant(s) : {{ missing.join(', ') }}.</p>
					<ul v-if="depotAjout?.remarques.length" class="mt-2 list-disc pl-5 text-xs text-amber-800">
						<li v-for="r in depotAjout.remarques" :key="r">{{ r }}</li>
					</ul>
				</template>
			</div>
		</div>

		<!-- Photo -->
		<div>
			<p class="champ-libelle">
				2. La photo de couverture <span class="font-light text-gray-500">(facultative)</span>
			</p>
			<label
				class="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed text-center text-sm transition-colors"
				:class="[
					dragOver === 'photo' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50',
					photoUrl ? 'p-0' : 'px-4 py-6',
				]"
				@dragover.prevent="dragOver = 'photo'"
				@dragleave="dragOver = null"
				@drop.prevent="onDrop('photo', $event)"
			>
				<img v-if="photoUrl" :src="photoUrl" alt="Aperçu de la photo" class="aspect-video w-full object-cover" />
				<template v-else>
					<i class="fa-solid fa-image text-2xl text-gray-400" aria-hidden="true"></i>
					<span class="text-gray-600">Glissez la photo ici ou <span class="text-primary underline">parcourez</span></span>
					<span class="text-xs font-light text-gray-500">JPEG, PNG ou WebP · 10 Mo max</span>
				</template>
				<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="pickPhoto(($event.target as HTMLInputElement).files?.[0])" />
			</label>
			<p v-if="photo" class="champ-aide">
				{{ photo.name }} — la position GPS et les autres métadonnées sont retirées à l'envoi.
			</p>
		</div>

		<p class="text-xs font-light text-gray-500">
			À l'envoi, le site est reconstruit (environ une minute) : l'actualité apparaît ensuite sur la page Actualités,
			l'accueil et le flux RSS. « Enregistrer sans publier » : elle attend les autres modifications pour être publiée
			avec elles, en une fois.
		</p>
		<div class="flex flex-wrap items-center gap-3">
			<PublishButtons label="Publier l’actualité" :busy="busy" :disabled="!mdFile || !preview || missing.length > 0" />
		</div>
	</form>

	<!-- Édition -->
	<form v-else-if="view === 'edit' && editing" class="space-y-4" @submit.prevent="saveEdit" @invalid.capture="onInvalid">
		<FormHeader back="Toutes les actualités" :title="editForm.title.trim() || editing.title || editing.slug" editing @back="backToList" />
		<div>
			<EditFileBar :imported="imported" @download="downloadFile" @load="loadFile">
				<p class="mb-3 text-xs font-light text-gray-500">
					Adresse de la page (inchangée) : <code class="font-mono">/actualites/{{ editing.slug }}</code>
				</p>
			</EditFileBar>
			<FormTabs v-model="editTab" :tabs="EDIT_TABS" prefix="ed" />

			<div v-show="editTab === 'infos'" id="ed-panel-infos" role="tabpanel" aria-labelledby="ed-tab-infos" class="space-y-4">
				<div>
					<label for="ed-title" class="champ-libelle">Titre</label>
					<input id="ed-title" v-model="editForm.title" type="text" required :class="inputClass" />
					<SeoLength :text="editForm.title" kind="titre" suffix />
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="ed-date" class="champ-libelle">Date de publication</label>
						<input id="ed-date" v-model="editForm.publishAt" type="date" required :class="inputClass" />
					</div>
					<div>
						<label for="ed-tag" class="champ-libelle">
							Catégorie <span class="font-light text-gray-500">(facultative)</span>
						</label>
						<input id="ed-tag" v-model="editForm.tag" type="text" placeholder="Ateliers" :class="inputClass" />
					</div>
				</div>
				<div>
					<label for="ed-excerpt" class="champ-libelle">Résumé</label>
					<textarea id="ed-excerpt" v-model="editForm.excerpt" rows="6" required :class="inputClass"></textarea>
					<SeoLength :text="editForm.excerpt" kind="description" />
				</div>
				<div>
					<label for="ed-author" class="champ-libelle">
						Auteur·rice <span class="font-light text-gray-500">(facultatif)</span>
					</label>
					<input id="ed-author" v-model="editForm.author" type="text" :class="inputClass" />
				</div>
				<label class="flex items-start gap-2 text-sm text-gray-700">
					<input
						type="checkbox"
						:checked="!editForm.isPublish"
						class="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
						@change="editForm.isPublish = !($event.target as HTMLInputElement).checked"
					/>
					<span>
						<span class="font-medium">Brouillon</span>
						<span class="block text-xs font-light text-gray-500">Retire l'actualité du site sans la supprimer (dépublication).</span>
					</span>
				</label>
			</div>

			<div v-show="editTab === 'contenu'" id="ed-panel-contenu" role="tabpanel" aria-labelledby="ed-tab-contenu">
				<div>
					<label for="ed-body" class="champ-libelle">Texte (Markdown)</label>
					<textarea id="ed-body" ref="bodyField" v-model="editForm.body" rows="6" required :class="[inputClass, 'font-mono text-sm leading-relaxed']"></textarea>
					<p class="champ-aide">
						<code>## Sous-titre</code>, <code>**gras**</code>, <code>*italique*</code>, <code>- liste</code>,
						<code>[lien](https://…)</code>. Le HTML est accepté (tableaux, encadrés, vidéos YouTube/Vimeo…) ; le code
						exécutable (scripts…) est retiré à l'affichage.
					</p>
					<LinkPicker v-model="editForm.body" :field="bodyField" />
				</div>
				<BlocsEditor class="mt-6" :blocs="blocs" :body="editForm.body" @insert="insertMarker" />
			</div>

			<div v-show="editTab === 'image'" id="ed-panel-image" role="tabpanel" aria-labelledby="ed-tab-image" class="space-y-4">
				<!-- Photo -->
				<fieldset>
					<legend class="text-sm font-semibold text-gray-700">Photo de couverture</legend>
					<img
						v-if="coverAction === 'keep' && editing.coverUrl"
						:src="editing.coverUrl"
						alt="Photo actuelle"
						class="mt-2 aspect-video w-full rounded-xl object-cover"
					/>
					<img v-if="coverAction === 'replace' && photoUrl" :src="photoUrl" alt="Nouvelle photo" class="mt-2 aspect-video w-full rounded-xl object-cover" />
					<p v-if="coverAction === 'remove' || (!editing.hasCover && coverAction === 'keep')" class="mt-2 text-sm font-light text-gray-500">
						Pas de photo : une vignette de remplacement s'affichera.
					</p>
					<div class="mt-2 flex flex-wrap items-center gap-3 text-sm">
						<label class="cursor-pointer font-medium text-primary hover:underline">
							{{ editing.hasCover ? 'Remplacer la photo' : 'Ajouter une photo' }}
							<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="pickEditPhoto(($event.target as HTMLInputElement).files?.[0])" />
						</label>
						<button
							v-if="editing.hasCover && coverAction !== 'remove'"
							type="button"
							class="font-medium text-red-600 hover:underline"
							@click="coverAction = 'remove'; reset()"
						>
							Retirer la photo
						</button>
						<button v-if="coverAction !== 'keep'" type="button" class="text-gray-600 hover:underline" @click="coverAction = 'keep'; reset()">
							Annuler le changement de photo
						</button>
					</div>
				</fieldset>
				<div>
					<label for="ed-credit" class="champ-libelle">
						Crédit photo <span class="font-light text-gray-500">(facultatif)</span>
					</label>
					<input id="ed-credit" v-model="editForm.imageCredit" type="text" placeholder="Photo : Prénom Nom" :class="inputClass" />
				</div>
			</div>
		</div>

		<p class="text-xs font-light text-gray-500">
			« Enregistrer et publier » reconstruit le site (environ une minute) ; si la reconstruction échoue, la version
			actuelle est conservée. « Enregistrer sans publier » : la modification attend les autres pour être publiée avec
			elles, en une fois.
		</p>
		<div class="flex flex-wrap items-center gap-3">
			<PublishButtons :busy="busy" :disabled="!editForm.title || !editForm.publishAt || !editForm.excerpt || !editForm.body" />
		</div>
	</form>
</template>
