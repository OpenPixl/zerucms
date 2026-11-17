<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { inscriptionApi, membresApi } from './client';
import EtapeProfil from './EtapeProfil.vue';
import EtapeActivite from './EtapeActivite.vue';
import EtapeRecap from './EtapeRecap.vue';
import type {
	ActiviteOption,
	ExterieurPayload,
	Genre,
	MembreCandidat,
	Profil,
} from '../../../lib/grist-asso/types';

type Step = 'profil' | 'activite' | 'recap';

const emptyExterieur = (): ExterieurPayload => ({
	genre: '' as Genre, // radio non pré-coché ; le serveur valide la valeur
	nom: '',
	prenom: '',
	telephone: '',
});

const step = ref<Step>('profil');
const profil = ref<Profil>('');

const adherent = reactive({ nom: '', prenom: '' });
const exterieur = reactive<ExterieurPayload>(emptyExterieur());

const candidats = ref<MembreCandidat[]>([]);
const introuvable = ref(false);

const membreId = ref<number | null>(null);
const membreLabel = ref('');

const activites = ref<ActiviteOption[]>([]);
const activiteId = ref<number | null>(null);
const activiteLabel = ref('');
const prix = ref<number | null>(null);
/** Prix de l'adhésion individuelle de la saison (`/api/inscription/offre`). */
const prixAdhesion = ref<number | null>(null);
const disponibilite = ref('');
/** `preinscription` : l'activité visée n'est pas publiée, on note seulement l'intérêt. */
const mode = ref<'inscription' | 'preinscription'>('inscription');
const cibleIntrouvable = ref(false);
const offreChargee = ref(false);
const preinscrit = ref(false);
/** Adhésion en cours : décide du tarif mis en avant à l'étape 2 (adhérent·e / non-adhérent·e). */
const estAdherent = ref(false);

const busy = ref(false);
const error = ref('');

/** Cible transmise par le bouton « S'inscrire » d'une fiche (`activite=…` répétable, `type=…`). */
const cible = ref(new URLSearchParams());

onMounted(() => {
	const params = new URLSearchParams(window.location.search);
	const c = new URLSearchParams();
	params.getAll('activite').forEach((a) => c.append('activite', a));
	if (params.get('type')) c.set('type', params.get('type')!);
	cible.value = c;
});

function messageOf(e: unknown): string {
	return e instanceof Error ? e.message : 'Une erreur est survenue, réessayez.';
}

async function submitAdherent() {
	busy.value = true;
	error.value = '';
	candidats.value = [];
	introuvable.value = false;
	try {
		const res = await membresApi.retrouverMembre({ ...adherent });
		if (res.status === 'introuvable') {
			introuvable.value = true;
			return;
		}
		if (res.status === 'ambigu') {
			candidats.value = res.candidats;
			return;
		}
		// `res.membreId` désigne le·la responsable du foyer quand la fiche trouvée
		// est rattachée à une adhésion familiale (logique de l'adhésion) : on
		// inscrit ici la personne elle-même, via `res.ficheId`.
		identifier(res.ficheId, `${res.prenom} ${res.nom}`.trim(), res.adhesionEnCours);
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

function choisirCandidat(c: MembreCandidat) {
	candidats.value = [];
	identifier(c.membreId, `${c.prenom} ${c.nom}`.trim(), c.adhesionEnCours);
}

async function submitExterieur() {
	busy.value = true;
	error.value = '';
	try {
		const res = await inscriptionApi.creerParticipantExterieur({ ...exterieur });
		identifier(res.membreId, `${res.prenom} ${res.nom}`.trim(), false);
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

async function identifier(id: number, label: string, adhesionEnCours: boolean) {
	membreId.value = id;
	membreLabel.value = label;
	estAdherent.value = adhesionEnCours;
	step.value = 'activite';
	if (!offreChargee.value) {
		busy.value = true;
		try {
			// Le serveur restreint la liste aux activités visées par la fiche d'origine
			// ou bascule en préinscription si aucune n'est publiée.
			const res = await inscriptionApi.offre(cible.value);
			activites.value = res.activites;
			mode.value = res.mode;
			cibleIntrouvable.value = res.cibleIntrouvable;
			prixAdhesion.value = res.prixAdhesion;
			offreChargee.value = true;
		} catch (e) {
			error.value = messageOf(e);
		} finally {
			busy.value = false;
		}
	}
	// Une seule activité proposée pour la fiche visée : on la coche d'office.
	if (cible.value.size > 0 && !cibleIntrouvable.value && activites.value.length === 1) {
		activiteId.value = activites.value[0].id;
	}
}

async function submitPreinscription(id: number) {
	if (membreId.value === null) return;
	busy.value = true;
	error.value = '';
	try {
		await inscriptionApi.preinscrire({ membreId: membreId.value, activiteId: id });
		activiteLabel.value = activites.value.find((a) => a.id === id)?.label ?? '';
		prix.value = null;
		preinscrit.value = true;
		step.value = 'recap';
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

async function submitActivite(id: number) {
	if (membreId.value === null) return;
	busy.value = true;
	error.value = '';
	try {
		const res = await membresApi.enregistrerActivite({ membreId: membreId.value, activiteId: id });
		const option = activites.value.find((a) => a.id === id);
		activiteLabel.value = option?.label ?? '';
		// Même règle que le montant dû côté serveur (/api/adhesion/inscription).
		prix.value =
			!estAdherent.value && option?.prixNonAdherent != null ? option.prixNonAdherent : (option?.prix ?? null);
		disponibilite.value = res.disponibilite;
		step.value = 'recap';
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

function recommencer() {
	step.value = 'profil';
	profil.value = '';
	Object.assign(adherent, { nom: '', prenom: '' });
	Object.assign(exterieur, emptyExterieur());
	candidats.value = [];
	introuvable.value = false;
	membreId.value = null;
	membreLabel.value = '';
	activiteId.value = null;
	activiteLabel.value = '';
	prix.value = null;
	disponibilite.value = '';
	preinscrit.value = false;
	estAdherent.value = false;
	error.value = '';
}

function annuler() {
	if (busy.value) return;
	if (!window.confirm('Effacer toutes les informations saisies et recommencer ?')) return;
	recommencer();
}
</script>

<template>
	<div class="mx-auto max-w-3xl">
		<ol class="space-y-4">
			<EtapeProfil
				v-model:profil="profil"
				:adherent="adherent"
				:exterieur="exterieur"
				:active="step === 'profil'"
				:done="step !== 'profil'"
				:busy="busy"
				:candidats="candidats"
				:introuvable="introuvable"
				:membre-label="membreLabel"
				@submit-adherent="submitAdherent"
				@submit-exterieur="submitExterieur"
				@choisir="choisirCandidat"
			/>

			<EtapeActivite
				v-if="step === 'activite' || step === 'recap'"
				v-model:activite-id="activiteId"
				:options="activites"
				:active="step === 'activite'"
				:done="step === 'recap'"
				:busy="busy"
				:activite-label="activiteLabel"
				:mode="mode"
				:cible-introuvable="cibleIntrouvable"
				:est-adherent="estAdherent"
				:prix-adhesion="prixAdhesion"
				@submit="submitActivite"
				@preinscrire="submitPreinscription"
			/>

			<EtapeRecap
				v-if="step === 'recap'"
				:membre-label="membreLabel"
				:exterieur="profil === 'exterieur'"
				:activite-label="activiteLabel"
				:prix="prix"
				:disponibilite="disponibilite"
				:preinscription="preinscrit"
				@recommencer="recommencer"
			/>
		</ol>

		<p v-if="error" class="mt-6 alerte-erreur" role="alert">
			{{ error }}
		</p>

		<div v-if="step !== 'recap'" class="mt-6 text-center">
			<button
				type="button"
				class="text-sm font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
				:disabled="busy"
				@click="annuler"
			>
				Annuler et tout effacer
			</button>
		</div>
	</div>
</template>
