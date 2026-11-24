<script setup lang="ts">
/**
 * Module « Facturation » (plugin `facturation`, administrateur·rice·s) :
 * onglets Devis (demandes en ligne en tête), Factures et Clients ; un clic
 * ouvre le document (`DocumentForm.vue`) ou la fiche client
 * (`ClientForm.vue`). Données dans Grist (`lib/documents.ts`), écrites sans
 * reconstruction du site. Prestations du catalogue : table Grist
 * `Prestations`, tenue dans Grist.
 */
import { computed, inject, onMounted, ref } from 'vue';
import { ApiError } from '../../../components/admin/client';
import { ADMIN_CONTEXT, inputClass } from '../../../components/admin/context';
import { euros, type Client } from '../lib/types';
import FormTabs from '../../../components/admin/FormTabs.vue';
import type { FormTab } from '../../../components/admin/form-tabs';
import ClientForm from './ClientForm.vue';
import DocumentForm from './DocumentForm.vue';
import { dateFr, facturationApi, type DonneesFacturation } from './client';

const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const donnees = ref<DonneesFacturation | null>(null);
const loading = ref(true);
const error = ref('');
type Onglet = 'devis' | 'factures' | 'clients';
const onglet = ref<Onglet>('devis');
const ONGLETS = [
	{ id: 'devis', label: 'Devis', icon: 'fa-file-signature' },
	{ id: 'factures', label: 'Factures', icon: 'fa-file-invoice' },
	{ id: 'clients', label: 'Clients', icon: 'fa-users' },
] as const satisfies readonly FormTab[];
const recherche = ref('');
/** Document ouvert (`id` null = nouveau) ou fiche client. */
const ouvert = ref<{ type: 'devis' | 'facture'; id: number | null } | null>(null);
const clientOuvert = ref<Client | 'nouveau' | null>(null);

async function recharger() {
	try {
		donnees.value = await facturationApi.charger();
		error.value = '';
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		loading.value = false;
	}
}
onMounted(recharger);

const nomClient = (id: number | null) => {
	const c = donnees.value?.clients.find((x) => x.id === id);
	return c ? c.societe || c.nom : 'Client inconnu';
};
const correspond = (...textes: string[]) => {
	const q = recherche.value.trim().toLowerCase();
	return !q || textes.some((t) => t.toLowerCase().includes(q));
};
const devis = computed(() =>
	(donnees.value?.devis ?? [])
		.filter((d) => correspond(d.numero, d.objet, nomClient(d.clientId), d.statut))
		.sort((a, b) => Number(b.statut === 'Demande') - Number(a.statut === 'Demande')),
);
const factures = computed(() => (donnees.value?.factures ?? []).filter((f) => correspond(f.numero, f.objet, nomClient(f.clientId), f.statut)));
const clients = computed(() => (donnees.value?.clients ?? []).filter((c) => correspond(c.nom, c.societe, c.email, c.ville)));
const demandes = computed(() => donnees.value?.devis.filter((d) => d.statut === 'Demande').length ?? 0);
const aEncaisser = computed(() => (donnees.value?.factures ?? []).filter((f) => f.statut === 'Émise').reduce((s, f) => s + f.total, 0));

const COULEURS: Record<string, string> = {
	Demande: 'bg-amber-100 text-amber-900',
	Brouillon: 'bg-gray-100 text-gray-700',
	Envoyé: 'bg-sky-100 text-sky-900',
	Accepté: 'bg-green-100 text-green-900',
	Refusé: 'bg-red-100 text-red-800',
	Émise: 'bg-sky-100 text-sky-900',
	Payée: 'bg-green-100 text-green-900',
};
const enRetard = (echeance: string, statut: string) => statut === 'Émise' && echeance && echeance < new Date().toISOString().slice(0, 10);

function ouvrir(type: 'devis' | 'facture', id: number | null) {
	ouvert.value = { type, id };
	onglet.value = type === 'devis' ? 'devis' : 'factures';
}
const docDevis = computed(() => (ouvert.value?.type === 'devis' && ouvert.value.id ? donnees.value?.devis.find((d) => d.id === ouvert.value!.id) ?? null : null));
const docFacture = computed(() => (ouvert.value?.type === 'facture' && ouvert.value.id ? donnees.value?.factures.find((f) => f.id === ouvert.value!.id) ?? null : null));

async function clientEnregistre() {
	clientOuvert.value = null;
	await recharger();
}
</script>

<template>
	<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
	<div v-else-if="!donnees" class="space-y-3">
		<p class="alerte-erreur" role="alert">{{ error || 'Données indisponibles.' }}</p>
		<p class="text-sm text-gray-600">
			Le tableau Grist de la facturation est injoignable : contactez la personne qui gère le site.
		</p>
	</div>

	<!-- Document ouvert -->
	<DocumentForm
		v-else-if="ouvert"
		:key="`${ouvert.type}-${ouvert.id ?? 'nouveau'}`"
		:type="ouvert.type"
		:devis="docDevis"
		:facture="docFacture"
		:donnees="donnees"
		:recharger="recharger"
		@back="ouvert = null"
		@ouvrir="ouvrir"
	/>

	<template v-else>
		<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>

		<div class="mb-4 grid grid-cols-2 gap-3 text-sm">
			<div class="rounded-xl border border-gray-200 p-3">
				<p class="text-xs text-gray-500">Demandes de devis à traiter</p>
				<p class="text-lg font-semibold" :class="demandes ? 'text-amber-700' : 'text-gray-900'">{{ demandes }}</p>
			</div>
			<div class="rounded-xl border border-gray-200 p-3">
				<p class="text-xs text-gray-500">Factures émises à encaisser</p>
				<p class="text-lg font-semibold tabular-nums">{{ euros(aEncaisser) }}</p>
			</div>
		</div>

		<FormTabs v-model="onglet" :tabs="ONGLETS" prefix="facturation" :counts="{ devis: demandes }" />

		<div class="mb-3 flex flex-wrap gap-2">
			<input v-model="recherche" type="search" placeholder="Rechercher (numéro, client, objet, statut…)" :class="[inputClass, 'mt-0 min-w-0 flex-1']" />
			<button v-if="onglet === 'devis'" type="button" class="bouton bouton-primaire" @click="ouvrir('devis', null)">
				<i class="fa-solid fa-plus" aria-hidden="true"></i>Nouveau devis
			</button>
			<button v-else-if="onglet === 'factures'" type="button" class="bouton bouton-primaire" @click="ouvrir('facture', null)">
				<i class="fa-solid fa-plus" aria-hidden="true"></i>Nouvelle facture
			</button>
			<button v-else type="button" class="bouton bouton-primaire" @click="clientOuvert = 'nouveau'">
				<i class="fa-solid fa-plus" aria-hidden="true"></i>Nouveau client
			</button>
		</div>

		<!-- Devis -->
		<ul v-if="onglet === 'devis'" id="facturation-panel-devis" role="tabpanel" aria-labelledby="facturation-tab-devis" class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
			<li v-for="d in devis" :key="d.id">
				<button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50" @click="ouvrir('devis', d.id)">
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium text-gray-900">{{ d.numero || 'Demande en ligne' }} · {{ nomClient(d.clientId) }}</span>
						<span class="block truncate text-xs font-light text-gray-500">{{ dateFr(d.date) }}<template v-if="d.objet"> · {{ d.objet }}</template></span>
					</span>
					<span class="shrink-0 tabular-nums">{{ euros(d.total) }}</span>
					<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="COULEURS[d.statut]">{{ d.statut }}</span>
				</button>
			</li>
			<li v-if="!devis.length" class="px-4 py-3 text-sm font-light text-gray-500">Aucun devis.</li>
		</ul>

		<!-- Factures -->
		<ul v-else-if="onglet === 'factures'" id="facturation-panel-factures" role="tabpanel" aria-labelledby="facturation-tab-factures" class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
			<li v-for="f in factures" :key="f.id">
				<button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50" @click="ouvrir('facture', f.id)">
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium text-gray-900">{{ f.numero || 'Brouillon' }} · {{ nomClient(f.clientId) }}</span>
						<span class="block truncate text-xs font-light" :class="enRetard(f.echeance, f.statut) ? 'text-red-700' : 'text-gray-500'">
							<template v-if="f.numero">{{ dateFr(f.date) }} · échéance {{ dateFr(f.echeance) }}<template v-if="enRetard(f.echeance, f.statut)"> (en retard)</template></template>
							<template v-else>{{ f.objet || 'non émise' }}</template>
						</span>
					</span>
					<span class="shrink-0 tabular-nums">{{ euros(f.total) }}</span>
					<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" :class="COULEURS[f.statut]">{{ f.statut }}</span>
				</button>
			</li>
			<li v-if="!factures.length" class="px-4 py-3 text-sm font-light text-gray-500">Aucune facture.</li>
		</ul>

		<!-- Clients -->
		<div v-else id="facturation-panel-clients" role="tabpanel" aria-labelledby="facturation-tab-clients">
			<ClientForm
				v-if="clientOuvert"
				:key="clientOuvert === 'nouveau' ? 'nouveau' : clientOuvert.id"
				class="mb-3"
				:client="clientOuvert === 'nouveau' ? null : clientOuvert"
				@saved="clientEnregistre"
				@cancel="clientOuvert = null"
			/>
			<ul class="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
				<li v-for="c in clients" :key="c.id">
					<button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50" @click="clientOuvert = c">
						<i class="fa-solid fa-user shrink-0 text-gray-400" aria-hidden="true"></i>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium text-gray-900">{{ c.societe ? `${c.societe} (${c.nom})` : c.nom }}</span>
							<span class="block truncate text-xs font-light text-gray-500">{{ [c.email, c.telephone, c.ville].filter(Boolean).join(' · ') }}</span>
						</span>
					</button>
				</li>
				<li v-if="!clients.length" class="px-4 py-3 text-sm font-light text-gray-500">Aucun client.</li>
			</ul>
		</div>
	</template>
</template>
