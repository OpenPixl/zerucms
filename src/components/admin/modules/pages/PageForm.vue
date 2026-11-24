<script setup lang="ts">
/**
 * Formulaire de page du module « Pages » : création (choix page classique /
 * enrichie, ou fichier `.md` déposé qui pré-remplit le formulaire, modèles
 * téléchargeables : ./page-markdown.ts) ou modification d'une page des sources
 * (onglets Informations / Contenu / Image ; fichier `.md` à télécharger ou à
 * recharger, `EditFileBar`). Emplacement : menu de navigation (lien direct
 * ou dans un menu déroulant), page libre (racine, hors menu) ou réservée
 * (Espace Admin). « Menu » = menu de navigation (frontmatter `menu:`). Le serveur valide
 * tout (src/lib/page-writer.ts) et reconstruit le site.
 */
import { computed, inject, onBeforeUnmount, reactive, ref, toRaw } from 'vue';
import { ASSIGNABLE_GROUPS, AUTH_GROUPS } from '../../../../lib/auth/groups';
import { type Bloc } from '../../../../lib/blocs';
import { PAGE_VARIABLES } from '../../../../lib/page-variables';
import { ApiError, pagesApi, type CoverUpdate, type DropdownView, type PageInput, type PageSourceView, type SaveResult } from '../../client';
import { isDeferredSubmit } from '../../lot';
import PublishButtons from '../../PublishButtons.vue';
import { ADMIN_CONTEXT, fileToBase64, inputClass, photoProblem, rememberOpenModule } from '../../context';
import LinkPicker from '../../LinkPicker.vue';
import SeoLength from '../../SeoLength.vue';
import EditFileBar from '../../EditFileBar.vue';
import FormHeader from '../../FormHeader.vue';
import FormTabs from '../../FormTabs.vue';
import { EDIT_TABS, useFormTabs, type EditTab } from '../../form-tabs';
import { telechargerContenu } from '../../zip-contenu';
import { fournirBlocPhotos } from './bloc-photos';
import { DEPOT_ACCEPT, lireDepot, photosDuDepot, remarquesDepot, trouverPhoto, type Depot } from '../../depot';
import { insererMarqueur } from './marqueur';
import BlocsEditor from './BlocsEditor.vue';
import { downloadPageTemplate, pageMarkdownFile, parsePageMarkdown } from './page-markdown';

const props = defineProps<{
	dropdowns: DropdownView[];
	source: PageSourceView | null;
	disabled: boolean;
	/** Création à partir d'un fichier déposé dans « Ajouter un contenu » (menu Contenus). */
	initialFile?: Depot;
}>();
const emit = defineEmits<{ published: [label: string, result: SaveResult]; cancel: [] }>();
const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const RESERVED_PREFIX = 'espace-benevoles';
const editing = props.source;

/** « Notre projet ! » → `notre-projet` (même règle que le serveur). */
function slugify(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/g, '');
}

/** Emplacement proposé à la saisie (un seul menu de navigation pour l'instant). */
type Emplacement = 'menu' | 'libre' | 'reservee';

function placementKey(p: PageInput['placement']): string {
	return p.kind === 'dropdown' ? `dropdown:${p.dropdown}` : p.kind;
}

function emplacementOf(source: PageSourceView): Emplacement {
	if (source.placement.kind === 'reservee') return 'reservee';
	// Une page rangée dans un menu déroulant reste dans le menu de navigation.
	return source.placement.kind === 'dropdown' || source.menu.show ? 'menu' : 'libre';
}

const form = reactive({
	type: editing?.type ?? ('classique' as PageInput['type']),
	title: editing?.title ?? '',
	description: editing?.description ?? '',
	placement: (editing ? emplacementOf(editing) : 'menu') as Emplacement,
	/** Position dans le menu de navigation : `racine` (lien direct) ou `dropdown:<dossier>`. */
	menuPosition: editing && editing.placement.kind === 'dropdown' ? placementKey(editing.placement) : 'racine',
	slug: editing?.slug ?? '',
	menuLabel: editing?.menu.label ?? '',
	access: [...(editing?.access ?? [])],
	body: editing?.body ?? '',
	imageCredit: editing?.imageCredit ?? '',
});
const blocs = reactive<Record<string, Bloc>>(structuredClone(toRaw(editing?.blocs ?? {})));
/** Photos des blocs (« Photos », « Carrousel ») : aperçus, fichiers choisis à envoyer avec la page. */
const blocPhotos = fournirBlocPhotos(editing?.blocPhotoUrls);
onBeforeUnmount(blocPhotos.liberer);
/** Création : type pas encore choisi (écran de choix classique / enrichie). */
const typeChosen = ref(Boolean(editing));
/** L'adresse suit le titre tant qu'elle n'a pas été modifiée à la main (création seulement). */
const slugTouched = ref(Boolean(editing));
const error = ref('');
const busy = ref(false);
const bodyField = ref<HTMLTextAreaElement | null>(null);
const { tab, onInvalid } = useFormTabs<EditTab>('pg', 'infos');

// --- Fichier .md : création, ou rechargement en modification ---

/** Fichier déposé ou chargé et remarques de lecture (affichées en tête du formulaire). */
const imported = ref<{ name: string; warnings: string[] } | null>(null);
const mdDragOver = ref(false);

/** Fichier `.md` déposé ou chargé, seul, avec ses photos ou en `.zip` (cf. `depot.ts`). */
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
	if (!/\.(md|markdown)$/i.test(file.name)) {
		error.value = 'Le fichier doit être un fichier Markdown (.md).';
		return;
	}
	if (file.size > 200 * 1024) {
		error.value = 'Le fichier est trop long (200 Ko max).';
		return;
	}
	const citees = new Set<File>();
	const { page, warnings, error: problem } = parsePageMarkdown(await file.text(), photosDuDepot(depot, blocPhotos.api, citees));
	if (!page) {
		error.value = problem!;
		return;
	}
	Object.assign(form, {
		type: page.type,
		title: page.title,
		description: page.description,
		menuLabel: page.menuLabel,
		imageCredit: page.imageCredit,
		body: page.body,
	});
	if (page.menuShow === false && form.placement === 'menu') form.placement = 'libre';
	else if (page.menuShow === true && form.placement === 'libre') form.placement = 'menu';
	for (const id of Object.keys(blocs)) delete blocs[id];
	Object.assign(blocs, page.blocs);
	if (page.cover) {
		const photoCouverture = trouverPhoto(depot, page.cover);
		if (photoCouverture) {
			citees.add(photoCouverture);
			pickPhoto(photoCouverture);
		} else warnings.push(`Photo de couverture « ${page.cover} » absente : déposez-la avec le fichier, ou choisissez-la dans l'onglet « Image ».`);
	}
	warnings.push(...remarquesDepot(depot, citees));
	if (!page.title) warnings.unshift('Titre absent du fichier : à saisir dans « Informations ».');
	imported.value = { name: depot.photos.length ? `${file.name} + ${depot.photos.length} photo(s)` : file.name, warnings };
	typeChosen.value = true;
}

if (props.initialFile && !editing) void pickMarkdown(props.initialFile);

/** Fichier de la page d'après le formulaire (modification). */
/** `.md` de la page d'après le formulaire, en `.zip` avec ses photos s'il y en a (`zip-contenu.ts`). */
async function downloadFile() {
	error.value = '';
	try {
		await telechargerContenu({
			nom: slug.value || 'page',
			dossier: editing ? `pages/${editing.path}` : null,
			blocs: form.type === 'enrichie' ? blocs : {},
			photos: blocPhotos.api,
			couverture: { actuelle: editing?.cover ?? null, nouvelle: coverAction.value === 'replace' ? photo.value : null, retiree: coverAction.value === 'remove' },
			construire: (b, cover) =>
				pageMarkdownFile({
					type: form.type,
					title: form.title,
					description: form.description,
					menu: form.placement === 'reservee' ? null : { show: form.placement === 'menu', label: form.menuLabel },
					imageCredit: form.imageCredit,
					blocs: b,
					body: form.body,
					cover,
				}),
		});
	} catch (e) {
		error.value = (e as Error).message;
	}
}

const coverAction = ref<'keep' | 'replace' | 'remove'>('keep');
const photo = ref<File | null>(null);
const photoUrl = ref('');

const slug = computed(() => (slugTouched.value ? form.slug : slugify(form.title)));
const placement = computed<PageInput['placement']>(() =>
	form.placement === 'reservee'
		? { kind: 'reservee' }
		: form.placement === 'menu' && form.menuPosition.startsWith('dropdown:')
			? { kind: 'dropdown', dropdown: form.menuPosition.slice('dropdown:'.length) }
			: { kind: 'racine' },
);
/** Début de l'adresse imposé par l'emplacement (`association/`, `espace-benevoles/`). */
const prefix = computed(() => {
	const p = placement.value;
	return p.kind === 'dropdown' ? `${p.dropdown}/` : p.kind === 'reservee' ? `${RESERVED_PREFIX}/` : '';
});
const path = computed(() => `${prefix.value}${slug.value || '…'}`);
const pathChanged = computed(() => Boolean(editing && path.value !== editing.path));
const dropdownLabel = computed(() =>
	placement.value.kind === 'dropdown' ? props.dropdowns.find((d) => `dropdown:${d.folder}` === form.menuPosition)?.label : undefined,
);
/** Création ou changement de niveau (racine / menu déroulant) : le serveur place la page en dernier. */
const placedLast = computed(() => !editing || placementKey(editing.placement) !== placementKey(placement.value));

function chooseType(type: PageInput['type']) {
	form.type = type;
	typeChosen.value = true;
}

function onSlugInput(event: Event) {
	slugTouched.value = true;
	form.slug = (event.target as HTMLInputElement).value;
}

/** Marqueur de bloc inséré au curseur, seul sur sa ligne. */
function insertMarker(id: string) {
	return insererMarqueur(form.body, (texte) => (form.body = texte), bodyField.value, id);
}

function pickPhoto(file: File | undefined) {
	error.value = '';
	if (!file) return;
	const problem = photoProblem(file);
	if (problem) {
		error.value = problem;
		return;
	}
	if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
	photo.value = file;
	photoUrl.value = URL.createObjectURL(file);
	coverAction.value = 'replace';
}

function resetPhoto() {
	photo.value = null;
	if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
	photoUrl.value = '';
}
onBeforeUnmount(resetPhoto);

async function submit(event: Event) {
	error.value = '';
	busy.value = true;
	try {
		const input: PageInput = {
			placement: placement.value,
			slug: slug.value,
			title: form.title,
			description: form.description,
			type: form.type,
			// Position décidée par le serveur (dernière à la création ou en changeant d'emplacement).
			menu: { show: form.placement === 'menu', order: editing?.menu.order ?? 0, label: form.menuLabel },
			access: form.placement === 'reservee' ? form.access : [],
			body: form.body,
			blocs: form.type === 'enrichie' ? blocs : {},
			imageCredit: form.imageCredit,
			photos: form.type === 'enrichie' ? await blocPhotos.envoi(blocs) : {},
		};
		const newPhoto = coverAction.value === 'replace' && photo.value ? { type: photo.value.type, data: await fileToBase64(photo.value) } : null;
		rememberOpenModule('pages-site');
		const options = { deferred: isDeferredSubmit(event) };
		if (editing) {
			const cover: CoverUpdate = newPhoto ? { action: 'replace', ...newPhoto } : coverAction.value === 'remove' ? { action: 'remove' } : { action: 'keep' };
			emit('published', `Modification : ${form.title}`, await pagesApi.update(editing.path, input, cover, options));
		} else {
			emit('published', `Page : ${form.title}`, await pagesApi.create(input, newPhoto, options));
		}
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		busy.value = false;
	}
}

const variables = Object.entries(PAGE_VARIABLES);
const token = (name: string) => `{{${name}}}`;
const groupChoices = ASSIGNABLE_GROUPS.map((g) => ({ value: g, label: AUTH_GROUPS[g].label }));
</script>

<template>
	<FormHeader back="Toutes les pages" :title="form.title.trim() || (editing ? editing.title || `/${editing.path}` : 'Nouvelle page')" :editing="Boolean(editing)" @back="emit('cancel')" />

	<!-- Création : choix du type -->
	<div v-if="!typeChosen" class="space-y-4">
		<p class="text-sm font-light text-gray-600">Quel type de page voulez-vous créer ?</p>
		<button
			type="button"
			class="block w-full rounded-2xl border border-gray-200 p-5 text-left transition-shadow hover:border-primary hover:shadow-md"
			@click="chooseType('classique')"
		>
			<span class="flex items-center gap-2 font-heading font-semibold text-gray-900">
				<i class="fa-solid fa-file-lines text-primary" aria-hidden="true"></i>Page classique
			</span>
			<span class="mt-1 block text-sm font-light text-gray-600">
				Du texte mis en forme (titres, listes, liens, tableaux), avec une photo de couverture facultative.
			</span>
		</button>
		<button
			type="button"
			class="block w-full rounded-2xl border border-gray-200 p-5 text-left transition-shadow hover:border-primary hover:shadow-md"
			@click="chooseType('enrichie')"
		>
			<span class="flex items-center gap-2 font-heading font-semibold text-gray-900">
				<i class="fa-solid fa-puzzle-piece text-primary" aria-hidden="true"></i>Page enrichie
			</span>
			<span class="mt-1 block text-sm font-light text-gray-600">
				Le texte, plus des blocs placés où vous voulez : photos, carrousel, vidéo, grille de cartes, tarif, bouton,
				encadré…
			</span>
		</button>

		<!-- Ou à partir d'un fichier .md -->
		<div class="pt-2">
			<p class="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-gray-400">
				<span class="h-px flex-1 bg-gray-200"></span>ou à partir d'un fichier .md<span class="h-px flex-1 bg-gray-200"></span>
			</p>
			<p v-if="error" class="mt-3 alerte-erreur" role="alert">{{ error }}</p>
			<label
				class="mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors"
				:class="mdDragOver ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50'"
				@dragover.prevent="mdDragOver = true"
				@dragleave="mdDragOver = false"
				@drop.prevent="mdDragOver = false; pickMarkdown([...($event.dataTransfer?.files ?? [])])"
			>
				<i class="fa-solid fa-file-arrow-up text-2xl text-gray-400" aria-hidden="true"></i>
				<span class="text-gray-600">Glissez votre fichier ici (avec ses photos, ou en .zip) ou <span class="text-primary underline">parcourez</span></span>
				<span class="text-xs font-light text-gray-500">Le formulaire se remplit : il ne reste qu'à vérifier et publier.</span>
				<input type="file" :accept="DEPOT_ACCEPT" multiple class="sr-only" @change="pickMarkdown([...(($event.target as HTMLInputElement).files ?? [])])" />
			</label>
			<p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
				<span class="text-gray-600"><i class="fa-solid fa-download mr-1 text-xs text-gray-400" aria-hidden="true"></i>Télécharger un modèle :</span>
				<button type="button" class="font-medium text-primary hover:underline" @click="downloadPageTemplate('classique')">page classique</button>
				<button type="button" class="font-medium text-primary hover:underline" @click="downloadPageTemplate('enrichie')">page enrichie</button>
			</p>
		</div>

		<button type="button" class="text-sm text-gray-600 hover:underline" @click="emit('cancel')">Annuler</button>
	</div>

	<form v-else class="space-y-5" @submit.prevent="submit" @invalid.capture="onInvalid">
		<div v-if="imported && !editing" class="rounded-lg bg-primary/5 px-3 py-2 text-sm text-gray-700" role="status">
			<p>
				<i class="fa-solid fa-file-circle-check mr-1 text-primary" aria-hidden="true"></i>
				Formulaire rempli depuis <strong>{{ imported.name }}</strong> : vérifiez, choisissez l'emplacement puis publiez.
			</p>
			<ul v-if="imported.warnings.length" class="mt-1 list-disc pl-5 text-xs text-amber-800">
				<li v-for="w in imported.warnings" :key="w">{{ w }}</li>
			</ul>
		</div>
		<p v-if="editing?.technique" class="text-sm text-gray-500">
			<i class="fa-solid fa-lock mr-1" aria-hidden="true"></i>Cette page ne se modifie pas depuis l'Espace Admin.
		</p>
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>

		<div>
			<EditFileBar v-if="editing && !editing.technique" :imported="imported" @download="downloadFile" @load="pickMarkdown" />
			<FormTabs v-model="tab" :tabs="EDIT_TABS" prefix="pg" />

			<div v-show="tab === 'infos'" id="pg-panel-infos" role="tabpanel" aria-labelledby="pg-tab-infos" class="space-y-5">
				<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
					<span class="font-semibold text-gray-700">Type :</span>
					<label class="flex items-center gap-1.5"><input v-model="form.type" type="radio" value="classique" /> Page classique</label>
					<label class="flex items-center gap-1.5"><input v-model="form.type" type="radio" value="enrichie" /> Page enrichie (blocs)</label>
				</div>

				<div>
					<label for="pg-title" class="champ-libelle">Titre</label>
					<input id="pg-title" v-model="form.title" type="text" required :class="inputClass" />
					<SeoLength :text="form.title" kind="titre" suffix />
				</div>
				<div>
					<label for="pg-description" class="champ-libelle">
						Description <span class="font-light text-gray-500">(facultative)</span>
					</label>
					<textarea id="pg-description" v-model="form.description" rows="6" :class="inputClass"></textarea>
					<SeoLength :text="form.description" kind="description" />
					<p class="champ-aide">Affichée sous le titre et dans les moteurs de recherche.</p>
				</div>

				<!-- Emplacement -->
				<fieldset class="space-y-3 rounded-xl bg-gray-100 p-4">
					<legend class="sr-only">Emplacement</legend>
					<div>
						<label for="pg-placement" class="champ-libelle">Emplacement</label>
						<select id="pg-placement" v-model="form.placement" :class="inputClass">
							<option value="menu">Menu de navigation</option>
							<option value="libre">Page libre (hors menu, accessible par son adresse ou un lien)</option>
							<option value="reservee">Page réservée (Espace Admin, connexion requise)</option>
						</select>
					</div>
					<div v-if="form.placement === 'menu' && props.dropdowns.length">
						<label for="pg-menu-position" class="champ-libelle">Position dans le menu</label>
						<select id="pg-menu-position" v-model="form.menuPosition" :class="inputClass">
							<option value="racine">Lien direct</option>
							<option v-for="d in props.dropdowns" :key="d.folder" :value="`dropdown:${d.folder}`">Dans le menu déroulant « {{ d.label }} »</option>
						</select>
					</div>
					<div>
						<label for="pg-slug" class="champ-libelle">Adresse</label>
						<div class="mt-1 champ-groupe">
							<span>/{{ prefix }}</span>
							<input
								id="pg-slug"
								:value="slug"
								type="text"
								pattern="[a-z0-9]+(-[a-z0-9]+)*"
								@input="onSlugInput"
							/>
						</div>
						<p v-if="pathChanged" class="champ-aide">
							Nouvelle adresse : /{{ path }} (les liens vers l'ancienne ne marcheront plus).
						</p>
					</div>

					<div v-if="form.placement === 'menu'">
						<label for="pg-menu-label" class="champ-libelle">
							Libellé dans le menu de navigation <span class="font-light text-gray-500">(facultatif)</span>
						</label>
						<input id="pg-menu-label" v-model="form.menuLabel" type="text" :placeholder="form.title" :class="inputClass" />
						<p v-if="placedLast" class="champ-aide">
							La page se place en dernière position {{ dropdownLabel ? `du menu déroulant « ${dropdownLabel} »` : 'du menu de navigation' }}.
						</p>
					</div>
					<fieldset v-else-if="form.placement === 'reservee'">
						<legend class="text-sm font-semibold text-gray-700">Accès</legend>
						<p class="text-xs font-light text-gray-500">Aucune case cochée : toute personne connectée.</p>
						<label v-for="g in groupChoices" :key="g.value" class="mt-1 flex items-center gap-2 text-sm text-gray-700">
							<input v-model="form.access" type="checkbox" :value="g.value" class="rounded border-gray-300" />
							{{ g.label }}
						</label>
					</fieldset>
				</fieldset>
			</div>

			<div v-show="tab === 'contenu'" id="pg-panel-contenu" role="tabpanel" aria-labelledby="pg-tab-contenu" class="space-y-5">
				<!-- Texte -->
				<div>
					<label for="pg-body" class="champ-libelle">Texte (Markdown)</label>
					<textarea
						id="pg-body"
						ref="bodyField"
						v-model="form.body"
						rows="6"
						required
						:class="[inputClass, 'font-mono text-sm leading-relaxed']"
					></textarea>
					<p class="champ-aide">
						<code>## Titre de section</code> (alimente le sommaire), <code>**gras**</code>, <code>*italique*</code>,
						<code>- liste</code>, <code>[lien](/contact)</code>.
					</p>
					<details class="mt-2 text-xs text-gray-600">
						<summary class="cursor-pointer font-medium text-primary">Insérer une information de l'association</summary>
						<p class="mt-1 font-light">Recopiez la variable dans le texte : elle est remplacée par la valeur configurée pour le site.</p>
						<ul class="mt-1 space-y-0.5">
							<li v-for="[name, v] in variables" :key="name">
								<code>{{ token(name) }}</code> — {{ v.label }}
							</li>
						</ul>
					</details>
					<LinkPicker v-model="form.body" :field="bodyField" />
				</div>

				<BlocsEditor v-if="form.type === 'enrichie'" :blocs="blocs" :body="form.body" @insert="insertMarker" />
			</div>

			<div v-show="tab === 'image'" id="pg-panel-image" role="tabpanel" aria-labelledby="pg-tab-image">
				<!-- Photo -->
				<fieldset>
					<legend class="text-sm font-semibold text-gray-700">
						Photo de couverture <span class="font-light text-gray-500">(facultative)</span>
					</legend>
					<img
						v-if="coverAction === 'keep' && editing?.coverUrl"
						:src="editing.coverUrl"
						alt="Photo actuelle"
						class="mt-2 aspect-video w-full rounded-xl object-cover"
					/>
					<img v-if="coverAction === 'replace' && photoUrl" :src="photoUrl" alt="Nouvelle photo" class="mt-2 aspect-video w-full rounded-xl object-cover" />
					<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
						<label class="cursor-pointer text-primary hover:underline">
							{{ editing?.cover || photo ? 'Remplacer la photo' : 'Ajouter une photo' }}
							<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="pickPhoto(($event.target as HTMLInputElement).files?.[0])" />
						</label>
						<button
							v-if="editing?.cover && coverAction !== 'remove'"
							type="button"
							class="text-red-600 hover:underline"
							@click="coverAction = 'remove'; resetPhoto()"
						>
							Retirer la photo
						</button>
						<button v-if="coverAction !== 'keep'" type="button" class="text-gray-600 hover:underline" @click="coverAction = 'keep'; resetPhoto()">
							Annuler le changement de photo
						</button>
					</div>
					<div v-if="editing?.cover || photo" class="mt-3">
						<label for="pg-credit" class="champ-libelle">
							Crédit photo <span class="font-light text-gray-500">(facultatif)</span>
						</label>
						<input id="pg-credit" v-model="form.imageCredit" type="text" placeholder="Photo : Prénom Nom" :class="inputClass" />
					</div>
				</fieldset>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<PublishButtons :label="editing ? 'Enregistrer et publier' : 'Créer et publier'" :busy="busy" :disabled="props.disabled || editing?.technique" />
			<button type="button" class="text-sm text-gray-600 hover:underline" @click="emit('cancel')">Annuler</button>
		</div>
	</form>
</template>
