<script setup lang="ts">
/**
 * Onglet « Charte graphique » du module « Association » : couleurs du thème
 * (`colors:` de `reglages.yaml`), polices (`polices:`, `FontsField.vue`), logo et icône d'onglet
 * (`src/content/images/`), écrits par `brand-writer.ts`. Aperçu en direct ;
 * tout part en une seule publication.
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { association } from '../../../../lib/association';
import { COLOR_PATTERN, type ThemeColors } from '../../../../config/site';
import { ApiError, brandApi, type BrandSource, type SaveResult } from '../../client';
import { isDeferredSubmit } from '../../lot';
import PublishButtons from '../../PublishButtons.vue';
import { ADMIN_CONTEXT, compactInputClass, fileToBase64, iconButtonClass, rememberOpenModule, sortableProps, takeModuleToReopen } from '../../context';
import DragHandle from '../pages/DragHandle.vue';
import OrderArrows from '../pages/OrderArrows.vue';
import ColorField from './ColorField.vue';
import { fullHex } from './contrast';
import { previewFamily } from './font-preview';
import FontsField, { type FontsDraft } from './FontsField.vue';

const props = defineProps<{ locked: boolean }>();
const emit = defineEmits<{ published: [label: string, result: SaveResult]; dirty: [value: boolean] }>();
const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const FAVICON_TYPES = ['image/svg+xml', 'image/png', 'image/x-icon', 'image/vnd.microsoft.icon'];
const FILE_MAX = 5 * 1024 * 1024;
const STRIPE_MAX = 12;

const source = ref<BrandSource | null>(null);
const loading = ref(true);
const busy = ref(false);
const error = ref('');

/** Couleurs en cours de saisie ; la bande garde un identifiant par ligne (couleurs répétables, glisser-déposer). */
const colors = ref({ primary: '', secondary: '', accent: '' });
let nextId = 0;
const stripe = ref<{ id: number; value: string }[]>([]);
/** Bande affichée (en-tête, PDF des RDV) ; ses couleurs sont gardées quand elle est désactivée. */
const stripeEnabled = ref(true);
const stripeValues = computed(() => stripe.value.map((s) => s.value));

/** Polices en cours de saisie (`FontsField`). */
const fonts = ref<FontsDraft>({ titres: '', texte: '', ajouts: [], retraits: [] });
function setFonts(source: BrandSource) {
	fonts.value = { titres: source.fonts.titres, texte: source.fonts.texte, ajouts: [], retraits: [] };
}
const fontsChanged = computed(
	() =>
		!!source.value &&
		(fonts.value.titres !== source.value.fonts.titres ||
			fonts.value.texte !== source.value.fonts.texte ||
			fonts.value.ajouts.length > 0 ||
			fonts.value.retraits.length > 0),
);
const fontFamily = (value: string) => (source.value ? previewFamily(value, source.value, fonts.value.ajouts) : undefined);

function setColors(c: ThemeColors) {
	colors.value = { primary: c.primary, secondary: c.secondary, accent: c.accent };
	stripe.value = c.stripe.map((value) => ({ id: nextId++, value }));
	stripeEnabled.value = c.stripeEnabled;
}

/** Fichier choisi (pas encore envoyé) et son aperçu local. */
interface Picked {
	file: File;
	url: string;
}
const logo = ref<Picked | null>(null);
const favicon = ref<Picked | null>(null);
const picked = { logo, favicon };
type PickedName = keyof typeof picked;

function pick(name: PickedName, input: HTMLInputElement, types: string[], what: string) {
	const file = input.files?.[0];
	input.value = '';
	if (!file) return;
	// Certains systèmes ne donnent pas de type aux .ico.
	const type = file.type || (file.name.toLowerCase().endsWith('.ico') ? 'image/x-icon' : '');
	if (!types.includes(type)) return void (error.value = `${what} : format non accepté.`);
	if (file.size > FILE_MAX) return void (error.value = `${what} : fichier trop lourd (5 Mo max).`);
	error.value = '';
	clear(name);
	picked[name].value = { file: type === file.type ? file : new File([file], file.name, { type }), url: URL.createObjectURL(file) };
}

function clear(name: PickedName) {
	const target = picked[name];
	if (target.value) URL.revokeObjectURL(target.value.url);
	target.value = null;
}

const savedColors = computed(() => source.value?.colors);
const colorsChanged = computed(
	() =>
		!!savedColors.value &&
		JSON.stringify({ ...colors.value, stripe: stripeValues.value, stripeEnabled: stripeEnabled.value }) !==
			JSON.stringify({
				primary: savedColors.value.primary,
				secondary: savedColors.value.secondary,
				accent: savedColors.value.accent,
				stripe: savedColors.value.stripe,
				stripeEnabled: savedColors.value.stripeEnabled,
			}),
);
const changed = computed(() => colorsChanged.value || fontsChanged.value || !!logo.value || !!favicon.value);
watch(changed, (value) => emit('dirty', value), { immediate: true });

const allValid = computed(
	() => [colors.value.primary, colors.value.secondary, colors.value.accent, ...stripeValues.value].every((c) => COLOR_PATTERN.test(c)) && stripe.value.length > 0,
);
/** Couleur affichable dans l'aperçu (une saisie en cours, incomplète, garde la précédente valeur valide). */
const shown = (value: string, fallback: string) => (COLOR_PATTERN.test(value) ? fullHex(value) : fallback);

async function load() {
	loading.value = true;
	try {
		source.value = await brandApi.get();
		setColors(source.value.colors);
		setFonts(source.value);
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

function fail(e: unknown) {
	takeModuleToReopen(); // l'enregistrement a échoué : pas de réouverture au prochain chargement
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

function reset() {
	if (source.value) {
		setColors(source.value.colors);
		setFonts(source.value);
	}
	clear('logo');
	clear('favicon');
	error.value = '';
}

// --- Bande de couleurs ---
function moveStripe(index: number, delta: -1 | 1) {
	const next = [...stripe.value];
	[next[index], next[index + delta]] = [next[index + delta], next[index]];
	stripe.value = next;
}
function addStripe() {
	stripe.value = [...stripe.value, { id: nextId++, value: stripe.value.at(-1)?.value ?? colors.value.primary }];
}
function resetStripe() {
	if (source.value) stripe.value = source.value.defaults.stripe.map((value) => ({ id: nextId++, value }));
}
const stripeIsDefault = computed(() => !!source.value && JSON.stringify(stripeValues.value) === JSON.stringify(source.value.defaults.stripe));

async function upload(picked: Picked | null) {
	return picked ? { type: picked.file.type, data: await fileToBase64(picked.file) } : undefined;
}

async function submit(event: Event) {
	if (!changed.value) return void (error.value = 'Aucune modification à enregistrer.');
	if (!allValid.value) return void (error.value = 'Une couleur est mal saisie (format #2f7fc1).');
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('association');
		const result = await brandApi.update(
			{
				colors: { ...colors.value, stripe: stripeValues.value, stripeEnabled: stripeEnabled.value },
				fonts: {
					titres: fonts.value.titres,
					texte: fonts.value.texte,
					retraits: fonts.value.retraits,
					ajouts: await Promise.all(
						fonts.value.ajouts.map(async (a) => ({
							nom: a.nom,
							fichiers: await Promise.all(a.fichiers.map(async (f) => ({ graisse: f.graisse, data: await fileToBase64(f.file) }))),
						})),
					),
				},
				logo: await upload(logo.value),
				favicon: await upload(favicon.value),
			},
			{ deferred: isDeferredSubmit(event) },
		);
		clear('logo');
		clear('favicon');
		emit('published', 'Charte graphique', result);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

const COLOR_FIELDS = [
	{ key: 'primary', label: 'Couleur principale', help: 'liens, boutons, titres mis en avant' },
	{ key: 'secondary', label: 'Couleur secondaire', help: 'pied de page, survols' },
	{ key: 'accent', label: "Couleur d'accent", help: 'bouton « Adhérer », touches de couleur' },
] as const;

const headerClass = 'flex flex-wrap items-center gap-2 rounded-t-xl border-b border-gray-100 bg-gray-100 px-4 py-2.5';
const fileButtonClass =
	'bouton bouton-contour bouton-mini cursor-pointer focus-within:ring-2 focus-within:ring-primary/40';
/** Damier : fond des aperçus d'images (transparence visible). */
const checkerClass = 'bg-[length:16px_16px] bg-[conic-gradient(#f3f4f6_25%,#fff_0_50%,#f3f4f6_0_75%,#fff_0)]';

onMounted(load);
onBeforeUnmount(() => {
	clear('logo');
	clear('favicon');
});
</script>

<template>
	<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
	<form v-else-if="source" class="space-y-6" @submit.prevent="submit">
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>

		<!-- Modifications en attente : enregistrées en une seule publication -->
		<div
			v-if="changed"
			class="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200"
			role="status"
		>
			<i class="fa-solid fa-palette" aria-hidden="true"></i>
			<span class="min-w-0 flex-1">Modifications pas encore enregistrées.</span>
			<PublishButtons compact :busy="busy" :disabled="props.locked" />
			<button type="button" class="text-xs font-medium text-gray-700 hover:underline" @click="reset">Annuler</button>
		</div>

		<!-- Aperçu en direct -->
		<section class="overflow-hidden rounded-xl border border-gray-200" aria-label="Aperçu">
			<header :class="headerClass">
				<i class="fa-solid fa-eye text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Aperçu</span>
				<span class="text-xs text-gray-500">avant publication</span>
			</header>
			<div class="bg-white" :style="{ fontFamily: fontFamily(fonts.texte) }">
				<div class="flex items-center gap-3 px-4 py-3">
					<img
						v-if="logo || source.logo"
						:src="logo?.url ?? source.logo!.preview"
						alt=""
						class="h-8 w-auto max-w-[8rem] object-contain"
					/>
					<span class="hidden flex-1 gap-3 text-[0.65rem] uppercase tracking-wide text-gray-500 sm:flex">
						<span>Accueil</span><span>Activités</span><span>Actualités</span>
					</span>
					<span
						class="ml-auto rounded-full px-3 py-1 text-xs font-semibold text-white"
						:style="{ backgroundColor: shown(colors.accent, source.colors.accent) }"
						>Adhérer</span
					>
				</div>
				<div v-if="stripeEnabled" class="flex h-1.5">
					<span v-for="s in stripe" :key="s.id" class="flex-1" :style="{ backgroundColor: shown(s.value, '#ffffff') }"></span>
				</div>
				<!-- Sans bande, l'en-tête du site porte une ombre (Header.astro). -->
				<div v-else class="h-1.5 bg-gradient-to-b from-black/10 to-transparent"></div>
				<div class="space-y-2 px-4 py-4 text-sm text-gray-700">
					<p class="font-heading text-base font-semibold" :style="{ color: shown(colors.primary, source.colors.primary), fontFamily: fontFamily(fonts.titres) }">
						Le numérique, ensemble
					</p>
					<p class="font-light">
						Un texte avec <span class="underline" :style="{ color: shown(colors.primary, source.colors.primary) }">un lien</span> vers
						nos ateliers.
					</p>
					<span
						class="inline-block rounded-full px-4 py-1.5 text-xs font-semibold text-white"
						:style="{ backgroundColor: shown(colors.primary, source.colors.primary) }"
						>Découvrir nos activités</span
					>
				</div>
				<div class="px-4 py-3 text-xs text-white" :style="{ backgroundColor: shown(colors.secondary, source.colors.secondary) }">
					{{ association.name }} — pied de page
				</div>
			</div>
		</section>

		<!-- Couleurs -->
		<section class="overflow-hidden rounded-xl border border-gray-200">
			<header :class="headerClass">
				<i class="fa-solid fa-palette text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Couleurs</span>
				<span class="text-xs text-gray-500">du texte blanc s'écrit dessus : visez « lisible »</span>
			</header>
			<div class="divide-y divide-gray-100">
				<ColorField
					v-for="f in COLOR_FIELDS"
					:id="`brand-${f.key}`"
					:key="f.key"
					v-model="colors[f.key]"
					:label="f.label"
					:help="f.help"
					:default-value="source.defaults[f.key]"
				/>
			</div>
		</section>

		<!-- Bande de couleurs -->
		<section class="overflow-hidden rounded-xl border border-gray-200">
			<header :class="headerClass">
				<i class="fa-solid fa-grip-lines text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Bande de couleurs</span>
				<span class="text-xs text-gray-500">sous l'en-tête, de gauche à droite</span>
				<label class="ml-auto flex cursor-pointer items-center gap-2 text-sm text-gray-700">
					<input v-model="stripeEnabled" type="checkbox" class="peer sr-only" />
					<span
						class="relative h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
						aria-hidden="true"
					></span>
					{{ stripeEnabled ? 'Affichée' : 'Masquée' }}
				</label>
			</header>
			<p v-if="!stripeEnabled" class="px-4 py-3 text-sm font-light text-gray-500">
				Pas de bande de couleurs sur le site. Ses couleurs sont gardées : réactivez-la pour les retrouver.
			</p>
			<VueDraggable
				v-show="stripeEnabled"
				v-bind="sortableProps"
				v-model="stripe"
				tag="ul"
				class="divide-y divide-gray-100"
			>
				<li v-for="(s, i) in stripe" :key="s.id" class="flex items-center gap-2 py-2 pr-4 pl-2">
					<DragHandle :disabled="false" />
					<input
						type="color"
						:value="shown(s.value, '#000000')"
						class="champ-couleur"
						:aria-label="`Couleur ${i + 1} de la bande : nuancier`"
						@input="s.value = ($event.target as HTMLInputElement).value"
					/>
					<input
						v-model.trim="s.value"
						type="text"
						maxlength="7"
						spellcheck="false"
						:aria-label="`Couleur ${i + 1} de la bande`"
						:class="[compactInputClass, 'w-28 font-mono', { 'champ-erreur': !COLOR_PATTERN.test(s.value) }]"
					/>
					<span class="ml-auto flex items-center gap-1">
						<OrderArrows :label="`couleur ${i + 1}`" :first="i === 0" :last="i === stripe.length - 1" :disabled="false" @up="moveStripe(i, -1)" @down="moveStripe(i, 1)" />
						<button
							type="button"
							:class="[iconButtonClass, 'text-red-600']"
							:disabled="stripe.length === 1"
							:aria-label="`Retirer la couleur ${i + 1}`"
							title="Retirer"
							@click="stripe = stripe.filter((o) => o.id !== s.id)"
						>
							<i class="fa-solid fa-xmark" aria-hidden="true"></i>
						</button>
					</span>
				</li>
			</VueDraggable>
			<div v-show="stripeEnabled" class="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-2.5">
				<button
					type="button"
					class="text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
					:disabled="stripe.length >= STRIPE_MAX"
					@click="addStripe"
				>
					<i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>Ajouter une couleur
				</button>
				<button v-if="!stripeIsDefault" type="button" class="text-xs text-gray-600 hover:underline" @click="resetStripe">bande d'origine</button>
			</div>
		</section>

		<!-- Polices -->
		<FontsField v-model="fonts" :source="source" :header-class="headerClass" />

		<!-- Logo -->
		<section class="overflow-hidden rounded-xl border border-gray-200">
			<header :class="headerClass">
				<i class="fa-solid fa-image text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Logo</span>
				<span class="text-xs text-gray-500">en-tête et pied de page</span>
			</header>
			<div class="flex flex-wrap items-center gap-4 p-4">
				<div :class="['flex h-24 w-48 items-center justify-center rounded-lg border border-gray-200 p-2', checkerClass]">
					<img v-if="logo || source.logo" :src="logo?.url ?? source.logo!.preview" alt="Logo" class="max-h-full max-w-full object-contain" />
					<span v-else class="text-xs text-gray-500">aucun</span>
				</div>
				<div class="min-w-0 flex-1 space-y-2">
					<p v-if="logo" class="text-sm text-gray-700">
						Nouveau : <strong class="font-medium">{{ logo.file.name }}</strong>
						<button type="button" class="ml-2 text-xs text-gray-600 hover:underline" @click="clear('logo')">annuler</button>
					</p>
					<label :class="fileButtonClass">
						<i class="fa-solid fa-upload mr-1.5" aria-hidden="true"></i>Remplacer le logo
						<input type="file" class="sr-only" :accept="LOGO_TYPES.join(',')" @change="pick('logo', $event.target as HTMLInputElement, LOGO_TYPES, 'Logo')" />
					</label>
					<p class="text-xs font-light text-gray-500">PNG à fond transparent ou SVG de préférence ; JPEG ou WebP acceptés. 5 Mo max.</p>
				</div>
			</div>
		</section>

		<!-- Icône d'onglet -->
		<section class="overflow-hidden rounded-xl border border-gray-200">
			<header :class="headerClass">
				<i class="fa-solid fa-window-maximize text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Icône d'onglet</span>
				<span class="text-xs text-gray-500">favicon : onglets, favoris, raccourcis</span>
			</header>
			<div class="flex flex-wrap items-center gap-4 p-4">
				<div class="flex items-end gap-3">
					<template v-if="favicon">
						<img v-for="size in [16, 32, 64]" :key="size" :src="favicon.url" :width="size" :height="size" alt="" :class="['rounded border border-gray-200', checkerClass]" />
					</template>
					<template v-else-if="source.favicons.length">
						<img v-for="size in [16, 32, 64]" :key="size" :src="source.favicons[0].preview" :width="size" :height="size" alt="" :class="['rounded border border-gray-200', checkerClass]" />
					</template>
					<span v-else class="text-xs text-gray-500">aucune</span>
				</div>
				<div class="min-w-0 flex-1 space-y-2">
					<p v-if="favicon" class="text-sm text-gray-700">
						Nouvelle : <strong class="font-medium">{{ favicon.file.name }}</strong>
						<button type="button" class="ml-2 text-xs text-gray-600 hover:underline" @click="clear('favicon')">annuler</button>
					</p>
					<p v-else-if="source.favicons.length" class="text-xs text-gray-500">Fichiers actuels : {{ source.favicons.map((f) => f.file).join(', ') }}</p>
					<label :class="fileButtonClass">
						<i class="fa-solid fa-upload mr-1.5" aria-hidden="true"></i>Remplacer l'icône
						<input type="file" class="sr-only" :accept="[...FAVICON_TYPES, '.ico'].join(',')" @change="pick('favicon', $event.target as HTMLInputElement, FAVICON_TYPES, 'Icône d’onglet')" />
					</label>
					<p class="text-xs font-light text-gray-500">
						Image carrée, simple et lisible en tout petit : SVG ou PNG (512 × 512 conseillé), ICO accepté. Remplace toutes les icônes actuelles.
					</p>
				</div>
			</div>
		</section>

		<div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<PublishButtons :busy="busy" :disabled="props.locked" />
			<button v-if="changed" type="button" class="text-sm text-gray-600 hover:underline" @click="reset">Annuler les modifications</button>
		</div>
	</form>
</template>
