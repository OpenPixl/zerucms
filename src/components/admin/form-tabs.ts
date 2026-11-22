/**
 * Formulaires en onglets (`FormTabs.vue`) : onglet actif, et retour
 * automatique sur l'onglet d'un champ invalide à l'envoi — sans quoi le
 * navigateur bloque l'envoi sans rien montrer (champ `required` masqué
 * par `v-show`). Brancher `onInvalid` en `@invalid.capture` sur le `<form>`.
 *
 * Panneaux : `id="<prefix>-panel-<onglet>"`, `role="tabpanel"`.
 */
import { nextTick, ref, type Ref } from 'vue';

export interface FormTab {
	id: string;
	label: string;
	/** Icône Font Awesome (style « solid »), ex. `fa-image` ; facultative. */
	icon?: string;
}

export function useFormTabs<T extends string>(prefix: string, first: T): { tab: Ref<T>; onInvalid: (event: Event) => void } {
	const tab = ref(first) as Ref<T>;
	let switching = false;

	function onInvalid(event: Event) {
		if (switching) return; // un événement par champ invalide : seul le premier compte
		const field = event.target as HTMLInputElement;
		const panel = field.closest?.('[role="tabpanel"]');
		const id = panel?.id.startsWith(`${prefix}-panel-`) ? panel.id.slice(`${prefix}-panel-`.length) : null;
		if (!id || id === tab.value) return;
		switching = true;
		tab.value = id as T;
		nextTick(() => {
			field.focus();
			field.reportValidity?.();
			switching = false;
		});
	}

	return { tab, onInvalid };
}

/** Onglets des formulaires d'actualité, de page et d'activité. */
export const EDIT_TABS = [
	{ id: 'infos', label: 'Informations', icon: 'fa-circle-info' },
	{ id: 'contenu', label: 'Contenu', icon: 'fa-align-left' },
	{ id: 'image', label: 'Image', icon: 'fa-image' },
] as const satisfies readonly FormTab[];
export type EditTab = (typeof EDIT_TABS)[number]['id'];
