<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { membresApi } from '../../../lib/grist-asso/client';
import type { MembreRecherche, PresenceStatut, SeanceCourante } from '../../../lib/grist-asso/types';
import { presenceApi } from './client';

const STORAGE_KEY = 'numerik-presence-membre';

interface MembreChoisi {
	membreId: number;
	label: string;
}

type StatutSeance =
	| 'idle'
	| 'busy'
	| 'present'
	| 'absent'
	| 'deja-present'
	| 'deja-absent'
	| 'non-inscrit';

const membre = ref<MembreChoisi | null>(null);

try {
	const brut = localStorage.getItem(STORAGE_KEY);
	if (brut) {
		const parsed = JSON.parse(brut);
		if (typeof parsed?.membreId === 'number' && typeof parsed?.label === 'string') {
			membre.value = parsed;
		}
	}
} catch {
	// localStorage indisponible (navigation privée, etc.) : on repart sur la recherche.
}

// --- Recherche du membre (1ʳᵉ visite) ---
const recherche = ref('');
const candidats = ref<MembreRecherche[]>([]);
const rechercheEnCours = ref(false);
let debounce: ReturnType<typeof setTimeout> | undefined;

watch(recherche, (q) => {
	clearTimeout(debounce);
	const requete = q.trim();
	if (requete.length < 2) {
		candidats.value = [];
		return;
	}
	debounce = setTimeout(async () => {
		rechercheEnCours.value = true;
		try {
			candidats.value = await membresApi.rechercherMembres(requete);
		} catch {
			candidats.value = [];
		} finally {
			rechercheEnCours.value = false;
		}
	}, 300);
});

function choisirMembre(c: MembreRecherche) {
	membre.value = { membreId: c.membreId, label: `${c.prenom} ${c.nom}`.trim() };
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(membre.value));
	} catch {
		// tant pis, il faudra se resélectionner au prochain passage.
	}
	recherche.value = '';
	candidats.value = [];
}

function changerMembre() {
	membre.value = null;
	seances.value = [];
	etatSeances.value = 'attente';
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// rien à faire de plus.
	}
}

// --- Séance(s) en cours ---
const seances = ref<SeanceCourante[]>([]);
const etatSeances = ref<'attente' | 'chargement' | 'ok' | 'erreur'>('attente');
const statuts = reactive<Record<number, StatutSeance>>({});

watch(
	membre,
	async (m) => {
		if (!m) return;
		etatSeances.value = 'chargement';
		try {
			seances.value = await presenceApi.seances(m.membreId);
			for (const s of seances.value) statuts[s.activiteId] = 'idle';
			etatSeances.value = 'ok';
		} catch {
			etatSeances.value = 'erreur';
		}
	},
	{ immediate: true },
);

async function repondre(seance: SeanceCourante, statut: PresenceStatut) {
	if (!membre.value) return;
	statuts[seance.activiteId] = 'busy';
	try {
		const res = await presenceApi.inscrire({
			membreId: membre.value.membreId,
			activiteId: seance.activiteId,
			statut,
		});
		if (res.status === 'deja') {
			statuts[seance.activiteId] = statut === 'present' ? 'deja-present' : 'deja-absent';
		} else if (res.status === 'non-inscrit') {
			statuts[seance.activiteId] = 'non-inscrit';
		} else {
			statuts[seance.activiteId] = statut;
		}
	} catch {
		statuts[seance.activiteId] = 'idle';
	}
}

function message(s: SeanceCourante): string {
	switch (statuts[s.activiteId]) {
		case 'present':
			return 'Présence enregistrée, merci !';
		case 'absent':
			return 'Absence enregistrée, merci de nous avoir prévenus.';
		case 'deja-present':
			return 'Vous étiez déjà noté·e présent·e à cette séance.';
		case 'deja-absent':
			return 'Vous aviez déjà signalé votre absence à cette séance.';
		case 'non-inscrit':
			return "Vous n'êtes pas inscrit·e à cette activité — contactez l'association.";
		default:
			return '';
	}
}
</script>

<template>
	<div class="mx-auto max-w-xl px-4 py-12 sm:px-6">
		<!-- Étape 1 : identification (1ʳᵉ visite sur cet appareil) -->
		<div v-if="!membre" class="rounded-2xl border border-gray-100 bg-surface p-6 shadow-sm">
			<h2 class="font-heading text-lg text-gray-900">Qui êtes-vous ?</h2>
			<p class="mt-1 text-sm text-gray-600">
				Tapez votre nom pour vous retrouver — on s'en souviendra la prochaine fois sur cet appareil.
			</p>
			<input
				v-model="recherche"
				type="text"
				placeholder="Nom, prénom…"
				class="mt-4 champ"
			/>
			<p v-if="rechercheEnCours" class="mt-2 text-xs text-gray-400">Recherche…</p>
			<ul v-else-if="candidats.length" class="mt-3 space-y-2">
				<li v-for="c in candidats" :key="c.membreId">
					<button
						type="button"
						class="w-full rounded-lg border border-gray-200 px-4 py-2 text-left text-sm hover:border-primary"
						@click="choisirMembre(c)"
					>
						<span class="font-medium text-gray-900">{{ c.prenom }} {{ c.nom }}</span>
					</button>
				</li>
			</ul>
			<p v-else-if="recherche.trim().length >= 2" class="mt-3 text-sm text-gray-500">
				Aucun résultat. Vérifiez l'orthographe ou contactez-nous.
			</p>
		</div>

		<!-- Étape 2 : séance(s) en cours -->
		<div v-else class="rounded-2xl border border-gray-100 bg-surface p-6 shadow-sm">
			<div class="flex items-center justify-between gap-3">
				<h2 class="font-heading text-lg text-gray-900">{{ membre.label }}</h2>
				<button
					type="button"
					class="shrink-0 text-xs text-gray-500 underline hover:text-primary"
					@click="changerMembre"
				>
					Ce n'est pas moi
				</button>
			</div>

			<p v-if="etatSeances === 'chargement'" class="mt-4 text-sm text-gray-500">Chargement…</p>
			<p v-else-if="etatSeances === 'erreur'" class="mt-4 message-erreur">
				Impossible de charger le planning pour l'instant. Réessayez dans un instant.
			</p>
			<p v-else-if="!seances.length" class="mt-4 text-sm text-gray-600">Aucun atelier en ce moment.</p>
			<ul v-else class="mt-4 space-y-3">
				<li v-for="s in seances" :key="s.activiteId" class="rounded-xl border border-gray-100 p-4">
					<p class="font-heading text-sm font-semibold text-gray-900">{{ s.label }}</p>

					<div v-if="statuts[s.activiteId] === 'idle'" class="mt-3 flex flex-wrap gap-3">
						<button
							type="button"
							class="bouton bouton-accent"
							@click="repondre(s, 'present')"
						>
							Je participe
						</button>
						<button
							type="button"
							class="bouton bouton-neutre"
							@click="repondre(s, 'absent')"
						>
							Je ne pourrai pas venir
						</button>
					</div>
					<p v-else-if="statuts[s.activiteId] === 'busy'" class="mt-3 text-sm text-gray-500">Envoi…</p>
					<p
						v-else
						class="mt-3 flex items-center gap-2 text-sm"
						:class="statuts[s.activiteId] === 'non-inscrit' ? 'text-red-600' : 'text-gray-700'"
					>
						<i
							class="fa-solid"
							:class="statuts[s.activiteId] === 'non-inscrit' ? 'fa-circle-exclamation' : 'fa-circle-check text-primary'"
							aria-hidden="true"
						></i>
						{{ message(s) }}
					</p>
				</li>
			</ul>
		</div>
	</div>
</template>
