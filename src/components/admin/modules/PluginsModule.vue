<script setup lang="ts">
/**
 * Module « Plugins » (groupe `superadmin` seul) : volets activables du site
 * (catalogue `src/plugins/catalogue.ts`). Liste (icône, nom, **interrupteur
 * d'activation** — enregistré et publié aussitôt, confirmation si d'autres
 * plugins en dépendent —, bouton « paramètres ») → page de configuration du
 * plugin : description, prérequis, interrupteurs de ses outils (`outils`
 * du catalogue : `outils.<id>.<outil>` de `reglages.yaml`), réglages
 * (`reglages.champs` du catalogue, par rubrique), et une seule paire de
 * boutons d'enregistrement en bas. Outils (« Réseaux » pour la diffusion :
 * `outilsTitre`) : interrupteur, icône + nom. Un outil qui a des champs de
 * connexion (`outil` des champs) est un **connecteur** : absent de la liste
 * tant que sa connexion n'est pas renseignée, ajouté par le bouton « + »
 * (menu des connecteurs disponibles) qui ouvre une modale de saisie ; sa
 * roue crantée rouvre cette modale. Connexion (`connexion` du catalogue,
 * `ConnexionPlugin.vue`) : enregistrée à part, sans reconstruction ; champs
 * communs au plugin dans la page.
 * Enregistrer écrit `plugins.<id>` de `reglages.yaml` et les réglages dans
 * le fichier du plugin, puis reconstruit le site (suivi par
 * `usePublication`), ou rejoint les modifications en attente. Un plugin dont
 * un fichier requis manque ne peut être ni activé ni réglé.
 *
 * `genre="extension"` = module « Extensions » (extensions installées dans
 * `extensions/`, src/lib/extensions.ts) : même page de configuration
 * (`extensions.<id>: false` = désactivée), plus le dépôt d'une archive .zip
 * (installation ou mise à jour), la suppression et les dossiers invalides.
 */
import { computed, inject, onMounted, ref } from 'vue';
import AdminOverlay from '../AdminOverlay.vue';
import Encadre from '../Encadre.vue';
import FormHeader from '../FormHeader.vue';
import Interrupteur from '../Interrupteur.vue';
import PublishButtons from '../PublishButtons.vue';
import PublishStatus from '../PublishStatus.vue';
import ConnexionPlugin from './plugins/ConnexionPlugin.vue';
import { ApiError, extensionsApi, pluginsApi, type ConnexionEtat, type PluginChamp, type PluginItem } from '../client';
import { ADMIN_CONTEXT, iconButtonClass, inputClass, rememberOpenModule, takeModuleToReopen } from '../context';
import { isDeferredSubmit } from '../lot';
import { usePublication } from '../usePublication';
import { normaliserChamp } from '../../../plugins/champs';
import { PLUGINS, type PluginInfo } from '../../../plugins/catalogue';

const props = withDefaults(defineProps<{ genre?: 'plugin' | 'extension' }>(), { genre: 'plugin' });
const ext = props.genre === 'extension';
/** Vocabulaire du module. */
const mot = ext
	? { un: 'Extension', le: "l'extension", tous: 'Toutes les extensions', actif: 'Extension active', propre: "propre à l'extension", module: 'extensions' }
	: { un: 'Plugin', le: 'le plugin', tous: 'Tous les plugins', actif: 'Plugin actif', propre: 'propre au plugin', module: 'plugins' };

const { sessionExpired } = inject(ADMIN_CONTEXT)!;

const plugins = ref<PluginItem[]>([]);
/** Extensions : dossiers invalides de `extensions/`, version du CMS en place. */
const invalides = ref<{ id: string; erreurs: string[] }[]>([]);
const versionCms = ref('');
/** Suppression demandée (second clic pour confirmer). */
const suppression = ref(false);
const fichier = ref<HTMLInputElement | null>(null);
const availability = ref<{ ok: boolean; reason?: string }>({ ok: true });
const loading = ref(true);
const busy = ref(false);
const error = ref('');
/** Plugin dont la page de configuration est ouverte (`null` = liste). */
const ouvertId = ref<string | null>(null);
const ouvert = computed(() => plugins.value.find((p) => p.id === ouvertId.value) ?? null);
/** Connecteur dont la modale de connexion est ouverte (« + » ou roue crantée). */
const outilOuvertId = ref<string | null>(null);
/** Menu « + » des connecteurs à ajouter, déroulé. */
const menuAjout = ref(false);
/** État de la connexion du plugin ouvert (connecteurs renseignés ou non). */
const connexionEtat = ref<ConnexionEtat | null>(null);
/** Liste : plugin dont l'activation est en cours d'envoi, désactivation à confirmer. */
const basculeId = ref<string | null>(null);
const aConfirmer = ref<string | null>(null);
const outilOuvert = computed(() => ouvert.value?.outils.find((o) => o.id === outilOuvertId.value) ?? null);

/** Fiche du catalogue (plugins seulement). */
const infoOuvert = computed(() => (ouvert.value && !ext ? (PLUGINS as Record<string, PluginInfo>)[ouvert.value.id] : undefined));
/** Outils qui ont des réglages de connexion (`outil` des champs) : roue crantée. */
const outilsReglables = computed(() => new Set((infoOuvert.value?.connexion?.champs ?? []).map((c) => c.outil).filter(Boolean)));
/** Connecteur renseigné : au moins un de ses champs de connexion enregistré. */
const configure = (outil: string) => !!connexionEtat.value?.champs.some((c) => c.outil === outil && c.renseigne);
/** Outils affichés : tous, sauf les connecteurs pas encore configurés. */
const outilsAffiches = computed(() => (ouvert.value?.outils ?? []).filter((o) => !outilsReglables.value.has(o.id) || configure(o.id)));
/** Sous-titre de l'encadré des outils : connecteurs configurés, ou outils allumés. */
const sousTitreOutils = computed(() => {
	if (!ouvert.value) return '';
	if (outilsReglables.value.size) {
		const n = outilsAffiches.value.filter((o) => outilsReglables.value.has(o.id)).length;
		return !connexionEtat.value ? 'chargement…' : n ? `${n} connecté${n > 1 ? 's' : ''}` : 'aucun connecté : bouton + pour en ajouter';
	}
	const allumes = ouvert.value.outils.filter((o) => outils.value[o.id]).length;
	return `${allumes} sur ${ouvert.value.outils.length} allumé${allumes > 1 ? 's' : ''}`;
});
/** Connecteurs proposés par le bouton « + ». */
const connecteursAAjouter = computed(() =>
	connexionEtat.value ? (ouvert.value?.outils ?? []).filter((o) => outilsReglables.value.has(o.id) && !configure(o.id)) : [],
);

function ouvrirConnecteur(id: string) {
	menuAjout.value = false;
	outilOuvertId.value = id;
}

async function chargerConnexion(id: string) {
	connexionEtat.value = null;
	try {
		const e = await pluginsApi.connexion(id);
		if (ouvertId.value === id) connexionEtat.value = e;
	} catch (e) {
		fail(e);
	}
}

/** Champs de connexion communs au plugin (sans outil) : rubrique « Connexion » dans la page. */
const connexionCommune = computed(() => (infoOuvert.value?.connexion?.champs ?? []).some((c) => !c.outil));

/** Icône Font Awesome : style plein, sauf une marque (`fa-brands fa-…`). */
const icone = (icon: string) => (icon.includes('fa-brands') ? icon : `fa-solid ${icon}`);

/** Saisie en cours de la page de configuration. */
const valeurs = ref<Record<string, string>>({});
const outils = ref<Record<string, boolean>>({});

function ouvrir(p: PluginItem) {
	const autre = ouvertId.value !== p.id;
	if (autre) outilOuvertId.value = null;
	ouvertId.value = p.id;
	menuAjout.value = false;
	if (autre && p.connexion && !ext) void chargerConnexion(p.id);
	valeurs.value = Object.fromEntries(p.champs.map((c) => [c.cle, c.valeur]));
	outils.value = Object.fromEntries(p.outils.map((o) => [o.id, o.actif]));
	error.value = '';
	suppression.value = false;
}

function fermer() {
	ouvertId.value = null;
	outilOuvertId.value = null;
	connexionEtat.value = null;
	menuAjout.value = false;
	error.value = '';
}

/** Aide de la rubrique « Connexion » (catalogue, lu dans le navigateur). */
const connexionAide = computed(() => infoOuvert.value?.connexion?.aide);

/** Réglages regroupés par rubrique, dans l'ordre du catalogue. */
const groupes = computed(() => {
	const map = new Map<string, PluginChamp[]>();
	for (const c of ouvert.value?.champs ?? []) {
		if (!map.has(c.groupe)) map.set(c.groupe, []);
		map.get(c.groupe)!.push(c);
	}
	return [...map];
});

const modifie = computed(
	() =>
		!!ouvert.value &&
		(ouvert.value.outils.some((o) => outils.value[o.id] !== o.actif) ||
			ouvert.value.champs.some((c) => (valeurs.value[c.cle] ?? '').trim() !== c.valeur)),
);

/** Réglages obligatoires encore vides (cf. `avertissements`) : marqués d'un astérisque. */
const aRenseigner = computed(() => new Set((ouvert.value?.avertissements ?? []).map((a) => a.nom)));

/** Texte de repli affiché dans un champ vide. */
function repli(c: PluginChamp): string {
	if (c.source === 'env') return `${c.repli} (réglé sur le serveur)`;
	if (c.source === 'defaut') return `${c.repli} (par défaut)`;
	return aRenseigner.value.has(c.label) ? 'À renseigner' : '';
}

/** État affiché : celui des sources, ou le changement pas encore en ligne. */
function etat(p: PluginItem): { texte: string; classe: string } {
	if (p.actif !== p.enLigne) {
		return { texte: p.actif ? 'Activation en attente' : 'Désactivation en attente', classe: 'bg-amber-100 text-amber-800' };
	}
	return p.actif ? { texte: 'Actif', classe: 'bg-green-100 text-green-800' } : { texte: 'Inactif', classe: 'bg-gray-100 text-gray-600' };
}

function fail(e: unknown) {
	takeModuleToReopen();
	if (e instanceof ApiError && e.status === 401) return sessionExpired();
	error.value = (e as Error).message;
}

async function load() {
	try {
		if (ext) {
			const res = await extensionsApi.list();
			plugins.value = res.extensions;
			invalides.value = res.invalides;
			versionCms.value = res.versionCms;
			availability.value = res.availability;
			receive(res.status);
			if (ouvert.value) ouvrir(ouvert.value);
			else if (ouvertId.value) fermer(); // supprimée
			return;
		}
		const res = await pluginsApi.list();
		plugins.value = res.plugins;
		availability.value = res.availability;
		receive(res.status);
		if (ouvert.value) ouvrir(ouvert.value);
	} catch (e) {
		fail(e);
	} finally {
		loading.value = false;
	}
}

const { status, following, receive, afterSave, publishLot, savedLabel, dismiss: dismissStatus, reloadIn, cancelReload } = usePublication({
	module: mot.module,
	onSettled: load,
	onError: fail,
});
const locked = computed(() => !availability.value.ok || following.value);

async function submit(plugin: PluginItem, event: Event) {
	if (!modifie.value) return void (error.value = 'Aucune modification à enregistrer.');
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule(mot.module);
		const options = { deferred: isDeferredSubmit(event) };
		const result = ext
			? await extensionsApi.update(plugin.id, plugin.actif, valeurs.value, options)
			: await pluginsApi.update(plugin.id, plugin.actif, valeurs.value, options, outils.value);
		afterSave(`${mot.un} « ${plugin.label} »`, result);
		if (result.deferred) await load();
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
	}
}

/** Activation impossible (fichier requis absent, plugin requis inactif). */
const activationBloquee = (p: PluginItem) => !p.actif && (p.manquants.length > 0 || p.requisInactifs.length > 0);

/** Interrupteur de la liste : activation / désactivation enregistrée et publiée aussitôt. */
async function basculer(p: PluginItem, voulu: boolean) {
	if (!voulu && p.dependants.length && aConfirmer.value !== p.id) return void (aConfirmer.value = p.id);
	aConfirmer.value = null;
	error.value = '';
	basculeId.value = p.id;
	try {
		rememberOpenModule(mot.module);
		const result = ext ? await extensionsApi.update(p.id, voulu, {}) : await pluginsApi.update(p.id, voulu, {});
		afterSave(`${mot.un} « ${p.label} » ${voulu ? 'activé' : 'désactivé'}${ext ? 'e' : ''}`, result);
		if (result.deferred) await load();
	} catch (e) {
		fail(e);
	} finally {
		basculeId.value = null;
	}
}

/** Extensions : archive .zip choisie → installée (ou mise à jour), puis site reconstruit. */
async function installer() {
	const file = fichier.value?.files?.[0];
	if (!file) return;
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule(mot.module);
		afterSave(`Installation de ${file.name}`, await extensionsApi.install(file));
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
		if (fichier.value) fichier.value.value = '';
	}
}

async function supprimer(p: PluginItem) {
	if (!suppression.value) return void (suppression.value = true);
	error.value = '';
	busy.value = true;
	try {
		rememberOpenModule(mot.module);
		afterSave(`Suppression de l'extension « ${p.label} »`, await extensionsApi.remove(p.id));
		fermer();
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
		suppression.value = false;
	}
}

onMounted(load);
</script>

<template>
	<PublishStatus
		:status="status"
		:following="following"
		:reload-in="reloadIn"
		:saved-label="savedLabel"
		:locked="locked"
		@dismiss="dismissStatus"
		@cancel-reload="cancelReload"
		@publish-lot="publishLot"
	/>
	<p v-if="!availability.ok" class="mb-4 text-sm text-gray-500">
		<i class="fa-solid fa-lock mr-1" aria-hidden="true"></i>{{ availability.reason }}
	</p>

	<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>

	<!-- Page de configuration d'un plugin : un seul formulaire -->

	<form v-else-if="ouvert" @submit.prevent="submit(ouvert, $event)">
		<FormHeader :back="mot.tous" :title="ouvert.label" :editing="true" @back="fermer">
			<span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="etat(ouvert).classe">{{ etat(ouvert).texte }}</span>
		</FormHeader>

		<div class="space-y-4">
			<p class="text-sm font-light text-gray-600">{{ ouvert.description }}</p>
			<p v-if="ouvert.version" class="text-xs text-gray-500">
				Version {{ ouvert.version }}<template v-if="ouvert.auteur"> · {{ ouvert.auteur }}</template>
			</p>

			<p v-if="ouvert.requisInactifs.length" class="alerte-erreur">
				<i class="fa-solid fa-circle-xmark mr-1" aria-hidden="true"></i>
				À activer d'abord : « {{ ouvert.requisInactifs.map((r) => r.label).join(' », « ') }} ».
			</p>
			<ul v-if="ouvert.manquants.length" class="space-y-1 alerte-erreur">
				<li v-for="m in ouvert.manquants" :key="m.fichier">
					<i class="fa-solid fa-circle-xmark mr-1" aria-hidden="true"></i>
					Fichier de réglages manquant : {{ m.aide }}
				</li>
			</ul>

			<Encadre
				v-if="ouvert.outils.length"
				:icone="outilsReglables.size ? 'fa-share-nodes' : 'fa-toolbox'"
				:titre="infoOuvert?.outilsTitre ?? 'Outils'"
				:sous-titre="sousTitreOutils"
				:repliable="!outilsReglables.size"
			>
				<template v-if="connecteursAAjouter.length" #actions>
					<div class="relative shrink-0">
						<button
							type="button"
							:class="[iconButtonClass, 'text-primary']"
							:aria-expanded="menuAjout"
							aria-haspopup="menu"
							:aria-label="`Ajouter : ${infoOuvert?.outilsTitre ?? 'outil'}`"
							title="Ajouter"
							@click="menuAjout = !menuAjout"
						>
							<i class="fa-solid fa-plus" aria-hidden="true"></i>
						</button>
						<ul
							v-if="menuAjout"
							role="menu"
							class="absolute right-0 z-10 mt-1 min-w-48 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
						>
							<li v-for="o in connecteursAAjouter" :key="o.id" role="none">
								<button
									type="button"
									role="menuitem"
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
									@click="ouvrirConnecteur(o.id)"
								>
									<i class="w-4 text-center text-primary" :class="icone(o.icon)" aria-hidden="true"></i>{{ o.label }}
								</button>
							</li>
						</ul>
					</div>
				</template>
				<div class="space-y-3 p-4">
					<p class="text-xs text-gray-500">
						{{ infoOuvert?.outilsAide ?? 'Un outil éteint n’apparaît plus sur le site ; ses données sont gardées.' }}
					</p>
					<p v-if="!outilsAffiches.length" class="text-sm font-light text-gray-500">
						<template v-if="!connexionEtat && outilsReglables.size">Chargement…</template>
						<template v-else>Aucun pour l'instant : ajoutez-en un avec le bouton +.</template>
					</p>
					<ul v-else class="divide-y divide-gray-100">
						<li v-for="o in outilsAffiches" :key="o.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
							<Interrupteur
								v-model="outils[o.id]"
								:labelledby="`outil-${ouvert.id}-${o.id}`"
								:disabled="locked || !ouvert.actif"
							/>
							<span class="min-w-0 flex-1 text-sm">
								<span :id="`outil-${ouvert.id}-${o.id}`" class="flex flex-wrap items-center gap-x-2 font-medium text-gray-900">
									<i class="text-primary" :class="icone(o.icon)" aria-hidden="true"></i>
									{{ o.label }}
									<span
										v-if="ouvert.actif && ouvert.enLigne && o.actif !== o.enLigne"
										class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
									>{{ o.actif ? 'Allumage en attente' : 'Extinction en attente' }}</span>
								</span>
								<span class="block text-xs text-gray-500">{{ o.description }}</span>
							</span>
							<button
								v-if="outilsReglables.has(o.id)"
								type="button"
								:class="[iconButtonClass, 'shrink-0 text-primary']"
								:aria-label="`Connexion « ${o.label} »`"
								title="Connexion"
								@click="ouvrirConnecteur(o.id)"
							>
								<i class="fa-solid fa-gear" aria-hidden="true"></i>
							</button>
						</li>
					</ul>
				</div>
			</Encadre>

			<ConnexionPlugin
				v-if="ouvert.connexion && connexionCommune"
				:key="`connexion-${ouvert.id}`"
				:plugin="ouvert.id"
				:aide="connexionAide"
				:outils="outils"
				@session-expiree="sessionExpired"
			/>

			<fieldset v-for="[groupe, champs] in groupes" :key="groupe" class="rounded-xl border border-gray-200 p-4">
				<legend class="px-1 font-heading text-sm font-semibold text-gray-900">{{ groupe }}</legend>
				<div class="space-y-4">
					<div v-for="c in champs" :key="c.cle">
						<label :for="`plugin-${ouvert.id}-${c.cle}`" class="champ-libelle">
							{{ c.label }}<span v-if="aRenseigner.has(c.label)" class="text-red-600"> *</span>
						</label>
						<input
							:id="`plugin-${ouvert.id}-${c.cle}`"
							v-model.trim="valeurs[c.cle]"
							type="text"
							@blur="valeurs[c.cle] = normaliserChamp(c.type, valeurs[c.cle])"
							spellcheck="false"
							autocomplete="off"
							:placeholder="repli(c)"
							:disabled="locked || ouvert.manquants.length > 0"
							:class="inputClass"
						/>
						<p v-if="c.aide" class="champ-aide">{{ c.aide }}</p>
					</div>
				</div>
			</fieldset>
			<p v-if="ouvert.secrets.length" class="text-xs text-gray-500">
				<i class="fa-solid fa-key mr-1" aria-hidden="true"></i>
				<template v-if="ouvert.secrets.every((s) => s.utilise)">Clé d'accès en place sur le serveur.</template>
				<template v-else>Clé d'accès manquante : à ajouter par la personne qui gère le serveur.</template>
			</p>
		</div>

		<p v-if="error" class="mt-6 alerte-erreur" role="alert">{{ error }}</p>
		<div class="mt-6 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-5">
			<PublishButtons :busy="busy" :disabled="locked || busy" />
			<button
				v-if="ext"
				type="button"
				class="bouton ml-auto"
				:class="suppression ? 'bouton-danger' : 'bouton-danger-contour'"
				:disabled="locked || busy"
				@click="supprimer(ouvert)"
			>
				<i class="fa-solid fa-trash" aria-hidden="true"></i>{{ suppression ? 'Confirmer la suppression' : "Supprimer l'extension" }}
			</button>
		</div>
		<p v-if="ext && suppression" class="mt-2 text-xs text-gray-500">L'extension est retirée du site ; ses réglages et ses données sont gardés.</p>
	</form>


	<!-- Catalogue -->
	<template v-else>
		<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>
		<template v-if="ext">
			<p class="mb-4 text-sm font-light text-gray-600">
				Fonctions faites sur mesure pour votre structure. Déposez l'archive .zip reçue pour installer une extension ou la
				mettre à jour.
			</p>
			<div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-gray-300 p-4">
				<label class="bouton bouton-primaire" :class="{ 'pointer-events-none opacity-60': locked || busy }">
					<i class="fa-solid" :class="busy ? 'fa-spinner fa-spin' : 'fa-file-zipper'" aria-hidden="true"></i>
					Installer une extension (.zip)
					<input ref="fichier" type="file" accept=".zip,application/zip" class="sr-only" :disabled="locked || busy" @change="installer" />
				</label>
				<span class="text-xs text-gray-500">Le site est republié après l'installation.</span>
			</div>
			<ul v-if="invalides.length" class="mb-4 space-y-1 alerte-erreur">
				<li v-for="i in invalides" :key="i.id">
					<i class="fa-solid fa-circle-xmark mr-1" aria-hidden="true"></i>
					« {{ i.id }} » ne peut pas être utilisée : {{ i.erreurs.join(' ') }}
				</li>
			</ul>
			<p v-if="!plugins.length" class="text-sm font-light text-gray-500">Aucune extension installée.</p>
		</template>
		<ul v-if="plugins.length" class="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
			<li v-for="p in plugins" :key="p.id" class="px-4 py-3">
				<div class="flex items-center gap-3">
					<Interrupteur
						:model-value="p.actif"
						:labelledby="`volet-${p.id}`"
						:disabled="locked || busy || basculeId !== null || activationBloquee(p)"
						@update:model-value="basculer(p, $event)"
					/>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
						<i :class="icone(p.icon)" aria-hidden="true"></i>
					</span>
					<span :id="`volet-${p.id}`" class="min-w-0 flex-1 font-heading text-sm text-gray-900">
						{{ p.label }}<span v-if="p.version" class="ml-1.5 text-xs font-light text-gray-500">{{ p.version }}</span>
					</span>
					<i v-if="basculeId === p.id" class="fa-solid fa-spinner fa-spin text-gray-400" aria-hidden="true"></i>
					<span
						v-else-if="p.actif !== p.enLigne"
						class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
						:class="etat(p).classe"
					>{{ etat(p).texte }}</span>
					<button
						type="button"
						:class="[iconButtonClass, 'text-primary']"
						:aria-label="`Configurer « ${p.label} »`"
						title="Configurer"
						@click="ouvrir(p)"
					>
						<i class="fa-solid fa-gear" aria-hidden="true"></i>
					</button>
				</div>
				<p v-if="activationBloquee(p)" class="mt-1 pl-10 text-xs text-gray-500">
					<i class="fa-solid fa-lock mr-1" aria-hidden="true"></i>
					<template v-if="p.requisInactifs.length">Activez d'abord « {{ p.requisInactifs.map((r) => r.label).join(' », « ') }} ».</template>
					<template v-else>À configurer avant de l'activer.</template>
				</p>
				<div v-if="aConfirmer === p.id" class="mt-2 flex flex-wrap items-center gap-2 pl-10 text-xs text-gray-600">
					<span class="flex-1">Cela désactive aussi : {{ p.dependants.map((d) => d.label).join(', ') }}.</span>
					<button type="button" class="bouton bouton-mini bouton-danger" :disabled="locked || busy" @click="basculer(p, false)">Désactiver</button>
					<button type="button" class="bouton bouton-mini bouton-neutre" @click="aConfirmer = null">Annuler</button>
				</div>
			</li>
		</ul>
	</template>

	<!-- Connexion d'un connecteur (réseau…) : modale ouverte par « + » ou la roue crantée -->
	<AdminOverlay
		v-if="ouvert && outilOuvert"
		:title="`Connexion — ${outilOuvert.label}`"
		variant="modal"
		wide
		@close="outilOuvertId = null"
	>
		<div class="space-y-4">
			<p class="flex items-start gap-2 text-sm font-light text-gray-600">
				<i class="mt-0.5 text-lg text-primary" :class="icone(outilOuvert.icon)" aria-hidden="true"></i>
				<span>{{ outilOuvert.description }}</span>
			</p>
			<ConnexionPlugin
				:key="`connexion-${ouvert.id}-${outilOuvert.id}`"
				:plugin="ouvert.id"
				:outil="outilOuvert.id"
				:aide="connexionAide"
				:outils="outils"
				@change="connexionEtat = $event"
				@session-expiree="sessionExpired"
			/>
			<button type="button" class="bouton bouton-neutre w-full" @click="outilOuvertId = null">Fermer</button>
		</div>
	</AdminOverlay>
</template>
