/**
 * Type de structure du site : `association` (défaut) ou `entreprise`
 * (auto-entrepreneur, micro-entreprise). Choisi dans l'assistant
 * d'installation, écrit dans `structure:` de `src/content/reglages.yaml`
 * (lu par `src/config/site.ts` : `site.structure`). Il décide :
 *  - des plugins proposés (`structures` du catalogue `src/plugins/catalogue.ts`) ;
 *  - du vocabulaire de l'Espace Admin et des textes par défaut (ci-dessous) ;
 *  - des mentions légales et du contenu d'exemple (`src/modeles/entreprise/`,
 *    appliqué par l'assistant : `src/lib/installation.ts`).
 * Les noms techniques (`association.yaml`, `{{association.nom}}`…) ne changent pas.
 *
 * Module pur : aussi utilisé dans le navigateur.
 */

export const STRUCTURES = ['association', 'entreprise'] as const;
export type Structure = (typeof STRUCTURES)[number];

export function estStructure(v: unknown): v is Structure {
	return typeof v === 'string' && (STRUCTURES as readonly string[]).includes(v);
}

export interface Vocabulaire {
	/** Choix de l'assistant d'installation. */
	choix: string;
	choixAide: string;
	/** « Association » / « Entreprise » (module, titres). */
	titre: string;
	/** « l'association » / « l'entreprise ». */
	la: string;
	/** « de l'association » / « de l'entreprise ». */
	de: string;
	/** Libellé du numéro légal principal. */
	numero: string;
	/** Personne responsable (mentions légales). */
	responsable: string;
}

export const VOCABULAIRE: Record<Structure, Vocabulaire> = {
	association: {
		choix: 'Association',
		choixAide: 'Association loi 1901 : adhésions, activités, bénévoles, partenaires.',
		titre: 'Association',
		la: "l'association",
		de: "de l'association",
		numero: 'Numéro RNA',
		responsable: 'Président·e',
	},
	entreprise: {
		choix: 'Auto-entrepreneur',
		choixAide: 'Micro-entreprise (entreprise individuelle) : prestations, devis et factures.',
		titre: 'Entreprise',
		la: "l'entreprise",
		de: "de l'entreprise",
		numero: 'Numéro SIRET',
		responsable: 'Entrepreneur·e (prénom et nom)',
	},
};

export const vocabulaire = (s: Structure): Vocabulaire => VOCABULAIRE[s];
