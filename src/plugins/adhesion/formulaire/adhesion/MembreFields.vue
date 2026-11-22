<script setup lang="ts">
import { ref } from 'vue';
import { adhesionApi } from './client';
import type { AdresseSuggestion, MembrePayload } from '../../../../lib/grist-asso/types';
import type { Errors } from '../../lib/validation';

const props = defineProps<{
	membre: MembrePayload;
	errors?: Errors<MembrePayload>;
	/** Masque les cases newsletter / droit à l'image (adhésion liée : réglage porté par le·la responsable). */
	hidePreferences?: boolean;
}>();

const genres: { value: string; label: string }[] = [
	{ value: 'Homme', label: 'Homme' },
	{ value: 'Femme', label: 'Femme' },
	{ value: 'Autre', label: 'Autre' },
	{ value: 'Association', label: 'Association' },
];

const base = 'mt-1 champ';

function cls(field: keyof MembrePayload): string {
	return `${base} ${props.errors?.[field] ? 'champ-erreur' : ''}`;
}

// --- Autocomplétion d'adresse (API Adresse / BAN) ---
const suggestions = ref<AdresseSuggestion[]>([]);
const ouvert = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

function onAdresseInput() {
	clearTimeout(timer);
	const q = props.membre.adresse;
	if (q.trim().length < 3) {
		suggestions.value = [];
		ouvert.value = false;
		return;
	}
	timer = setTimeout(async () => {
		try {
			suggestions.value = await adhesionApi.chercherAdresse(q);
			ouvert.value = suggestions.value.length > 0;
		} catch {
			suggestions.value = [];
			ouvert.value = false;
		}
	}, 300);
}

function choisir(s: AdresseSuggestion) {
	props.membre.adresse = s.adresse;
	props.membre.codePostal = s.codePostal;
	props.membre.commune = s.commune;
	ouvert.value = false;
	suggestions.value = [];
}
</script>

<template>
	<div class="grid gap-4 sm:grid-cols-2">
		<fieldset class="sm:col-span-2">
			<legend class="champ-libelle">Genre</legend>
			<div class="mt-2 flex flex-wrap gap-2">
				<label
					v-for="g in genres"
					:key="g.value"
					class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-primary"
					:class="[
						membre.genre === g.value ? 'border-primary bg-primary/5' : 'border-gray-200',
						errors?.genre ? 'border-red-400' : '',
					]"
				>
					<input type="radio" name="genre" :value="g.value" v-model="membre.genre" />
					<span>{{ g.label }}</span>
				</label>
			</div>
			<p v-if="errors?.genre" class="champ-erreur-texte">{{ errors.genre }}</p>
		</fieldset>

		<label class="block">
			<span class="champ-libelle">Nom</span>
			<input v-model.trim="membre.nom" autocomplete="family-name" :class="cls('nom')" />
			<span v-if="errors?.nom" class="champ-erreur-texte">{{ errors.nom }}</span>
		</label>
		<label class="block">
			<span class="champ-libelle">Prénom</span>
			<input v-model.trim="membre.prenom" autocomplete="given-name" :class="cls('prenom')" />
			<span v-if="errors?.prenom" class="champ-erreur-texte">{{ errors.prenom }}</span>
		</label>
		<label v-if="membre.genre !== 'Association'" class="block">
			<span class="champ-libelle">Date de naissance</span>
			<input v-model="membre.dateNaissance" type="date" autocomplete="bday" :class="cls('dateNaissance')" />
			<span v-if="errors?.dateNaissance" class="champ-erreur-texte">{{ errors.dateNaissance }}</span>
		</label>
		<label class="block">
			<span class="champ-libelle">Courriel</span>
			<input v-model.trim="membre.email" type="email" autocomplete="email" :class="cls('email')" />
			<span v-if="errors?.email" class="champ-erreur-texte">{{ errors.email }}</span>
		</label>

		<div class="relative block sm:col-span-2">
			<span class="champ-libelle">Adresse</span>
			<input
				v-model.trim="membre.adresse"
				autocomplete="off"
				placeholder="Commencez à taper, puis choisissez dans la liste…"
				:class="cls('adresse')"
				@input="onAdresseInput"
				@focus="ouvert = suggestions.length > 0"
				@blur="ouvert = false"
			/>
			<ul
				v-if="ouvert"
				class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-surface shadow-lg"
			>
				<li v-for="s in suggestions" :key="s.label">
					<button
						type="button"
						class="block w-full px-3 py-2 text-left text-sm hover:bg-primary/5"
						@mousedown.prevent="choisir(s)"
					>
						{{ s.label }}
					</button>
				</li>
			</ul>
			<span v-if="errors?.adresse" class="champ-erreur-texte">{{ errors.adresse }}</span>
		</div>

		<label class="block">
			<span class="champ-libelle">Code postal</span>
			<input
				v-model.trim="membre.codePostal"
				inputmode="numeric"
				autocomplete="postal-code"
				:class="cls('codePostal')"
			/>
			<span v-if="errors?.codePostal" class="champ-erreur-texte">{{ errors.codePostal }}</span>
		</label>
		<label class="block">
			<span class="champ-libelle">Commune</span>
			<input v-model.trim="membre.commune" autocomplete="address-level2" :class="cls('commune')" />
			<span v-if="errors?.commune" class="champ-erreur-texte">{{ errors.commune }}</span>
		</label>
		<label class="block">
			<span class="champ-libelle">Téléphone fixe</span>
			<input v-model.trim="membre.telFixe" type="tel" autocomplete="tel" :class="cls('telFixe')" />
			<span v-if="errors?.telFixe" class="champ-erreur-texte">{{ errors.telFixe }}</span>
		</label>
		<label class="block">
			<span class="champ-libelle">Téléphone mobile</span>
			<input v-model.trim="membre.telMobile" type="tel" autocomplete="tel" :class="cls('telMobile')" />
			<span v-if="errors?.telMobile" class="champ-erreur-texte">{{ errors.telMobile }}</span>
		</label>

		<template v-if="!hidePreferences">
			<label class="flex items-start gap-3 sm:col-span-2">
				<input v-model="membre.newsletter" type="checkbox" class="mt-1" />
				<span class="text-sm text-gray-600">
					J'accepte de recevoir la lettre d'information de l'association.
				</span>
			</label>
			<label class="flex items-start gap-3 sm:col-span-2">
				<input v-model="membre.droitImage" type="checkbox" class="mt-1" />
				<span class="text-sm text-gray-600">
					J'autorise l'association à utiliser mon image sur ses supports de communication.
				</span>
			</label>
		</template>
		<p class="text-xs text-gray-400 sm:col-span-2">Au moins un numéro de téléphone est requis.</p>
	</div>
</template>
