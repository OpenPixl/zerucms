<script setup lang="ts">
/**
 * Assistant d'installation (super admin, première connexion après le
 * déploiement, mot de passe déjà changé) : type de structure (association ou
 * auto-entrepreneur) → compte administrateur → identité (nom, coordonnées,
 * logo) → plugins proposés à ce type (tous
 * décochés) → réglages et secrets des plugins cochés → contenu d'exemple →
 * récapitulatif. « Installer » envoie tout d'un coup (`installationApi`,
 * src/lib/installation.ts) ; en production, le site passe en maintenance
 * pendant sa reconstruction (page de progression), puis la page
 * `/installation` (`src/pages/installation.astro`, seule à monter ce
 * composant) revient sur l'écran de fin.
 */
import { computed, onMounted, ref } from 'vue';
import { PASSWORD_MIN_LENGTH } from '../../lib/auth/password-rules';
import { ApiError, installationApi, type InstallationEtat, type InstallationPlugin, type InstallationSaisie } from './client';
import { fileToBase64, inputClass } from './context';
import { STRUCTURES, vocabulaire, type Structure } from '../../lib/structure';
import { normaliserChamp } from '../../plugins/champs';

/** Message de la reconstruction échouée d'une installation précédente (annulée, à relancer). */
const props = defineProps<{ echec?: string }>();

// Même clé que `AdminRoot.vue` et l'écran « Bienvenue » (scripts/bienvenue.mjs).
const PLUS_TARD = 'numerik-installation-plus-tard';
/** « Plus tard » : le site, sans être renvoyé ici jusqu'à la fermeture de l'onglet. */
function plusTard() {
	try {
		sessionStorage.setItem(PLUS_TARD, '1');
	} catch {
		// Rien à garder.
	}
	window.location.assign('/');
}

const etat = ref<InstallationEtat | null>(null);
const error = ref('');
const busy = ref(false);
const termine = ref(false);

const structure = ref<Structure>('association');
const voc = computed(() => vocabulaire(structure.value));
const ICONES_STRUCTURE: Record<Structure, string> = { association: 'fa-people-group', entreprise: 'fa-briefcase' };

const compte = ref({ login: '', fullname: '', email: '', password: '' });
const association = ref({ name: '', email: '', phone: '', street: '', postalCode: '', city: '' });
const logo = ref<{ file: File; url: string } | null>(null);
const plugins = ref<Record<string, boolean>>({});
const reglages = ref<Record<string, Record<string, string>>>({});
const secrets = ref<Record<string, string>>({});
const exemples = ref(true);

/** Mot de passe proposé : lisible, sans caractère ambigu. */
function proposerMotDePasse() {
	const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
	const bytes = crypto.getRandomValues(new Uint8Array(14));
	compte.value.password = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

onMounted(async () => {
	try {
		const e = await installationApi.get();
		etat.value = e;
		structure.value = e.structure;
		const a = e.association;
		association.value = { name: a.name, email: a.email, phone: a.phone, street: a.address.street, postalCode: a.address.postalCode, city: a.address.city };
		plugins.value = Object.fromEntries(e.plugins.map((p) => [p.id, false]));
		reglages.value = Object.fromEntries(e.plugins.map((p) => [p.id, Object.fromEntries(p.champs.map((c) => [c.cle, c.valeur]))]));
		proposerMotDePasse();
	} catch (err) {
		error.value = (err as Error).message;
	}
});

const labelDe = (id: string) => etat.value?.plugins.find((p) => p.id === id)?.label ?? id;
/** Plugin coché dont un requis ne l'est pas. */
const requisManquants = (p: InstallationPlugin) => p.requiert.filter((r) => !plugins.value[r]);
/** Plugins proposés au type de structure choisi. */
const proposes = computed(() => (etat.value?.plugins ?? []).filter((p) => !p.structures.length || p.structures.includes(structure.value)));
const actifs = computed(() => proposes.value.filter((p) => plugins.value[p.id] && !requisManquants(p).length));
/** Plugins actifs ayant quelque chose à régler. */
const aRegler = computed(() => actifs.value.filter((p) => p.secrets.length || p.champs.length));

function basculer(p: InstallationPlugin) {
	plugins.value[p.id] = !plugins.value[p.id];
	// Décocher un plugin décoche ceux qui le requièrent ; cocher coche ses requis.
	for (const autre of etat.value?.plugins ?? []) {
		if (!plugins.value[p.id] && autre.requiert.includes(p.id)) plugins.value[autre.id] = false;
	}
	if (plugins.value[p.id]) for (const r of p.requiert) plugins.value[r] = true;
}

/** Changer de type décoche les plugins qui ne lui sont pas proposés. */
function choisirStructure(s: Structure) {
	structure.value = s;
	for (const p of etat.value?.plugins ?? []) if (p.structures.length && !p.structures.includes(s)) plugins.value[p.id] = false;
}

type Etape = 'structure' | 'compte' | 'association' | 'plugins' | 'reglages' | 'contenu' | 'recap';
const ETAPES: { id: Etape; label: string }[] = [
	{ id: 'structure', label: 'Structure' },
	{ id: 'compte', label: 'Compte' },
	{ id: 'association', label: 'Identité' },
	{ id: 'plugins', label: 'Plugins' },
	{ id: 'reglages', label: 'Réglages' },
	{ id: 'contenu', label: 'Contenu' },
	{ id: 'recap', label: 'Installer' },
];
const etapes = computed(() => ETAPES.filter((e) => e.id !== 'reglages' || aRegler.value.length));
const courante = ref<Etape>('structure');
const index = computed(() => etapes.value.findIndex((e) => e.id === courante.value));

/** Contrôle de l'étape avant de passer à la suivante (le serveur revérifie tout). */
function probleme(e: Etape): string {
	if (e === 'compte' && !etat.value?.compte) {
		const c = compte.value;
		if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(c.login.trim().toLowerCase())) return "Identifiant : 2 à 32 caractères (minuscules, chiffres, « . », « - » ou « _ »).";
		if (!c.fullname.trim()) return 'Indiquez le prénom et le nom.';
		if (c.password.length < PASSWORD_MIN_LENGTH) return `Mot de passe : au moins ${PASSWORD_MIN_LENGTH} caractères.`;
	}
	if (e === 'association') {
		const a = association.value;
		if (!a.name.trim() || !a.email.trim() || !a.phone.trim() || !a.street.trim() || !a.postalCode.trim() || !a.city.trim()) {
			return 'Tous les champs sont obligatoires (sauf le logo).';
		}
	}
	if (e === 'reglages') {
		for (const p of aRegler.value) {
			for (const s of p.secrets) if (s.obligatoire && !s.dejaDefini && !secrets.value[s.nom]?.trim()) return `${p.label} : « ${s.label} » est à renseigner (ou décochez le plugin).`;
		}
	}
	return '';
}

function suivant() {
	error.value = probleme(courante.value);
	if (error.value) return;
	courante.value = etapes.value[index.value + 1].id;
}
function precedent() {
	error.value = '';
	courante.value = etapes.value[index.value - 1].id;
}

async function choisirLogo(input: HTMLInputElement) {
	const file = input.files?.[0];
	input.value = '';
	if (!file) return;
	if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return void (error.value = 'Logo : PNG, JPEG, WebP ou SVG.');
	if (file.size > 5 * 1024 * 1024) return void (error.value = 'Logo : 5 Mo au plus.');
	error.value = '';
	logo.value = { file, url: URL.createObjectURL(file) };
}

async function installer() {
	error.value = '';
	busy.value = true;
	try {
		const saisie: InstallationSaisie = {
			structure: structure.value,
			compte: etat.value?.compte ? null : { ...compte.value, login: compte.value.login.trim().toLowerCase() },
			association: association.value,
			logo: logo.value ? { type: logo.value.file.type, data: await fileToBase64(logo.value.file) } : null,
			plugins: plugins.value,
			reglages: Object.fromEntries(actifs.value.map((p) => [p.id, reglages.value[p.id] ?? {}])),
			secrets: Object.fromEntries(
				actifs.value.flatMap((p) => p.secrets.filter((s) => !s.dejaDefini && secrets.value[s.nom]).map((s) => [s.nom, secrets.value[s.nom].trim()])),
			),
			exemples: exemples.value,
		};
		const r = await installationApi.installer(saisie);
		termine.value = true;
		// Production : la page rechargée est celle de la maintenance (progression
		// de la construction), qui revient ensuite ici, sur l'écran de fin.
		if (r.maintenance) setTimeout(() => window.location.reload(), 1500);
	} catch (err) {
		error.value = err instanceof ApiError ? err.message : (err as Error).message;
	} finally {
		busy.value = false;
	}
}

const libelleChamp = 'champ-libelle';
const reload = () => window.location.reload();
</script>

<template>
	<div v-if="!etat" class="text-sm text-gray-500">
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>
		<p v-else>Chargement…</p>
	</div>

	<div v-else-if="termine" class="space-y-3 text-sm" role="status">
		<p class="alerte-succes">
			<i class="fa-solid fa-circle-check mr-1.5" aria-hidden="true"></i>Installation enregistrée : le site est en cours de
			construction.
		</p>
		<template v-if="etat.dev">
			<p class="text-gray-600">
				Serveur de développement : rien n'est reconstruit. Relancez le serveur de dev pour que les secrets saisis soient pris
				en compte.
			</p>
			<button type="button" class="bouton bouton-primaire" @click="reload">Continuer</button>
		</template>
		<p v-else class="text-gray-600">Le site passe en maintenance le temps de sa construction, puis revient seul.</p>
	</div>

	<div v-else class="text-sm">
		<p v-if="props.echec" class="mb-4 alerte-erreur" role="alert">
			La construction du site a échoué : l'installation précédente a été annulée (le compte administrateur est gardé).
			Vérifiez les réglages puis relancez-la. <span class="mt-1 block text-xs">{{ props.echec }}</span>
		</p>
		<!-- Étapes -->
		<ol class="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Étapes de l'installation">
			<li
				v-for="(e, i) in etapes"
				:key="e.id"
				class="flex items-center gap-1.5"
				:class="i === index ? 'font-semibold text-primary' : i < index ? 'text-gray-700' : 'text-gray-400'"
				:aria-current="i === index ? 'step' : undefined"
			>
				<span
					class="flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem]"
					:class="i < index ? 'bg-primary text-white' : i === index ? 'border border-primary' : 'border border-gray-300'"
				>
					<i v-if="i < index" class="fa-solid fa-check" aria-hidden="true"></i><template v-else>{{ i + 1 }}</template>
				</span>
				{{ e.label }}
			</li>
		</ol>

		<!-- 0. Type de structure -->
		<section v-if="courante === 'structure'" class="space-y-3">
			<p class="text-gray-600">
				Bienvenue ! Le site est-il celui d'une association ou d'un auto-entrepreneur ? Ce choix décide des plugins proposés,
				des mentions légales et du contenu d'exemple.
			</p>
			<label
				v-for="s in STRUCTURES"
				:key="s"
				class="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3"
				:class="structure === s ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50'"
			>
				<input type="radio" name="inst-structure" class="mt-1" :checked="structure === s" @change="choisirStructure(s)" />
				<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<i class="fa-solid" :class="ICONES_STRUCTURE[s]" aria-hidden="true"></i>
				</span>
				<span>
					<span class="block font-heading font-semibold text-gray-900">{{ vocabulaire(s).choix }}</span>
					<span class="block text-xs font-light text-gray-600">{{ vocabulaire(s).choixAide }}</span>
				</span>
			</label>
		</section>

		<!-- 1. Compte administrateur -->
		<section v-else-if="courante === 'compte'" class="space-y-4">
			<p v-if="structure === 'association'" class="text-gray-600">
				Créez le compte du <strong>bureau</strong> de l'association : il gère le site au quotidien (contenus, comptes,
				sauvegardes). Votre compte super admin reste réservé aux interventions techniques.
			</p>
			<p v-else class="text-gray-600">
				Créez le compte de l'<strong>entrepreneur·e</strong> : il gère le site au quotidien (contenus, devis et factures,
				sauvegardes). Votre compte super admin reste réservé aux interventions techniques.
			</p>
			<p v-if="etat.compte" class="alerte-succes">
				Compte administrateur déjà créé : <strong>{{ etat.compte.fullname }}</strong> ({{ etat.compte.login }}).
			</p>
			<template v-else>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label for="inst-fullname" :class="libelleChamp">Prénom et nom</label>
						<input id="inst-fullname" v-model="compte.fullname" type="text" autocomplete="off" :class="inputClass" />
					</div>
					<div>
						<label for="inst-login" :class="libelleChamp">Identifiant de connexion</label>
						<input id="inst-login" v-model="compte.login" type="text" autocomplete="off" spellcheck="false" placeholder="ex. marie.d" :class="inputClass" />
					</div>
				</div>
				<div>
					<label for="inst-email" :class="libelleChamp">Email <span class="font-light text-gray-500">(facultatif)</span></label>
					<input id="inst-email" v-model="compte.email" type="email" autocomplete="off" :class="inputClass" />
				</div>
				<div>
					<label for="inst-password" :class="libelleChamp">Mot de passe provisoire</label>
					<div class="mt-1 flex gap-2">
						<input id="inst-password" v-model="compte.password" type="text" autocomplete="off" spellcheck="false" class="champ font-mono" />
						<button type="button" class="bouton bouton-neutre shrink-0" title="Proposer un autre mot de passe" @click="proposerMotDePasse">
							<i class="fa-solid fa-rotate" aria-hidden="true"></i><span class="sr-only">Proposer un autre mot de passe</span>
						</button>
					</div>
					<p class="champ-aide">À transmettre à la personne : elle le remplacera à sa première connexion.</p>
				</div>
			</template>
		</section>

		<!-- 2. Association -->
		<section v-else-if="courante === 'association'" class="space-y-4">
			<p class="text-gray-600">
				Nom et coordonnées {{ voc.de }}, affichés sur tout le site. Le reste (présentation, réseaux sociaux, mentions légales
				dont le SIRET, couleurs) se règle ensuite dans <strong>Paramètres → {{ voc.titre }}</strong>.
			</p>
			<div>
				<label for="inst-nom" :class="libelleChamp">{{ structure === 'entreprise' ? 'Nom commercial' : "Nom de l'association" }}</label>
				<input id="inst-nom" v-model="association.name" type="text" maxlength="80" :class="inputClass" />
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="inst-mail" :class="libelleChamp">Email de contact</label>
					<input id="inst-mail" v-model="association.email" type="email" :class="inputClass" />
				</div>
				<div>
					<label for="inst-tel" :class="libelleChamp">Téléphone</label>
					<input id="inst-tel" v-model="association.phone" type="tel" :class="inputClass" />
				</div>
			</div>
			<div>
				<label for="inst-rue" :class="libelleChamp">{{ structure === 'entreprise' ? 'Adresse' : 'Adresse du siège' }}</label>
				<input id="inst-rue" v-model="association.street" type="text" :class="inputClass" />
			</div>
			<div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
				<div>
					<label for="inst-cp" :class="libelleChamp">Code postal</label>
					<input id="inst-cp" v-model="association.postalCode" type="text" inputmode="numeric" :class="inputClass" />
				</div>
				<div>
					<label for="inst-ville" :class="libelleChamp">Ville</label>
					<input id="inst-ville" v-model="association.city" type="text" :class="inputClass" />
				</div>
			</div>
			<div>
				<span :class="libelleChamp">Logo <span class="font-light text-gray-500">(facultatif)</span></span>
				<div class="mt-1 flex items-center gap-3">
					<span class="flex h-14 w-28 items-center justify-center rounded-lg border border-gray-200 bg-white p-1">
						<img v-if="logo || etat.logo" :src="logo?.url ?? etat.logo ?? ''" alt="Logo" class="max-h-full max-w-full object-contain" />
					</span>
					<label class="bouton bouton-neutre">
						<i class="fa-solid fa-image" aria-hidden="true"></i>{{ logo ? 'Changer' : 'Choisir un logo' }}
						<input type="file" class="sr-only" accept="image/png,image/jpeg,image/webp,image/svg+xml" @change="choisirLogo($event.target as HTMLInputElement)" />
					</label>
					<button v-if="logo" type="button" class="text-xs text-gray-600 hover:underline" @click="logo = null">Retirer</button>
				</div>
				<p class="champ-aide">PNG, JPEG, WebP ou SVG (5 Mo max). Sans logo, celui de démonstration reste en place.</p>
			</div>
		</section>

		<!-- 3. Plugins -->
		<section v-else-if="courante === 'plugins'" class="space-y-3">
			<p class="text-gray-600">
				Cochez les volets dont {{ voc.la }} a besoin (ceux proposés à ce type de structure). Rien n'est actif au départ ; vous
				pourrez en activer ou en désactiver plus tard (menu <strong>Plugins</strong>).
			</p>
			<label
				v-for="p in proposes"
				:key="p.id"
				class="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3"
				:class="plugins[p.id] ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50'"
			>
				<input type="checkbox" class="mt-1" :checked="plugins[p.id]" @change="basculer(p)" />
				<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
					<i class="fa-solid" :class="p.icon" aria-hidden="true"></i>
				</span>
				<span class="min-w-0">
					<span class="block font-heading font-semibold text-gray-900">{{ p.label }}</span>
					<span class="block text-xs font-light text-gray-600">{{ p.description }}</span>
					<span v-if="p.requiert.length" class="mt-1 block text-xs text-gray-500">
						Requiert : {{ p.requiert.map(labelDe).join(', ') }} (coché avec lui).
					</span>
				</span>
			</label>
		</section>

		<!-- 4. Réglages et secrets des plugins cochés -->
		<section v-else-if="courante === 'reglages'" class="space-y-5">
			<p class="text-gray-600">
				Réglages des plugins cochés. Les clés et identifiants sont gardés sur le serveur, jamais dans le site ni dans les
				sauvegardes, et ne se saisissent qu'ici : ensuite, ils se changent dans le fichier <code>.env</code> du serveur.
			</p>
			<fieldset v-for="p in aRegler" :key="p.id" class="rounded-xl border border-gray-200 p-4">
				<legend class="px-1 font-heading font-semibold text-gray-900">
					<i class="fa-solid mr-1.5 text-primary" :class="p.icon" aria-hidden="true"></i>{{ p.label }}
				</legend>
				<div class="space-y-4">
					<div v-for="s in p.secrets" :key="s.nom">
						<label :for="`inst-${s.nom}`" :class="libelleChamp">
							{{ s.label }}
							<span v-if="!s.obligatoire" class="font-light text-gray-500">(facultatif)</span>
						</label>
						<p v-if="s.dejaDefini" class="mt-1 text-xs text-green-800">
							<i class="fa-solid fa-check mr-1" aria-hidden="true"></i>Déjà défini dans le <code>.env</code> du serveur.
						</p>
						<template v-else>
							<input
								:id="`inst-${s.nom}`"
								v-model="secrets[s.nom]"
								:type="s.type === 'cle' ? 'password' : 'text'"
								autocomplete="off"
								spellcheck="false"
								:class="inputClass"
							/>
							<p class="champ-aide">
								{{ s.aide }} <code class="text-[0.65rem] text-gray-400">{{ s.nom }}</code>
							</p>
						</template>
					</div>
					<div v-for="c in p.champs" :key="c.cle">
						<label :for="`inst-${p.id}-${c.cle}`" :class="libelleChamp">{{ c.label }}</label>
						<input
							:id="`inst-${p.id}-${c.cle}`"
							v-model.trim="reglages[p.id][c.cle]"
							type="text"
							@blur="reglages[p.id][c.cle] = normaliserChamp(c.type, reglages[p.id][c.cle])"
							autocomplete="off"
							spellcheck="false"
							:placeholder="(c.env && secrets[c.env]) || c.repli"
							:class="inputClass"
						/>
						<p v-if="c.aide" class="champ-aide">{{ c.aide }}</p>
					</div>
				</div>
			</fieldset>
		</section>

		<!-- 5. Contenu d'exemple -->
		<section v-else-if="courante === 'contenu'" class="space-y-3">
			<p v-if="structure === 'association'" class="text-gray-600">
				Le site est livré avec un contenu de démonstration : une actualité, deux activités, des pages (qui sommes-nous,
				statuts, règlement intérieur), une annonce et un partenaire.
			</p>
			<p v-else class="text-gray-600">
				Contenu de démonstration d'un auto-entrepreneur : une actualité, les pages « À propos » et « Prestations », un accueil
				adapté et une annonce. Les mentions légales d'entreprise individuelle sont posées dans tous les cas.
			</p>
			<label class="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3" :class="exemples ? 'border-primary bg-primary/5' : 'border-gray-200'">
				<input v-model="exemples" type="radio" class="mt-1" :value="true" name="inst-exemples" />
				<span>
					<span class="block font-semibold text-gray-900">Garder les exemples</span>
					<span class="block text-xs font-light text-gray-600">Pour voir le site rempli, puis remplacer les textes un à un.</span>
				</span>
			</label>
			<label class="flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3" :class="!exemples ? 'border-primary bg-primary/5' : 'border-gray-200'">
				<input v-model="exemples" type="radio" class="mt-1" :value="false" name="inst-exemples" />
				<span>
					<span class="block font-semibold text-gray-900">Partir d'un site vide</span>
					<span class="block text-xs font-light text-gray-600">
						Les exemples sont retirés ; les mentions légales et les pages du site (accueil, actualités, contact) restent.
					</span>
				</span>
			</label>
		</section>

		<!-- 6. Récapitulatif -->
		<section v-else class="space-y-3">
			<p class="text-gray-600">Vérifiez avant d'installer :</p>
			<dl class="divide-y divide-gray-100 rounded-xl border border-gray-200">
				<div class="flex gap-3 px-4 py-2">
					<dt class="w-32 shrink-0 text-gray-500">Structure</dt>
					<dd>{{ voc.choix }}</dd>
				</div>
				<div class="flex gap-3 px-4 py-2">
					<dt class="w-32 shrink-0 text-gray-500">Administrateur</dt>
					<dd v-if="etat.compte">{{ etat.compte.fullname }} ({{ etat.compte.login }}), déjà créé</dd>
					<dd v-else>
						{{ compte.fullname }} ({{ compte.login }}) · mot de passe provisoire
						<code class="rounded bg-gray-100 px-1 font-mono">{{ compte.password }}</code>
					</dd>
				</div>
				<div class="flex gap-3 px-4 py-2">
					<dt class="w-32 shrink-0 text-gray-500">{{ voc.titre }}</dt>
					<dd>
						{{ association.name }} · {{ association.email }} · {{ association.phone }}<br />
						{{ association.street }}, {{ association.postalCode }} {{ association.city }}<template v-if="logo"> · nouveau logo</template>
					</dd>
				</div>
				<div class="flex gap-3 px-4 py-2">
					<dt class="w-32 shrink-0 text-gray-500">Plugins</dt>
					<dd>{{ actifs.map((p) => p.label).join(', ') || 'aucun' }}</dd>
				</div>
				<div class="flex gap-3 px-4 py-2">
					<dt class="w-32 shrink-0 text-gray-500">Contenu</dt>
					<dd>{{ exemples ? 'exemples gardés' : 'exemples retirés' }}</dd>
				</div>
			</dl>
			<p class="text-xs text-gray-500">
				Notez le mot de passe provisoire avant d'installer. Le site est ensuite reconstruit : il passe en maintenance quelques
				minutes, avec une barre de progression.
			</p>
		</section>

		<p v-if="error" class="mt-4 alerte-erreur" role="alert">{{ error }}</p>

		<div class="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
			<button v-if="index > 0" type="button" class="bouton bouton-neutre" :disabled="busy" @click="precedent">
				<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>Précédent
			</button>
			<button v-if="courante !== 'recap'" type="button" class="bouton bouton-primaire" @click="suivant">
				Suivant<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
			</button>
			<button v-else type="button" class="bouton bouton-primaire" :disabled="busy" @click="installer">
				<i class="fa-solid" :class="busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'" aria-hidden="true"></i>
				{{ busy ? 'Installation…' : 'Installer le site' }}
			</button>
			<button type="button" class="ml-auto text-xs text-gray-500 underline hover:text-gray-900" :disabled="busy" @click="plusTard">
				Plus tard
			</button>
		</div>
	</div>
</template>
