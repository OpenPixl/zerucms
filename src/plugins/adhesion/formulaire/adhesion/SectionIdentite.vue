<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import MembreFields from './MembreFields.vue';
import {
	hasErrors,
	validateContact,
	validateMembre,
	validateRenouvellement,
} from '../../lib/validation';
import type {
	ContactPayload,
	MembreCandidat,
	MembreEtat,
	MembrePayload,
	Mode,
} from '../../../../lib/grist-asso/types';

const props = defineProps<{
	mode: Mode;
	identite: MembrePayload;
	renouv: { nom: string; prenom: string };
	active: boolean;
	done: boolean;
	busy: boolean;
	candidats: MembreCandidat[];
	/** Libellé « Prénom Nom » de la fiche identifiée (canonique côté Grist). */
	membreLabel: string;
	/** Renouvellement : fiche retrouvée, en attente de confirmation des préférences. */
	renouvEtat: MembreEtat | null;
	renouvPrefs: { newsletter: boolean; droitImage: boolean };
}>();

const emit = defineEmits<{
	submit: [];
	choisir: [candidat: MembreCandidat];
	confirmerRenouvellement: [];
	reprendreIdentite: [];
	submitContact: [payload: ContactPayload];
}>();

const inputBase = 'mt-1 champ';
const champ = (err?: string) =>
	`${inputBase} ${err ? 'champ-erreur' : ''}`;

// --- Validation ---
const montreErreurs = ref(false);

const erreursMembre = computed(() => validateMembre(props.identite));
const erreursRenouv = computed(() => validateRenouvellement(props.renouv));

function onSubmit() {
	montreErreurs.value = true;
	const e = props.mode === 'renouvellement' ? erreursRenouv.value : erreursMembre.value;
	if (hasErrors(e)) return;
	emit('submit');
}

// --- Sous-parcours « actualités seules » ---
const contactMode = ref(false);
const contact = reactive<ContactPayload>({ nom: '', prenom: '', email: '' });
const contactConsent = ref(false);
const montreErreursContact = ref(false);
const erreursContact = computed(() => validateContact(contact));

function envoyerContact() {
	montreErreursContact.value = true;
	if (hasErrors(erreursContact.value) || !contactConsent.value) return;
	emit('submitContact', { ...contact });
}
</script>

<template>
	<li
		class="rounded-2xl border bg-surface p-6 shadow-sm transition-opacity"
		:class="active ? 'border-primary' : 'border-gray-100'"
	>
		<div class="flex items-center gap-3">
			<span
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-sm"
				:class="done ? 'bg-primary text-white' : 'bg-primary/10 text-primary'"
			>
				<i v-if="done" class="fa-solid fa-check" aria-hidden="true"></i>
				<span v-else>1</span>
			</span>
			<h2 class="font-heading text-lg text-gray-900">
				{{ mode === 'nouveau' ? 'Vos informations' : 'Vous retrouver' }}
			</h2>
		</div>

		<template v-if="!done">
			<!-- Sous-formulaire : actualités seules -->
			<form v-if="contactMode" class="mt-5" @submit.prevent="envoyerContact" novalidate>
				<p class="text-sm text-gray-600">Recevez nos actualités et informations sans adhérer.</p>
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="champ-libelle">Nom</span>
						<input
							v-model.trim="contact.nom"
							autocomplete="family-name"
							:class="champ(montreErreursContact ? erreursContact.nom : undefined)"
						/>
						<span v-if="montreErreursContact && erreursContact.nom" class="champ-erreur-texte">
							{{ erreursContact.nom }}
						</span>
					</label>
					<label class="block">
						<span class="champ-libelle">Prénom</span>
						<input
							v-model.trim="contact.prenom"
							autocomplete="given-name"
							:class="champ(montreErreursContact ? erreursContact.prenom : undefined)"
						/>
						<span v-if="montreErreursContact && erreursContact.prenom" class="champ-erreur-texte">
							{{ erreursContact.prenom }}
						</span>
					</label>
					<label class="block sm:col-span-2">
						<span class="champ-libelle">Courriel</span>
						<input
							v-model.trim="contact.email"
							type="email"
							autocomplete="email"
							:class="champ(montreErreursContact ? erreursContact.email : undefined)"
						/>
						<span v-if="montreErreursContact && erreursContact.email" class="champ-erreur-texte">
							{{ erreursContact.email }}
						</span>
					</label>
					<label class="flex items-start gap-3 sm:col-span-2">
						<input v-model="contactConsent" type="checkbox" class="mt-1" />
						<span class="text-sm text-gray-600">
							J'accepte de recevoir les actualités et informations de l'association par courriel.
						</span>
					</label>
					<p
						v-if="montreErreursContact && !contactConsent"
						class="text-xs text-red-600 sm:col-span-2"
					>
						Votre consentement est nécessaire.
					</p>
				</div>
				<div class="mt-6 flex items-center gap-4">
					<button
						type="submit"
						class="bouton bouton-accent"
						:disabled="busy"
					>
						{{ busy ? 'Envoi…' : 'Je m’inscris aux actualités' }}
					</button>
					<button type="button" class="text-sm text-gray-500 hover:text-primary" @click="contactMode = false">
						Retour à l'adhésion
					</button>
				</div>
			</form>

			<!-- Formulaire d'identité (adhésion) -->
			<form v-else class="mt-5" @submit.prevent="onSubmit" novalidate>
				<div v-if="mode === 'renouvellement'" class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="champ-libelle">Nom</span>
						<input
							v-model.trim="renouv.nom"
							autocomplete="family-name"
							:class="champ(montreErreurs ? erreursRenouv.nom : undefined)"
						/>
						<span v-if="montreErreurs && erreursRenouv.nom" class="champ-erreur-texte">
							{{ erreursRenouv.nom }}
						</span>
					</label>
					<label class="block">
						<span class="champ-libelle">Prénom</span>
						<input
							v-model.trim="renouv.prenom"
							autocomplete="given-name"
							:class="champ(montreErreurs ? erreursRenouv.prenom : undefined)"
						/>
						<span v-if="montreErreurs && erreursRenouv.prenom" class="champ-erreur-texte">
							{{ erreursRenouv.prenom }}
						</span>
					</label>
				</div>

				<MembreFields
					v-else
					:membre="props.identite"
					:errors="montreErreurs ? erreursMembre : undefined"
				/>

				<!-- Désambiguïsation renouvellement -->
				<div v-if="candidats.length" class="mt-5 rounded-xl bg-amber-50 p-4">
					<p class="text-sm text-amber-800">Plusieurs fiches correspondent. Laquelle est la vôtre ?</p>
					<ul class="mt-3 space-y-2">
						<li v-for="c in candidats" :key="c.membreId">
							<button
								type="button"
								class="w-full rounded-lg border border-amber-200 bg-surface px-4 py-2 text-left text-sm hover:border-primary"
								@click="emit('choisir', c)"
							>
								<span class="font-medium text-gray-900">{{ c.prenom }} {{ c.nom }}</span>
								<span class="text-gray-500"> — {{ c.indice }}</span>
							</button>
						</li>
					</ul>
				</div>

				<!-- Renouvellement : confirmation de la fiche + préférences -->
				<div v-if="renouvEtat" class="mt-5 rounded-xl bg-primary/5 p-4">
					<p class="text-sm text-gray-700">
						Fiche trouvée :
						<span class="font-medium text-gray-900">{{ membreLabel }}</span>.
						<button
							type="button"
							class="ml-1 text-gray-500 underline hover:text-primary"
							@click="emit('reprendreIdentite')"
						>
							Ce n'est pas vous ?
						</button>
					</p>

					<p
						v-if="renouvEtat.adhesionEnCours"
						class="mt-3 flex items-start gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-gray-600"
					>
						<i class="fa-solid fa-circle-check mt-0.5 text-primary" aria-hidden="true"></i>
						<span>
							Votre adhésion pour la saison en cours est déjà enregistrée. Vous pouvez passer
							directement au choix d'une activité.
						</span>
					</p>

					<fieldset class="mt-3 space-y-2">
						<legend class="champ-libelle">Vos préférences</legend>
						<label class="flex items-start gap-3">
							<input v-model="renouvPrefs.newsletter" type="checkbox" class="mt-1" />
							<span class="text-sm text-gray-600">
								J'accepte de recevoir la lettre d'information de l'association.
							</span>
						</label>
						<label class="flex items-start gap-3">
							<input v-model="renouvPrefs.droitImage" type="checkbox" class="mt-1" />
							<span class="text-sm text-gray-600">
								J'autorise l'association à utiliser mon image sur ses supports de communication.
							</span>
						</label>
					</fieldset>

					<button
						type="button"
						class="bouton bouton-accent mt-4"
						:disabled="busy"
						@click="emit('confirmerRenouvellement')"
					>
						{{ busy ? 'Envoi…' : renouvEtat.adhesionEnCours ? 'Choisir une activité' : 'Continuer' }}
					</button>
				</div>

				<button
					v-if="!renouvEtat"
					type="submit"
					class="bouton bouton-accent mt-6"
					:disabled="busy"
				>
					{{ busy ? 'Envoi…' : 'Continuer' }}
				</button>

				<p v-if="mode === 'nouveau'" class="mt-4 text-sm text-gray-500">
					Vous ne souhaitez pas adhérer ?
					<button type="button" class="font-medium text-primary hover:text-secondary" @click="contactMode = true">
						Recevoir seulement nos actualités
					</button>
				</p>
			</form>
		</template>

		<p v-else class="mt-3 text-sm text-gray-600">
			{{ membreLabel }}
			<span class="text-gray-400">— informations enregistrées</span>
		</p>
	</li>
</template>
