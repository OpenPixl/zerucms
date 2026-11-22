<script setup lang="ts">
import { computed } from 'vue';
import { DISPO_ATTENTE } from '../../../../lib/grist-asso/choices';
import type { CotisationOption, InscriptionLigne } from '../../../../lib/grist-asso/types';
import { formatPrix } from '../../../../lib/grist-asso/format';

const props = defineProps<{
	membreLabel: string;
	cotisation: CotisationOption | null;
	/** Renouvellement d'un membre déjà à jour : pas de nouvelle cotisation, activité seule. */
	adhesionDejaAJour?: boolean;
	inscriptions: InscriptionLigne[];
	montantTotal: number | null;
	/** Lien vers le bulletin d'adhésion PDF ; `null` si la génération n'est pas configurée. */
	bulletinHref?: string | null;
	/** Partenaires où régler sa cotisation (`src/content/partenaires.yaml`). */
	relaisAdhesion?: string[];
}>();

const plusieursMembres = computed(
	() => new Set(props.inscriptions.map((l) => l.membreId)).size > 1,
);

const emit = defineEmits<{ recommencer: [] }>();
</script>

<template>
	<li class="rounded-2xl border border-primary bg-primary/5 p-6">
		<div class="flex items-center gap-3">
			<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
				<i class="fa-solid fa-check" aria-hidden="true"></i>
			</span>
			<h2 class="font-heading text-lg text-gray-900">
				{{ adhesionDejaAJour ? 'Inscription enregistrée' : 'Adhésion enregistrée' }}
			</h2>
		</div>

		<p class="mt-4 text-sm text-gray-700">
			Merci <span class="font-medium">{{ membreLabel }}</span>,
			{{ adhesionDejaAJour ? 'votre inscription est bien enregistrée.' : "votre demande d'adhésion est bien enregistrée." }}
		</p>

		<dl class="mt-4 divide-y divide-primary/15 rounded-xl bg-surface text-sm">
			<div class="flex justify-between px-4 py-2">
				<dt class="text-gray-600">Cotisation</dt>
				<dd class="text-gray-900">
					<template v-if="adhesionDejaAJour">Déjà à jour pour la saison</template>
					<template v-else>{{ cotisation?.label }} — {{ formatPrix(cotisation?.prix ?? null) }}</template>
				</dd>
			</div>
			<div class="flex justify-between gap-4 px-4 py-2">
				<dt class="text-gray-600">{{ inscriptions.length > 1 ? 'Activités' : 'Activité' }}</dt>
				<dd class="text-right text-gray-900">
					<template v-if="inscriptions.length">
						<span v-for="(l, i) in inscriptions" :key="i" class="block">
							<span v-if="plusieursMembres" class="text-gray-600">{{ l.membreLabel }} — </span>
							{{ l.activiteLabel }} — {{ formatPrix(l.prix) }}
							<span v-if="l.disponibilite === DISPO_ATTENTE" class="text-xs text-amber-700">
								(liste d'attente)
							</span>
						</span>
					</template>
					<template v-else>
						<span class="text-gray-500">Aucune pour l'instant</span>
						<span class="block text-xs text-gray-400">À choisir plus tard auprès de l'association.</span>
					</template>
				</dd>
			</div>
			<div v-if="montantTotal !== null" class="flex justify-between px-4 py-3">
				<dt class="font-heading font-semibold text-gray-900">Total à régler</dt>
				<dd class="font-heading font-semibold text-gray-900">{{ formatPrix(montantTotal) }}</dd>
			</div>
		</dl>

		<a
			v-if="bulletinHref"
			:href="bulletinHref"
			target="_blank"
			rel="noopener"
			class="bouton bouton-primaire mt-4"
		>
			<i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>
			Imprimer le bulletin d'adhésion (PDF)
		</a>

		<p class="mt-4 text-sm text-gray-600">
			Le règlement se fait sur place lors de votre venue<template v-if="relaisAdhesion?.length">, ou
			auprès de {{ relaisAdhesion.length > 1 ? 'nos partenaires' : 'notre partenaire' }}
			({{ relaisAdhesion.join(', ') }})</template>. La cotisation n'est pas remboursable.
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
