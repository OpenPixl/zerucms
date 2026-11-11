/**
 * Mode maintenance du site. Tant que `<DATA_DIR>/publication/maintenance.json`
 * existe, les pages répondent par une page « Site en maintenance » (503) ;
 * `/api/*`, les fichiers du site (`/_astro/`, `/_image`, favicon) passent.
 * L'état est servi en JSON sur `/__maintenance` (`{ etat: 'aucune' }` hors
 * maintenance : la page se recharge alors), un aperçu de la page sur
 * `/__maintenance/apercu[?message=…]`.
 *
 * Deux sortes :
 *  - **restauration** (`ouvrirMaintenance`) : barre de progression écrite par
 *    la route de restauration et la publication (`src/lib/site-build.ts`,
 *    d'après la sortie du build) ; personne ne passe ; retirée au démarrage
 *    du serveur (`scripts/start.mjs` : fin du redémarrage qui suit la
 *    publication, ou reste d'un serveur arrêté en cours de route) ;
 *  - **manuelle** (`ouvrirMaintenanceManuelle`, module « Site » de l'Espace
 *    Admin) : message libre, pas de progression ; les membres connectés
 *    (cookie indicateur `numerik_connecte`) voient le site normalement, la
 *    page propose un formulaire de connexion ; survit aux redémarrages,
 *    levée depuis le module. Ce n'est pas une protection : le contenu reste
 *    public, seul l'affichage est suspendu.
 *
 * Site neuf sans aucun compte : la même porte sert l'écran « Bienvenue »
 * (création du premier compte, `scripts/bienvenue.mjs`).
 *
 * La décision (`reponseMaintenance`) est partagée par la porte placée devant
 * le serveur de production (`porteMaintenance`, `scripts/start.mjs`) et par
 * `src/integrations/maintenance.ts` en développement (serveur Vite : le
 * middleware d'Astro ne voit pas les cookies des pages prérendues). Module
 * sans dépendance à Astro.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { aucunCompte, pageBienvenue } from './bienvenue.mjs';

/**
 * @typedef {{ etat: 'en-cours' | 'redemarrage', motif: string, etape: string, progression: number, debut: string,
 *   nature?: 'restauration' | 'installation', manuel?: boolean, message?: string, par?: string }} Maintenance
 */

export const ROUTE_ETAT = '/__maintenance';
/** Cookie indicateur de session ouverte (`HINT_COOKIE_NAME` de `src/lib/auth/session.ts`). */
const COOKIE_CONNECTE = 'numerik_connecte=1';
export const MESSAGE_PAR_DEFAUT = 'Le site est momentanément indisponible pour maintenance. Merci de revenir un peu plus tard.';

export function fichierMaintenance(dataDir) {
	return join(dataDir, 'publication', 'maintenance.json');
}

/** @returns {Maintenance | null} */
export function lireMaintenance(dataDir) {
	try {
		return JSON.parse(readFileSync(fichierMaintenance(dataDir), 'utf8'));
	} catch {
		return null;
	}
}

function ecrireMaintenance(dataDir, etat) {
	const fichier = fichierMaintenance(dataDir);
	mkdirSync(join(dataDir, 'publication'), { recursive: true });
	writeFileSync(`${fichier}.tmp`, JSON.stringify(etat));
	renameSync(`${fichier}.tmp`, fichier);
}

/**
 * Met le site en maintenance pendant une reconstruction (barre de
 * progression) ; `nature` complète la phrase « Le site est en cours de … ».
 */
export function ouvrirMaintenance(dataDir, motif, etape = 'Préparation…', nature = 'restauration') {
	ecrireMaintenance(dataDir, { etat: 'en-cours', motif, nature, etape, progression: 2, debut: new Date().toISOString() });
}

/** Maintenance décidée depuis l'Espace Admin : message libre, membres connectés admis. */
export function ouvrirMaintenanceManuelle(dataDir, { message = '', par = '', debut = new Date().toISOString() } = {}) {
	ecrireMaintenance(dataDir, {
		etat: 'en-cours',
		manuel: true,
		motif: 'Maintenance',
		message: String(message).trim().slice(0, 500),
		par,
		etape: '',
		progression: 0,
		debut,
	});
}

/** Avance l'étape / le pourcentage (sans effet hors maintenance ; la progression ne recule jamais). */
export function avancerMaintenance(dataDir, { etape, progression, etat } = {}) {
	const m = lireMaintenance(dataDir);
	if (!m || m.manuel) return;
	ecrireMaintenance(dataDir, {
		...m,
		...(etape ? { etape } : {}),
		...(etat ? { etat } : {}),
		progression: Math.max(m.progression, Math.min(100, Math.round(progression ?? m.progression))),
	});
}

/** Rouvre le site. */
export function fermerMaintenance(dataDir) {
	rmSync(fichierMaintenance(dataDir), { force: true });
}

/** Nom de l'association, relu à chaque affichage (le contenu change pendant une restauration). */
export function nomAssociation(root) {
	try {
		const m = readFileSync(join(root, 'src', 'content', 'association.yaml'), 'utf8').match(/^name:\s*['"]?(.*?)['"]?\s*$/m);
		return m ? m[1] : '';
	} catch {
		return '';
	}
}

const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Page autonome (aucun fichier du site : il peut être en cours de remplacement). */
export function pageMaintenance({ nom = '', etat, apercu = false } = {}) {
	const titre = nom ? `${echapper(nom)} — site en maintenance` : 'Site en maintenance';
	const manuel = Boolean(etat?.manuel);
	const pct = manuel ? 0 : (etat?.progression ?? 0);
	const texte = manuel
		? echapper(etat?.message || MESSAGE_PAR_DEFAUT).replace(/\n/g, '<br>')
		: `${nom ? `Le site de ${echapper(nom)}` : 'Le site'} est en cours ${echapper(etat?.nature === 'installation' ? "d'installation" : 'de restauration')}. Il revient dans quelques minutes : cette page se met à jour toute seule.`;
	const progression = manuel
		? ''
		: `<div class="barre" role="progressbar" aria-label="Avancement" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="plein" id="plein"></div></div>
	<div class="ligne"><span id="etape" aria-live="polite">${echapper(etat?.etape ?? 'Préparation…')}</span><span id="pct">${pct} %</span></div>`;
	// Maintenance manuelle : connexion des membres (les membres connectés voient le site).
	const connexion = manuel
		? `<details id="acces">
		<summary>Espace Admin</summary>
		<form id="connexion">
			<label>Identifiant <input name="login" autocomplete="username" required></label>
			<label>Mot de passe <input name="password" type="password" autocomplete="current-password" required></label>
			<p id="erreur" role="alert"></p>
			<button type="submit">Se connecter</button>
		</form>
	</details>`
		: '';
	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${titre}</title>
<style>
	:root { color-scheme: light dark; --fond: #f6f7f9; --carte: #fff; --texte: #1f2937; --doux: #6b7280; --barre: #e5e7eb; --plein: #2563eb; --erreur: #b91c1c; }
	@media (prefers-color-scheme: dark) { :root { --fond: #111827; --carte: #1f2937; --texte: #f3f4f6; --doux: #9ca3af; --barre: #374151; --plein: #60a5fa; --erreur: #fca5a5; } }
	* { box-sizing: border-box; }
	body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--fond); color: var(--texte); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
	main { width: 100%; max-width: 32rem; background: var(--carte); border-radius: 16px; padding: 2rem 1.5rem; box-shadow: 0 1px 3px rgb(0 0 0 / .08); text-align: center; }
	h1 { margin: 0 0 .25rem; font-size: 1.35rem; }
	p { margin: 0; color: var(--doux); }
	.barre { margin: 1.5rem 0 .5rem; height: .75rem; border-radius: 999px; background: var(--barre); overflow: hidden; }
	.plein { height: 100%; width: ${pct}%; background: var(--plein); border-radius: inherit; transition: width .6s ease; }
	.ligne { display: flex; justify-content: space-between; gap: 1rem; font-size: .875rem; color: var(--doux); }
	#etape { text-align: left; }
	#pct { font-variant-numeric: tabular-nums; }
	details { margin-top: 1.5rem; font-size: .875rem; color: var(--doux); }
	summary { cursor: pointer; }
	form { display: grid; gap: .6rem; margin-top: .75rem; text-align: left; }
	label { display: grid; gap: .2rem; }
	input { font: inherit; padding: .4rem .6rem; border: 1px solid var(--barre); border-radius: 8px; background: var(--fond); color: var(--texte); }
	button { font: inherit; padding: .45rem .8rem; border: 0; border-radius: 8px; background: var(--plein); color: #fff; cursor: pointer; }
	#erreur { color: var(--erreur); }
	#erreur:empty { display: none; }
</style>
</head>
<body>
<main>
	${apercu ? '<p style="margin-bottom:1rem;font-size:.8rem">Aperçu de la page vue par les visiteurs</p>' : ''}<h1>Site en maintenance</h1>
	<p>${texte}</p>
	${progression}
	${connexion}
</main>
<script>
(() => {
	const manuel = ${manuel ? 'true' : 'false'};
	if (${apercu ? 'true' : 'false'}) return;
	const plein = document.getElementById('plein'), etape = document.getElementById('etape'), pct = document.getElementById('pct');
	let vu = ${pct};
	const montrer = (p, texte) => {
		if (!plein) return;
		vu = Math.max(vu, p);
		plein.style.width = vu + '%'; pct.textContent = vu + ' %'; plein.parentElement.setAttribute('aria-valuenow', vu);
		if (texte) etape.textContent = texte;
	};
	async function suivre() {
		try {
			const r = await fetch('${ROUTE_ETAT}', { cache: 'no-store' });
			if (r.ok) {
				const m = await r.json();
				if (m.etat === 'aucune') { montrer(100, 'Terminé : chargement du site…'); setTimeout(() => location.reload(), 800); return; }
				if (!manuel) montrer(m.progression, m.etape);
			} else montrer(vu, 'Redémarrage du serveur…');
		} catch { montrer(vu, 'Redémarrage du serveur…'); }
		setTimeout(suivre, manuel ? 30000 : 1500);
	}
	setTimeout(suivre, manuel ? 30000 : 1000);
	const form = document.getElementById('connexion');
	if (form) form.addEventListener('submit', async (e) => {
		e.preventDefault();
		const erreur = document.getElementById('erreur');
		erreur.textContent = '';
		const donnees = Object.fromEntries(new FormData(form));
		try {
			const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(donnees) });
			if (r.ok) return location.reload();
			const d = await r.json().catch(() => null);
			erreur.textContent = (d && d.error) || 'Connexion impossible.';
		} catch { erreur.textContent = 'Serveur injoignable.'; }
	});
})();
</script>
</body>
</html>`;
}

/** Chemins jamais bloqués (API, fichiers du site). */
const LIBRES = /^\/(?:api\/|_astro\/|_image(?:\?|$)|favicon)/;

/**
 * Réponse à donner à la place du site, ou `null` pour le laisser répondre.
 * @param {{ url: string, method?: string, cookie?: string, dataDir: string, nom?: () => string }} requete
 * @returns {{ status: number, headers: Record<string, string>, body: string | undefined } | null}
 */
export function reponseMaintenance({ url, method = 'GET', cookie = '', dataDir, nom = () => '' }) {
	if (url === ROUTE_ETAT || url.startsWith(`${ROUTE_ETAT}?`)) {
		const m = lireMaintenance(dataDir);
		return {
			status: 200,
			headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
			body: JSON.stringify(m ? { etat: m.etat, etape: m.etape, progression: m.progression, manuel: Boolean(m.manuel) } : { etat: 'aucune' }),
		};
	}
	// Aperçu (module « Site ») : la page telle que les visiteurs la voient, message en cours ou par défaut.
	if (url === `${ROUTE_ETAT}/apercu` || url.startsWith(`${ROUTE_ETAT}/apercu?`)) {
		const m = lireMaintenance(dataDir);
		const message = new URL(url, 'http://x').searchParams.get('message');
		const etat = m && !m.manuel ? m : { ...(m ?? {}), manuel: true, message: message ?? m?.message ?? '' };
		return {
			status: 200,
			headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
			body: pageMaintenance({ nom: nom(), etat, apercu: true }),
		};
	}
	if (LIBRES.test(url) || (method !== 'GET' && method !== 'HEAD')) return null;
	const m = lireMaintenance(dataDir);
	// Site neuf sans aucun compte : écran « Bienvenue » (création du premier compte, scripts/bienvenue.mjs).
	if (!m && aucunCompte(dataDir)) {
		return {
			status: 200,
			headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
			body: method === 'HEAD' ? undefined : pageBienvenue(),
		};
	}
	if (!m) return null;
	if (m.manuel && cookie.split(/;\s*/).includes(COOKIE_CONNECTE)) return null;
	return {
		status: 503,
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': m.manuel ? '3600' : '60' },
		body: method === 'HEAD' ? undefined : pageMaintenance({ nom: nom(), etat: m }),
	};
}

/**
 * Enveloppe le gestionnaire HTTP du site (production, `scripts/start.mjs`).
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} handler
 * @param {{ dataDir: string, nom?: () => string }} options
 */
export function porteMaintenance(handler, { dataDir, nom = () => '' }) {
	return (req, res) => {
		const r = reponseMaintenance({ url: req.url || '/', method: req.method, cookie: req.headers.cookie, dataDir, nom });
		if (!r) return handler(req, res);
		res.writeHead(r.status, r.headers);
		res.end(r.body);
	};
}
