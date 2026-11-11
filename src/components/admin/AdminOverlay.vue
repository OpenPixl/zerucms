<script setup lang="ts">
/**
 * Calque superposé au site : `variant="drawer"` = panneau latéral à droite
 * (modules), sous la barre d'administration (`top-10`) pour qu'un clic sur
 * un autre module de la barre l'ouvre directement ; `variant="modal"` =
 * fenêtre centrée (connexion ; `wide` = plus large, ex. ajout par fichier .md ;
 * `opaque` = fond plein qui cache le site, ex. assistant d'installation : le
 * contenu de démonstration n'a pas à être vu avant le choix du type de structure).
 * Échap ou clic sur le fond ferme (sauf `closable: false`, ex. changement de
 * mot de passe imposé) ; le focus est placé dans le calque à
 * l'ouverture et rendu à l'élément d'origine à la fermeture ; la page
 * dessous ne défile plus.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{ title: string; variant?: 'drawer' | 'modal'; closable?: boolean; wide?: boolean; opaque?: boolean }>(), {
	variant: 'drawer',
	closable: true,
});
const emit = defineEmits<{ close: [] }>();

function requestClose() {
	if (props.closable) emit('close');
}

const panel = ref<HTMLElement | null>(null);
const titleId = `admin-overlay-${Math.random().toString(36).slice(2, 8)}`;
let previousFocus: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') requestClose();
	if (event.key !== 'Tab' || !panel.value) return;
	// Garde le focus clavier dans le calque.
	const focusables = panel.value.querySelectorAll<HTMLElement>(
		'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
	);
	if (focusables.length === 0) return;
	const first = focusables[0];
	const last = focusables[focusables.length - 1];
	if (event.shiftKey && document.activeElement === first) {
		last.focus();
		event.preventDefault();
	} else if (!event.shiftKey && document.activeElement === last) {
		first.focus();
		event.preventDefault();
	}
}

onMounted(async () => {
	previousFocus = document.activeElement as HTMLElement | null;
	document.documentElement.style.overflow = 'hidden';
	document.addEventListener('keydown', onKeydown);
	await nextTick();
	const target = panel.value?.querySelector<HTMLElement>('[autofocus], input, button:not([data-overlay-close])');
	(target ?? panel.value)?.focus();
});

onBeforeUnmount(() => {
	document.documentElement.style.overflow = '';
	document.removeEventListener('keydown', onKeydown);
	previousFocus?.focus?.();
});
</script>

<template>
	<div :class="['fixed z-[70]', props.variant === 'modal' ? 'inset-0 flex items-center justify-center p-4' : 'inset-x-0 top-10 bottom-0']">
		<div :class="['absolute inset-0', props.opaque ? 'bg-gray-100' : 'bg-gray-900/50']" aria-hidden="true" @click="requestClose"></div>
		<div
			ref="panel"
			role="dialog"
			aria-modal="true"
			:aria-labelledby="titleId"
			tabindex="-1"
			:class="[
				'flex flex-col bg-white shadow-2xl focus:outline-none',
				props.variant === 'modal'
					? ['relative max-h-full w-full overflow-hidden rounded-2xl', props.wide ? 'max-w-lg' : 'max-w-sm']
					: 'absolute inset-y-0 right-0 w-full max-w-xl sm:border-l sm:border-gray-200',
			]"
		>
			<header class="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
				<h2 :id="titleId" class="font-heading text-lg font-semibold text-gray-900">{{ props.title }}</h2>
				<button
					v-if="props.closable"
					type="button"
					data-overlay-close
					class="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
					aria-label="Fermer"
					@click="emit('close')"
				>
					<i class="fa-solid fa-xmark" aria-hidden="true"></i>
				</button>
			</header>
			<div class="scrollbar-fin flex-1 overflow-y-auto px-5 py-5">
				<slot />
			</div>
		</div>
	</div>
</template>
