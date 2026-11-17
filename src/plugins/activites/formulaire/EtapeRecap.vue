<script setup lang="ts">
import { DISPO_ATTENTE } from '../../../lib/grist-asso/choices';
import { formatPrix } from '../../../lib/grist-asso/format';

defineProps<{
	membreLabel: string;
	exterieur: boolean;
	activiteLabel: string;
	prix: number | null;
	disponibilite: string;
	/** Préinscription (atelier non publié) : aucune inscription créée, intérêt noté. */
	preinscription: boolean;
}>();

const emit = defineEmits<{ recommencer: [] }>();
</script>

<template>
	<li class="rounded-2xl border border-primary bg-primary/5 p-6">
		<div class="flex items-center gap-3">
			<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
				<i class="fa-solid fa-check" aria-hidden="true"></i>
			</span>
			<h2 class="font-heading text-lg text-gray-900">
				{{ preinscription ? 'Préinscription enregistrée' : 'Inscription enregistrée' }}
			</h2>
		</div>

		<p v-if="preinscription" class="mt-4 text-sm text-gray-700">
			Merci <span class="font-medium">{{ membreLabel }}</span>, nous avons bien noté votre intérêt
			pour <span class="font-medium">« {{ activiteLabel }} »</span>. Nous vous recontactons
			dès l'ouverture des inscriptions.
		</p>

		<template v-else>
		<p class="mt-4 text-sm text-gray-700">
			Merci <span class="font-medium">{{ membreLabel }}</span>, votre inscription est bien
			enregistrée{{ disponibilite === DISPO_ATTENTE ? ", en liste d'attente" : '' }}.
		</p>

		<dl class="mt-4 divide-y divide-primary/15 rounded-xl bg-white text-sm">
			<div class="flex justify-between gap-4 px-4 py-2">
				<dt class="text-gray-600">Activité</dt>
				<dd class="text-right text-gray-900">
					{{ activiteLabel }}
					<span v-if="disponibilite === DISPO_ATTENTE" class="block text-xs text-amber-700">
						Liste d'attente — nous vous recontactons dès qu'une place se libère.
					</span>
				</dd>
			</div>
			<div v-if="prix !== null" class="flex justify-between px-4 py-3">
				<dt class="font-heading font-semibold text-gray-900">Tarif</dt>
				<dd class="font-heading font-semibold text-gray-900">{{ formatPrix(prix) }}</dd>
			</div>
		</dl>

		<p v-if="prix" class="mt-4 text-sm text-gray-700">
			Règlement à effectuer sur place, lors de la première séance.
		</p>
		</template>

		<p v-if="exterieur" class="mt-4 text-xs text-gray-500">
			Les informations que vous avez transmises (nom, prénom, téléphone) ne sont utilisées que
			pour organiser votre participation à cette activité — elles ne sont ni conservées à
			d'autres fins, ni transmises à des tiers.
		</p>

		<button
			type="button"
			class="mt-6 text-sm font-medium text-primary hover:text-secondary"
			@click="emit('recommencer')"
		>
			Faire une autre inscription
		</button>
	</li>
</template>
