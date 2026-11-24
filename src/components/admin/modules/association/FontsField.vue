<script setup lang="ts">
/**
 * Onglet « Polices » du module « Charte graphique » (`BrandForm.vue`) :
 * police des titres et du texte (liste des polices proposées + polices
 * déposées par l'association), polices déposées à ajouter ou à retirer.
 * Brouillon en `v-model` (`FontsDraft`), envoyé avec le reste de la charte ;
 * le serveur revalide tout (`brand-writer.ts`).
 */
import { computed, ref } from 'vue';
import {
	FONT_FILE_MAX,
	FONT_NAME_MAX,
	FONT_ROLES,
	FONT_WEIGHTS,
	FONT_CATALOGUE,
	catalogueFont,
	guessWeight,
	WEIGHT_LABELS,
	WEIGHTS_USED,
	type FontRole,
	type FontWeight,
} from '../../../../lib/font-catalogue';
import type { BrandSource } from '../../client';
import { compactInputClass, iconButtonClass } from '../../context';
import { previewFamily } from './font-preview';
import Encadre from '../../Encadre.vue';

export interface FontsDraft {
	titres: string;
	texte: string;
	ajouts: { key: number; nom: string; fichiers: { graisse: FontWeight; file: File }[] }[];
	retraits: string[];
}

const props = defineProps<{ source: BrandSource }>();
const draft = defineModel<FontsDraft>({ required: true });

const ACCEPT = '.woff2,.woff,.ttf,.otf';

/** Polices déposées visibles : enregistrées non retirées + ajoutées. */
const uploadedNames = computed(() => [
	...props.source.fonts.deposees.filter((d) => !draft.value.retraits.includes(d.nom)).map((d) => d.nom),
	...draft.value.ajouts.map((a) => a.nom.trim()),
]);

function weightsOf(name: string): FontWeight[] | null {
	if (catalogueFont(name)) return null;
	const added = draft.value.ajouts.find((a) => a.nom.trim() === name);
	if (added) return added.fichiers.map((f) => f.graisse);
	return props.source.fonts.deposees.find((d) => d.nom === name)?.fichiers.map((f) => f.graisse) ?? [];
}

/** Graisses employées par le site mais absentes de la police choisie (imitées par le navigateur). */
function missingWeights(role: FontRole): FontWeight[] {
	const weights = weightsOf(draft.value[role]);
	if (!weights || weights.includes('variable')) return [];
	return WEIGHTS_USED[role].filter((w) => !weights.includes(w));
}

const usedBy = (name: string) => FONT_ROLES.filter((r) => draft.value[r.role] === name).map((r) => r.label.toLowerCase());
const family = (name: string) => previewFamily(name, props.source, draft.value.ajouts);
const labelOf = (name: string) => catalogueFont(name)?.label ?? name;

function toggleRemoval(name: string) {
	const r = draft.value.retraits;
	draft.value = { ...draft.value, retraits: r.includes(name) ? r.filter((n) => n !== name) : [...r, name] };
}

// --- Ajout d'une police ---

const adding = ref(false);
const newName = ref('');
const newFiles = ref<{ graisse: FontWeight; file: File }[]>([]);
const addError = ref('');
let nextKey = 0;

function pickFiles(event: Event) {
	const input = event.target as HTMLInputElement;
	const files = [...(input.files ?? [])];
	input.value = '';
	addError.value = '';
	for (const file of files) {
		if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) {
			addError.value = `${file.name} : formats acceptés WOFF2, WOFF, TTF ou OTF.`;
			continue;
		}
		if (file.size > FONT_FILE_MAX) {
			addError.value = `${file.name} : fichier trop lourd (2 Mo max).`;
			continue;
		}
		newFiles.value.push({ graisse: guessWeight(file.name), file });
		// Nom proposé d'après le premier fichier (« Aileron-Light.woff2 » → « Aileron »).
		if (!newName.value.trim()) newName.value = file.name.replace(/\.[^.]+$/, '').split(/[-_ ]/)[0];
	}
}

const newProblem = computed(() => {
	const nom = newName.value.trim();
	if (!nom) return 'Donnez un nom à la police.';
	if (catalogueFont(nom) || FONT_CATALOGUE.some((f) => f.label.toLowerCase() === nom.toLowerCase())) return 'C’est déjà une police proposée : choisissez-la dans la liste.';
	if (uploadedNames.value.some((n) => n.toLowerCase() === nom.toLowerCase())) return 'Ce nom est déjà pris.';
	if (!newFiles.value.length) return 'Choisissez au moins un fichier.';
	const weights = newFiles.value.map((f) => f.graisse);
	if (new Set(weights).size !== weights.length) return 'Deux fichiers ont la même graisse.';
	return '';
});

function confirmAdd() {
	if (newProblem.value) return void (addError.value = newProblem.value);
	draft.value = { ...draft.value, ajouts: [...draft.value.ajouts, { key: nextKey++, nom: newName.value.trim(), fichiers: [...newFiles.value] }] };
	cancelAdd();
}

function cancelAdd() {
	adding.value = false;
	newName.value = '';
	newFiles.value = [];
	addError.value = '';
}

function removeAdded(key: number) {
	const added = draft.value.ajouts.find((a) => a.key === key);
	const roles = { ...draft.value };
	// Rôle qui utilisait la police retirée : retour à la police enregistrée.
	for (const r of FONT_ROLES) if (added && roles[r.role] === added.nom.trim()) roles[r.role] = props.source.fonts[r.role];
	draft.value = { ...roles, ajouts: draft.value.ajouts.filter((a) => a.key !== key) };
}
</script>

<template>
	<Encadre icone="fa-font" titre="Polices" sous-titre="titres et texte du site">

		<!-- Choix par rôle -->
		<div class="divide-y divide-gray-100">
			<div v-for="r in FONT_ROLES" :key="r.role" class="space-y-2 px-4 py-3">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<label :for="`font-${r.role}`" class="w-20 text-sm font-medium text-gray-900">{{ r.label }}</label>
					<select :id="`font-${r.role}`" v-model="draft[r.role]" :class="[compactInputClass, 'min-w-0 flex-1 sm:max-w-xs']">
						<optgroup label="Polices proposées">
							<option v-for="f in FONT_CATALOGUE" :key="f.id" :value="f.id">
								{{ f.label }}{{ f.id === props.source.fontDefaults[r.role] ? ' (par défaut)' : '' }}
							</option>
						</optgroup>
						<optgroup v-if="uploadedNames.length" label="Vos polices">
							<option v-for="n in uploadedNames" :key="n" :value="n">{{ n }}</option>
						</optgroup>
					</select>
					<button
						v-if="draft[r.role] !== props.source.fontDefaults[r.role]"
						type="button"
						class="text-xs text-gray-600 hover:underline"
						@click="draft[r.role] = props.source.fontDefaults[r.role]"
					>
						par défaut
					</button>
				</div>
				<p class="text-xs font-light text-gray-500">{{ r.help }}</p>
				<div class="rounded-lg border border-gray-200 bg-gray-50 px-3 pt-1.5 pb-2">
					<p class="flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wide text-gray-500">
						<i class="fa-solid fa-eye" aria-hidden="true"></i>Aperçu · {{ labelOf(draft[r.role]) }}
					</p>
					<p
						class="mt-0.5 text-gray-900"
						:class="r.role === 'titres' ? 'text-lg font-semibold' : 'text-sm'"
						:style="{ fontFamily: family(draft[r.role]) }"
					>
						{{ r.role === 'titres' ? 'Le numérique, ensemble et pour tous' : 'Ateliers, accompagnement et prêt de matériel : bienvenue à toutes et à tous.' }}
					</p>
				</div>
				<p v-if="missingWeights(r.role).length" class="text-xs text-amber-800">
					<i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true"></i>
					Cette police n'a pas toutes les épaisseurs utilisées par le site : certains textes seront un peu moins nets.
				</p>
			</div>
		</div>

		<!-- Polices déposées -->
		<div class="border-t border-gray-100 px-4 py-3">
			<p class="champ-libelle">Vos polices</p>
			<ul v-if="props.source.fonts.deposees.length || draft.ajouts.length" class="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-100">
				<li v-for="d in props.source.fonts.deposees" :key="d.nom" class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
					<span
						class="min-w-0 font-medium"
						:class="draft.retraits.includes(d.nom) ? 'text-gray-400 line-through' : 'text-gray-900'"
						:style="{ fontFamily: family(d.nom) }"
						>{{ d.nom }}</span
					>
					<span class="text-xs text-gray-500">{{ d.fichiers.map((f) => f.graisse).join(' · ') }}</span>
					<span v-if="usedBy(d.nom).length" class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{{ usedBy(d.nom).join(' et ') }}</span>
					<span v-if="d.fichiers.some((f) => !f.preview)" class="text-xs text-red-700">fichier manquant</span>
					<span class="ml-auto">
						<button v-if="draft.retraits.includes(d.nom)" type="button" class="text-xs text-gray-700 hover:underline" @click="toggleRemoval(d.nom)">
							garder
						</button>
						<button
							v-else
							type="button"
							:class="[iconButtonClass, 'text-red-600']"
							:disabled="usedBy(d.nom).length > 0"
							:title="usedBy(d.nom).length ? 'Utilisée : choisissez d’abord une autre police' : 'Retirer la police'"
							:aria-label="`Retirer la police ${d.nom}`"
							@click="toggleRemoval(d.nom)"
						>
							<i class="fa-solid fa-xmark" aria-hidden="true"></i>
						</button>
					</span>
				</li>
				<li v-for="a in draft.ajouts" :key="`new-${a.key}`" class="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
					<span class="min-w-0 font-medium text-gray-900" :style="{ fontFamily: family(a.nom) }">{{ a.nom }}</span>
					<span class="text-xs text-gray-500">{{ a.fichiers.map((f) => f.graisse).join(' · ') }}</span>
					<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">nouvelle</span>
					<span v-if="usedBy(a.nom).length" class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{{ usedBy(a.nom).join(' et ') }}</span>
					<button type="button" class="ml-auto text-xs text-gray-700 hover:underline" @click="removeAdded(a.key)">annuler</button>
				</li>
			</ul>
			<p v-else class="mt-1 text-xs font-light text-gray-500">Aucune : le site utilise les polices proposées.</p>

			<!-- Ajout -->
			<button v-if="!adding" type="button" class="mt-3 text-sm font-medium text-primary hover:underline" @click="adding = true">
				<i class="fa-solid fa-plus mr-1" aria-hidden="true"></i>Ajouter une police
			</button>
			<div v-else class="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
				<div>
					<label for="font-new-name" class="champ-libelle">Nom de la police</label>
					<input id="font-new-name" v-model="newName" type="text" :maxlength="FONT_NAME_MAX" :class="compactInputClass" placeholder="ex. Aileron" />
				</div>
				<div>
					<label class="bouton bouton-contour bouton-mini cursor-pointer focus-within:ring-2 focus-within:ring-primary/40">
						<i class="fa-solid fa-upload mr-1.5" aria-hidden="true"></i>Choisir les fichiers
						<input type="file" multiple class="sr-only" :accept="ACCEPT" @change="pickFiles" />
					</label>
					<p class="champ-aide">
						Fichiers de police (WOFF2 de préférence), 2 Mo max. Vérifiez que la licence autorise l'usage sur un site web.
					</p>
				</div>
				<ul v-if="newFiles.length" class="space-y-1.5">
					<li v-for="(f, i) in newFiles" :key="i" class="flex flex-wrap items-center gap-2 text-sm">
						<span class="min-w-0 flex-1 truncate text-gray-700">{{ f.file.name }}</span>
						<select v-model="f.graisse" :class="[compactInputClass, 'w-44']" :aria-label="`Graisse de ${f.file.name}`">
							<option v-for="w in FONT_WEIGHTS" :key="w" :value="w">{{ WEIGHT_LABELS[w] }}</option>
						</select>
						<button type="button" :class="[iconButtonClass, 'text-red-600']" :aria-label="`Retirer ${f.file.name}`" @click="newFiles.splice(i, 1)">
							<i class="fa-solid fa-xmark" aria-hidden="true"></i>
						</button>
					</li>
				</ul>
				<p v-if="addError" class="champ-erreur-texte" role="alert">{{ addError }}</p>
				<div class="flex flex-wrap items-center gap-3">
					<button type="button" class="bouton bouton-primaire bouton-mini" @click="confirmAdd">Ajouter à la liste</button>
					<button type="button" class="text-xs text-gray-700 hover:underline" @click="cancelAdd">Annuler</button>
				</div>
				<p class="text-xs font-light text-gray-500">Choisissez-la ensuite pour les titres ou le texte.</p>
			</div>
		</div>
	</Encadre>
</template>
