<script setup lang="ts">
/**
 * En-tête d'un formulaire de module : bouton de retour à la liste (couleur
 * accent, même style que les boutons du site) puis l'élément en cours
 * (pastille ronde bleu clair, icône « modifier » ou « + », puis son titre, qui suit la saisie du champ
 * Titre — titre enregistré ou « Nouvelle … » s'il est vide) pour savoir où
 * l'on se trouve. Actualités, Pages, Activités, Comptes, Plugins. Slot par
 * défaut : affiché à droite du titre (ex. état du plugin).
 */
const props = defineProps<{ back: string; title: string; editing: boolean }>();
const emit = defineEmits<{ back: [] }>();
</script>

<template>
	<div class="mb-5">
		<button
			type="button"
			class="bouton bouton-accent"
			@click="emit('back')"
		>
			<i class="fa-solid fa-arrow-left text-xs" aria-hidden="true"></i>
			{{ props.back }}
		</button>
		<div class="mt-4 flex items-center gap-3">
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary"
				:title="props.editing ? 'Modification' : 'Création'"
			>
				<i :class="['fa-solid text-sm', props.editing ? 'fa-pen-to-square' : 'fa-plus']" aria-hidden="true"></i>
				<span class="sr-only">{{ props.editing ? 'Modification :' : 'Création :' }}</span>
			</span>
			<h3 class="min-w-0 font-heading text-lg font-semibold leading-snug text-gray-900">{{ props.title }}</h3>
			<slot />
		</div>
	</div>
</template>
