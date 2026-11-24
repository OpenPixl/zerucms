<script setup lang="ts">
/**
 * Module « Site » (bureau, menu « Paramètres ») : réglages techniques du
 * site en ligne. Pour l'instant, le **mode maintenance** : état (en ligne,
 * maintenance manuelle, restauration en cours avec sa progression), mise
 * en maintenance avec un message libre, levée. Les membres connectés
 * continuent de voir le site. Serveur : route `/api/admin/maintenance`,
 * logique `scripts/maintenance.mjs` (aucune reconstruction du site).
 * Deux onglets (`FormTabs`) : Maintenance et E-mails (**compte e-mail** du site (envoi d'e-mails : serveur SMTP,
 * identifiants masqués, vérification, e-mail de test) : `ConnexionPlugin.vue`
 * avec `emailApi`, route `/api/admin/email`, logique `src/lib/email.ts`).
 */
import { computed, inject, onMounted, ref } from 'vue';
import { ApiError, emailApi, installationApi, maintenanceApi, type MaintenanceEtat } from '../client';
import ConnexionPlugin from './plugins/ConnexionPlugin.vue';
import FormTabs from '../FormTabs.vue';

const TABS = [
	{ id: 'maintenance', label: 'Maintenance', icon: 'fa-screwdriver-wrench' },
	{ id: 'email', label: 'E-mails', icon: 'fa-envelope' },
] as const;
const tab = ref<(typeof TABS)[number]['id']>('maintenance');
import { ADMIN_CONTEXT, inputClass } from '../context';
import { enMaintenance } from '../maintenance';

const { user, sessionExpired } = inject(ADMIN_CONTEXT)!;

/** Super admin, site pas encore installé : lien vers l'assistant. */
const installationRequise = ref(false);
onMounted(async () => {
	if (!user.value?.groups.includes('superadmin')) return;
	installationRequise.value = await installationApi.requise().then((r) => r.requise).catch(() => false);
});
const reprendreInstallation = () => window.dispatchEvent(new Event('numerik:installation'));

const etat = ref<MaintenanceEtat | null>(null);
const message = ref('');
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const notice = ref('');
/** Confirmation de la levée d'une maintenance de restauration. */
const confirmerLevee = ref(false);

const maintenance = computed(() => etat.value?.maintenance ?? null);
const restauration = computed(() => Boolean(maintenance.value && !maintenance.value.manuel));
const manuelle = computed(() => Boolean(maintenance.value?.manuel));
const messageModifie = computed(() => manuelle.value && message.value.trim() !== (maintenance.value?.message ?? ''));
const apercu = computed(() => `/__maintenance/apercu?message=${encodeURIComponent(message.value.trim())}`);

function appliquer(e: MaintenanceEtat) {
	etat.value = e;
	message.value = e.maintenance?.manuel ? e.maintenance.message : message.value;
	enMaintenance.value = Boolean(e.maintenance);
	confirmerLevee.value = false;
}

async function act(action: () => Promise<MaintenanceEtat>, succes = '') {
	error.value = '';
	notice.value = '';
	busy.value = true;
	try {
		appliquer(await action());
		notice.value = succes;
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		busy.value = false;
		loading.value = false;
	}
}

const charger = () => act(() => maintenanceApi.get());
function activer() {
	if (manuelle.value && !messageModifie.value) {
		notice.value = '';
		error.value = 'Aucune modification à enregistrer.';
		return;
	}
	void act(
		() => maintenanceApi.activer(message.value),
		manuelle.value ? 'Message enregistré.' : 'Le site est en maintenance. Vous, connecté·e, continuez de le voir normalement.',
	);
}
const lever = () => act(() => maintenanceApi.lever(restauration.value), 'Le site est de nouveau en ligne pour tout le monde.');

onMounted(charger);

/** E-mail de test : destinataire (par défaut, l'adresse du compte connecté). */
const testA = ref(user.value?.email ?? '');
const testBusy = ref(false);
const testErreur = ref('');
const testSucces = ref('');
async function envoyerTest() {
	testErreur.value = testSucces.value = '';
	testBusy.value = true;
	try {
		await emailApi.tester(testA.value.trim());
		testSucces.value = `E-mail envoyé à ${testA.value.trim()} : vérifiez la boîte de réception (et les indésirables).`;
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		testErreur.value = (e as Error).message;
	} finally {
		testBusy.value = false;
	}
}

const dateFr = (iso: string) =>
	new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
</script>

<template>
	<div v-if="installationRequise" class="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700" role="status">
		<span class="flex-1">L'installation du site n'est pas terminée.</span>
		<button type="button" class="bouton bouton-primaire" @click="reprendreInstallation">
			<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>Assistant d'installation
		</button>
	</div>

	<FormTabs v-model="tab" :tabs="TABS" prefix="site" />

	<section v-show="tab === 'maintenance'" id="site-panel-maintenance" role="tabpanel" aria-labelledby="site-tab-maintenance">
		<p class="mb-4 text-sm font-light text-gray-600">
			Les visiteurs voient une page « Site en maintenance » avec votre message ; une fois connecté·e, vous voyez le site
			normalement.
		</p>

		<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>
		<p v-if="notice" class="mb-4 alerte-succes" role="status">{{ notice }}</p>

		<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>
		<template v-else-if="etat">
			<!-- État -->
			<div
				class="mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
				:class="
					restauration
						? 'border-amber-200 bg-amber-50 text-amber-900'
						: manuelle
							? 'border-red-200 bg-red-50 text-red-900'
							: 'border-green-200 bg-green-50 text-green-900'
				"
				role="status"
			>
				<i
					class="fa-solid mt-0.5"
					:class="restauration ? 'fa-spinner fa-spin' : manuelle ? 'fa-screwdriver-wrench' : 'fa-circle-check'"
					aria-hidden="true"
				></i>
				<div class="min-w-0 flex-1">
					<template v-if="restauration && maintenance">
						<p class="font-semibold">{{ maintenance.motif }}</p>
						<p>{{ maintenance.etape }} ({{ maintenance.progression }} %)</p>
						<div class="mt-2 h-2 overflow-hidden rounded-full bg-amber-200" role="progressbar" :aria-valuenow="maintenance.progression" aria-valuemin="0" aria-valuemax="100">
							<div class="h-full rounded-full bg-amber-500" :style="{ width: `${maintenance.progression}%` }"></div>
						</div>
						<p class="mt-2 text-xs">Depuis {{ dateFr(maintenance.debut) }}. La maintenance prend fin avec la restauration.</p>
					</template>
					<template v-else-if="manuelle && maintenance">
						<p class="font-semibold">Le site est en maintenance.</p>
						<p class="text-xs">
							Depuis {{ dateFr(maintenance.debut) }}<template v-if="maintenance.par">, par {{ maintenance.par }}</template>. Les
							visiteurs voient la page de maintenance ; elle reste en place après une publication ou un redémarrage du serveur.
						</p>
					</template>
					<p v-else class="font-semibold">Le site est en ligne.</p>
				</div>
				<button type="button" class="shrink-0 text-xs underline hover:no-underline" :disabled="busy" @click="charger">Actualiser</button>
			</div>

			<!-- Restauration en cours : levée forcée seulement -->
			<div v-if="restauration">
				<button v-if="!confirmerLevee" type="button" class="bouton bouton-danger-contour" :disabled="busy" @click="confirmerLevee = true">
					Lever la maintenance quand même
				</button>
				<div v-else class="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700" role="alert">
					<p>
						Les visiteurs reverront l'ancien site jusqu'à la fin de la restauration. À utiliser seulement si elle semble bloquée.
					</p>
					<div class="mt-3 flex flex-wrap gap-3">
						<button type="button" class="bouton bouton-danger" :disabled="busy" @click="lever">Lever la maintenance</button>
						<button type="button" class="text-sm text-gray-700 hover:underline" @click="confirmerLevee = false">Annuler</button>
					</div>
				</div>
			</div>

			<!-- Maintenance manuelle -->
			<form v-else @submit.prevent="activer">
				<label for="site-maintenance-message" class="champ-libelle">
					Message affiché aux visiteurs <span class="font-light text-gray-500">(facultatif)</span>
				</label>
				<textarea
					id="site-maintenance-message"
					v-model="message"
					rows="6"
					maxlength="500"
					:placeholder="etat.messageParDefaut"
					:class="inputClass"
				></textarea>
				<p class="champ-aide">
					Vide : « {{ etat.messageParDefaut }} »
					· <a :href="apercu" target="_blank" rel="noopener" class="text-primary underline hover:no-underline">Aperçu de la page</a>
				</p>
				<div class="mt-4 flex flex-wrap gap-3">
					<template v-if="manuelle">
						<button type="button" class="bouton bouton-primaire" :disabled="busy" @click="lever">
							<i class="fa-solid fa-circle-check mr-1.5" aria-hidden="true"></i>Remettre le site en ligne
						</button>
						<button type="submit" class="bouton bouton-contour" :disabled="busy">Enregistrer le message</button>
					</template>
					<button v-else type="submit" class="bouton bouton-danger" :disabled="busy">
						<i class="fa-solid fa-screwdriver-wrench mr-1.5" aria-hidden="true"></i>Mettre le site en maintenance
					</button>
				</div>
			</form>
		</template>
	</section>

	<section v-show="tab === 'email'" id="site-panel-email" role="tabpanel" aria-labelledby="site-tab-email">
		<p class="mb-4 text-sm font-light text-gray-600">
			Le compte e-mail avec lequel le site envoie ses messages. Ces informations sont fournies par votre messagerie
			(hébergeur, Gmail, Outlook…).
		</p>
		<ConnexionPlugin plugin="email" titre="Compte e-mail" :api="emailApi" @session-expiree="sessionExpired" />

		<form class="mt-4 rounded-xl border border-gray-200 p-4" @submit.prevent="envoyerTest">
			<label for="site-email-test" class="champ-libelle">Envoyer un e-mail de test à</label>
			<div class="mt-1 flex flex-wrap gap-2">
				<input
					id="site-email-test"
					v-model="testA"
					type="email"
					required
					autocomplete="email"
					placeholder="vous@exemple.fr"
					:class="[inputClass, 'min-w-0 flex-1']"
				/>
				<button type="submit" class="bouton bouton-contour" :disabled="testBusy">
					<i class="fa-solid" :class="testBusy ? 'fa-spinner fa-spin' : 'fa-paper-plane'" aria-hidden="true"></i>Envoyer
				</button>
			</div>
			<p v-if="testErreur" class="mt-3 alerte-erreur" role="alert">{{ testErreur }}</p>
			<p v-if="testSucces" class="mt-3 alerte-succes" role="status">{{ testSucces }}</p>
		</form>
	</section>
</template>
