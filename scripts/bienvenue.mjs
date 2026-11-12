/**
 * Première visite d'un site neuf, à la manière des CMS courants : tant
 * qu'aucun compte n'existe (`<DATA_DIR>/accounts/` vide), toute page répond
 * par l'écran « Bienvenue » qui crée le compte super admin (nom, identifiant,
 * e-mail, mot de passe choisi), via `POST /api/auth/premier-compte`. La
 * personne est alors connectée et arrive sur la page de l'assistant
 * d'installation (`/installation`, `src/pages/installation.astro`), sans
 * repasser par le site de démonstration.
 *
 * Comme pour WordPress, la première personne qui ouvre le site l'installe :
 * à faire dès la mise en ligne (ou créer le compte en ligne de commande avec
 * `auth-user init`, qui ferme cet écran).
 *
 * Utilisé par la porte de `scripts/maintenance.mjs` (production et dev).
 * Module sans dépendance à Astro.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Route de création du premier compte (`src/pages/api/auth/premier-compte.ts`). */
export const ROUTE_PREMIER_COMPTE = '/api/auth/premier-compte';

/** Une fois un compte vu, plus besoin de relire le dossier (les comptes ne disparaissent pas tous). */
const avecComptes = new Set();

/** Vrai tant que `<DATA_DIR>/accounts/` ne contient aucun compte. */
export function aucunCompte(dataDir) {
	if (avecComptes.has(dataDir)) return false;
	let fichiers = [];
	try {
		fichiers = readdirSync(join(dataDir, 'accounts'));
	} catch {
		return true;
	}
	if (fichiers.some((f) => f.endsWith('.yaml'))) {
		avecComptes.add(dataDir);
		return false;
	}
	return true;
}

/** Page autonome (aucun fichier du site requis). */
export function pageBienvenue() {
	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bienvenue — installation du site</title>
<style>
	:root { color-scheme: light dark; --fond: #f6f7f9; --carte: #fff; --texte: #1f2937; --doux: #6b7280; --bord: #d1d5db; --accent: #2563eb; --erreur: #b91c1c; }
	@media (prefers-color-scheme: dark) { :root { --fond: #111827; --carte: #1f2937; --texte: #f3f4f6; --doux: #9ca3af; --bord: #4b5563; --accent: #60a5fa; --erreur: #fca5a5; } }
	* { box-sizing: border-box; }
	body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--fond); color: var(--texte); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
	main { width: 100%; max-width: 30rem; background: var(--carte); border-radius: 16px; padding: 2rem 1.5rem; box-shadow: 0 1px 3px rgb(0 0 0 / .08); }
	.etapes { margin: 0 0 1rem; font-size: .8rem; color: var(--doux); text-transform: uppercase; letter-spacing: .04em; }
	h1 { margin: 0 0 .5rem; font-size: 1.4rem; }
	p { margin: 0 0 1rem; color: var(--doux); }
	form { display: grid; gap: .9rem; }
	label { display: grid; gap: .25rem; font-weight: 600; font-size: .9rem; }
	.aide { font-weight: 400; font-size: .8rem; color: var(--doux); }
	input { font: inherit; font-weight: 400; padding: .5rem .7rem; border: 1px solid var(--bord); border-radius: 8px; background: var(--fond); color: var(--texte); }
	input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
	button { font: inherit; font-weight: 600; margin-top: .4rem; padding: .6rem 1rem; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
	button:disabled { opacity: .6; cursor: wait; }
	#erreur { margin: 0; color: var(--erreur); font-size: .9rem; }
	#erreur:empty { display: none; }
</style>
</head>
<body>
<main>
	<p class="etapes">Installation · étape 1 sur 2</p>
	<h1>Bienvenue sur votre nouveau site</h1>
	<p>Commencez par créer votre compte d'administration. Il a tous les droits
	sur le site. Vous paramétrerez ensuite votre structure (nom, logo,
	fonctions…) avec l'assistant d'installation.</p>
	<form id="compte" novalidate>
		<label>Votre nom
			<input name="fullname" autocomplete="name" required maxlength="80">
		</label>
		<label>Identifiant de connexion
			<span class="aide">2 à 32 caractères : lettres minuscules, chiffres, « . », « - » ou « _ ».</span>
			<input name="login" autocomplete="username" required maxlength="32" autocapitalize="none" spellcheck="false">
		</label>
		<label>E-mail <span class="aide">(facultatif)</span>
			<input name="email" type="email" autocomplete="email" maxlength="120">
		</label>
		<label>Mot de passe
			<span class="aide">10 caractères au moins.</span>
			<input name="password" type="password" autocomplete="new-password" required minlength="10">
		</label>
		<label>Mot de passe (confirmation)
			<input name="confirmation" type="password" autocomplete="new-password" required minlength="10">
		</label>
		<p id="erreur" role="alert"></p>
		<button type="submit">Créer mon compte et continuer</button>
	</form>
</main>
<script>
(() => {
	const form = document.getElementById('compte');
	const erreur = document.getElementById('erreur');
	const bouton = form.querySelector('button');
	form.login.addEventListener('input', () => { form.login.value = form.login.value.toLowerCase().replace(/\\s+/g, ''); });
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		erreur.textContent = '';
		const d = Object.fromEntries(new FormData(form));
		if (!d.fullname.trim() || !d.login.trim()) { erreur.textContent = 'Nom et identifiant sont obligatoires.'; return; }
		if (d.password.length < 10) { erreur.textContent = 'Le mot de passe doit contenir au moins 10 caractères.'; return; }
		if (d.password !== d.confirmation) { erreur.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
		bouton.disabled = true;
		try {
			const r = await fetch('${ROUTE_PREMIER_COMPTE}', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) });
			const j = await r.json().catch(() => null);
			if (r.ok || r.status === 409) {
				// Site neuf : un « Plus tard » d'une installation précédente (même adresse, même onglet) ne vaut plus.
				try { sessionStorage.removeItem('numerik-installation-plus-tard'); } catch {}
				location.href = '/installation';
				return;
			}
			erreur.textContent = (j && j.error) || 'Création du compte impossible.';
		} catch { erreur.textContent = 'Serveur injoignable.'; }
		bouton.disabled = false;
	});
})();
</script>
</body>
</html>`;
}
