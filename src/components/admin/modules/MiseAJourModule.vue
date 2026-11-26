<script setup lang="ts">
/**
 * Module « Mise à jour » (super admin seul, ouvert aussi par le badge
 * « Mise à jour X.Y.Z » de la barre) : version du site et dernière version
 * publiée, bouton « Mettre à jour » confirmé en deux clics. Le site passe en
 * maintenance (page avec barre de progression) puis redémarre sur la
 * nouvelle version ; on rejoint cette page aussitôt. Serveur : route
 * `/api/admin/mise-a-jour`, logique `src/lib/mise-a-jour.ts` (même script
 * que `./update.sh`). Docker : consigne seulement (mise à jour sur le serveur).
 */
import { computed, inject, onMounted, ref } from 'vue';
import { ApiError, miseAJourApi } from '../client';
import { ADMIN_CONTEXT, rememberOpenModule } from '../context';
import type { EtatMiseAJour } from '../../../lib/mise-a-jour';

const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const etat = ref<EtatMiseAJour | null>(null);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const confirmer = ref(false);

const disponible = computed(() => (etat.value?.version.updateAvailable ? etat.value.version.latest : null));
const dernier = computed(() => etat.value?.dernier ?? null);
const installation = computed(
	() =>
		({
			git: 'installé avec git (Node.js)',
			archive: 'installé sans git (Node.js)',
			docker: 'installé avec Docker',
			dev: 'serveur de développement',
		})[etat.value?.mode ?? 'archive'],
);

function fail(e: unknown) {
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

async function charger() {
	loading.value = true;
	error.value = '';
	try {
		etat.value = await miseAJourApi.get();
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

async function lancer() {
	if (!disponible.value) return;
	busy.value = true;
	error.value = '';
	try {
		// Module rouvert au retour du site, sur le résultat.
		rememberOpenModule('mise-a-jour');
		await miseAJourApi.lancer(disponible.value);
		// Page de maintenance (barre de progression) jusqu'au retour du site.
		window.location.assign('/');
	} catch (e) {
		fail(e);
		busy.value = false;
		confirmer.value = false;
	}
}

onMounted(charger);

const dateFr = (iso: string) =>
	new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<template>
	<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>
	<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>

	<template v-else-if="etat">
		<!-- Versions -->
		<div
			class="mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
			:class="disponible ? 'border-sky-200 bg-sky-50 text-sky-950' : 'border-green-200 bg-green-50 text-green-900'"
			role="status"
		>
			<i class="fa-solid mt-0.5" :class="disponible ? 'fa-circle-arrow-up' : 'fa-circle-check'" aria-hidden="true"></i>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">
					<template v-if="disponible">Version {{ disponible }} disponible</template>
					<template v-else>Le site est à jour</template>
				</p>
				<p>
					Site en version {{ etat.version.current }}, {{ installation }}.
					<template v-if="!etat.version.latest">Dernière version publiée inconnue (GitHub injoignable).</template>
				</p>
				<a v-if="etat.version.url && disponible" :href="etat.version.url" target="_blank" rel="noopener" class="mt-1 inline-block text-xs underline hover:no-underline">
					Voir les nouveautés de la version {{ disponible }}
				</a>
			</div>
			<button type="button" class="shrink-0 text-xs underline hover:no-underline" :disabled="busy" @click="charger">Actualiser</button>
		</div>

		<!-- Dernier résultat -->
		<div
			v-if="dernier && dernier.etat !== 'en-cours'"
			class="mb-4 text-sm"
			:class="dernier.etat === 'reussie' ? 'alerte-succes' : 'alerte-erreur'"
			role="status"
		>
			<p class="font-semibold">
				{{ dernier.etat === 'reussie' ? `Mise à jour ${dernier.depuis} → ${dernier.version} réussie` : `La mise à jour vers ${dernier.version} a échoué : le site n'a pas changé.` }}
			</p>
			<p class="text-xs">{{ dateFr(dernier.fin ?? dernier.debut) }}, par {{ dernier.par }}.</p>
			<p v-if="dernier.etat === 'echec' && dernier.message" class="mt-1 text-xs">{{ dernier.message }}</p>
			<p v-if="dernier.misDeCote?.length" class="mt-1 text-xs">
				Fichiers modifiés sur le serveur, mis de côté (rien n'est perdu, « git stash list ») :
				<code>{{ dernier.misDeCote.join(', ') }}</code>
			</p>
		</div>

		<!-- Docker : sur le serveur -->
		<div v-if="etat.mode === 'docker'" class="alerte-attention text-sm">
			Ce site tourne sous Docker : la mise à jour se fait sur le serveur, dans le dossier du site, avec
			<code>./update.sh</code>.
		</div>

		<template v-else-if="disponible">
			<p class="mb-3 text-sm font-light text-gray-600">
				Le contenu, les comptes et le journal sont sauvegardés d'abord (module « Sauvegardes »). Pendant la mise à jour, qui
				peut prendre plusieurs minutes, les visiteurs voient une page « Site en maintenance » ; le site revient tout seul
				dans sa nouvelle version. Si quelque chose échoue, il reste tel qu'il était.
			</p>
			<p v-if="etat.bloquee" class="alerte-attention text-sm">{{ etat.bloquee }}</p>
			<template v-else>
				<button v-if="!confirmer" type="button" class="bouton bouton-primaire" :disabled="busy" @click="confirmer = true">
					<i class="fa-solid fa-circle-arrow-up mr-1.5" aria-hidden="true"></i>Mettre à jour vers la version {{ disponible }}
				</button>
				<div v-else class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700" role="alert">
					<p>Le site sera en maintenance pendant quelques minutes. Lancer la mise à jour maintenant ?</p>
					<div class="mt-3 flex flex-wrap gap-3">
						<button type="button" class="bouton bouton-primaire" :disabled="busy" @click="lancer">
							{{ busy ? 'Lancement…' : `Oui, mettre à jour vers ${disponible}` }}
						</button>
						<button type="button" class="text-sm text-gray-700 hover:underline" :disabled="busy" @click="confirmer = false">Annuler</button>
					</div>
				</div>
			</template>
		</template>

		<p class="mt-4 text-xs font-light text-gray-500">
			Aussi possible sur le serveur, dans le dossier du site : <code>./update.sh</code> (même procédure).
		</p>
	</template>
</template>
