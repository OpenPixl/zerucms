/**
 * Couleurs de fond des sections (Présentation, Grille de tarifs, L'équipe,
 * Bandeau défilant) : teintes de la charte graphique, qui suivent ses
 * couleurs et le mode sombre. Classes écrites en entier (lues par Tailwind).
 * Sans dépendance : aussi utilisé par l'îlot de l'admin (options du champ).
 */
export const FONDS_SECTION = {
	gris: 'bg-gray-100',
	fond: 'bg-fond',
	surface: 'bg-surface',
	primaire: 'bg-primary/10',
	secondaire: 'bg-secondary/10',
	accent: 'bg-accent/10',
} as const;

export type FondSection = keyof typeof FONDS_SECTION;

/** Classe du fond ; valeur inconnue = `defaut`. */
export function classeFond(fond: string, defaut: FondSection = 'gris'): string {
	return FONDS_SECTION[fond as FondSection] ?? FONDS_SECTION[defaut];
}

/** Choix du champ « Couleur du fond » d'une section. */
export const OPTIONS_FOND: { value: FondSection; label: string }[] = [
	{ value: 'gris', label: 'Gris clair' },
	{ value: 'fond', label: 'Fond du site' },
	{ value: 'surface', label: 'Blanc (surface)' },
	{ value: 'primaire', label: 'Couleur principale, teinte claire' },
	{ value: 'secondaire', label: 'Couleur secondaire, teinte claire' },
	{ value: 'accent', label: "Couleur d'accent, teinte claire" },
];
