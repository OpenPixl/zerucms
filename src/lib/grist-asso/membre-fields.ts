/**
 * Validation + conversion "payload formulaire" -> "champs Grist" pour un membre.
 * Partagé par les routes /api/adhesion/membre (étape 1) et /api/adhesion/co-membre
 * (membre supplémentaire d'une adhésion multiple).
 */
import { GENRE_CHOICES, ROLE_MORAL, ROLE_PHYSIQUE } from './choices';
import { COLS, dateToEpochSeconds } from './grist';
import { isNonEmptyString } from '../http';
import type { Genre, MembrePayload } from './types';

export function readGenre(value: unknown): Genre | null {
	return (GENRE_CHOICES as readonly string[]).includes(value as string) ? (value as Genre) : null;
}

/** Valide un payload d'identité complète. Renvoie null si invalide. */
export function validateMembrePayload(data: Record<string, unknown>): MembrePayload | null {
	const {
		genre,
		nom,
		prenom,
		dateNaissance,
		email,
		adresse,
		codePostal,
		commune,
		telFixe,
		telMobile,
		newsletter,
		droitImage,
	} = data;

	const g = readGenre(genre);
	if (!g) return null;

	const estAssociation = g === 'Association';
	const requis = estAssociation
		? [nom, prenom, email, adresse, codePostal, commune]
		: [nom, prenom, dateNaissance, email, adresse, codePostal, commune];
	if (!requis.every(isNonEmptyString)) return null;
	if (!String(email).includes('@')) return null;
	if (!estAssociation && dateToEpochSeconds(String(dateNaissance)) === null) return null;
	if (!/^\d{5}$/.test(String(codePostal))) return null;
	if (!isNonEmptyString(telFixe) && !isNonEmptyString(telMobile)) return null;

	return {
		genre: g,
		nom: String(nom).trim(),
		prenom: String(prenom).trim(),
		dateNaissance: estAssociation ? '' : String(dateNaissance),
		email: String(email).trim(),
		adresse: String(adresse).trim(),
		codePostal: String(codePostal).trim(),
		commune: String(commune).trim(),
		telFixe: typeof telFixe === 'string' ? telFixe.trim() : '',
		telMobile: typeof telMobile === 'string' ? telMobile.trim() : '',
		newsletter: newsletter === true,
		droitImage: droitImage === true,
	};
}

/** Construit l'objet `fields` Grist pour créer un enregistrement Membres. */
export function membreFieldsForGrist(p: MembrePayload): Record<string, unknown> {
	const c = COLS.membre;
	const ddn = p.dateNaissance ? dateToEpochSeconds(p.dateNaissance) : null;

	const fields: Record<string, unknown> = {
		[c.genre]: p.genre,
		[c.role]: p.genre === 'Association' ? ROLE_MORAL : ROLE_PHYSIQUE,
		[c.nom]: p.nom,
		[c.prenom]: p.prenom,
		[c.email]: p.email,
		[c.adresse]: p.adresse,
		[c.codePostal]: p.codePostal,
		[c.commune]: p.commune,
		[c.telFixe]: p.telFixe,
		[c.telMobile]: p.telMobile,
		[c.newsletter]: p.newsletter,
		[c.droitImage]: p.droitImage,
	};
	if (ddn !== null) fields[c.dateNaissance] = ddn;
	return fields;
}
