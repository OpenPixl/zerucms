<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DISPO_ATTENTE } from '../../../../lib/grist-asso/choices';
import type { ActiviteOption, GroupeMembre, InscriptionLigne } from '../../../../lib/grist-asso/types';
import { formatPrix } from '../../../../lib/grist-asso/format';

const props = defineProps<{
	options: ActiviteOption[];
	membres: GroupeMembre[];
	inscriptions: InscriptionLigne[];
	active: boolean;
	done: boolean;
	busy: boolean;
}>();

const emit = defineEmits<{
	ajouter: [payload: { membreId: number; activiteId: number }];
	submit: [pending: { membreId: number; activiteId: number } | null];
	passer: [];
}>();

const plusieursMembres = computed(() => props.membres.length > 1);

const membreCourant = ref<number | null>(props.membres[0]?.membreId ?? null);
const activiteCourante = ref<number | null>(null);

// Garder un membre sélectionné valide quand la liste arrive / change.
watch(
	() => props.membres,
	(m) => {
		if (!m.some((x) => x.membreId === membreCourant.value)) {
			membreCourant.value = m[0]?.membreId ?? null;
		}
	},
	{ immediate: true },
);

function complet(o: ActiviteOption): boolean {
	return o.placesRestantes !== null && o.placesRestantes <= 0;
}

function placesLabel(o: ActiviteOption): string {
	if (o.placesRestantes === null) return '';
	if (o.placesRestantes <= 0) return 'Complet';
	if (o.placesRestantes === 1) return '1 place restante';
	return `${o.placesRestantes} places restantes`;
}

const dejaInscrit = computed(() =>
	props.inscriptions.some(
		(l) => l.membreId === membreCourant.value && l.activiteId === activiteCourante.value,
	),
);

/** Sélection courante exploitable : membre + activité disponible + pas de doublon. */
const selectionCourante = computed(() => {
	if (membreCourant.value === null || activiteCourante.value === null) return null;
	const o = props.options.find((x) => x.id === activiteCourante.value);
	if (!o || complet(o) || dejaInscrit.value) return null;
	return { membreId: membreCourant.value, activiteId: activiteCourante.value };
});

const peutValider = computed(
	() => props.inscriptions.length > 0 || selectionCourante.value !== null,
);

function ajouter() {
	if (!selectionCourante.value) return;
	emit('ajouter', selectionCourante.value);
	activiteCourante.value = null; // on garde le membre, on repart sur une nouvelle activité
}

function valider() {
	emit('submit', selectionCourante.value);
}
</script>

<template>
	<li
		class="rounded-2xl border bg-surface p-6 shadow-sm"
		:class="active ? 'border-primary' : 'border-gray-100'"
	>
		<div class="flex items-center gap-3">
			<span
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-sm"
				:class="done ? 'bg-primary text-white' : 'bg-primary/10 text-primary'"
			>
				<i v-if="done" class="fa-solid fa-check" aria-hidden="true"></i>
				<span v-else>3</span>
			</span>
			<h2 class="font-heading text-lg text-gray-900">Choix de l'activité</h2>
		</div>

		<form v-if="active" class="mt-5" @submit.prevent="valider">
			<!-- Activités déjà ajoutées -->
			<ul v-if="inscriptions.length" class="mb-4 space-y-2">
				<li
					v-for="(l, i) in inscriptions"
					:key="i"
					class="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-2 text-sm"
				>
					<span class="text-gray-900">
						<span v-if="plusieursMembres" class="font-medium">{{ l.membreLabel }} — </span>
						{{ l.activiteLabel }}
						<span v-if="l.disponibilite === DISPO_ATTENTE" class="ml-1 text-xs text-amber-700">
							(liste d'attente)
						</span>
					</span>
					<span class="font-heading font-semibold text-gray-900">{{ formatPrix(l.prix) }}</span>
				</li>
			</ul>

			<p v-if="busy && !options.length" class="text-sm text-gray-500">Chargement…</p>

			<template v-else>
				<label v-if="plusieursMembres" class="mb-3 block">
					<span class="mb-1 block text-sm font-medium text-gray-700">Pour qui ?</span>
					<select
						v-model.number="membreCourant"
						class="champ"
					>
						<option v-for="m in membres" :key="m.membreId" :value="m.membreId">
							{{ m.label }}
						</option>
					</select>
				</label>

				<div class="space-y-2">
					<label
						v-for="o in options"
						:key="o.id"
						class="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3"
						:class="[
							complet(o)
								? 'cursor-not-allowed opacity-50'
								: 'cursor-pointer hover:border-primary',
							{ 'border-primary bg-primary/5': activiteCourante === o.id },
						]"
					>
						<span class="flex items-center gap-3">
							<input
								type="radio"
								:value="o.id"
								v-model.number="activiteCourante"
								name="activite"
								:disabled="complet(o)"
							/>
							<span class="text-sm text-gray-900">{{ o.label }}</span>
						</span>
						<span class="text-right">
							<span class="block font-heading font-semibold text-gray-900">{{ formatPrix(o.prix) }}</span>
							<span
								class="block text-xs"
								:class="complet(o) ? 'text-red-600' : 'text-gray-400'"
							>{{ placesLabel(o) }}</span>
						</span>
					</label>
				</div>

				<p v-if="dejaInscrit" class="mt-2 text-xs text-amber-700">
					Cette activité est déjà ajoutée pour ce membre.
				</p>
			</template>

			<div class="mt-6 flex flex-wrap items-center gap-3">
				<button
					type="submit"
					class="bouton bouton-accent"
					:disabled="busy || !peutValider"
				>
					{{ busy ? 'Envoi…' : 'Valider mon inscription' }}
				</button>
				<button
					type="button"
					class="bouton bouton-accent-contour"
					:disabled="busy || !selectionCourante"
					@click="ajouter"
				>
					<i class="fa-solid fa-plus text-xs" aria-hidden="true"></i>
					Ajouter une activité
				</button>
				<button
					v-if="!inscriptions.length"
					type="button"
					class="bouton bouton-neutre"
					:disabled="busy"
					@click="emit('passer')"
				>
					Continuer sans activité
				</button>
			</div>
			<p class="mt-3 text-xs text-gray-400">
				Plusieurs activités possibles (une par membre, ou plusieurs pour la même personne).
				Vous pourrez aussi en ajouter plus tard auprès de l'association.
			</p>
		</form>

		<div v-else-if="done" class="mt-3 text-sm text-gray-600">
			<template v-if="inscriptions.length">
				<p v-for="(l, i) in inscriptions" :key="i">
					<span v-if="plusieursMembres">{{ l.membreLabel }} — </span>{{ l.activiteLabel }}
					<span class="text-gray-400">
						— enregistré<span v-if="l.disponibilite === DISPO_ATTENTE"> (liste d'attente)</span>
					</span>
				</p>
			</template>
			<p v-else>Aucune activité pour l'instant <span class="text-gray-400">— enregistré</span></p>
		</div>
	</li>
</template>
