<script setup lang="ts">
/**
 * Onglet « Généralités » du module « Association » : nom, présentation,
 * coordonnées, réseaux sociaux et mentions légales, tels qu'ils sont dans
 * les sources (`src/content/association.yaml`, modifié en place par
 * `association-writer.ts`). Utilisés partout sur le site (en-tête, pied de
 * page, contact, variables `{{association.…}}` des pages).
 */
import { computed, inject, ref, watch } from 'vue';
import type { Association } from '../../../../lib/association';
import { SOCIAL_NETWORKS } from '../../../../lib/association';
import { ApiError, associationApi, type SaveResult } from '../../client';
import { isDeferredSubmit } from '../../lot';
import PublishButtons from '../../PublishButtons.vue';
import { ADMIN_CONTEXT, inputClass, rememberOpenModule, takeModuleToReopen } from '../../context';
import { site } from '../../../../config/site';
import { vocabulaire } from '../../../../lib/structure';

/** Association ou entreprise (auto-entrepreneur) : libellés et mentions légales. */
const entreprise = site.structure === 'entreprise';
const voc = vocabulaire(site.structure);

const props = defineProps<{ source: Association; locked: boolean }>();
const emit = defineEmits<{ published: [label: string, result: SaveResult]; dirty: [value: boolean] }>();
const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const copy = (a: Association): Association => ({
	...a,
	address: { ...a.address },
	social: Object.fromEntries(SOCIAL_NETWORKS.map(({ key }) => [key, a.social[key] ?? ''])),
	legal: { ...a.legal, hosting: { ...a.legal.hosting } },
});

/** Valeurs des sources (référence) et formulaire en cours de saisie. */
const saved = ref(copy(props.source));
const form = ref(copy(props.source));
const busy = ref(false);
const error = ref('');

const changed = computed(() => JSON.stringify(form.value) !== JSON.stringify(saved.value));
watch(changed, (value) => emit('dirty', value), { immediate: true });

async function submit(event: Event) {
	if (!changed.value) return void (error.value = 'Aucune modification à enregistrer.');
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule('association');
		const result = await associationApi.update(form.value, { deferred: isDeferredSubmit(event) });
		saved.value = copy(form.value);
		emit('published', "Informations de l'association", result);
	} catch (e) {
		takeModuleToReopen(); // l'enregistrement a échoué : pas de réouverture au prochain chargement
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		busy.value = false;
	}
}

function reset() {
	form.value = copy(saved.value);
	error.value = '';
}

/** En-tête des sections, comme les listes du module « Pages ». */
const headerClass = 'flex flex-wrap items-center gap-2 rounded-t-xl border-b border-gray-100 bg-gray-100 px-4 py-2.5';
/** Champ sur la même ligne que son libellé (réseaux sociaux). */
const inlineInputClass = inputClass.replace('mt-1 ', '');
</script>

<template>
	<form class="space-y-6" @submit.prevent="submit">
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>
		<p class="text-sm font-light text-gray-600">
			Ces informations sont affichées sur tout le site : en-tête, pied de page, page Contact, mentions légales, aperçus de
			partage… et dans le texte des pages grâce aux variables <code class="text-gray-900" v-text="'{{association.nom}}'"></code>,
			etc.
		</p>

		<!-- Modifications en attente : enregistrées en une seule publication -->
		<div
			v-if="changed"
			class="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200"
			role="status"
		>
			<i class="fa-solid fa-pen" aria-hidden="true"></i>
			<span class="min-w-0 flex-1">Modifications pas encore enregistrées.</span>
			<PublishButtons compact :busy="busy" :disabled="props.locked" />
			<button type="button" class="text-xs font-medium text-gray-700 hover:underline" @click="reset">Annuler</button>
		</div>

		<!-- 1. Identité -->
		<section class="overflow-hidden rounded-xl border border-gray-200">
			<header :class="headerClass">
				<i class="fa-solid fa-landmark text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Identité</span>
				<span class="text-xs text-gray-500">en-tête, accueil, moteurs de recherche</span>
			</header>
			<div class="space-y-4 p-4">
				<div>
					<label for="asso-name" class="champ-libelle">Nom {{ voc.de }}</label>
					<input id="asso-name" v-model="form.name" type="text" required maxlength="80" :class="inputClass" />
				</div>
				<div>
					<label for="asso-description" class="champ-libelle">Présentation</label>
					<textarea id="asso-description" v-model="form.description" rows="3" required maxlength="300" :class="inputClass"></textarea>
					<p class="champ-aide">Une phrase : page d'accueil et résultats des moteurs de recherche ({{ form.description.length }}/300).</p>
				</div>
			</div>
		</section>

		<!-- 2. Coordonnées et adresse -->
		<section class="overflow-hidden rounded-xl border border-gray-200">
			<header :class="headerClass">
				<i class="fa-solid fa-address-card text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Coordonnées</span>
				<span class="text-xs text-gray-500">pied de page, page Contact</span>
			</header>
			<div class="grid gap-4 p-4 sm:grid-cols-2">
				<div>
					<label for="asso-email" class="champ-libelle">Email de contact</label>
					<input id="asso-email" v-model="form.email" type="email" required :class="inputClass" />
				</div>
				<div>
					<label for="asso-phone" class="champ-libelle">Téléphone</label>
					<input id="asso-phone" v-model="form.phone" type="tel" required :class="inputClass" />
				</div>
				<div class="sm:col-span-2">
					<label for="asso-street" class="champ-libelle">{{ entreprise ? 'Adresse' : 'Adresse du siège' }}</label>
					<textarea id="asso-street" v-model="form.address.street" rows="3" required placeholder="N° et rue&#10;Complément (bâtiment, étage…)" :class="inputClass"></textarea>
					<p class="champ-aide">Jusqu'à 3 lignes, sans le code postal ni la ville : chaque retour à la ligne est gardé à l'affichage.</p>
				</div>
				<div>
					<label for="asso-postal" class="champ-libelle">Code postal</label>
					<input id="asso-postal" v-model="form.address.postalCode" type="text" required inputmode="numeric" :class="inputClass" />
				</div>
				<div>
					<label for="asso-city" class="champ-libelle">Ville</label>
					<input id="asso-city" v-model="form.address.city" type="text" required :class="inputClass" />
				</div>
			</div>
		</section>

		<!-- 3. Réseaux sociaux -->
		<section class="overflow-hidden rounded-xl border border-gray-200">
			<header :class="headerClass">
				<i class="fa-solid fa-share-nodes text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Réseaux sociaux</span>
				<span class="text-xs text-gray-500">icônes du pied de page ; vide = masqué</span>
			</header>
			<ul class="divide-y divide-gray-100">
				<li v-for="network in SOCIAL_NETWORKS" :key="network.key" class="flex items-center gap-3 px-4 py-2.5">
					<i :class="[network.icon, 'fa-fw shrink-0 text-lg', form.social[network.key] ? 'text-primary' : 'text-gray-300']" aria-hidden="true"></i>
					<label :for="`asso-social-${network.key}`" class="w-24 shrink-0 text-sm font-medium text-gray-700 sm:w-28">{{ network.label }}</label>
					<input
						:id="`asso-social-${network.key}`"
						v-model="form.social[network.key]"
						type="url"
						placeholder="https://…"
						:class="inlineInputClass"
					/>
				</li>
			</ul>
		</section>

		<!-- 4. Mentions légales -->
		<section class="overflow-hidden rounded-xl border border-gray-200">
			<header :class="headerClass">
				<i class="fa-solid fa-scale-balanced text-gray-400" aria-hidden="true"></i>
				<span class="font-heading font-semibold text-gray-900">Mentions légales</span>
				<span class="text-xs text-gray-500">facultatives ; vide = « [À compléter] » dans les pages</span>
			</header>
			<div class="grid gap-4 p-4 sm:grid-cols-2">
				<div v-if="!entreprise">
					<label for="asso-rna" class="champ-libelle">Numéro RNA</label>
					<input id="asso-rna" v-model="form.legal.registrationNumber" type="text" placeholder="W…" :class="inputClass" />
				</div>
				<div>
					<label for="asso-siret" class="champ-libelle">Numéro SIRET</label>
					<input id="asso-siret" v-model="form.legal.siretNumber" type="text" inputmode="numeric" :class="inputClass" />
				</div>
				<div class="sm:col-span-2">
					<label for="asso-president" class="champ-libelle">{{ voc.responsable }}</label>
					<input id="asso-president" v-model="form.legal.president" type="text" :class="inputClass" />
				</div>
				<div>
					<label for="asso-manager" class="champ-libelle">Responsable de la publication</label>
					<input id="asso-manager" v-model="form.legal.publicationManager" type="text" :placeholder="form.legal.president" :class="inputClass" />
					<p class="champ-aide">{{ entreprise ? "L'entrepreneur·e (repris si vide)." : 'Souvent le·la président·e (repris si vide).' }}</p>
				</div>
				<div v-if="!entreprise">
					<label for="asso-role" class="champ-libelle">Sa fonction dans l'association</label>
					<input id="asso-role" v-model="form.legal.publicationManagerRole" type="text" placeholder="Président·e" :class="inputClass" />
				</div>
			</div>
			<fieldset class="mx-4 mb-4 space-y-3 rounded-xl bg-gray-100 p-4">
				<legend class="float-left mb-1 font-heading text-sm font-semibold text-gray-900">Hébergeur du site</legend>
				<div class="clear-left">
					<label for="asso-host-name" class="champ-libelle">Nom</label>
					<input id="asso-host-name" v-model="form.legal.hosting.name" type="text" :class="inputClass" />
				</div>
				<div>
					<label for="asso-host-address" class="champ-libelle">Adresse</label>
					<input id="asso-host-address" v-model="form.legal.hosting.address" type="text" :class="inputClass" />
				</div>
				<div>
					<label for="asso-host-phone" class="champ-libelle">Téléphone</label>
					<input id="asso-host-phone" v-model="form.legal.hosting.phone" type="tel" :class="inputClass" />
				</div>
			</fieldset>
		</section>

		<div class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<PublishButtons :busy="busy" :disabled="props.locked" />
			<button v-if="changed" type="button" class="text-sm text-gray-600 hover:underline" @click="reset">Annuler les modifications</button>
		</div>
	</form>
</template>
