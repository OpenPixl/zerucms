import type { APIRoute } from 'astro';
import { isValidLogin, listAccounts, normalizeLogin, saveAccount, type Account } from '../../../lib/auth/accounts';
import { json, jsonError, publicUser, readJson } from '../../../lib/auth/api';
import { hashPassword, passwordProblem } from '../../../lib/auth/password';
import { isAuthConfigured, openSession } from '../../../lib/auth/session';
import { logEvent } from '../../../lib/journal';

export const prerender = false;

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Une création à la fois : deux envois simultanés ne créent pas deux comptes. */
let enCours: Promise<unknown> = Promise.resolve();

/**
 * Premier compte d'un site neuf (écran « Bienvenue », `scripts/bienvenue.mjs`) :
 * `{ fullname, login, email?, password, confirmation }` → compte super admin
 * + session ouverte. Refusé (409) dès qu'un compte existe.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
	if (!isAuthConfigured()) {
		return jsonError("La connexion n'est pas encore configurée sur ce serveur (AUTH_SECRET manquant).", 503);
	}
	const body = await readJson(request);
	const fullname = texte(body?.fullname, 80);
	const login = normalizeLogin(texte(body?.login, 40));
	const email = texte(body?.email, 120);
	const password = typeof body?.password === 'string' ? body.password : '';
	const confirmation = typeof body?.confirmation === 'string' ? body.confirmation : '';

	if (!fullname) return jsonError('Indiquez votre nom.');
	if (!isValidLogin(login)) return jsonError('Identifiant invalide : 2 à 32 caractères, lettres minuscules, chiffres, « . », « - » ou « _ ».');
	if (email && !EMAIL.test(email)) return jsonError('Adresse e-mail invalide.');
	const probleme = passwordProblem(password);
	if (probleme) return jsonError(probleme);
	if (password !== confirmation) return jsonError('Les deux mots de passe ne sont pas identiques.');

	const creation = enCours.then(async () => {
		if ((await listAccounts()).length) return null;
		const now = new Date().toISOString();
		const account: Account = {
			login,
			fullname,
			...(email ? { email } : {}),
			groups: ['superadmin'],
			state: 'enabled',
			hashedPassword: await hashPassword(password),
			created: now,
			updated: now,
		};
		await saveAccount(account);
		return account;
	});
	enCours = creation.catch(() => {});
	const account = await creation;
	if (!account) return jsonError('Le site a déjà un compte : connectez-vous depuis « Espace Admin ».', 409);

	openSession(cookies, account);
	await logEvent({ by: account, action: 'compte.creation', label: account.login, message: 'premier compte (super admin), écran « Bienvenue »' });
	return json({ user: publicUser(account) });
};
