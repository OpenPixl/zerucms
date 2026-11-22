<script setup lang="ts">
/** Fiche client (création ou modification) : enregistrée dans la table Grist `Clients`. */
import { ref } from 'vue';
import { ApiError } from '../../../components/admin/client';
import { inputClass } from '../../../components/admin/context';
import type { Client, ClientSaisie } from '../lib/types';
import { facturationApi } from './client';

const props = defineProps<{ client: Client | null }>();
const emit = defineEmits<{ saved: [id: number]; cancel: [] }>();

const vide: ClientSaisie = { nom: '', societe: '', email: '', telephone: '', adresse: '', codePostal: '', ville: '', siret: '', notes: '' };
const { id: _id, ...depart } = props.client ?? { id: 0, ...vide };
const form = ref<ClientSaisie>({ ...depart });
const busy = ref(false);
const error = ref('');

async function enregistrer() {
	error.value = '';
	busy.value = true;
	try {
		const { id } = await facturationApi.client(props.client?.id ?? null, form.value);
		emit('saved', id);
	} catch (e) {
		error.value = e instanceof ApiError ? e.message : (e as Error).message;
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<form class="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4" @submit.prevent="enregistrer">
		<p class="font-heading font-semibold text-gray-900">{{ client ? 'Modifier le client' : 'Nouveau client' }}</p>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label for="fc-nom" class="champ-libelle">Nom</label>
				<input id="fc-nom" v-model="form.nom" type="text" required :class="inputClass" />
			</div>
			<div>
				<label for="fc-societe" class="champ-libelle">Société <span class="font-light text-gray-500">(facultatif)</span></label>
				<input id="fc-societe" v-model="form.societe" type="text" :class="inputClass" />
			</div>
			<div>
				<label for="fc-email" class="champ-libelle">Email</label>
				<input id="fc-email" v-model="form.email" type="email" :class="inputClass" />
			</div>
			<div>
				<label for="fc-tel" class="champ-libelle">Téléphone</label>
				<input id="fc-tel" v-model="form.telephone" type="tel" :class="inputClass" />
			</div>
			<div class="sm:col-span-2">
				<label for="fc-adresse" class="champ-libelle">Adresse</label>
				<input id="fc-adresse" v-model="form.adresse" type="text" :class="inputClass" />
			</div>
			<div>
				<label for="fc-cp" class="champ-libelle">Code postal</label>
				<input id="fc-cp" v-model="form.codePostal" type="text" inputmode="numeric" :class="inputClass" />
			</div>
			<div>
				<label for="fc-ville" class="champ-libelle">Ville</label>
				<input id="fc-ville" v-model="form.ville" type="text" :class="inputClass" />
			</div>
			<div class="sm:col-span-2">
				<label for="fc-siret" class="champ-libelle">SIREN / SIRET <span class="font-light text-gray-500">(client professionnel)</span></label>
				<input id="fc-siret" v-model="form.siret" type="text" inputmode="numeric" :class="inputClass" />
			</div>
			<div class="sm:col-span-2">
				<label for="fc-notes" class="champ-libelle">Notes internes</label>
				<textarea id="fc-notes" v-model="form.notes" rows="6" :class="inputClass"></textarea>
			</div>
		</div>
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>
		<div class="flex flex-wrap gap-3">
			<button type="submit" class="bouton bouton-primaire" :disabled="busy">Enregistrer le client</button>
			<button type="button" class="text-sm text-gray-700 hover:underline" @click="emit('cancel')">Annuler</button>
		</div>
	</form>
</template>
