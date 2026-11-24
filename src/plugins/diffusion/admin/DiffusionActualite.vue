<script setup lang="ts">
/**
 * Onglet « Diffusion » du formulaire d'une actualité (module « Actualités »,
 * plugin diffusion actif) : diffuse la version **en ligne** de l'actualité
 * sur la Page Facebook — texte relu (titre + résumé proposés), lien vers
 * l'article (Facebook en tire l'aperçu). Confirmation en deux temps ;
 * diffusion déjà faite rappelée (date, auteur·rice, lien vers la publication).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ApiError } from '../../../components/admin/client';
import { inputClass } from '../../../components/admin/context';
import type { Diffusion } from '../../../lib/diffusion';
import { MESSAGE_MAX, messagePropose } from '../lib/regles';
import { diffusionApi, type EtatDiffusion } from './client';

const props = defineProps<{
	slug: string;
	/** Titre et résumé enregistrés (texte proposé). */
	titre: string;
	resume: string;
	isPublish: boolean;
	publishAt: string;
	diffusion: Diffusion;
	/** Formulaire modifié et pas encore enregistré : la diffusion porte sur la version en ligne. */
	modifie?: boolean;
}>();
const emit = defineEmits<{ diffusee: [diffusion: Diffusion] }>();

const etat = ref<EtatDiffusion | null>(null);
const erreurEtat = ref('');
const message = ref(messagePropose(props.titre, props.resume));
const confirmer = ref(false);
const envoi = ref(false);
const erreur = ref('');
const avertissement = ref('');
const trace = ref(props.diffusion.facebook ?? null);

watch(
	() => props.slug,
	() => {
		message.value = messagePropose(props.titre, props.resume);
		trace.value = props.diffusion.facebook ?? null;
		confirmer.value = false;
		erreur.value = avertissement.value = '';
	},
);

onMounted(async () => {
	try {
		etat.value = await diffusionApi.etat();
	} catch (err) {
		erreurEtat.value = (err as Error).message;
	}
});

const programmee = computed(() => props.publishAt > new Date().toLocaleDateString('sv-SE'));
const bloquee = computed(() => !props.isPublish || programmee.value);
const facebook = computed(() => etat.value?.facebook);
const pret = computed(() => Boolean(facebook.value?.configure && facebook.value.page && !bloquee.value));

const dateFr = (iso: string) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? iso
		: d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

async function diffuser() {
	erreur.value = avertissement.value = '';
	envoi.value = true;
	try {
		const r = await diffusionApi.facebook(props.slug, message.value);
		trace.value = r.trace;
		avertissement.value = r.avertissement;
		confirmer.value = false;
		emit('diffusee', { ...props.diffusion, facebook: r.trace });
	} catch (err) {
		erreur.value = err instanceof ApiError ? err.message : (err as Error).message;
	} finally {
		envoi.value = false;
	}
}
</script>

<template>
	<div class="space-y-4 text-sm">
		<p v-if="erreurEtat" class="alerte-erreur" role="alert">{{ erreurEtat }}</p>
		<p v-else-if="!etat" class="text-gray-500">Chargement…</p>

		<template v-else-if="facebook">
			<p v-if="!facebook.actif" class="alerte-attention">La diffusion sur Facebook est éteinte (module « Plugins », réservé au super admin).</p>
			<p v-else-if="!facebook.configure" class="alerte-attention">
				Aucune Page Facebook n'est configurée : le super admin doit renseigner l'identifiant de la Page et son jeton
				(module « Plugins » → « Diffusion sur les réseaux sociaux »).
			</p>
			<p v-else-if="facebook.erreur" class="alerte-erreur" role="alert">{{ facebook.erreur }}</p>
			<p v-if="facebook.rappel" :class="facebook.rappel.niveau === 'expire' ? 'alerte-erreur' : 'alerte-attention'">
				<i class="fa-solid fa-clock-rotate-left mr-1.5" aria-hidden="true"></i>{{ facebook.rappel.message }}
			</p>

			<template v-if="facebook.page">
				<p class="flex items-center gap-2 text-gray-700">
					<i class="fa-brands fa-facebook text-lg text-[#1877f2]" aria-hidden="true"></i>
					Page :
					<a :href="facebook.page.lien" target="_blank" rel="noopener" class="font-semibold text-primary hover:underline">{{ facebook.page.nom }}</a>
				</p>

				<p v-if="trace" class="alerte-succes">
					<i class="fa-solid fa-circle-check mr-1.5" aria-hidden="true"></i>
					Diffusée sur Facebook le {{ dateFr(trace.date) }}<template v-if="trace.par"> par {{ trace.par }}</template>.
					<a v-if="trace.lien" :href="trace.lien" target="_blank" rel="noopener" class="ml-1 font-semibold underline">Voir la publication</a>
				</p>
				<p v-if="avertissement" class="alerte-attention">{{ avertissement }}</p>

				<p v-if="!props.isPublish" class="alerte-attention">Cette actualité est un brouillon : publiez-la sur le site avant de la diffuser.</p>
				<p v-else-if="programmee" class="alerte-attention">
					Actualité programmée : elle pourra être diffusée à partir de sa date de publication.
				</p>
				<p v-else-if="props.modifie" class="alerte-attention">
					Le formulaire a des modifications non enregistrées : la diffusion porte sur la version en ligne. Enregistrez et
					publiez d'abord pour diffuser la nouvelle version.
				</p>

				<div>
					<label for="diffusion-message" class="champ-libelle">Texte de la publication</label>
					<textarea id="diffusion-message" v-model="message" rows="6" :maxlength="MESSAGE_MAX" :disabled="bloquee" :class="inputClass"></textarea>
					<p class="champ-aide">
						Le lien vers l'actualité est ajouté à la publication : Facebook en affiche l'aperçu (titre, résumé et photo de la
						page en ligne).
						<button
							v-if="message !== messagePropose(props.titre, props.resume)"
							type="button"
							class="ml-1 text-primary hover:underline"
							@click="message = messagePropose(props.titre, props.resume)"
						>
							Revenir au texte proposé
						</button>
					</p>
				</div>
				<p v-if="etat.dev" class="champ-aide">
					Serveur de développement : le lien pointe vers l'adresse du site de développement (<code>SITE_URL</code>), que
					Facebook ne peut pas lire. Un vrai test se fait sur un site en ligne.
				</p>

				<p v-if="erreur" class="alerte-erreur" role="alert">{{ erreur }}</p>

				<div class="flex flex-wrap items-center gap-3">
					<template v-if="!confirmer">
						<button type="button" class="bouton bouton-primaire" :disabled="!pret || !message.trim()" @click="confirmer = true">
							<i class="fa-brands fa-facebook" aria-hidden="true"></i>{{ trace ? 'Diffuser à nouveau' : 'Diffuser sur Facebook' }}
						</button>
					</template>
					<template v-else>
						<span class="text-gray-700">
							Publier sur la Page « {{ facebook.page.nom }} »<template v-if="trace"> une seconde fois</template> ?
						</span>
						<button type="button" class="bouton bouton-primaire" :disabled="envoi" @click="diffuser">
							<i class="fa-solid" :class="envoi ? 'fa-spinner fa-spin' : 'fa-paper-plane'" aria-hidden="true"></i>
							{{ envoi ? 'Diffusion…' : 'Confirmer' }}
						</button>
						<button type="button" class="bouton bouton-neutre" :disabled="envoi" @click="confirmer = false">Annuler</button>
					</template>
				</div>
			</template>
		</template>
	</div>
</template>
