<script setup lang="ts">
/**
 * Formulaire du module « Charte graphique » (`CharteModule.vue`), en onglets :
 * Couleurs (`colors:` de `reglages.yaml`), En-tête (logo, bande de
 * couleurs, bouton d'action `cta:`), Polices (`polices:`, `FontsField.vue`), Mode sombre (`sombre:`,
 * palettes de `src/lib/mode-sombre.ts`, logo `logo-sombre.*`) et Icône
 * d'onglet (`src/content/images/`), écrits par `brand-writer.ts`. Aperçu en
 * direct au-dessus des onglets ; tous les onglets restent montés et tout
 * part en une seule publication.
 */
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { association } from '../../../../lib/association';
import { COLOR_PATTERN, CTA_LABEL_MAX, type LinkToggle, type ThemeColors } from '../../../../config/site';
import { isSafeUrl } from '../../../../lib/safe-url';
import LinkPicker from '../../LinkPicker.vue';
import { ApiError, brandApi, type BrandSource, type SaveResult } from '../../client';
import { isDeferredSubmit } from '../../lot';
import PublishButtons from '../../PublishButtons.vue';
import FormTabs from '../../FormTabs.vue';
import Encadre from '../../Encadre.vue';
import type { FormTab } from '../../form-tabs';
import { ADMIN_CONTEXT, compactInputClass, inputClass, fileToBase64, iconButtonClass, rememberOpenModule, sortableProps, takeModuleToReopen } from '../../context';
import DragHandle from '../pages/DragHandle.vue';
import OrderArrows from '../pages/OrderArrows.vue';
import ColorField from './ColorField.vue';
import { fullHex } from './contrast';
import { previewFamily } from './font-preview';
import FontsField, { type FontsDraft } from './FontsField.vue';
import { couleurSombreAuto, MARQUE, PALETTES_SOMBRES, type CouleurMarque, type ReglageSombre } from '../../../../lib/mode-sombre';

const props = defineProps<{ locked: boolean; source: BrandSource }>();
const emit = defineEmits<{ published: [label: string, result: SaveResult]; dirty: [value: boolean] }>();
const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const FAVICON_TYPES = ['image/svg+xml', 'image/png', 'image/x-icon', 'image/vnd.microsoft.icon'];
const FILE_MAX = 5 * 1024 * 1024;
const STRIPE_MAX = 12;

const TABS = [
	{ id: 'couleurs', label: 'Couleurs', icon: 'fa-palette' },
	{ id: 'en-tete', label: 'En-tête', icon: 'fa-window-maximize' },
	{ id: 'polices', label: 'Polices', icon: 'fa-font' },
	{ id: 'sombre', label: 'Mode sombre', icon: 'fa-moon' },
	{ id: 'icone', label: 'Icône', icon: 'fa-star' },
] as const satisfies readonly FormTab[];
type TabId = (typeof TABS)[number]['id'];
const tab = ref<TabId>('couleurs');

/** Valeurs enregistrées (relues par le module après chaque publication : formulaire remonté). */
const source = ref<BrandSource | null>(props.source);
const busy = ref(false);
const error = ref('');

/** Couleurs en cours de saisie ; la bande garde un identifiant par ligne (couleurs répétables, glisser-déposer). */
const colors = ref({ primary: '', secondary: '', accent: '' });
let nextId = 0;
const stripe = ref<{ id: number; value: string }[]>([]);
/** Bande affichée (en-tête, PDF des RDV) ; ses couleurs sont gardées quand elle est désactivée. */
const stripeEnabled = ref(true);
const stripeValues = computed(() => stripe.value.map((s) => s.value));

/** Bouton d'action de l'en-tête (« Adhérer ») en cours de saisie. */
const cta = ref<LinkToggle>({ label: '', href: '', enabled: true });
const ctaHrefField = ref<HTMLInputElement | null>(null);
const ctaSnapshot = (c: LinkToggle) => JSON.stringify({ label: c.label.trim(), href: c.href.trim(), enabled: c.enabled });
const ctaChanged = computed(() => !!source.value && ctaSnapshot(cta.value) !== ctaSnapshot(source.value.cta));
const ctaIsDefault = computed(() => !!source.value && ctaSnapshot(cta.value) === ctaSnapshot(source.value.ctaDefaults));
const ctaHrefValid = computed(() => !!cta.value.href.trim() && !/\s/.test(cta.value.href.trim()) && isSafeUrl(cta.value.href.trim()));
/** Lien vers la page d'un plugin inactif : le site masque alors le bouton. */
const ctaIndisponible = computed(() => {
	const chemin = cta.value.href.trim().split(/[?#]/)[0].replace(/\/+$/, '');
	return (source.value?.pagesIndisponibles ?? []).some((p) => chemin === p || chemin.startsWith(`${p}/`));
});
/** Bouton visible dans l'aperçu. */
const ctaShown = computed(() => cta.value.enabled && !ctaIndisponible.value);

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

/**
 * Mode sombre en cours de saisie. Couleur de marque `null` = automatique :
 * elle suit la couleur claire (`couleurSombreAuto`).
 */
const sombre = ref({ enabled: false, fond: '', surface: '', texte: '' });
const sombreMarque = ref<Record<CouleurMarque, string | null>>({ primary: null, secondary: null, accent: null });
function setSombre(s: ReglageSombre) {
	sombre.value = { enabled: s.enabled, fond: s.fond, surface: s.surface, texte: s.texte };
	sombreMarque.value = { primary: s.primary ?? null, secondary: s.secondary ?? null, accent: s.accent ?? null };
}
/** Variante automatique d'une couleur de marque (d'après la saisie claire en cours). */
const autoMarque = (k: CouleurMarque) => couleurSombreAuto(shown(colors.value[k], source.value?.colors[k] ?? '#000000'));
const valeurMarque = (k: CouleurMarque) => sombreMarque.value[k] ?? autoMarque(k);
function setMarque(k: CouleurMarque, v: string) {
	sombreMarque.value = { ...sombreMarque.value, [k]: COLOR_PATTERN.test(v) && fullHex(v).toLowerCase() === autoMarque(k) ? null : v };
}
const sombreSnapshot = (s: ReglageSombre) =>
	JSON.stringify({ enabled: s.enabled, fond: s.fond, surface: s.surface, texte: s.texte, primary: s.primary ?? null, secondary: s.secondary ?? null, accent: s.accent ?? null });
const sombreChanged = computed(
	() => !!source.value && sombreSnapshot({ ...sombre.value, ...sombreMarque.value } as ReglageSombre) !== sombreSnapshot(source.value.sombre),
);
/** Palette prédéfinie qui correspond à la saisie (bouton enfoncé). */
const paletteActive = computed(() =>
	PALETTES_SOMBRES.find((p) => [p.fond, p.surface, p.texte].join() === [sombre.value.fond, sombre.value.surface, sombre.value.texte].map((c) => c.toLowerCase()).join()),
);
function choisirPalette(id: string) {
	const p = PALETTES_SOMBRES.find((x) => x.id === id)!;
	sombre.value = { ...sombre.value, fond: p.fond, surface: p.surface, texte: p.texte };
}
/** Logo du mode sombre à retirer (le logo normal sert alors partout). */
const retirerLogoSombre = ref(false);
const SOMBRE_FIELDS = [
	{ key: 'fond', label: 'Fond de page', help: 'arrière-plan du site' },
	{ key: 'surface', label: 'Surfaces', help: 'en-tête, cartes, champs, encadrés' },
	{ key: 'texte', label: 'Texte', help: 'titres et texte courant (les gris en sont tirés)' },
] as const;

/** Fichier choisi (pas encore envoyé) et son aperçu local. */
interface Picked {
	file: File;
	url: string;
}
const logo = ref<Picked | null>(null);
const logoSombre = ref<Picked | null>(null);
const favicon = ref<Picked | null>(null);
const picked = { logo, logoSombre, favicon };
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
const themeChanged = computed(
	() =>
		!!savedColors.value &&
		JSON.stringify(colors.value) !==
			JSON.stringify({ primary: savedColors.value.primary, secondary: savedColors.value.secondary, accent: savedColors.value.accent }),
);
const stripeChanged = computed(
	() =>
		!!savedColors.value &&
		JSON.stringify({ stripe: stripeValues.value, stripeEnabled: stripeEnabled.value }) !==
			JSON.stringify({ stripe: savedColors.value.stripe, stripeEnabled: savedColors.value.stripeEnabled }),
);
/** Onglets avec une saisie pas encore publiée (pastille). */
const marks = computed<Record<TabId, boolean>>(() => ({
	couleurs: themeChanged.value,
	'en-tete': stripeChanged.value || ctaChanged.value || !!logo.value,
	polices: fontsChanged.value,
	sombre: sombreChanged.value || !!logoSombre.value || retirerLogoSombre.value,
	icone: !!favicon.value,
}));
const changed = computed(() => Object.values(marks.value).some(Boolean));
watch(changed, (value) => emit('dirty', value), { immediate: true });

const allValid = computed(
	() =>
		[
			colors.value.primary,
			colors.value.secondary,
			colors.value.accent,
			...stripeValues.value,
			sombre.value.fond,
			sombre.value.surface,
			sombre.value.texte,
			...MARQUE.map(valeurMarque),
		].every((c) => COLOR_PATTERN.test(c)) && stripe.value.length > 0,
);
/** Couleur affichable dans l'aperçu (une saisie en cours, incomplète, garde la précédente valeur valide). */
const shown = (value: string, fallback: string) => (COLOR_PATTERN.test(value) ? fullHex(value) : fallback);
/** Logo affiché dans l'aperçu sombre : logo sombre choisi ou enregistré (sauf retrait), sinon logo normal. */
const apercuLogoSombre = computed(
	() => logoSombre.value?.url ?? (!retirerLogoSombre.value ? source.value?.logoSombre?.preview : undefined) ?? logo.value?.url ?? source.value?.logo?.preview,
);
/** Couleur affichable du mode sombre (fond, surface, texte). */
const sombreShown = (k: 'fond' | 'surface' | 'texte') => shown(sombre.value[k], source.value?.sombre[k] ?? '#000000');
/** Gris de l'aperçu sombre : texte mêlé au fond, comme le CSS du site (global.css). */
const grisSombre = (pourcent: number) => `color-mix(in oklab, ${sombreShown('texte')} ${pourcent}%, ${sombreShown('fond')})`;

function fail(e: unknown) {
	takeModuleToReopen(); // l'enregistrement a échoué : pas de réouverture au prochain chargement
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

function reset() {
	if (source.value) {
		setColors(source.value.colors);
		setSombre(source.value.sombre);
		setFonts(source.value);
		cta.value = { ...source.value.cta };
	}
	retirerLogoSombre.value = false;
	clear('logo');
	clear('logoSombre');
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
	if (!cta.value.label.trim() || !ctaHrefValid.value) {
		tab.value = 'en-tete';
		return void (error.value = "Bouton de l'en-tête : texte et lien (ex. /adherer) obligatoires.");
	}
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('charte');
		const result = await brandApi.update(
			{
				colors: { ...colors.value, stripe: stripeValues.value, stripeEnabled: stripeEnabled.value },
				sombre: {
					...sombre.value,
					primary: sombreMarque.value.primary ?? undefined,
					secondary: sombreMarque.value.secondary ?? undefined,
					accent: sombreMarque.value.accent ?? undefined,
				},
				cta: { label: cta.value.label.trim(), href: cta.value.href.trim(), enabled: cta.value.enabled },
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
				logoSombre: await upload(logoSombre.value),
				retirerLogoSombre: retirerLogoSombre.value && !logoSombre.value,
				favicon: await upload(favicon.value),
			},
			{ deferred: isDeferredSubmit(event) },
		);
		clear('logo');
		clear('logoSombre');
		clear('favicon');
		retirerLogoSombre.value = false;
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

reset();
onBeforeUnmount(() => {
	clear('logo');
	clear('logoSombre');
	clear('favicon');
});
</script>

<template>
	<form v-if="source" class="space-y-6" @submit.prevent="submit">
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
						v-if="ctaShown"
						class="ml-auto max-w-[9rem] truncate rounded-full px-3 py-1 text-xs font-semibold text-white"
						:style="{ backgroundColor: shown(colors.accent, source.colors.accent) }"
						>{{ cta.label || '…' }}</span
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

		<FormTabs v-model="tab" :tabs="TABS" prefix="charte" :marks="marks" />
		<div v-show="tab === 'couleurs'" id="charte-panel-couleurs" role="tabpanel" aria-labelledby="charte-tab-couleurs" class="space-y-6">
			<!-- Couleurs -->
			<Encadre icone="fa-palette" titre="Couleurs" sous-titre="du texte blanc s'écrit dessus : visez « lisible »">
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
			</Encadre>
		</div>
		<div v-show="tab === 'en-tete'" id="charte-panel-en-tete" role="tabpanel" aria-labelledby="charte-tab-en-tete" class="space-y-6">
			<!-- Logo -->
			<Encadre icone="fa-image" titre="Logo" sous-titre="en-tête et pied de page">
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
						<p class="text-xs font-light text-gray-500">PNG à fond transparent ou SVG de préférence, 5 Mo max.</p>
					</div>
				</div>
			</Encadre>
			<!-- Bouton d'action de l'en-tête -->
			<Encadre icone="fa-hand-pointer" titre="Bouton de l'en-tête" sous-titre="à droite du menu, couleur d'accent">
				<template #actions>
					<label class="ml-auto flex cursor-pointer items-center gap-2 text-sm text-gray-700">
						<input v-model="cta.enabled" type="checkbox" class="peer sr-only" />
						<span
							class="relative h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
							aria-hidden="true"
						></span>
						{{ cta.enabled ? 'Affiché' : 'Masqué' }}
					</label>
				</template>
				<p v-if="!cta.enabled" class="px-4 py-3 text-sm font-light text-gray-500">
					Pas de bouton dans l'en-tête.
				</p>
				<div v-show="cta.enabled" class="space-y-4 p-4">
					<div>
						<label for="cta-label" class="champ-libelle">Texte</label>
						<input id="cta-label" v-model="cta.label" type="text" :maxlength="CTA_LABEL_MAX" :class="[inputClass, { 'champ-erreur': !cta.label.trim() }]" />
						<p class="champ-aide">Court : il tient sur une ligne, aussi sur téléphone (ex. « Adhérer », « Prendre rendez-vous »).</p>
					</div>
					<div>
						<label for="cta-href" class="champ-libelle">Lien</label>
						<input
							id="cta-href"
							ref="ctaHrefField"
							v-model="cta.href"
							type="text"
							spellcheck="false"
							placeholder="/adherer"
							:class="[inputClass, 'font-mono', { 'champ-erreur': !ctaHrefValid }]"
						/>
						<p v-if="!ctaHrefValid" class="champ-erreur-texte">Adresse d'une page du site (ex. /adherer) ou adresse complète (https://…).</p>
						<p v-else-if="ctaIndisponible" class="champ-aide">
							Cette page n'est pas active sur le site : le bouton ne s'affichera pas.
						</p>
						<LinkPicker v-model="cta.href" :field="ctaHrefField" mode="url" />
					</div>
					<button v-if="!ctaIsDefault" type="button" class="text-xs text-gray-600 hover:underline" @click="cta = { ...source.ctaDefaults }">
						bouton d'origine
					</button>
				</div>
			</Encadre>

			<!-- Bande de couleurs -->
			<Encadre icone="fa-grip-lines" titre="Bande de couleurs" sous-titre="sous l'en-tête, de gauche à droite">
				<template #actions>
					<label class="ml-auto flex cursor-pointer items-center gap-2 text-sm text-gray-700">
						<input v-model="stripeEnabled" type="checkbox" class="peer sr-only" />
						<span
							class="relative h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
							aria-hidden="true"
						></span>
						{{ stripeEnabled ? 'Affichée' : 'Masquée' }}
					</label>
				</template>
				<p v-if="!stripeEnabled" class="px-4 py-3 text-sm font-light text-gray-500">
					Pas de bande de couleurs sur le site.
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
			</Encadre>
		</div>
		<div v-show="tab === 'polices'" id="charte-panel-polices" role="tabpanel" aria-labelledby="charte-tab-polices" class="space-y-6">
			<!-- Polices -->
			<FontsField v-model="fonts" :source="source" />
		</div>
		<div v-show="tab === 'sombre'" id="charte-panel-sombre" role="tabpanel" aria-labelledby="charte-tab-sombre" class="space-y-6">
			<!-- Aperçu du mode sombre (si proposé) -->
			<section v-if="sombre.enabled" class="overflow-hidden rounded-xl border border-gray-200" aria-label="Aperçu du mode sombre">
				<header :class="headerClass">
					<i class="fa-solid fa-eye text-gray-400" aria-hidden="true"></i>
					<span class="font-heading font-semibold text-gray-900">Aperçu du mode sombre</span>
					<span class="text-xs text-gray-500">avant publication</span>
				</header>
				<div :style="{ fontFamily: fontFamily(fonts.texte), backgroundColor: sombreShown('fond') }">
					<div class="flex items-center gap-3 px-4 py-3" :style="{ backgroundColor: sombreShown('surface') }">
						<img v-if="apercuLogoSombre" :src="apercuLogoSombre" alt="" class="h-8 w-auto max-w-[8rem] object-contain" />
						<span class="hidden flex-1 gap-3 text-[0.65rem] uppercase tracking-wide sm:flex" :style="{ color: grisSombre(76) }">
							<span>Accueil</span><span>Activités</span><span>Actualités</span>
						</span>
						<i class="fa-solid fa-sun ml-auto text-xs" :style="{ color: grisSombre(76) }" aria-hidden="true"></i>
						<span v-if="ctaShown" class="max-w-[9rem] truncate rounded-full px-3 py-1 text-xs font-semibold text-white" :style="{ backgroundColor: valeurMarque('accent') }">{{ cta.label || '…' }}</span>
					</div>
					<div v-if="stripeEnabled" class="flex h-1.5">
						<span v-for="s in stripe" :key="s.id" class="flex-1" :style="{ backgroundColor: shown(s.value, '#ffffff') }"></span>
					</div>
					<div class="space-y-2 px-4 py-4 text-sm" :style="{ color: grisSombre(86) }">
						<p class="font-heading text-base font-semibold" :style="{ color: valeurMarque('primary'), fontFamily: fontFamily(fonts.titres) }">
							Le numérique, ensemble
						</p>
						<p class="font-light">
							Un texte avec <span class="underline" :style="{ color: valeurMarque('primary') }">un lien</span> vers nos ateliers.
						</p>
						<div class="rounded-lg p-3" :style="{ backgroundColor: sombreShown('surface'), color: sombreShown('texte') }">
							Une carte sur une surface.
						</div>
						<span class="inline-block rounded-full px-4 py-1.5 text-xs font-semibold text-white" :style="{ backgroundColor: valeurMarque('primary') }"
							>Découvrir nos activités</span
						>
					</div>
					<div class="px-4 py-3 text-xs text-white" :style="{ backgroundColor: valeurMarque('secondary') }">
						{{ association.name }} — pied de page
					</div>
				</div>
			</section>
			<!-- Mode sombre -->
			<Encadre icone="fa-moon" titre="Mode sombre" sous-titre="bouton clair / sombre dans l'en-tête">
				<template #actions>
					<label class="ml-auto flex cursor-pointer items-center gap-2 text-sm text-gray-700">
						<input v-model="sombre.enabled" type="checkbox" class="peer sr-only" />
						<span
							class="relative h-5 w-9 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
							aria-hidden="true"
						></span>
						{{ sombre.enabled ? 'Proposé' : 'Non proposé' }}
					</label>
				</template>
				<p v-if="!sombre.enabled" class="px-4 py-3 text-sm font-light text-gray-500">
					Une fois activé, chaque visiteur peut passer le site en sombre.
				</p>
				<template v-else>
					<div class="space-y-2 px-4 py-3">
						<p class="champ-libelle">Palette</p>
						<div class="flex flex-wrap gap-2" role="group" aria-label="Palettes prédéfinies">
							<button
								v-for="p in PALETTES_SOMBRES"
								:key="p.id"
								type="button"
								:class="[
									'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
									paletteActive?.id === p.id ? 'border-primary ring-2 ring-primary/30' : 'border-gray-200 hover:border-primary',
								]"
								:aria-pressed="paletteActive?.id === p.id"
								:title="p.origine"
								@click="choisirPalette(p.id)"
							>
								<span class="flex overflow-hidden rounded border border-gray-300" aria-hidden="true">
									<span class="h-5 w-3" :style="{ backgroundColor: p.fond }"></span>
									<span class="h-5 w-3" :style="{ backgroundColor: p.surface }"></span>
									<span class="h-5 w-3" :style="{ backgroundColor: p.texte }"></span>
								</span>
								{{ p.label }}
							</button>
						</div>
						<p class="champ-aide">
							{{ paletteActive ? `${paletteActive.label} : ${paletteActive.origine}.` : 'Palette personnalisée.' }} Les couleurs restent modifiables
							ci-dessous.
						</p>
					</div>
					<div class="divide-y divide-gray-100 border-t border-gray-100">
						<ColorField
							v-for="f in SOMBRE_FIELDS"
							:id="`sombre-${f.key}`"
							:key="f.key"
							v-model="sombre[f.key]"
							:label="f.label"
							:help="f.help"
							:default-value="source.sombre[f.key]"
							default-label="valeur enregistrée"
							:checks="f.key === 'texte' ? [{ against: sombre.fond, label: 'Sur le fond' }, { against: sombre.surface, label: 'Sur les surfaces' }] : []"
						/>
					</div>
					<p class="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
						Couleurs adaptées automatiquement au fond sombre ; vous pouvez les modifier.
					</p>
					<div class="divide-y divide-gray-100 border-t border-gray-100">
						<ColorField
							v-for="f in COLOR_FIELDS"
							:id="`sombre-${f.key}`"
							:key="f.key"
							:model-value="valeurMarque(f.key)"
							:label="f.label"
							:help="sombreMarque[f.key] ? f.help : `${f.help} — automatique`"
							:default-value="autoMarque(f.key)"
							default-label="automatique"
							:checks="[
								{ against: '#ffffff', label: 'Texte blanc' },
								{ against: sombre.fond, label: 'Sur le fond' },
							]"
							@update:model-value="setMarque(f.key, $event)"
						/>
					</div>
					<!-- Logo du mode sombre -->
					<div class="flex flex-wrap items-center gap-4 border-t border-gray-100 p-4">
						<div class="flex h-24 w-48 items-center justify-center rounded-lg border border-gray-200 p-2" :style="{ backgroundColor: sombreShown('surface') }">
							<img v-if="apercuLogoSombre" :src="apercuLogoSombre" alt="Logo en mode sombre" class="max-h-full max-w-full object-contain" />
						</div>
						<div class="min-w-0 flex-1 space-y-2">
							<p class="champ-libelle">Logo du mode sombre <span class="font-light text-gray-500">(facultatif)</span></p>
							<p v-if="logoSombre" class="text-sm text-gray-700">
								Nouveau : <strong class="font-medium">{{ logoSombre.file.name }}</strong>
								<button type="button" class="ml-2 text-xs text-gray-600 hover:underline" @click="clear('logoSombre')">annuler</button>
							</p>
							<p v-else-if="source.logoSombre && retirerLogoSombre" class="text-sm text-gray-700">
								Retiré : le logo normal servira aussi en mode sombre.
								<button type="button" class="ml-2 text-xs text-gray-600 hover:underline" @click="retirerLogoSombre = false">annuler</button>
							</p>
							<p v-else-if="!source.logoSombre" class="text-xs text-gray-500">Aucun : le logo normal est utilisé. Vérifiez qu'il reste lisible sur le fond ci-contre.</p>
							<div class="flex flex-wrap items-center gap-3">
								<label :class="fileButtonClass">
									<i class="fa-solid fa-upload mr-1.5" aria-hidden="true"></i>{{ source.logoSombre ? 'Remplacer' : 'Déposer' }} le logo sombre
									<input
										type="file"
										class="sr-only"
										:accept="LOGO_TYPES.join(',')"
										@change="pick('logoSombre', $event.target as HTMLInputElement, LOGO_TYPES, 'Logo du mode sombre')"
									/>
								</label>
								<button
									v-if="source.logoSombre && !logoSombre && !retirerLogoSombre"
									type="button"
									class="text-xs text-red-700 hover:underline"
									@click="retirerLogoSombre = true"
								>
									retirer
								</button>
							</div>
							<p class="text-xs font-light text-gray-500">Version claire du logo, pour un fond sombre : PNG transparent ou SVG.</p>
						</div>
					</div>
				</template>
			</Encadre>
		</div>
		<div v-show="tab === 'icone'" id="charte-panel-icone" role="tabpanel" aria-labelledby="charte-tab-icone" class="space-y-6">
			<!-- Icône d'onglet -->
			<Encadre icone="fa-window-maximize" titre="Icône d'onglet" sous-titre="favicon : onglets, favoris, raccourcis">
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
						<label :class="fileButtonClass">
							<i class="fa-solid fa-upload mr-1.5" aria-hidden="true"></i>Remplacer l'icône
							<input type="file" class="sr-only" :accept="[...FAVICON_TYPES, '.ico'].join(',')" @change="pick('favicon', $event.target as HTMLInputElement, FAVICON_TYPES, 'Icône d’onglet')" />
						</label>
						<p class="text-xs font-light text-gray-500">
							Image carrée, simple et lisible en tout petit (PNG ou SVG).
						</p>
					</div>
				</div>
			</Encadre>
		</div>

		<div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<PublishButtons :busy="busy" :disabled="props.locked" />
			<button v-if="changed" type="button" class="text-sm text-gray-600 hover:underline" @click="reset">Annuler les modifications</button>
		</div>
	</form>
</template>
