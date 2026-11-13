/**
 * Écriture des informations de l'association (`src/content/association.yaml`,
 * lu par `src/lib/association.ts`) depuis le module « Association » de
 * l'Espace Admin (bureau). La publication (reconstruction du site) est
 * faite par `site-build.ts`, via `admin-publish.ts`.
 *
 * Le YAML est modifié en place (`yaml` Document) : commentaires, guillemets
 * et ordre du fichier écrit à la main sont conservés, seules les valeurs
 * changent. Le fichier entier est revalidé (`parseAssociation`, mêmes règles
 * qu'au build) avant d'écrire. Réseaux sociaux : un champ vidé retire la
 * ligne ; une clé inconnue du module (ajoutée à la main) n'est pas touchée.
 *
 * « Transaction » sur ce seul fichier : texte d'origine gardé en mémoire,
 * réécrit si la reconstruction échoue (`restore`).
 *
 * Code serveur uniquement.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMap, isScalar, parseDocument, Scalar, YAMLMap, type Document } from 'yaml';
import { ADRESSE_LIGNES_MAX, normaliserRue, parseAssociation, SOCIAL_NETWORKS, type Association } from './association';
import type { Applied } from './content-transaction';
import { siteRoot } from './news-writer';
import { isSafeUrl } from './safe-url';

export const ASSOCIATION_NAME_MAX = 80;
export const ASSOCIATION_DESCRIPTION_MAX = 300;
const TEXT_MAX = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function associationFile(): string {
	return join(siteRoot(), 'src', 'content', 'association.yaml');
}

/** Informations telles qu'elles sont dans les sources (formulaire du module). */
export async function readAssociationSource(): Promise<Association> {
	return parseAssociation(await readFile(associationFile(), 'utf8'));
}

// --- Validation ------------------------------------------------------------

/** Champs du formulaire : chemin dans le YAML, libellé (messages d'erreur), obligatoire. */
const FIELDS: { path: string[]; label: string; required?: true; max?: number }[] = [
	{ path: ['name'], label: "Nom de l'association", required: true, max: ASSOCIATION_NAME_MAX },
	{ path: ['description'], label: 'Présentation', required: true, max: ASSOCIATION_DESCRIPTION_MAX },
	{ path: ['email'], label: 'Email de contact', required: true },
	{ path: ['phone'], label: 'Téléphone', required: true },
	{ path: ['address', 'street'], label: 'Adresse (rue)', required: true },
	{ path: ['address', 'postalCode'], label: 'Code postal', required: true },
	{ path: ['address', 'city'], label: 'Ville', required: true },
	{ path: ['legal', 'registrationNumber'], label: 'Numéro RNA' },
	{ path: ['legal', 'siretNumber'], label: 'Numéro SIRET' },
	{ path: ['legal', 'president'], label: 'Président·e' },
	{ path: ['legal', 'publicationManager'], label: 'Responsable de la publication' },
	{ path: ['legal', 'publicationManagerRole'], label: 'Fonction du·de la responsable' },
	{ path: ['legal', 'hosting', 'name'], label: "Nom de l'hébergeur" },
	{ path: ['legal', 'hosting', 'address'], label: "Adresse de l'hébergeur" },
	{ path: ['legal', 'hosting', 'phone'], label: "Téléphone de l'hébergeur" },
];

const valueAt = (input: Association, path: string[]): string =>
	String(path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : ''), input) ?? '');

function validate(input: Association): string[] {
	const errors: string[] = [];
	for (const { path, label, required, max = TEXT_MAX } of FIELDS) {
		const value = valueAt(input, path);
		if (required && !value) errors.push(`« ${label} » est obligatoire.`);
		else if (value.length > max) errors.push(`« ${label} » est trop long (${max} caractères max).`);
	}
	if (input.address.street.split('\n').length > ADRESSE_LIGNES_MAX) errors.push(`« Adresse » : ${ADRESSE_LIGNES_MAX} lignes au plus (sans le code postal ni la ville).`);
	if (input.email && !EMAIL.test(input.email)) errors.push("L'email de contact n'est pas une adresse valide.");
	for (const { key, label } of SOCIAL_NETWORKS) {
		const url = input.social[key] ?? '';
		if (url && (!/^https?:\/\//i.test(url) || !isSafeUrl(url) || url.length > TEXT_MAX)) {
			errors.push(`Lien ${label} invalide : adresse complète attendue (https://…).`);
		}
	}
	return errors;
}

// --- Écriture --------------------------------------------------------------

/** Table YAML à `path`, créée si absente ou vide (`legal:` sans contenu…). */
function ensureMap(doc: Document, path: string[]): YAMLMap {
	const node = doc.getIn(path, true);
	if (isMap(node)) return node;
	const map = new YAMLMap();
	doc.setIn(path, map);
	return map;
}

/**
 * Remplace une valeur en gardant son nœud (guillemets, commentaire de fin de
 * ligne) ; nouvelle valeur entre guillemets simples. Texte sur plusieurs
 * lignes (rue) : bloc `|-`, une ligne du fichier par ligne d'adresse.
 */
function setText(doc: Document, path: string[], value: string): void {
	const parent = ensureMap(doc, path.slice(0, -1));
	const key = path[path.length - 1];
	const node = parent.get(key, true);
	const multiligne = value.includes('\n');
	if (isScalar(node)) {
		node.value = value;
		if (multiligne) node.type = Scalar.BLOCK_LITERAL;
		else if (node.type === Scalar.BLOCK_LITERAL || node.type === Scalar.BLOCK_FOLDED) node.type = Scalar.QUOTE_SINGLE;
		return;
	}
	const scalar = new Scalar(value);
	scalar.type = multiligne ? Scalar.BLOCK_LITERAL : Scalar.QUOTE_SINGLE;
	parent.set(key, scalar);
}

export type AssociationResult = { name?: string; applied?: Applied; errors: string[] };

export async function saveAssociation(input: Association): Promise<AssociationResult> {
	const errors = validate(input);
	if (errors.length) return { errors };

	const file = associationFile();
	const original = await readFile(file, 'utf8');
	const doc = parseDocument(original);
	if (doc.errors.length) return { errors: [`association.yaml illisible : ${doc.errors[0].message}`] };

	for (const { path } of FIELDS) setText(doc, path, valueAt(input, path));
	const social = ensureMap(doc, ['social']);
	for (const { key } of SOCIAL_NETWORKS) {
		const url = input.social[key] ?? '';
		if (url) setText(doc, ['social', key], url);
		else social.delete(key);
	}

	const text = doc.toString({ lineWidth: 0 });
	parseAssociation(text);
	await writeFile(file, text, 'utf8');
	return {
		name: input.name,
		applied: { restore: () => writeFile(file, original, 'utf8'), purge: async () => {} },
		errors: [],
	};
}

/** Corps JSON du formulaire → `Association` (textes forcés, sans retour à la ligne sauf la rue, rognés ; rien n'est validé ici). */
export function readAssociationInput(raw: unknown): Association {
	const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
	const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
	const r = obj(raw);
	const address = obj(r.address);
	const legal = obj(r.legal);
	const hosting = obj(legal.hosting);
	const social = obj(r.social);
	return {
		name: text(r.name),
		description: text(r.description),
		email: text(r.email),
		phone: text(r.phone),
		address: { street: normaliserRue(address.street), postalCode: text(address.postalCode), city: text(address.city) },
		social: Object.fromEntries(SOCIAL_NETWORKS.map(({ key }) => [key, text(social[key])])),
		legal: {
			registrationNumber: text(legal.registrationNumber),
			siretNumber: text(legal.siretNumber),
			president: text(legal.president),
			publicationManager: text(legal.publicationManager),
			publicationManagerRole: text(legal.publicationManagerRole),
			hosting: { name: text(hosting.name), address: text(hosting.address), phone: text(hosting.phone) },
		},
	};
}
