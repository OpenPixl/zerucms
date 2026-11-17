<script setup lang="ts">
import { ref } from 'vue';
import type { ExterieurPayload, MembreCandidat, Profil } from '../../../lib/grist-asso/types';

const props = defineProps<{
	adherent: { nom: string; prenom: string };
	exterieur: ExterieurPayload;
	active: boolean;
	done: boolean;
	busy: boolean;
	candidats: MembreCandidat[];
	introuvable: boolean;
	membreLabel: string;
}>();

const emit = defineEmits<{
	submitAdherent: [];
	submitExterieur: [];
	choisir: [candidat: MembreCandidat];
}>();

const profil = defineModel<Profil>('profil', { required: true });

const champ = 'mt-1 champ';

const montreErreurs = ref(false);

function onSubmitAdherent() {
	montreErreurs.value = true;
	if (!props.adherent.nom.trim() || !props.adherent.prenom.trim()) return;
	emit('submitAdherent');
}

const genres: { value: 'Homme' | 'Femme' | 'Autre'; label: string }[] = [
	{ value: 'Homme', label: 'Homme' },
	{ value: 'Femme', label: 'Femme' },
	{ value: 'Autre', label: 'Autre' },
];

function onSubmitExterieur() {
	montreErreurs.value = true;
	const e = props.exterieur;
	if (!e.genre || !e.nom.trim() || !e.prenom.trim() || !e.telephone.trim()) return;
	emit('submitExterieur');
}
</script>

<template>
	<li
		class="rounded-2xl border bg-white p-6 shadow-sm transition-opacity"
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
			<h2 class="font-heading text-lg text-gray-900">Qui êtes-vous ?</h2>
		</div>

		<template v-if="!done">
			<fieldset class="mt-5 border-0 p-0" :disabled="busy">
				<div class="flex flex-col gap-3 sm:flex-row">
					<label
						class="flex flex-1 cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 hover:border-primary"
						:class="{ 'border-primary bg-primary/5': profil === 'adherent' }"
					>
						<input type="radio" value="adherent" v-model="profil" class="mt-1" />
						<span>
							<span class="block font-heading text-gray-900">Je suis adhérent·e</span>
							<span class="block text-sm font-light text-gray-600">
								On retrouve votre fiche avec votre nom et prénom.
							</span>
						</span>
					</label>
					<label
						class="flex flex-1 cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 hover:border-primary"
						:class="{ 'border-primary bg-primary/5': profil === 'exterieur' }"
					>
						<input type="radio" value="exterieur" v-model="profil" class="mt-1" />
						<span>
							<span class="block font-heading text-gray-900">Je suis extérieur·e à l'association</span>
							<span class="block text-sm font-light text-gray-600">
								Nom, prénom et téléphone, pour vous recontacter au sujet de l'activité.
							</span>
						</span>
					</label>
				</div>
			</fieldset>

			<!-- Profil adhérent : recherche par nom + prénom -->
			<form v-if="profil === 'adherent'" class="mt-5" @submit.prevent="onSubmitAdherent" novalidate>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="champ-libelle">Nom</span>
						<input v-model.trim="adherent.nom" autocomplete="family-name" :class="champ" />
						<span v-if="montreErreurs && !adherent.nom.trim()" class="champ-erreur-texte">
							Le nom est obligatoire.
						</span>
					</label>
					<label class="block">
						<span class="champ-libelle">Prénom</span>
						<input v-model.trim="adherent.prenom" autocomplete="given-name" :class="champ" />
						<span v-if="montreErreurs && !adherent.prenom.trim()" class="champ-erreur-texte">
							Le prénom est obligatoire.
						</span>
					</label>
				</div>

				<p v-if="introuvable" class="mt-3 message-erreur">
					Aucune fiche trouvée à ce nom. Vérifiez l'orthographe, ou choisissez « Je suis extérieur·e »
					ci-dessus.
				</p>

				<div v-if="candidats.length" class="mt-4 rounded-xl bg-amber-50 p-4">
					<p class="text-sm text-amber-800">Plusieurs fiches correspondent. Laquelle est la vôtre ?</p>
					<ul class="mt-3 space-y-2">
						<li v-for="c in candidats" :key="c.membreId">
							<button
								type="button"
								class="w-full rounded-lg border border-amber-200 bg-white px-4 py-2 text-left text-sm hover:border-primary"
								@click="emit('choisir', c)"
							>
								<span class="font-medium text-gray-900">{{ c.prenom }} {{ c.nom }}</span>
								<span class="text-gray-500"> — {{ c.indice }}</span>
							</button>
						</li>
					</ul>
				</div>

				<button
					v-else
					type="submit"
					class="bouton bouton-accent mt-5"
					:disabled="busy"
				>
					{{ busy ? 'Recherche…' : 'Continuer' }}
				</button>
			</form>

			<!-- Profil extérieur : identité minimale + téléphone -->
			<form v-else-if="profil === 'exterieur'" class="mt-5" @submit.prevent="onSubmitExterieur" novalidate>
				<fieldset class="mb-4">
					<legend class="champ-libelle">Genre</legend>
					<div class="mt-2 flex flex-wrap gap-2">
						<label
							v-for="g in genres"
							:key="g.value"
							class="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-primary"
							:class="exterieur.genre === g.value ? 'border-primary bg-primary/5' : 'border-gray-200'"
						>
							<input type="radio" name="genre-exterieur" :value="g.value" v-model="exterieur.genre" />
							<span>{{ g.label }}</span>
						</label>
					</div>
					<p v-if="montreErreurs && !exterieur.genre" class="champ-erreur-texte">
						Sélectionnez un genre.
					</p>
				</fieldset>

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="champ-libelle">Nom</span>
						<input v-model.trim="exterieur.nom" autocomplete="family-name" :class="champ" />
						<span v-if="montreErreurs && !exterieur.nom.trim()" class="champ-erreur-texte">
							Le nom est obligatoire.
						</span>
					</label>
					<label class="block">
						<span class="champ-libelle">Prénom</span>
						<input v-model.trim="exterieur.prenom" autocomplete="given-name" :class="champ" />
						<span v-if="montreErreurs && !exterieur.prenom.trim()" class="champ-erreur-texte">
							Le prénom est obligatoire.
						</span>
					</label>
					<label class="block sm:col-span-2">
						<span class="champ-libelle">Téléphone</span>
						<input
							v-model.trim="exterieur.telephone"
							type="tel"
							autocomplete="tel"
							placeholder="06 12 34 56 78"
							:class="champ"
						/>
						<span v-if="montreErreurs && !exterieur.telephone.trim()" class="champ-erreur-texte">
							Le téléphone est obligatoire, pour vous recontacter au sujet de l'activité.
						</span>
					</label>
				</div>

				<button
					type="submit"
					class="bouton bouton-accent mt-5"
					:disabled="busy"
				>
					{{ busy ? 'Envoi…' : 'Continuer' }}
				</button>
			</form>
		</template>

		<p v-else class="mt-3 text-sm text-gray-600">
			{{ membreLabel }}
			<span class="text-gray-400">— {{ profil === 'exterieur' ? "extérieur·e" : 'adhérent·e' }}</span>
		</p>
	</li>
</template>
