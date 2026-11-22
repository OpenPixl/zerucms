<script setup lang="ts">
/**
 * Formulaire d'une fiche du module « Activités » : création ou modification.
 * L'adresse (nom du dossier) se choisit à la création seulement ; l'URL
 * publique `/activites/<catégorie>/<adresse>` change si la catégorie change.
 * Onglets Informations / Contenu / Image (+ Partage en modification :
 * actualité créée depuis la fiche enregistrée, `src/lib/activity-news.ts`,
 * liste des actualités déjà créées) ; en modification, fichier `.md`
 * à télécharger ou à recharger (`EditFileBar`, ./activity-markdown.ts) ;
 * en création, `initialFile` (« Ajouter un contenu ») pré-remplit le formulaire.
 * Le serveur valide tout (src/lib/activity-writer.ts) et reconstruit le site.
 */
import { computed, inject, onBeforeUnmount, reactive, ref, toRaw } from 'vue';
import type { Bloc } from '../../../../lib/blocs';
import BlocsEditor from '../pages/BlocsEditor.vue';
import { fournirBlocPhotos } from '../pages/bloc-photos';
import { insererMarqueur } from '../pages/marqueur';
import { outilActif } from '../../../../plugins';
import { TYPES_ACTIVITE_INSCRIPTION } from '../../../../lib/grist-asso/choices';
import {
	ApiError,
	activitiesApi,
	type ActivityCategory,
	type ActivityInput,
	type ActivitySourceView,
	type CoverUpdate,
	type SaveResult,
} from '../../client';
import { isDeferredSubmit } from '../../lot';
import PublishButtons from '../../PublishButtons.vue';
import { ADMIN_CONTEXT, fileToBase64, inputClass, photoProblem, rememberOpenModule } from '../../context';
import EditFileBar from '../../EditFileBar.vue';
import FormHeader from '../../FormHeader.vue';
import FormTabs from '../../FormTabs.vue';
import LinkPicker from '../../LinkPicker.vue';
import SeoLength from '../../SeoLength.vue';
import { EDIT_TABS, useFormTabs, type EditTab, type FormTab } from '../../form-tabs';
import { readMarkdownFile } from '../../markdown-file';
import { telechargerContenu } from '../../zip-contenu';
import { lireDepot, photosDuDepot, remarquesDepot, trouverPhoto, type Depot } from '../../depot';
import { activityMarkdownFile, parseActivityMarkdown } from './activity-markdown';

const props = defineProps<{
	categories: ActivityCategory[];
	source: ActivitySourceView | null;
	category: string;
	disabled: boolean;
	/** Création à partir d'un dépôt fait dans « Ajouter un contenu » (menu Contenus) : `.md` + photos. */
	initialFile?: Depot;
}>();
const emit = defineEmits<{ published: [label: string, result: SaveResult]; cancel: [] }>();
const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const editing = props.source;

/** « Atelier Photo ! » → `atelier-photo` (même règle que le serveur). */
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

/** Zone du texte (curseur, pour `LinkPicker`). */
const bodyField = ref<HTMLTextAreaElement | null>(null);
const form = reactive({
	title: editing?.title ?? '',
	slug: editing?.slug ?? '',
	category: editing?.category ?? props.category ?? '',
	excerpt: editing?.excerpt ?? '',
	level: editing?.level ?? '',
	isPublish: editing ? editing.isPublish : true,
	inscription: editing ? editing.inscription : true,
	/** Un nom Grist par ligne. */
	activiteGrist: (editing?.activiteGrist ?? []).join('\n'),
	typeGrist: editing?.typeGrist ?? '',
	imageCredit: editing?.imageCredit ?? '',
	body: editing?.body ?? '',
});
/** Blocs placés dans le texte (photos, vidéo, carrousel…) et leurs photos. */
const blocs = reactive<Record<string, Bloc>>(structuredClone(toRaw(editing?.blocs ?? {})));
const blocPhotos = fournirBlocPhotos(editing?.blocPhotoUrls);
onBeforeUnmount(blocPhotos.liberer);
function insertMarker(id: string) {
	return insererMarqueur(form.body, (texte) => (form.body = texte), bodyField.value, id);
}

/** L'adresse suit le titre tant qu'elle n'a pas été modifiée à la main (création seulement). */
const slugTouched = ref(false);
const slug = computed(() => (editing ? editing.slug : slugTouched.value ? form.slug : slugify(form.title)));
const categoryLabel = computed(() => props.categories.find((c) => c.slug === form.category)?.label);
const categoryChanged = computed(() => Boolean(editing && form.category !== editing.category));
const error = ref('');
const busy = ref(false);
type ActivityTab = EditTab | 'partage';
const { tab, onInvalid } = useFormTabs<ActivityTab>('act', 'infos');
const tabs: readonly FormTab[] = editing ? [...EDIT_TABS, { id: 'partage', label: 'Partage', icon: 'fa-share-nodes' }] : EDIT_TABS;

// --- Partage (modification) ---

/** Une actualité est en cours de création (bouton de l'onglet « Partage »). */
const sharing = ref(false);
const formatDate = (iso: string) =>
	new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

async function createNews(deferred: boolean) {
	if (!editing) return;
	error.value = '';
	sharing.value = true;
	try {
		rememberOpenModule('activites');
		emit('published', `Actualité : ${editing.title}`, await activitiesApi.createNews(editing.slug, { deferred }));
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		sharing.value = false;
	}
}

// --- Fichier .md (modification) ---

/** Dernier fichier chargé et remarques de lecture. */
const imported = ref<{ name: string; warnings: string[] } | null>(null);
const gristNames = () =>
	form.activiteGrist
		.split('\n')
		.map((n) => n.trim())
		.filter(Boolean);

/** `.md` de la fiche d'après le formulaire, en `.zip` avec ses photos s'il y en a (`zip-contenu.ts`). */
async function downloadFile() {
	error.value = '';
	try {
		await telechargerContenu({
			nom: slug.value || 'activite',
			dossier: editing ? `activites/${editing.slug}` : null,
			blocs,
			photos: blocPhotos.api,
			couverture: { actuelle: editing?.cover ?? null, nouvelle: coverAction.value === 'replace' ? photo.value : null, retiree: coverAction.value === 'remove' },
			construire: (b, cover) => activityMarkdownFile({ ...form, activiteGrist: gristNames(), blocs: b }, cover),
		});
	} catch (e) {
		error.value = (e as Error).message;
	}
}

/** Fichier `.md` chargé, seul, avec ses photos ou en `.zip` (cf. `depot.ts`). */
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
	const citees = new Set<File>();
	const { fields, warnings, error: problem } = parseActivityMarkdown(
		await file.text(),
		props.categories.map((c) => c.slug),
		photosDuDepot(depot, blocPhotos.api, citees),
	);
	if (!fields) {
		error.value = problem!;
		return;
	}
	const { category, typeGrist, activiteGrist, blocs: lus, cover, ...rest } = fields;
	if (cover) {
		const photoCouverture = trouverPhoto(depot, cover);
		if (photoCouverture) {
			citees.add(photoCouverture);
			pickPhoto(photoCouverture);
		} else warnings.push(`Photo de couverture « ${cover} » absente : déposez-la avec le fichier, ou choisissez-la dans l'onglet « Image ».`);
	}
	warnings.push(...remarquesDepot(depot, citees));
	Object.assign(form, rest, { activiteGrist: activiteGrist.join('\n') });
	for (const id of Object.keys(blocs)) delete blocs[id];
	Object.assign(blocs, lus);
	if (category !== undefined) form.category = category;
	if (typeGrist !== undefined) form.typeGrist = typeGrist;
	if (!fields.title) warnings.unshift('Titre absent du fichier : à saisir dans « Informations ».');
	imported.value = { name: depot.photos.length ? `${file.name} + ${depot.photos.length} photo(s)` : file.name, warnings };
}

if (props.initialFile && !editing) void loadFile(props.initialFile);

function onSlugInput(event: Event) {
	slugTouched.value = true;
	form.slug = (event.target as HTMLInputElement).value;
}

// --- Photo ---

const coverAction = ref<'keep' | 'replace' | 'remove'>('keep');
const photo = ref<File | null>(null);
const photoUrl = ref('');

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
		const input: ActivityInput = {
			slug: slug.value,
			title: form.title,
			excerpt: form.excerpt,
			category: form.category,
			isPublish: form.isPublish,
			level: form.level,
			inscription: form.inscription,
			activiteGrist: gristNames(),
			typeGrist: form.typeGrist,
			imageCredit: form.imageCredit,
			body: form.body,
			blocs,
			photos: await blocPhotos.envoi(blocs),
		};
		const newPhoto = coverAction.value === 'replace' && photo.value ? { type: photo.value.type, data: await fileToBase64(photo.value) } : null;
		rememberOpenModule('activites');
		const options = { deferred: isDeferredSubmit(event) };
		if (editing) {
			const cover: CoverUpdate = newPhoto ? { action: 'replace', ...newPhoto } : coverAction.value === 'remove' ? { action: 'remove' } : { action: 'keep' };
			emit('published', `Modification : ${form.title}`, await activitiesApi.update(editing.slug, input, cover, options));
		} else {
			emit('published', `Activité : ${form.title}`, await activitiesApi.create(input, newPhoto, options));
		}
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<FormHeader back="Toutes les activités" :title="form.title.trim() || (editing ? editing.title || editing.slug : 'Nouvelle activité')" :editing="Boolean(editing)" @back="emit('cancel')" />
	<form class="space-y-5" @submit.prevent="submit" @invalid.capture="onInvalid">
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>

		<div v-if="imported && !editing" class="rounded-lg bg-primary/5 px-3 py-2 text-sm text-gray-700" role="status">
			<p>
				<i class="fa-solid fa-file-circle-check mr-1 text-primary" aria-hidden="true"></i>
				Formulaire rempli depuis <strong>{{ imported.name }}</strong> : vérifiez la catégorie et l'adresse, ajoutez une photo puis publiez.
			</p>
			<ul v-if="imported.warnings.length" class="mt-1 list-disc pl-5 text-xs text-amber-800">
				<li v-for="w in imported.warnings" :key="w">{{ w }}</li>
			</ul>
		</div>

		<div>
			<EditFileBar v-if="editing" :imported="imported" @download="downloadFile" @load="loadFile" />
			<FormTabs v-model="tab" :tabs="tabs" prefix="act" />

			<div v-show="tab === 'infos'" id="act-panel-infos" role="tabpanel" aria-labelledby="act-tab-infos" class="space-y-5">
				<div>
					<label for="act-title" class="champ-libelle">Titre</label>
					<input id="act-title" v-model="form.title" type="text" required :class="inputClass" />
					<SeoLength :text="form.title" kind="titre" suffix />
				</div>
				<div>
					<label for="act-excerpt" class="champ-libelle">Résumé</label>
					<textarea id="act-excerpt" v-model="form.excerpt" rows="6" required :class="inputClass"></textarea>
					<SeoLength :text="form.excerpt" kind="description" />
					<p class="champ-aide">Une ou deux phrases : affiché sur la carte de l'activité et dans les moteurs de recherche.</p>
				</div>

				<!-- Emplacement -->
				<fieldset class="space-y-3 rounded-xl bg-gray-100 p-4">
					<legend class="sr-only">Emplacement</legend>
					<div>
						<label for="act-category" class="champ-libelle">Catégorie</label>
						<select id="act-category" v-model="form.category" required :class="inputClass">
							<option value="" disabled>Choisir…</option>
							<option v-for="c in props.categories" :key="c.slug" :value="c.slug">{{ c.label }}</option>
						</select>
						<p v-if="!editing || categoryChanged" class="champ-aide">
							L'activité se place en dernière position{{ categoryLabel ? ` de « ${categoryLabel} »` : '' }} ; les flèches ↑/↓ de la liste changent l'ordre.
						</p>
					</div>
					<div>
						<label for="act-slug" class="champ-libelle">Adresse</label>
						<div
							class="mt-1 champ-groupe"
						>
							<span>/activites/{{ form.category || '…' }}/</span>
							<input
								id="act-slug"
								:value="slug"
								type="text"
								pattern="[a-z0-9]+(-[a-z0-9]+)*"
								:readonly="Boolean(editing)"
								:class="{ 'text-gray-500': editing }"
								@input="onSlugInput"
							/>
						</div>
						<p v-if="!editing" class="champ-aide">Déduite du titre ; ne change plus après la création.</p>
						<p v-if="categoryChanged" class="mt-1 text-xs text-amber-800">
							La catégorie change : l'adresse devient /activites/{{ form.category }}/{{ slug }}, les liens vers l'ancienne ne
							fonctionneront plus.
						</p>
					</div>
					<label class="flex items-center gap-2 text-sm text-gray-700">
						<input v-model="form.isPublish" type="checkbox" class="rounded border-gray-300" />
						Publiée <span class="font-light text-gray-500">(décochée : brouillon, absente du site)</span>
					</label>
					<div>
						<label for="act-level" class="champ-libelle">
							Niveau <span class="font-light text-gray-500">(facultatif)</span>
						</label>
						<input id="act-level" v-model="form.level" type="text" placeholder="Ex. Grand débutant, Initiation, Tous niveaux" :class="inputClass" />
						<p class="champ-aide">Pastille affichée sur la carte de l'activité.</p>
					</div>
				</fieldset>

				<!-- Inscription en ligne (plugin inscription ; inactif : réglages gardés tels quels) -->
				<fieldset v-if="outilActif('activites', 'inscription')" class="space-y-3 rounded-xl bg-gray-100 p-4">
					<legend class="sr-only">Inscription en ligne</legend>
					<label class="flex items-center gap-2 text-sm font-semibold text-gray-700">
						<input v-model="form.inscription" type="checkbox" class="rounded border-gray-300" />
						Bouton « S'inscrire » sur la fiche
					</label>
					<p v-if="!form.inscription" class="text-xs font-light text-gray-500">Masqué (ex. activité sur rendez-vous).</p>
					<template v-else>
						<div>
							<label for="act-grist" class="champ-libelle">
								Activité(s) Grist visée(s) <span class="font-light text-gray-500">(facultatif, une par ligne)</span>
							</label>
							<textarea id="act-grist" v-model="form.activiteGrist" rows="6" :placeholder="form.title" :class="inputClass"></textarea>
							<p class="champ-aide">
								Nom exact de la colonne « Nom » de la table Activite ; terminer par <code>*</code> pour viser tous les noms qui
								commencent ainsi (ex. <code>Initiation*</code>). Vide : le titre de la fiche.
							</p>
						</div>
						<div>
							<label for="act-type" class="champ-libelle">
								Type Grist visé <span class="font-light text-gray-500">(facultatif)</span>
							</label>
							<select id="act-type" v-model="form.typeGrist" :class="inputClass">
								<option value="">Aucun</option>
								<option v-for="t in TYPES_ACTIVITE_INSCRIPTION" :key="t" :value="t">{{ t }}</option>
							</select>
						</div>
					</template>
				</fieldset>
			</div>

			<div v-show="tab === 'contenu'" id="act-panel-contenu" role="tabpanel" aria-labelledby="act-tab-contenu">
				<!-- Texte -->
				<div>
					<label for="act-body" class="champ-libelle">Texte de la fiche (Markdown)</label>
					<textarea id="act-body" ref="bodyField" v-model="form.body" rows="6" required :class="[inputClass, 'font-mono text-sm leading-relaxed']"></textarea>
					<p class="champ-aide">
						<code>## Titre de section</code> (alimente le sommaire), <code>**gras**</code>, <code>*italique*</code>,
						<code>- liste</code>, <code>[lien](/contact)</code>. Le HTML est accepté (tableaux, encadrés…).
					</p>
					<LinkPicker v-model="form.body" :field="bodyField" />
				</div>
				<BlocsEditor class="mt-6" :blocs="blocs" :body="form.body" @insert="insertMarker" />
			</div>

			<div v-show="tab === 'image'" id="act-panel-image" role="tabpanel" aria-labelledby="act-tab-image">
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
						<button v-if="editing?.cover && coverAction !== 'remove'" type="button" class="text-red-600 hover:underline" @click="coverAction = 'remove'; resetPhoto()">
							Retirer la photo
						</button>
						<button v-if="coverAction !== 'keep'" type="button" class="text-gray-600 hover:underline" @click="coverAction = 'keep'; resetPhoto()">
							Annuler le changement de photo
						</button>
					</div>
					<p v-if="!editing?.cover && !photo" class="champ-aide">Sans photo, la carte affiche « Image à venir ».</p>
					<div v-if="editing?.cover || photo" class="mt-3">
						<label for="act-credit" class="champ-libelle">
							Crédit photo <span class="font-light text-gray-500">(facultatif)</span>
						</label>
						<input id="act-credit" v-model="form.imageCredit" type="text" placeholder="Photo : Prénom Nom / Source" :class="inputClass" />
					</div>
				</fieldset>
			</div>

			<div v-if="editing" v-show="tab === 'partage'" id="act-panel-partage" role="tabpanel" aria-labelledby="act-tab-partage" class="space-y-4">
				<!-- Actualité dédiée -->
				<section class="space-y-3 rounded-xl bg-gray-100 p-4">
					<h3 class="flex items-center gap-2 text-sm font-semibold text-gray-700">
						<i class="fa-solid fa-newspaper text-primary" aria-hidden="true"></i>
						Actualité dédiée
					</h3>
					<p class="text-sm font-light text-gray-600">
						Crée une actualité datée du jour qui reprend le titre, le résumé, la catégorie, le texte et la photo de la
						fiche. Sur le site, elle se termine par un bouton « S'inscrire » et un lien vers la fiche. Vous pourrez la
						retoucher ensuite dans le module « Actualités ».
					</p>
					<p class="champ-aide">C'est la fiche <strong>enregistrée</strong> qui sert de modèle : enregistrez d'abord vos modifications en cours.</p>
					<p v-if="!editing.isPublish" class="alerte-attention text-sm">
						Cette activité est un brouillon : tant qu'elle n'est pas publiée, l'actualité n'affichera ni « S'inscrire » ni le lien vers la fiche.
					</p>
					<div class="flex flex-wrap items-center gap-3">
						<button type="button" class="bouton bouton-primaire" :disabled="props.disabled || sharing || busy" @click="createNews(false)">
							<i class="fa-solid fa-plus mr-1.5" aria-hidden="true"></i>
							{{ sharing ? 'Création…' : 'Créer l’actualité et publier' }}
						</button>
						<button
							type="button"
							class="bouton bouton-contour"
							:disabled="props.disabled || sharing || busy"
							title="L'actualité est enregistrée mais pas encore mise en ligne : publiez ensuite toutes les modifications en attente en une fois."
							@click="createNews(true)"
						>
							Créer sans publier
						</button>
					</div>
				</section>

				<!-- Actualités déjà créées -->
				<section v-if="editing.actualites.length">
					<h3 class="text-sm font-semibold text-gray-700">Actualités de cette activité</h3>
					<ul class="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">
						<li v-for="n in editing.actualites" :key="n.slug" class="flex items-center gap-3 px-4 py-2.5">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium" :class="n.isPublish ? 'text-gray-900' : 'text-gray-500'">{{ n.title }}</span>
								<span class="block text-xs font-light text-gray-500">{{ formatDate(n.publishAt) }}</span>
							</span>
							<span v-if="!n.isPublish" class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Brouillon</span>
							<a
								v-else
								:href="n.href"
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
								:aria-label="`Voir « ${n.title} » sur le site`"
								:title="`Voir « ${n.title} » sur le site`"
							>
								<i class="fa-solid fa-eye text-sm" aria-hidden="true"></i>
							</a>
						</li>
					</ul>
					<p class="champ-aide">Modifier ou supprimer une actualité : module « Actualités ».</p>
				</section>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<PublishButtons :label="editing ? 'Enregistrer et publier' : 'Créer et publier'" :busy="busy" :disabled="props.disabled" />
			<button type="button" class="text-sm text-gray-600 hover:underline" @click="emit('cancel')">Annuler</button>
		</div>
	</form>
</template>
