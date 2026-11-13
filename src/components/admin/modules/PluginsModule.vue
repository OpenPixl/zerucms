<script setup lang="ts">
/**
 * Module « Plugins » (groupe `superadmin` seul) : volets activables du site
 * (catalogue `src/plugins/catalogue.ts`). Liste (icône, nom, état, bouton
 * « paramètres ») → page de configuration du plugin : description,
 * prérequis, réglages (`reglages.champs` du catalogue, par rubrique), case
 * « plugin actif », et une seule paire de boutons d'enregistrement en bas.
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
import FormHeader from '../FormHeader.vue';
import PublishButtons from '../PublishButtons.vue';
import PublishStatus from '../PublishStatus.vue';
import { ApiError, extensionsApi, pluginsApi, type PluginChamp, type PluginItem } from '../client';
import { ADMIN_CONTEXT, iconButtonClass, inputClass, rememberOpenModule, takeModuleToReopen } from '../context';
import { isDeferredSubmit } from '../lot';
import { usePublication } from '../usePublication';
import { normaliserChamp } from '../../../plugins/champs';

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

/** Saisie en cours de la page de configuration. */
const actif = ref(false);
const valeurs = ref<Record<string, string>>({});

function ouvrir(p: PluginItem) {
	ouvertId.value = p.id;
	actif.value = p.actif;
	valeurs.value = Object.fromEntries(p.champs.map((c) => [c.cle, c.valeur]));
	error.value = '';
	suppression.value = false;
}

function fermer() {
	ouvertId.value = null;
	error.value = '';
}

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
	() => !!ouvert.value && (actif.value !== ouvert.value.actif || ouvert.value.champs.some((c) => (valeurs.value[c.cle] ?? '').trim() !== c.valeur)),
);

/** Texte de repli affiché dans un champ vide. */
function repli(c: PluginChamp): string {
	if (c.source === 'env') return `${c.repli} (valeur du .env, ${c.env})`;
	if (c.source === 'defaut') return `${c.repli} (par défaut)`;
	return c.env ? `vide : à renseigner ici ou dans le .env (${c.env})` : '';
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
		const result = await (ext ? extensionsApi : pluginsApi).update(plugin.id, actif.value, valeurs.value, { deferred: isDeferredSubmit(event) });
		afterSave(`${mot.un} « ${plugin.label} »`, result);
		if (result.deferred) await load();
	} catch (e) {
		fail(e);
	} finally {
		busy.value = false;
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
	<p v-if="!availability.ok" class="mb-4 alerte-attention">{{ availability.reason }}</p>

	<p v-if="loading" class="text-sm font-light text-gray-500">Chargement…</p>

	<!-- Page de configuration d'un plugin : un seul formulaire -->
	<form v-else-if="ouvert" @submit.prevent="submit(ouvert, $event)">
		<FormHeader :back="mot.tous" :title="ouvert.label" :editing="true" @back="fermer">
			<span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="etat(ouvert).classe">{{ etat(ouvert).texte }}</span>
		</FormHeader>

		<div class="space-y-4">
			<p class="text-sm font-light text-gray-600">{{ ouvert.description }}</p>
			<p class="text-xs text-gray-500">
				<template v-if="ouvert.version">Version {{ ouvert.version }}<template v-if="ouvert.auteur"> · {{ ouvert.auteur }}</template> · </template>
				Documentation : <code class="rounded bg-gray-100 px-1">{{ ouvert.doc }}</code> (identifiant
				<code class="rounded bg-gray-100 px-1">{{ ouvert.id }}</code>)
			</p>

			<p v-if="ouvert.requisInactifs.length" class="alerte-erreur">
				<i class="fa-solid fa-circle-xmark mr-1" aria-hidden="true"></i>
				Requiert le plugin « {{ ouvert.requisInactifs.map((r) => r.label).join(' », « ') }} », inactif : activez-le d'abord.
			</p>
			<ul v-if="ouvert.manquants.length" class="space-y-1 alerte-erreur">
				<li v-for="m in ouvert.manquants" :key="m.fichier">
					<i class="fa-solid fa-circle-xmark mr-1" aria-hidden="true"></i>
					<code>{{ m.fichier }}</code> absent : {{ m.aide }}
				</li>
			</ul>
			<ul v-if="ouvert.avertissements.length" class="space-y-1 alerte-attention">
				<li v-for="a in ouvert.avertissements" :key="a.nom">
					<i class="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true"></i>
					<code>{{ a.nom }}</code> : {{ a.aide }}
				</li>
			</ul>

			<label class="flex items-start gap-3 rounded-xl border border-gray-200 p-4 text-sm">
				<input
					v-model="actif"
					type="checkbox"
					class="mt-0.5 accent-primary"
					:disabled="locked || (!ouvert.actif && (ouvert.manquants.length > 0 || ouvert.requisInactifs.length > 0))"
				/>
				<span>
					<span class="block font-medium text-gray-900">{{ mot.actif }}</span>
					<span class="block text-xs text-gray-500">
						Inactif, le site n'a plus rien de {{ ext ? 'cette extension' : 'ce plugin' }} (page, encart, liens) ; ses réglages et son contenu sont gardés.
					</span>
					<span v-if="ouvert.dependants.length" class="block text-xs text-amber-800">
						Le désactiver retire aussi : {{ ouvert.dependants.map((d) => d.label).join(', ') }}.
					</span>
				</span>
			</label>

			<fieldset v-for="[groupe, champs] in groupes" :key="groupe" class="rounded-xl border border-gray-200 p-4">
				<legend class="px-1 font-heading text-sm font-semibold text-gray-900">{{ groupe }}</legend>
				<div class="space-y-4">
					<div v-for="c in champs" :key="c.cle">
						<label :for="`plugin-${ouvert.id}-${c.cle}`" class="champ-libelle">{{ c.label }}</label>
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
			<p v-if="ouvert.fichierReglages" class="text-xs text-gray-500">
				Réglages enregistrés dans <code class="rounded bg-gray-100 px-1">{{ ouvert.fichierReglages }}</code> ; un champ
				vide reprend la valeur indiquée en gris.
			</p>
			<ul v-if="ouvert.secrets.length" class="space-y-1 text-xs text-gray-500">
				<li v-for="s in ouvert.secrets" :key="s.nom">
					<i class="fa-solid fa-key mr-1" aria-hidden="true"></i>
					Clé secrète (dans le .env, jamais ici) :
					<template v-if="s.utilise === s.nom"><code class="rounded bg-gray-100 px-1">{{ s.nom }}</code>, {{ mot.propre }}.</template>
					<template v-else-if="s.utilise">
						<code class="rounded bg-gray-100 px-1">{{ s.utilise }}</code>, partagée ; ajouter
						<code class="rounded bg-gray-100 px-1">{{ s.nom }}</code> pour une clé {{ mot.propre }}.
					</template>
					<template v-else>aucune.</template>
				</li>
			</ul>
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
		<p v-if="ext && suppression" class="mt-2 text-xs text-gray-500">
			Le code de l'extension est retiré et le site reconstruit ; ses réglages
			<template v-if="ouvert.fichierReglages">(<code>{{ ouvert.fichierReglages }}</code>)</template> et ses données restent.
		</p>
	</form>

	<!-- Catalogue -->
	<template v-else>
		<p v-if="error" class="mb-4 alerte-erreur" role="alert">{{ error }}</p>
		<template v-if="ext">
			<p class="mb-4 text-sm font-light text-gray-600">
				Les extensions sont des développements propres à une structure, installés à part (dossier
				<code class="rounded bg-gray-100 px-1">extensions/</code>, conservé par les mises à jour). Une archive déjà
				installée est remplacée par la nouvelle version.
			</p>
			<div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-gray-300 p-4">
				<label class="bouton bouton-primaire" :class="{ 'pointer-events-none opacity-60': locked || busy }">
					<i class="fa-solid" :class="busy ? 'fa-spinner fa-spin' : 'fa-file-zipper'" aria-hidden="true"></i>
					Installer une extension (.zip)
					<input ref="fichier" type="file" accept=".zip,application/zip" class="sr-only" :disabled="locked || busy" @change="installer" />
				</label>
				<span class="text-xs text-gray-500">CMS {{ versionCms }} · le site est reconstruit après l'installation.</span>
			</div>
			<ul v-if="invalides.length" class="mb-4 space-y-1 alerte-erreur">
				<li v-for="i in invalides" :key="i.id">
					<i class="fa-solid fa-circle-xmark mr-1" aria-hidden="true"></i>
					<code>extensions/{{ i.id }}/</code> : {{ i.erreurs.join(' ') }}
				</li>
			</ul>
			<p v-if="!plugins.length" class="text-sm font-light text-gray-500">Aucune extension installée.</p>
		</template>
		<ul v-if="plugins.length" class="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
			<li v-for="p in plugins" :key="p.id" class="flex items-center gap-3 px-4 py-3">
				<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<i class="fa-solid" :class="p.icon" aria-hidden="true"></i>
				</span>
				<span class="min-w-0 flex-1 font-heading text-sm text-gray-900">
					{{ p.label }}<span v-if="p.version" class="ml-1.5 text-xs font-light text-gray-500">{{ p.version }}</span>
				</span>
				<span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="etat(p).classe">{{ etat(p).texte }}</span>
				<button
					type="button"
					:class="[iconButtonClass, 'text-primary']"
					:aria-label="`Configurer « ${p.label} »`"
					title="Configurer"
					@click="ouvrir(p)"
				>
					<i class="fa-solid fa-gear" aria-hidden="true"></i>
				</button>
			</li>
		</ul>
	</template>
</template>
