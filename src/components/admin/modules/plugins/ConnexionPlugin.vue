<script setup lang="ts">
/**
 * Rubrique « Connexion » de la page de configuration d'un plugin (module
 * « Plugins », super admin) : identifiants d'un service extérieur
 * (`connexion` du catalogue), écrits dans `<DATA_DIR>/connexions/<id>.yaml`
 * (`src/lib/connexions.ts`). Un champ masqué n'est jamais renvoyé au
 * navigateur : une fois enregistré il s'affiche « •••• » et peut seulement
 * être remplacé ou effacé. Enregistrement à part du reste de la page, sans
 * reconstruction du site, suivi d'une vérification auprès du service
 * (état, échéance du jeton : rappel de renouvellement).
 * Prop `api` : autre connexion que celle d'un plugin (ex. compte e-mail du
 * site, module « Site ») ; `titre` remplace « Connexion ».
 */
import { computed, onMounted, ref } from 'vue';
import { ApiError, pluginsApi, type ConnexionEtat } from '../../client';
import { inputClass } from '../../context';

/** Accès à une connexion (défaut : celle du plugin, `pluginsApi`). */
export interface ConnexionApi {
	charger(): Promise<ConnexionEtat>;
	enregistrer(valeurs: Record<string, string | null>): Promise<ConnexionEtat>;
	verifier(): Promise<ConnexionEtat>;
}

const props = defineProps<{
	plugin: string;
	api?: ConnexionApi;
	titre?: string;
	/**
	 * Outil dont on montre la connexion (page de réglage d'un réseau) ; absent =
	 * champs communs au plugin (sans `outil`).
	 */
	outil?: string;
	aide?: string;
	/** État des outils (champ d'un outil éteint : signalé comme tel). */
	outils?: Record<string, boolean>;
	disabled?: boolean;
}>();
const api = computed<ConnexionApi>(
	() =>
		props.api ?? {
			charger: () => pluginsApi.connexion(props.plugin),
			enregistrer: (v) => pluginsApi.enregistrerConnexion(props.plugin, v),
			verifier: () => pluginsApi.verifierConnexion(props.plugin),
		},
);
const emit = defineEmits<{ sessionExpiree: []; change: [etat: ConnexionEtat] }>();

const etat = ref<ConnexionEtat | null>(null);
/** Nouvelles valeurs saisies ; `null` = effacement demandé. */
const saisies = ref<Record<string, string | null>>({});
/** Champs masqués rouverts pour être remplacés. */
const remplacer = ref<Record<string, boolean>>({});
/** Effacement en attente de confirmation (second clic). */
const aEffacer = ref<string | null>(null);
const busy = ref(false);
const verification = ref(false);
const erreur = ref('');
const succes = ref('');

function recevoir(e: ConnexionEtat) {
	etat.value = e;
	saisies.value = Object.fromEntries(e.champs.filter((c) => c.clair).map((c) => [c.cle, c.valeur]));
	remplacer.value = {};
	aEffacer.value = null;
}

function echec(e: unknown) {
	if (e instanceof ApiError && e.status === 401) return emit('sessionExpiree');
	erreur.value = (e as Error).message;
}

onMounted(async () => {
	try {
		recevoir(await api.value.charger());
	} catch (e) {
		echec(e);
	}
});

/** Saisies à envoyer : nouvelles valeurs et effacements. */
const changements = computed(() => {
	const sortie: Record<string, string | null> = {};
	for (const c of champs.value) {
		const v = saisies.value[c.cle];
		if (v === null) sortie[c.cle] = null;
		else if (c.clair) {
			if ((v ?? '').trim() !== c.valeur) sortie[c.cle] = (v ?? '').trim() || (c.renseigne ? null : '');
		} else if (v && v.trim()) sortie[c.cle] = v.trim();
	}
	return Object.fromEntries(Object.entries(sortie).filter(([, v]) => v !== ''));
});
const modifie = computed(() => Object.keys(changements.value).length > 0);

/** Champs et états de cet outil (ou communs au plugin). */
const champs = computed(() => (etat.value?.champs ?? []).filter((c) => (c.outil ?? undefined) === props.outil));
const statut = computed(() => (etat.value?.statut ?? []).filter((s) => (s.outil ?? undefined) === props.outil));

const masque = (c: ConnexionEtat['champs'][number]) => c.renseigne && !c.clair && !remplacer.value[c.cle] && saisies.value[c.cle] !== null;

function effacer(cle: string) {
	if (aEffacer.value !== cle) return void (aEffacer.value = cle);
	saisies.value = { ...saisies.value, [cle]: null };
	aEffacer.value = null;
}

function annuler() {
	if (etat.value) recevoir(etat.value);
	erreur.value = succes.value = '';
}

async function enregistrer() {
	if (!modifie.value) return;
	erreur.value = succes.value = '';
	busy.value = true;
	try {
		recevoir(await api.value.enregistrer(changements.value));
		emit('change', etat.value!);
		succes.value = 'Connexion enregistrée.';
	} catch (e) {
		echec(e);
	} finally {
		busy.value = false;
	}
}

async function verifier() {
	erreur.value = succes.value = '';
	verification.value = true;
	try {
		const e = await api.value.verifier();
		if (etat.value) etat.value = { ...etat.value, statut: e.statut };
	} catch (e) {
		echec(e);
	} finally {
		verification.value = false;
	}
}

const STYLES = {
	ok: { classe: 'alerte-succes', icone: 'fa-circle-check' },
	attention: { classe: 'rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-700', icone: 'fa-clock-rotate-left' },
	erreur: { classe: 'alerte-erreur', icone: 'fa-circle-xmark' },
	inconnu: { classe: 'rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-600', icone: 'fa-circle-question' },
} as const;

const dateFr = (iso?: string) =>
	iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
</script>

<template>
	<fieldset class="rounded-xl border border-gray-200 p-4" @keydown.enter.prevent="enregistrer">
		<legend class="px-1 font-heading text-sm font-semibold text-gray-900">
			<i class="fa-solid fa-key mr-1 text-gray-500" aria-hidden="true"></i>{{ titre ?? 'Connexion' }}
		</legend>
		<p v-if="aide" class="mb-3 text-xs text-gray-500">{{ aide }}</p>
		<p v-if="!etat && !erreur" class="text-sm font-light text-gray-500">Chargement…</p>

		<template v-if="etat">
			<ul v-if="statut.length" class="mb-4 space-y-2 text-sm">
				<li v-for="s in statut" :key="s.titre" :class="STYLES[s.niveau].classe">
					<p class="font-semibold">
						<i class="fa-solid mr-1.5" :class="STYLES[s.niveau].icone" aria-hidden="true"></i>
						<a v-if="s.lien" :href="s.lien" target="_blank" rel="noopener" class="underline">{{ s.titre }}</a>
						<template v-else>{{ s.titre }}</template>
					</p>
					<p class="mt-1">{{ s.message }}</p>
					<p v-if="s.verifieLe" class="mt-1 text-xs opacity-80">Vérifié le {{ dateFr(s.verifieLe) }}</p>
				</li>
			</ul>

			<div class="space-y-4">
				<div v-for="c in champs" :key="c.cle">
					<label :for="`connexion-${plugin}-${c.cle}`" class="champ-libelle">
						{{ c.label }}<span v-if="c.obligatoire" class="text-red-600"> *</span>
						<span v-if="!outil && c.outil && outils?.[c.outil] === false" class="ml-1 text-xs font-normal text-gray-500">(outil éteint)</span>
					</label>
					<div v-if="masque(c)" class="mt-1 flex flex-wrap items-center gap-2">
						<input
							:id="`connexion-${plugin}-${c.cle}`"
							type="text"
							value="••••••••••••"
							disabled
							aria-label="Valeur enregistrée, masquée"
							class="champ max-w-56 text-gray-500"
						/>
						<button type="button" class="bouton bouton-mini bouton-contour" :disabled="disabled || busy" @click="remplacer[c.cle] = true">
							<i class="fa-solid fa-pen" aria-hidden="true"></i>Remplacer
						</button>
						<button
							type="button"
							class="bouton bouton-mini"
							:class="aEffacer === c.cle ? 'bouton-danger' : 'bouton-danger-contour'"
							:disabled="disabled || busy"
							@click="effacer(c.cle)"
						>
							<i class="fa-solid fa-eraser" aria-hidden="true"></i>{{ aEffacer === c.cle ? 'Confirmer' : 'Effacer' }}
						</button>
					</div>
					<p v-else-if="saisies[c.cle] === null" class="mt-1 text-sm text-red-700">
						Sera effacé à l'enregistrement.
						<button type="button" class="ml-1 underline" @click="saisies[c.cle] = c.clair ? c.valeur : ''">Annuler</button>
					</p>
					<input
						v-else
						:id="`connexion-${plugin}-${c.cle}`"
						v-model="saisies[c.cle]"
						:type="c.clair ? 'text' : 'password'"
						spellcheck="false"
						autocomplete="off"
						:placeholder="c.renseigne && !c.clair ? 'Nouvelle valeur' : ''"
						:disabled="disabled || busy"
						:class="inputClass"
					/>
					<p v-if="c.aide" class="champ-aide">{{ c.aide }}</p>
				</div>
			</div>

			<p class="mt-3 text-xs text-gray-500">
				<i class="fa-solid fa-lock mr-1" aria-hidden="true"></i>Gardé sur le serveur : une fois enregistré, il n'est plus affiché.
			</p>
		</template>

		<p v-if="erreur" class="mt-3 alerte-erreur" role="alert">{{ erreur }}</p>
		<p v-if="succes" class="mt-3 alerte-succes">{{ succes }}</p>

		<div v-if="etat" class="mt-4 flex flex-wrap items-center gap-2">
			<button type="button" class="bouton bouton-primaire" :disabled="disabled || busy || !modifie" @click="enregistrer">
				<i class="fa-solid" :class="busy ? 'fa-spinner fa-spin' : 'fa-floppy-disk'" aria-hidden="true"></i>Enregistrer la connexion
			</button>
			<button v-if="modifie" type="button" class="bouton bouton-neutre" :disabled="busy" @click="annuler">Annuler</button>
			<button
				v-if="statut.length"
				type="button"
				class="bouton bouton-contour ml-auto"
				:disabled="disabled || busy || verification"
				@click="verifier"
			>
				<i class="fa-solid fa-rotate" :class="{ 'fa-spin': verification }" aria-hidden="true"></i>Vérifier maintenant
			</button>
		</div>
	</fieldset>
</template>
