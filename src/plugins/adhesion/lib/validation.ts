/**
 * Validation côté client (messages inline). Le serveur revalide de toute façon
 * (voir membre-fields.ts) — ceci ne sert qu'à guider la saisie.
 */
import { GENRE_CHOICES } from '../../../lib/grist-asso/choices';
import type { ContactPayload, MembrePayload } from '../../../lib/grist-asso/types';

import type { Errors } from '../../../lib/http';
export type { Errors };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CP_RE = /^\d{5}$/;

function telNormalise(v: string): string {
	return v.replace(/[\s.\-]/g, '');
}

export function validateMembre(m: MembrePayload): Errors<MembrePayload> {
	const e: Errors<MembrePayload> = {};

	if (!(GENRE_CHOICES as readonly string[]).includes(m.genre)) {
		e.genre = 'Sélectionnez un genre.';
	}
	if (!m.nom.trim()) e.nom = 'Le nom est obligatoire.';
	if (!m.prenom.trim()) e.prenom = 'Le prénom est obligatoire.';

	if (m.genre !== 'Association') {
		if (!m.dateNaissance) {
			e.dateNaissance = 'La date de naissance est obligatoire.';
		} else {
			const d = new Date(`${m.dateNaissance}T00:00:00`);
			if (Number.isNaN(d.getTime())) e.dateNaissance = 'Date invalide.';
			else if (d > new Date()) e.dateNaissance = 'La date ne peut pas être dans le futur.';
			else if (d < new Date('1900-01-01')) e.dateNaissance = 'Date trop ancienne.';
		}
	}

	if (!m.email.trim()) e.email = 'Le courriel est obligatoire.';
	else if (!EMAIL_RE.test(m.email.trim())) e.email = 'Courriel invalide.';

	if (!m.adresse.trim()) e.adresse = "L'adresse est obligatoire.";
	if (!m.codePostal.trim()) e.codePostal = 'Le code postal est obligatoire.';
	else if (!CP_RE.test(m.codePostal.trim())) e.codePostal = 'Le code postal doit comporter 5 chiffres.';
	if (!m.commune.trim()) e.commune = 'La commune est obligatoire.';

	const fixe = telNormalise(m.telFixe);
	const mobile = telNormalise(m.telMobile);
	if (!fixe && !mobile) {
		e.telFixe = 'Indiquez au moins un numéro de téléphone.';
		e.telMobile = 'Indiquez au moins un numéro de téléphone.';
	} else {
		if (fixe && !/^0\d{9}$/.test(fixe)) e.telFixe = 'Numéro à 10 chiffres attendu.';
		if (mobile && !/^0\d{9}$/.test(mobile)) e.telMobile = 'Numéro à 10 chiffres attendu.';
	}

	return e;
}

export function validateContact(c: ContactPayload): Errors<ContactPayload> {
	const e: Errors<ContactPayload> = {};
	if (!c.nom.trim()) e.nom = 'Le nom est obligatoire.';
	if (!c.prenom.trim()) e.prenom = 'Le prénom est obligatoire.';
	if (!c.email.trim()) e.email = 'Le courriel est obligatoire.';
	else if (!EMAIL_RE.test(c.email.trim())) e.email = 'Courriel invalide.';
	return e;
}

export function validateRenouvellement(r: { nom: string; prenom: string }): Errors<{
	nom: string;
	prenom: string;
}> {
	const e: Errors<{ nom: string; prenom: string }> = {};
	if (!r.nom.trim()) e.nom = 'Le nom est obligatoire.';
	if (!r.prenom.trim()) e.prenom = 'Le prénom est obligatoire.';
	return e;
}

export function hasErrors(e: Record<string, string | undefined>): boolean {
	return Object.values(e).some(Boolean);
}
