<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { adhesionApi } from './client';
import SectionIdentite from './SectionIdentite.vue';
import SectionCotisation from './SectionCotisation.vue';
import SectionMembres from './SectionMembres.vue';
import SectionActivite from './SectionActivite.vue';
import SectionRecap from './SectionRecap.vue';
import type {
	ActiviteOption,
	ContactPayload,
	CotisationOption,
	Genre,
	GroupeMembre,
	InscriptionLigne,
	MembreCandidat,
	MembreEtat,
	MembrePayload,
	MembreRecherche,
	Mode,
} from '../../../../lib/grist-asso/types';

defineProps<{
	/** Partenaires où régler sa cotisation (`relais: true` de `src/content/partenaires.yaml`). */
	relaisAdhesion?: string[];
}>();

type Step = 'identite' | 'cotisation' | 'membres' | 'activite' | 'recap' | 'contact-ok';

const emptyIdentite = (): MembrePayload => ({
	genre: '' as Genre, // radio non pré-coché ; le serveur valide la valeur
	nom: '',
	prenom: '',
	dateNaissance: '',
	email: '',
	adresse: '',
	codePostal: '',
	commune: '',
	telFixe: '',
	telMobile: '',
	newsletter: false,
	droitImage: false,
});

const mode = ref<Mode>('nouveau');
const step = ref<Step>('identite');

const identite = reactive<MembrePayload>(emptyIdentite());
const renouv = reactive({ nom: '', prenom: '' });
/** Renouvellement : fiche retrouvée en attente de confirmation (préférences + adhésion à jour). */
const renouvEtat = ref<MembreEtat | null>(null);
const renouvPrefs = reactive({ newsletter: false, droitImage: false });
/** Renouvellement d'un membre déjà à jour : l'étape Cotisation est sautée. */
const cotisationSkipped = ref(false);

const membreId = ref<number | null>(null);
const membreLabel = ref('');
const membreGenre = ref<Genre | null>(null);
const adhesionId = ref<number | null>(null);
const bulletinToken = ref<string | null>(null);
const candidats = ref<MembreCandidat[]>([]);
const groupe = ref<GroupeMembre[]>([]);
const resultatsRecherche = ref<MembreRecherche[]>([]);
const sectionMembresRef = ref<InstanceType<typeof SectionMembres> | null>(null);

const cotisations = ref<CotisationOption[]>([]);
const activites = ref<ActiviteOption[]>([]);
const cotisationId = ref<number | null>(null);
/** Inscriptions activité créées pendant le parcours (1 ligne par membre × activité). */
const inscriptions = ref<InscriptionLigne[]>([]);

const busy = ref(false);
const error = ref('');

const cotisationChoisie = computed(
	() => cotisations.value.find((c) => c.id === cotisationId.value) ?? null,
);
/** Membres candidats à une inscription : le groupe si adhésion multiple, sinon l'adhérent seul. */
const membresPourActivite = computed<GroupeMembre[]>(() =>
	groupe.value.length > 0
		? groupe.value
		: membreId.value !== null
			? [{ membreId: membreId.value, label: membreLabel.value }]
			: [],
);
const montantTotal = computed(() => {
	const c = cotisationChoisie.value?.prix ?? null;
	const activitesTotal = inscriptions.value.reduce((s, l) => s + (l.prix ?? 0), 0);
	if (c === null && inscriptions.value.length === 0) return null;
	return (c ?? 0) + activitesTotal;
});
const bulletinHref = computed(() =>
	bulletinToken.value
		? `/api/adhesion/bulletin?t=${encodeURIComponent(bulletinToken.value)}`
		: null,
);

function reset() {
	step.value = 'identite';
	membreId.value = null;
	membreLabel.value = '';
	membreGenre.value = null;
	adhesionId.value = null;
	bulletinToken.value = null;
	candidats.value = [];
	renouvEtat.value = null;
	cotisationSkipped.value = false;
	groupe.value = [];
	resultatsRecherche.value = [];
	cotisationId.value = null;
	inscriptions.value = [];
	error.value = '';
}
watch(mode, reset);
// Une association n'a pas de date de naissance : on vide le champ masqué.
watch(
	() => identite.genre,
	(g) => {
		if (g === 'Association') identite.dateNaissance = '';
	},
);

async function submitIdentite() {
	busy.value = true;
	error.value = '';
	candidats.value = [];
	renouvEtat.value = null;
	try {
		const res =
			mode.value === 'nouveau'
				? await adhesionApi.creerMembre({ ...identite })
				: await adhesionApi.retrouverMembre({ ...renouv });

		if (res.status === 'introuvable') {
			error.value =
				"Aucune fiche trouvée à ce nom. Vérifiez l'orthographe ou choisissez « Nouveau membre ».";
			return;
		}
		if (res.status === 'ambigu') {
			candidats.value = res.candidats;
			return;
		}
		await identifier(res);
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

/**
 * Fiche identifiée (création, rapprochement direct ou choix d'un candidat ;
 * un membre rattaché est déjà résolu côté serveur sur son·sa responsable).
 * En renouvellement on marque une pause « préférences » avant de poursuivre ;
 * en création on enchaîne sur la cotisation.
 */
async function identifier(
	m: MembreEtat & { membreId: number; prenom: string; nom: string; genre: Genre | null },
) {
	membreId.value = m.membreId;
	membreLabel.value = `${m.prenom} ${m.nom}`.trim();
	membreGenre.value = m.genre;
	if (mode.value === 'renouvellement') {
		renouvPrefs.newsletter = m.newsletter;
		renouvPrefs.droitImage = m.droitImage;
		renouvEtat.value = {
			newsletter: m.newsletter,
			droitImage: m.droitImage,
			adhesionEnCours: m.adhesionEnCours,
			groupe: m.groupe,
		};
		return; // l'étape 1 reste active, SectionIdentite affiche le panneau
	}
	await goCotisation();
}

/** Renouvellement : préférences confirmées → MAJ Grist, puis suite du parcours. */
async function confirmerRenouvellement() {
	const etat = renouvEtat.value;
	if (membreId.value === null || !etat) return;
	busy.value = true;
	error.value = '';
	try {
		// Adhésion liée : on aligne systématiquement tout le foyer sur ce choix.
		// Fiche seule : on n'écrit que si une case a changé.
		const aChange =
			renouvPrefs.newsletter !== etat.newsletter || renouvPrefs.droitImage !== etat.droitImage;
		if (etat.groupe.length > 0 || aChange) {
			await adhesionApi.majPreferences({
				membreId: membreId.value,
				newsletter: renouvPrefs.newsletter,
				droitImage: renouvPrefs.droitImage,
			});
		}
		renouvEtat.value = null;
		if (etat.adhesionEnCours) {
			// Adhésion déjà à jour : on saute la cotisation, direction l'activité.
			cotisationSkipped.value = true;
			groupe.value = etat.groupe;
			await chargerActivites();
		} else {
			await goCotisation();
		}
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

/** L'usager rejette la fiche proposée : on rouvre la saisie nom + prénom. */
function reprendreIdentite() {
	renouvEtat.value = null;
	membreId.value = null;
	membreLabel.value = '';
	membreGenre.value = null;
}

async function submitContact(payload: ContactPayload) {
	busy.value = true;
	error.value = '';
	try {
		await adhesionApi.inscrireContact(payload);
		step.value = 'contact-ok';
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

function choisirCandidat(c: MembreCandidat) {
	candidats.value = [];
	void identifier(c);
}

async function goCotisation() {
	step.value = 'cotisation';
	if (cotisations.value.length === 0) {
		busy.value = true;
		try {
			cotisations.value = await adhesionApi.cotisations();
		} catch (e) {
			error.value = messageOf(e);
		} finally {
			busy.value = false;
		}
	}
}

async function chargerActivites() {
	step.value = 'activite';
	if (activites.value.length === 0) {
		busy.value = true;
		try {
			activites.value = await adhesionApi.activites();
		} catch (e) {
			error.value = messageOf(e);
		} finally {
			busy.value = false;
		}
	}
}

async function submitCotisation() {
	if (membreId.value === null || cotisationId.value === null) return;
	busy.value = true;
	error.value = '';
	try {
		const res = await adhesionApi.enregistrerCotisation({
			membreId: membreId.value,
			cotisationId: cotisationId.value,
		});
		adhesionId.value = res.adhesionId;
		bulletinToken.value = res.bulletinToken ?? null;

		if (cotisationChoisie.value?.multiple) {
			groupe.value =
				res.groupe.length > 0
					? res.groupe
					: [{ membreId: membreId.value, label: membreLabel.value }];
			step.value = 'membres';
		} else {
			await chargerActivites();
		}
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

async function ajouterCoMembre(payload: MembrePayload) {
	if (membreId.value === null || adhesionId.value === null) return;
	busy.value = true;
	error.value = '';
	try {
		const res = await adhesionApi.ajouterCoMembre({
			...payload,
			responsableId: membreId.value,
			adhesionId: adhesionId.value,
		});
		groupe.value.push({ membreId: res.membreId, label: `${res.prenom} ${res.nom}`.trim() });
		sectionMembresRef.value?.reset();
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

async function rattacherExistant(membreExistantId: number) {
	if (membreId.value === null || adhesionId.value === null) return;
	busy.value = true;
	error.value = '';
	try {
		const res = await adhesionApi.ajouterCoMembre({
			responsableId: membreId.value,
			adhesionId: adhesionId.value,
			membreExistantId,
		});
		groupe.value.push({ membreId: res.membreId, label: `${res.prenom} ${res.nom}`.trim() });
		resultatsRecherche.value = [];
		sectionMembresRef.value?.reset();
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

async function retirerMembre(id: number) {
	if (membreId.value === null || adhesionId.value === null) return;
	busy.value = true;
	error.value = '';
	try {
		await adhesionApi.detacherMembre({
			responsableId: membreId.value,
			adhesionId: adhesionId.value,
			membreId: id,
		});
		groupe.value = groupe.value.filter((m) => m.membreId !== id);
	} catch (e) {
		error.value = messageOf(e);
	} finally {
		busy.value = false;
	}
}

async function rechercherMembres(q: string) {
	if (q.trim().length < 2) {
		resultatsRecherche.value = [];
		return;
	}
	try {
		resultatsRecherche.value = await adhesionApi.rechercherMembres(q);
	} catch {
		resultatsRecherche.value = [];
	}
}

/** Crée une inscription (membre × activité) et l'ajoute à la liste. Renvoie false en cas d'échec. */
async function ajouterInscription(payload: { membreId: number; activiteId: number }): Promise<boolean> {
	const doublon = inscriptions.value.some(
		(l) => l.membreId === payload.membreId && l.activiteId === payload.activiteId,
	);
	if (doublon) return true;

	busy.value = true;
	error.value = '';
	try {
		const res = await adhesionApi.enregistrerActivite(payload);
		const act = activites.value.find((a) => a.id === payload.activiteId);
		const mem = membresPourActivite.value.find((m) => m.membreId === payload.membreId);
		inscriptions.value.push({
			membreId: payload.membreId,
			membreLabel: mem?.label ?? membreLabel.value,
			activiteId: payload.activiteId,
			activiteLabel: act?.label ?? '',
			prix: act?.prix ?? null,
			disponibilite: res.disponibilite,
		});
		return true;
	} catch (e) {
		error.value = messageOf(e);
		return false;
	} finally {
		busy.value = false;
	}
}

/** Bouton « Valider mon inscription » : enregistre la sélection en attente puis va au récap. */
async function finaliserActivites(pending: { membreId: number; activiteId: number } | null) {
	if (pending && !(await ajouterInscription(pending))) return;
	step.value = 'recap';
}

/** L'usager ne choisit pas d'activité maintenant : on va au récap sans créer d'inscription. */
function sauterActivite() {
	inscriptions.value = [];
	step.value = 'recap';
}

function messageOf(e: unknown): string {
	return e instanceof Error ? e.message : 'Une erreur est survenue, réessayez.';
}

function recommencer() {
	mode.value = 'nouveau';
	Object.assign(identite, emptyIdentite());
	Object.assign(renouv, { nom: '', prenom: '' });
	reset();
}

function annuler() {
	if (busy.value) return;
	if (!window.confirm('Effacer toutes les informations saisies et recommencer ?')) return;
	recommencer();
}
</script>

<template>
	<div class="mx-auto max-w-3xl">
		<!-- Choix du parcours -->
		<fieldset class="border-0 p-0" :disabled="step !== 'identite' || busy">
			<div class="flex flex-col gap-3 sm:flex-row">
				<label class="flex flex-1 cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 hover:border-primary" :class="{ 'border-primary bg-primary/5': mode === 'nouveau' }">
					<input type="radio" value="nouveau" v-model="mode" class="mt-1" />
					<span>
						<span class="block font-heading text-gray-900">Nouveau membre</span>
						<span class="block text-sm font-light text-gray-600">Première adhésion à l'association.</span>
					</span>
				</label>
				<label class="flex flex-1 cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 hover:border-primary" :class="{ 'border-primary bg-primary/5': mode === 'renouvellement' }">
					<input type="radio" value="renouvellement" v-model="mode" class="mt-1" />
					<span>
						<span class="block font-heading text-gray-900">Renouvellement</span>
						<span class="block text-sm font-light text-gray-600">Vous avez déjà été adhérent·e.</span>
					</span>
				</label>
			</div>
		</fieldset>

		<!-- Confirmation « actualités seules » -->
		<div v-if="step === 'contact-ok'" class="mt-8 rounded-2xl border border-primary bg-primary/5 p-6">
			<div class="flex items-center gap-3">
				<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
					<i class="fa-solid fa-check" aria-hidden="true"></i>
				</span>
				<h2 class="font-heading text-lg text-gray-900">Inscription aux actualités enregistrée</h2>
			</div>
			<p class="mt-4 text-sm text-gray-700">
				Merci, vous recevrez désormais nos actualités et informations par courriel.
			</p>
			<button type="button" class="mt-6 text-sm font-medium text-primary hover:text-secondary" @click="recommencer">
				Retour au formulaire
			</button>
		</div>

		<ol v-else class="mt-4 space-y-4">
			<SectionIdentite
				:mode="mode"
				:identite="identite"
				:renouv="renouv"
				:active="step === 'identite'"
				:done="step !== 'identite'"
				:busy="busy"
				:candidats="candidats"
				:membre-label="membreLabel"
				:renouv-etat="renouvEtat"
				:renouv-prefs="renouvPrefs"
				@submit="submitIdentite"
				@choisir="choisirCandidat"
				@confirmer-renouvellement="confirmerRenouvellement"
				@reprendre-identite="reprendreIdentite"
				@submit-contact="submitContact"
			/>

			<SectionCotisation
				v-if="step !== 'identite' && !cotisationSkipped"
				:options="cotisations"
				v-model="cotisationId"
				:active="step === 'cotisation'"
				:done="step === 'membres' || step === 'activite' || step === 'recap'"
				:busy="busy"
				:membre-label="membreLabel"
				:genre="membreGenre"
				@submit="submitCotisation"
			/>

			<SectionMembres
				v-if="step === 'membres' || (cotisationChoisie?.multiple && (step === 'activite' || step === 'recap'))"
				ref="sectionMembresRef"
				:groupe="groupe"
				:resultats="resultatsRecherche"
				:active="step === 'membres'"
				:done="step === 'activite' || step === 'recap'"
				:busy="busy"
				@ajouter="ajouterCoMembre"
				@rattacher="rattacherExistant"
				@retirer="retirerMembre"
				@rechercher="rechercherMembres"
				@continuer="chargerActivites"
			/>

			<SectionActivite
				v-if="step === 'activite' || step === 'recap'"
				:options="activites"
				:membres="membresPourActivite"
				:inscriptions="inscriptions"
				:active="step === 'activite'"
				:done="step === 'recap'"
				:busy="busy"
				@ajouter="ajouterInscription"
				@submit="finaliserActivites"
				@passer="sauterActivite"
			/>

			<SectionRecap
				v-if="step === 'recap'"
				:membre-label="membreLabel"
				:cotisation="cotisationChoisie"
				:adhesion-deja-a-jour="cotisationSkipped"
				:inscriptions="inscriptions"
				:montant-total="montantTotal"
				:bulletin-href="bulletinHref"
				:relais-adhesion="relaisAdhesion"
				@recommencer="recommencer"
			/>
		</ol>

		<p v-if="error" class="mt-6 alerte-erreur" role="alert">
			{{ error }}
		</p>

		<div v-if="step !== 'recap' && step !== 'contact-ok'" class="mt-6 text-center">
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
