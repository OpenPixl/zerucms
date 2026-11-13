/**
 * Informations de l'association (nom, coordonnées, mentions légales), propres
 * à chaque déploiement : lues dans `src/content/association.yaml`, fichier qui
 * appartient à l'association et qu'une mise à jour du modèle ne remplace pas.
 *
 * Fichier importé tel quel (`?raw`, suivi par Vite : modifié en dev, il est
 * relu à chaud) puis validé ici : un champ manquant fait échouer le build avec
 * le chemin du champ. Lecture synchrone volontaire — `association` est utilisé
 * partout (composants, `page-variables.ts`, `content.config.ts` via
 * `site-pages.ts`), y compris dans l'îlot Vue de l'admin : pas de
 * `getCollection` ni de `fs` ici.
 */

import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';
import raw from '../content/association.yaml?raw';

/** Champ facultatif : absent ou `null` dans le YAML = chaîne vide. */
const optional = z
	.string()
	.nullish()
	.transform((v) => v ?? '');

const required = z.string({ error: 'champ obligatoire' }).trim().min(1, 'champ obligatoire');

/** Lignes de la rue (n° et voie, complément, bâtiment…) avant code postal et ville. */
export const ADRESSE_LIGNES_MAX = 3;

/**
 * Saisie de la rue mise en forme : une ligne par retour à la ligne (au plus
 * `ADRESSE_LIGNES_MAX`, vérifié par le schéma), espaces resserrés, lignes
 * vides retirées. Partagé par le module Association et l'installation.
 */
export function normaliserRue(v: unknown): string {
	if (typeof v !== 'string') return '';
	return v
		.split(/\r?\n/)
		.map((l) => l.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
}

const schema = z.object({
	name: required,
	description: required,
	email: required,
	phone: required,
	address: z.object({
		street: required.refine((v) => v.split('\n').length <= ADRESSE_LIGNES_MAX, `${ADRESSE_LIGNES_MAX} lignes au plus`),
		postalCode: required,
		city: required,
	}),
	social: z
		.record(z.string(), optional)
		.nullish()
		.transform((v) => v ?? {}),
	legal: z
		.object({
			registrationNumber: optional,
			siretNumber: optional,
			president: optional,
			publicationManager: optional,
			publicationManagerRole: optional,
			hosting: z
				.object({ name: optional, address: optional, phone: optional })
				.nullish()
				.transform((v) => v ?? { name: '', address: '', phone: '' }),
		})
		.nullish()
		.transform(
			(v) =>
				v ?? {
					registrationNumber: '',
					siretNumber: '',
					president: '',
					publicationManager: '',
					publicationManagerRole: '',
					hosting: { name: '', address: '', phone: '' },
				},
		),
});

export type Association = z.infer<typeof schema>;

/**
 * Réseaux sociaux reconnus (`social:` du YAML) : icône du pied de page et
 * champ du module « Association ». Une autre clé reste affichée (icône lien).
 */
export const SOCIAL_NETWORKS = [
	{ key: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook' },
	{ key: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram' },
	{ key: 'linkedin', label: 'LinkedIn', icon: 'fa-brands fa-linkedin' },
	{ key: 'twitter', label: 'X (Twitter)', icon: 'fa-brands fa-x-twitter' },
	{ key: 'youtube', label: 'YouTube', icon: 'fa-brands fa-youtube' },
	{ key: 'tiktok', label: 'TikTok', icon: 'fa-brands fa-tiktok' },
] as const;

/** Lit et valide le texte d'`association.yaml` (aussi avant écriture, `association-writer.ts`). */
export function parseAssociation(text: string): Association {
	const result = schema.safeParse(parseYaml(text));
	if (result.success) return result.data;
	const details = result.error.issues.map((i) => `  - ${i.path.join('.') || '(fichier)'} : ${i.message}`).join('\n');
	throw new Error(`src/content/association.yaml invalide :\n${details}`);
}

export const association = parseAssociation(raw);

/** Adresse ligne par ligne (rue sur 1 à 3 lignes, puis code postal et ville) : affichages sur plusieurs lignes. */
export function getAddressLines(): string[] {
	return [...association.address.street.split('\n'), `${association.address.postalCode} ${association.address.city}`];
}

/** Adresse sur une ligne, séparée par des virgules (texte courant, données structurées). */
export function getFullAddress(): string {
	return getAddressLines().join(', ');
}
