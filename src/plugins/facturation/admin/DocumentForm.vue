<script setup lang="ts">
/**
 * Devis ou facture du module « Facturation ».
 *  - Devis : client, dates, objet, statut, lignes, notes ; « Créer la
 *    facture » une fois enregistré (devis numéroté) ; suppression sauf
 *    accepté ou facturé. Une demande en ligne montre le message du client.
 *  - Facture : brouillon modifiable puis « Émettre » (numéro définitif, date
 *    du jour, échéance ; enregistre d'abord le brouillon). Émise : lecture
 *    seule, sauf le paiement (payée, date, mode).
 * PDF via Gotenberg (`pdfHref`) quand il est configuré.
 */
import { computed, ref } from 'vue';
import FormHeader from '../../../components/admin/FormHeader.vue';
import { ApiError } from '../../../components/admin/client';
import { inputClass } from '../../../components/admin/context';
import { euros, STATUTS_DEVIS, type Devis, type Facture } from '../lib/types';
import ClientForm from './ClientForm.vue';
import LignesEditeur from './LignesEditeur.vue';
import { aujourdhui, dateFr, facturationApi, pdfHref, plusJours, type DonneesFacturation } from './client';

const props = defineProps<{
	type: 'devis' | 'facture';
	devis?: Devis | null;
	facture?: Facture | null;
	donnees: DonneesFacturation;
	recharger: () => Promise<void>;
}>();
const emit = defineEmits<{ back: []; ouvrir: [type: 'devis' | 'facture', id: number] }>();

const estDevis = props.type === 'devis';
const existant = computed(() => (estDevis ? props.devis : props.facture) ?? null);
const brouillon = computed(() => estDevis || !props.facture || props.facture.statut === 'Brouillon');

const d = props.devis;
const f = props.facture;
const form = ref({
	clientId: (d ?? f)?.clientId ?? null,
	date: d?.date || aujourdhui(),
	validite: d?.validite || plusJours(aujourdhui(), props.donnees.reglages.validiteJours),
	objet: (d ?? f)?.objet ?? '',
	statut: d?.statut ?? 'Brouillon',
	notes: (d ?? f)?.notes ?? '',
	datePrestation: f?.datePrestation ?? '',
	// Copie simple : structuredClone échoue sur les objets réactifs de Vue.
	lignes: ((d ?? f)?.lignes ?? []).map((l) => ({ ...l })),
});
const paiement = ref({
	paye: f?.statut === 'Payée',
	datePaiement: f?.datePaiement || aujourdhui(),
	modePaiement: f?.modePaiement || props.donnees.reglages.modesPaiement[0] || '',
});

const busy = ref(false);
const error = ref('');
const notice = ref('');
const nouveauClient = ref(false);
const confirmation = ref<'' | 'emettre' | 'supprimer'>('');

const titre = computed(() => {
	if (estDevis) return props.devis ? (props.devis.numero ? `Devis ${props.devis.numero}` : 'Demande de devis') : 'Nouveau devis';
	return props.facture?.numero ? `Facture ${props.facture.numero}` : props.facture ? 'Facture (brouillon)' : 'Nouvelle facture';
});
const client = computed(() => props.donnees.clients.find((c) => c.id === form.value.clientId) ?? null);
const factureLiee = computed(() => (props.devis?.factureId ? props.donnees.factures.find((x) => x.id === props.devis!.factureId) : null));

async function agir(action: () => Promise<void>, succes = '') {
	error.value = '';
	notice.value = '';
	busy.value = true;
	try {
		await action();
		notice.value = succes;
		confirmation.value = '';
	} catch (e) {
		error.value = e instanceof ApiError ? e.message : (e as Error).message;
	} finally {
		busy.value = false;
	}
}

/** Enregistre et rend l'identifiant (le formulaire bascule sur le document enregistré). */
async function sauver(): Promise<number> {
	const v = form.value;
	if (estDevis) {
		const r = await facturationApi.devis('enregistrer', props.devis?.id ?? null, {
			clientId: v.clientId,
			date: v.date,
			validite: v.validite,
			objet: v.objet,
			statut: v.statut,
			notes: v.notes,
			lignes: v.lignes,
		});
		return r.id!;
	}
	const r = await facturationApi.facture('enregistrer', props.facture?.id ?? null, {
		facture: { clientId: v.clientId, devisId: props.facture?.devisId ?? null, datePrestation: v.datePrestation, objet: v.objet, notes: v.notes, lignes: v.lignes },
	});
	return r.id!;
}

const enregistrer = () =>
	agir(async () => {
		const id = await sauver();
		await props.recharger();
		emit('ouvrir', props.type, id);
	}, 'Enregistré.');

const facturer = () =>
	agir(async () => {
		const r = await facturationApi.devis('facturer', props.devis!.id);
		await props.recharger();
		emit('ouvrir', 'facture', r.factureId!);
	});

const emettre = () =>
	agir(async () => {
		const id = await sauver();
		await facturationApi.facture('emettre', id);
		await props.recharger();
		emit('ouvrir', 'facture', id);
	});

const enregistrerPaiement = () =>
	agir(async () => {
		await facturationApi.facture('paiement', props.facture!.id, { paiement: paiement.value });
		await props.recharger();
	}, 'Paiement enregistré.');

const supprimer = () =>
	agir(async () => {
		if (estDevis) await facturationApi.devis('supprimer', props.devis!.id);
		else await facturationApi.facture('supprimer', props.facture!.id);
		await props.recharger();
		emit('back');
	});

async function clientCree(id: number) {
	await props.recharger();
	form.value.clientId = id;
	nouveauClient.value = false;
}
</script>

<template>
	<FormHeader :back="estDevis ? 'Devis' : 'Factures'" :title="titre" :editing="Boolean(existant)" @back="emit('back')">
		<span v-if="facture" class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">{{ facture.statut }}</span>
	</FormHeader>

	<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>
	<p v-if="notice" class="mb-4 alerte-succes" role="status">{{ notice }}</p>

	<!-- Demande en ligne : message du client -->
	<div v-if="devis?.message" class="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
		<p class="font-semibold">Message du client</p>
		<p class="mt-1 whitespace-pre-line">{{ devis.message }}</p>
	</div>

	<form class="space-y-4" @submit.prevent="enregistrer">
		<!-- Client -->
		<div>
			<label for="doc-client" class="champ-libelle">Client</label>
			<div class="mt-1 flex gap-2">
				<select id="doc-client" v-model="form.clientId" :disabled="!brouillon" class="champ min-w-0 flex-1">
					<option :value="null">— Choisir —</option>
					<option v-for="c in donnees.clients" :key="c.id" :value="c.id">{{ c.societe ? `${c.societe} (${c.nom})` : c.nom }}</option>
				</select>
				<button v-if="brouillon" type="button" class="bouton bouton-neutre shrink-0" @click="nouveauClient = !nouveauClient">
					<i class="fa-solid fa-user-plus" aria-hidden="true"></i><span class="hidden sm:inline">Nouveau client</span>
				</button>
			</div>
			<p v-if="client" class="champ-aide">
				{{ [client.email, client.telephone, [client.adresse, `${client.codePostal} ${client.ville}`.trim()].filter(Boolean).join(', ')].filter(Boolean).join(' · ') }}
			</p>
		</div>
		<ClientForm v-if="nouveauClient" :client="null" @saved="clientCree" @cancel="nouveauClient = false" />

		<!-- Dates, objet, statut -->
		<div v-if="estDevis" class="grid gap-4 sm:grid-cols-3">
			<div>
				<label for="doc-date" class="champ-libelle">Date</label>
				<input id="doc-date" v-model="form.date" type="date" required :class="inputClass" />
			</div>
			<div>
				<label for="doc-validite" class="champ-libelle">Valable jusqu'au</label>
				<input id="doc-validite" v-model="form.validite" type="date" :class="inputClass" />
			</div>
			<div>
				<label for="doc-statut" class="champ-libelle">Statut</label>
				<select id="doc-statut" v-model="form.statut" :class="inputClass">
					<option v-for="s in STATUTS_DEVIS" :key="s" :value="s">{{ s }}</option>
				</select>
			</div>
		</div>
		<div v-else-if="facture && !brouillon" class="grid gap-2 text-sm sm:grid-cols-3">
			<p><span class="text-gray-500">Émise le</span> {{ dateFr(facture.date) }}</p>
			<p><span class="text-gray-500">Échéance</span> {{ dateFr(facture.echeance) }}</p>
			<p v-if="facture.datePrestation"><span class="text-gray-500">Prestation</span> {{ facture.datePrestation }}</p>
		</div>
		<div v-else>
			<label for="doc-prestation" class="champ-libelle">Date ou période de la prestation</label>
			<input id="doc-prestation" v-model="form.datePrestation" type="text" placeholder="ex. 12 novembre 2026, ou du 3 au 7 novembre" :class="inputClass" />
			<p class="champ-aide">Mention obligatoire. Date d'émission et échéance sont fixées à l'émission.</p>
		</div>
		<div>
			<label for="doc-objet" class="champ-libelle">Objet</label>
			<input id="doc-objet" v-model="form.objet" type="text" maxlength="200" :readonly="!brouillon" :class="inputClass" />
		</div>

		<!-- Lignes -->
		<fieldset>
			<legend class="champ-libelle mb-1">Prestations</legend>
			<LignesEditeur v-model="form.lignes" :prestations="donnees.prestations" :readonly="!brouillon" />
		</fieldset>

		<div v-if="brouillon">
			<label for="doc-notes" class="champ-libelle">Notes <span class="font-light text-gray-500">(imprimées sur le document)</span></label>
			<textarea id="doc-notes" v-model="form.notes" rows="6" :class="inputClass"></textarea>
		</div>

		<div v-if="brouillon" class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<button type="submit" class="bouton bouton-primaire" :disabled="busy">
				<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>{{ estDevis ? 'Enregistrer le devis' : 'Enregistrer le brouillon' }}
			</button>
			<button v-if="!estDevis" type="button" class="bouton bouton-accent" :disabled="busy" @click="confirmation = 'emettre'">
				<i class="fa-solid fa-stamp" aria-hidden="true"></i>Émettre la facture
			</button>
			<button
				v-if="devis && devis.numero && !devis.factureId && devis.statut !== 'Refusé'"
				type="button"
				class="bouton bouton-accent"
				:disabled="busy"
				@click="facturer"
			>
				<i class="fa-solid fa-file-invoice" aria-hidden="true"></i>Créer la facture
			</button>
			<a v-if="existant && donnees.reglages.pdf" :href="pdfHref(type, existant.id)" class="bouton bouton-neutre">
				<i class="fa-solid fa-file-pdf" aria-hidden="true"></i>PDF
			</a>
			<button
				v-if="existant && (estDevis ? !devis?.factureId && devis?.statut !== 'Accepté' : true)"
				type="button"
				class="ml-auto text-sm text-red-700 hover:underline"
				@click="confirmation = 'supprimer'"
			>
				Supprimer
			</button>
		</div>
	</form>

	<!-- Confirmations -->
	<div v-if="confirmation === 'emettre'" class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700" role="alert">
		<p class="font-semibold">Émettre la facture ?</p>
		<p class="mt-1">
			Elle reçoit son numéro et la date du jour, puis ne pourra plus être modifiée ni supprimée. Total : <strong>{{ euros(form.lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0)) }}</strong>.
		</p>
		<div class="mt-3 flex flex-wrap gap-3">
			<button type="button" class="bouton bouton-primaire" :disabled="busy" @click="emettre">Émettre</button>
			<button type="button" class="text-sm text-gray-700 hover:underline" @click="confirmation = ''">Annuler</button>
		</div>
	</div>
	<div v-if="confirmation === 'supprimer'" class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700" role="alert">
		<p class="font-semibold">Supprimer {{ estDevis ? 'ce devis' : 'ce brouillon de facture' }} ?</p>
		<div class="mt-3 flex flex-wrap gap-3">
			<button type="button" class="bouton bouton-danger" :disabled="busy" @click="supprimer">Supprimer</button>
			<button type="button" class="text-sm text-gray-700 hover:underline" @click="confirmation = ''">Annuler</button>
		</div>
	</div>

	<!-- Devis facturé -->
	<p v-if="factureLiee" class="mt-4 text-sm">
		Facturé :
		<button type="button" class="text-primary underline hover:no-underline" @click="emit('ouvrir', 'facture', factureLiee.id)">
			{{ factureLiee.numero ? `facture ${factureLiee.numero}` : 'facture en brouillon' }}
		</button>
	</p>

	<!-- Facture émise : paiement -->
	<form v-if="facture && !brouillon" class="mt-6 space-y-3 rounded-xl border border-gray-200 p-4" @submit.prevent="enregistrerPaiement">
		<p class="font-heading font-semibold text-gray-900">Paiement</p>
		<label class="flex items-center gap-2 text-sm"><input v-model="paiement.paye" type="checkbox" />Facture payée</label>
		<div v-if="paiement.paye" class="grid gap-3 sm:grid-cols-2">
			<div>
				<label for="pay-date" class="champ-libelle">Date du paiement</label>
				<input id="pay-date" v-model="paiement.datePaiement" type="date" required :class="inputClass" />
			</div>
			<div>
				<label for="pay-mode" class="champ-libelle">Mode</label>
				<select id="pay-mode" v-model="paiement.modePaiement" :class="inputClass">
					<option v-for="m in donnees.reglages.modesPaiement" :key="m" :value="m">{{ m }}</option>
				</select>
			</div>
		</div>
		<div class="flex flex-wrap gap-3">
			<button type="submit" class="bouton bouton-primaire" :disabled="busy">Enregistrer le paiement</button>
			<a v-if="donnees.reglages.pdf" :href="pdfHref('facture', facture.id)" class="bouton bouton-neutre">
				<i class="fa-solid fa-file-pdf" aria-hidden="true"></i>PDF
			</a>
		</div>
	</form>
</template>
