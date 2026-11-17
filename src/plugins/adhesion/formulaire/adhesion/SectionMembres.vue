<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import MembreFields from './MembreFields.vue';
import { hasErrors, validateMembre } from '../../lib/validation';
import type { Genre, MembrePayload, MembreRecherche } from '../../../../lib/grist-asso/types';

defineProps<{
	groupe: { membreId: number; label: string }[];
	resultats: MembreRecherche[];
	active: boolean;
	done: boolean;
	busy: boolean;
}>();

const emit = defineEmits<{
	ajouter: [payload: MembrePayload];
	rattacher: [membreId: number];
	retirer: [membreId: number];
	rechercher: [q: string];
	continuer: [];
}>();

const emptyMembre = (): MembrePayload => ({
	genre: '' as Genre,
	nom: '',
	prenom: '',
	dateNaissance: '',
	email: '',
	adresse: '',
	codePostal: '',
	commune: '',
	telFixe: '',
	telMobile: '',
	newsletter: false,
	droitImage: false,
});

type Panneau = 'aucun' | 'nouveau' | 'existant';
const panneau = ref<Panneau>('aucun');
const coMembre = reactive<MembrePayload>(emptyMembre());
const recherche = ref('');
const montreErreurs = ref(false);
const erreurs = computed(() => validateMembre(coMembre));
let timer: ReturnType<typeof setTimeout> | undefined;

function onRecherche() {
	clearTimeout(timer);
	const q = recherche.value;
	timer = setTimeout(() => emit('rechercher', q), 300);
}

function valider() {
	montreErreurs.value = true;
	if (hasErrors(erreurs.value)) return;
	emit('ajouter', { ...coMembre });
}

function reset() {
	Object.assign(coMembre, emptyMembre());
	recherche.value = '';
	montreErreurs.value = false;
	panneau.value = 'aucun';
}
defineExpose({ reset });
</script>

<template>
	<li class="rounded-2xl border bg-white p-6 shadow-sm" :class="active ? 'border-primary' : 'border-gray-100'">
		<div class="flex items-center gap-3">
			<span
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-sm"
				:class="done ? 'bg-primary text-white' : 'bg-primary/10 text-primary'"
			>
				<i v-if="done" class="fa-solid fa-check" aria-hidden="true"></i>
				<i v-else class="fa-solid fa-user-group" aria-hidden="true"></i>
			</span>
			<h2 class="font-heading text-lg text-gray-900">Membres de l'adhésion</h2>
		</div>

		<ul class="mt-4 space-y-2 text-sm">
			<li
				v-for="(m, i) in groupe"
				:key="m.membreId"
				class="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2"
			>
				<i class="fa-solid fa-user text-gray-400" aria-hidden="true"></i>
				<span class="text-gray-900">{{ m.label }}</span>
				<span v-if="i === 0" class="text-xs text-gray-400">— responsable</span>
				<button
					v-else-if="active"
					type="button"
					class="ml-auto text-gray-400 hover:text-red-600 disabled:opacity-50"
					:disabled="busy"
					:aria-label="`Retirer ${m.label}`"
					@click="emit('retirer', m.membreId)"
				>
					<i class="fa-solid fa-trash-can" aria-hidden="true"></i>
				</button>
			</li>
		</ul>

		<template v-if="active">
			<!-- Nouveau membre -->
			<form v-if="panneau === 'nouveau'" class="mt-5 border-t border-gray-100 pt-5" @submit.prevent="valider" novalidate>
				<p class="mb-1 text-sm font-medium text-gray-700">Nouveau membre à rattacher</p>
				<p class="mb-3 text-xs text-gray-400">
					La lettre d'information et le droit à l'image suivent le choix du·de la responsable
					de l'adhésion.
				</p>
				<MembreFields
					:membre="coMembre"
					:errors="montreErreurs ? erreurs : undefined"
					hide-preferences
				/>
				<div class="mt-6 flex items-center gap-4">
					<button
						type="submit"
						class="bouton bouton-accent"
						:disabled="busy"
					>
						{{ busy ? 'Envoi…' : 'Ajouter ce membre' }}
					</button>
					<button type="button" class="text-sm text-gray-500 hover:text-primary" @click="panneau = 'aucun'">
						Annuler
					</button>
				</div>
			</form>

			<!-- Membre existant -->
			<div v-else-if="panneau === 'existant'" class="mt-5 border-t border-gray-100 pt-5">
				<label class="champ-libelle">
					Rechercher un membre existant
					<input
						v-model.trim="recherche"
						type="search"
						placeholder="Nom ou prénom…"
						class="mt-1 champ"
						@input="onRecherche"
					/>
				</label>
				<ul v-if="resultats.length" class="mt-3 space-y-2">
					<li v-for="r in resultats" :key="r.membreId">
						<button
							type="button"
							class="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-left text-sm hover:border-primary disabled:opacity-50"
							:disabled="busy || groupe.some((g) => g.membreId === r.membreId)"
							@click="emit('rattacher', r.membreId)"
						>
							<span class="font-medium text-gray-900">{{ r.prenom }} {{ r.nom }}</span>
							<span v-if="r.indice" class="text-gray-500"> — {{ r.indice }}</span>
							<span v-if="groupe.some((g) => g.membreId === r.membreId)" class="text-gray-400"> (déjà dans le groupe)</span>
						</button>
					</li>
				</ul>
				<p v-else-if="recherche.length >= 2" class="mt-3 text-sm text-gray-500">Aucun membre trouvé.</p>
				<button type="button" class="mt-4 text-sm text-gray-500 hover:text-primary" @click="panneau = 'aucun'">
					Fermer la recherche
				</button>
			</div>

			<!-- Actions -->
			<div v-else class="mt-5 flex flex-wrap items-center gap-3">
				<button
					type="button"
					class="bouton bouton-contour"
					:disabled="busy"
					@click="panneau = 'nouveau'"
				>
					+ Nouveau membre
				</button>
				<button
					type="button"
					class="bouton bouton-contour"
					:disabled="busy"
					@click="panneau = 'existant'"
				>
					Rattacher un membre existant
				</button>
				<button
					type="button"
					class="bouton bouton-accent"
					:disabled="busy || groupe.length < 2"
					@click="emit('continuer')"
				>
					Continuer
				</button>
				<span v-if="groupe.length < 2" class="text-xs text-gray-400">
					Cette cotisation requiert au moins deux membres.
				</span>
			</div>
		</template>

		<p v-else-if="done" class="mt-3 text-sm text-gray-600">{{ groupe.length }} membres — enregistrés</p>
	</li>
</template>
