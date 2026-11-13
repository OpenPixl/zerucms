
import { DEFINITIONS_EXTENSIONS } from './extensions';

/** Familles du CMS ; une extension en ajoute (`agenda` de son `definitions.ts`). */
export type AgendaKind = 'parcours' | 'fablab' | 'espace-jeune' | 'bidouille-repair' | 'ateliers' | (string & {});

/** Libellé, icône et couleurs d'une famille. `hex` : couleur CSS de la bordure (variable du thème pour les couleurs de l'association). */
export interface AgendaKindMeta {
	label: string;
	icon: string;
	dot: string;
	text: string;
	hex: string;
}

export interface AgendaSession {
	/** Jour de la semaine (libellé affiché). */
	day: string;
	/** Heure de début, format « 14h00 ». */
	start: string;
	/** Heure de fin, format « 16h00 ». */
	end: string;
	/** Intitulé de la séance. */
	title: string;
	/** Personne(s) qui anime(nt) la séance. Facultatif (ex. permanence sur RDV). */
	animators?: string;
	/** Lieu de la séance, s'il diffère du lieu habituel. */
	location?: string;
	/** Famille d'activité, sert au code couleur. */
	kind: AgendaKind;
	/** Précision optionnelle (fréquence, salle…). */
	note?: string;
	/** Libellé de la légende, s'il diffère de celui du `kind` (`AGENDA_KIND_META`). */
	legend?: string;
}

/** Ordre d'affichage des jours dans l'agenda. */
export const AGENDA_DAYS = [
	'Lundi',
	'Mardi',
	'Mercredi',
	'Jeudi',
	'Vendredi',
	'Samedi',
	'Dimanche',
] as const;

export const AGENDA_KIND_META: Record<AgendaKind, AgendaKindMeta> = {
	...DEFINITIONS_EXTENSIONS.agenda,
	parcours: {
		label: 'Parcours initiation',
		icon: 'fa-route',
		dot: 'bg-primary',
		text: 'text-primary',
		hex: 'var(--color-primary)',
	},
	fablab: {
		label: 'FabLab',
		icon: 'fa-cubes',
		dot: 'bg-accent',
		text: 'text-accent',
		hex: 'var(--color-accent)',
	},
	'espace-jeune': {
		label: 'Espace Jeune',
		icon: 'fa-gamepad',
		dot: 'bg-secondary',
		text: 'text-secondary',
		hex: 'var(--color-secondary)',
	},
	'bidouille-repair': {
		label: 'Bidouille & Repair',
		icon: 'fa-screwdriver-wrench',
		dot: 'bg-amber-500',
		text: 'text-amber-600',
		hex: '#f59e0b',
	},
	ateliers: {
		label: 'Ateliers',
		icon: 'fa-calendar-check',
		dot: 'bg-violet-500',
		text: 'text-violet-600',
		hex: '#8b5cf6',
	},

};

/**
 * Regroupe les séances par jour, dans l'ordre de `AGENDA_DAYS`. Les jours
 * sans séance sont omis, sauf ceux listés dans `keepDays` (colonne vide).
 */
export function groupByDay(sessions: AgendaSession[], keepDays: readonly string[] = []) {
	return AGENDA_DAYS.map((day) => ({
		day,
		sessions: sessions
			.filter((session) => session.day === day)
			.sort((a, b) => a.start.localeCompare(b.start)),
	})).filter((group) => group.sessions.length > 0 || keepDays.includes(group.day));
}
