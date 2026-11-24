/**
 * Publication sur une Page Facebook par l'API Graph de Meta (serveur seul).
 *
 * Connexion : `facebook.page_id`, `facebook.jeton` (jeton de Page, permission
 * `pages_manage_posts`) et `facebook.version` facultative, saisis dans la page
 * de configuration du plugin et écrits **uniquement** dans
 * `<DATA_DIR>/connexions/diffusion.yaml` (`src/lib/connexions.ts`) ; lus à
 * chaque appel, jamais renvoyés au navigateur.
 *
 * Le jeton est vérifié (`verifierFacebook()` : Page + `debug_token`) à
 * l'enregistrement, puis une fois par jour au plus ; son état (nom de la
 * Page, échéances, erreur) est écrit sous `etat.facebook` du même fichier et
 * sert aux rappels de renouvellement (`rappelJeton()` de `regles.ts`).
 */
import { ecrireEtatConnexion, lireConnexion, lireEtatConnexion, valeurConnexion } from '../../../lib/connexions';
import type { EtatJeton } from './regles';

const PLUGIN = 'diffusion';
const DELAI_MS = 15_000;
/** Au-delà, l'état du jeton est revérifié auprès de Facebook. */
const REVERIFIER_MS = 24 * 60 * 60_000;
/** Jeton qui expire avant ce délai : jeton de courte durée (1 à 2 h), pas un jeton de Page longue durée. */
const COURTE_DUREE_MS = 2 * 24 * 60 * 60_000;

export class FacebookError extends Error {
	constructor(
		message: string,
		/** Jeton refusé (expiré, révoqué) : noté dans l'état de la connexion. */
		readonly jeton = false,
	) {
		super(message);
	}
}

export interface PageFacebook {
	nom: string;
	lien: string;
}

interface Config {
	pageId: string;
	jeton: string;
	version: string;
}

async function config(): Promise<Config | null> {
	const data = await lireConnexion(PLUGIN);
	const pageId = valeurConnexion(data, 'facebook.page_id');
	const jeton = valeurConnexion(data, 'facebook.jeton');
	return pageId && jeton ? { pageId, jeton, version: valeurConnexion(data, 'facebook.version') } : null;
}

/** Page et jeton renseignés dans le fichier de connexion ? */
export async function facebookConfigure(): Promise<boolean> {
	return (await config()) !== null;
}

/** Message lisible pour une erreur renvoyée par l'API Graph. */
function erreurGraph(erreur: { message?: string; code?: number }): FacebookError {
	const code = erreur.code;
	if (code === 190 || code === 102) {
		return new FacebookError(
			'Le jeton de la Page Facebook n’est plus valide (expiré, révoqué ou mot de passe changé) : générez-en un nouveau et remplacez-le dans le module « Plugins ».',
			true,
		);
	}
	if (code === 10 || (code !== undefined && code >= 200 && code < 300)) {
		return new FacebookError('Facebook refuse la publication : le jeton doit être celui de la Page, avec la permission pages_manage_posts.');
	}
	if (code === 100) return new FacebookError(`Demande refusée par Facebook (identifiant de Page ou lien incorrect) : ${erreur.message ?? ''}`.trim());
	if (code === 4 || code === 17 || code === 32 || code === 368) return new FacebookError('Facebook limite temporairement les publications de cette Page : réessayez plus tard.');
	return new FacebookError(`Facebook a refusé la demande${erreur.message ? ` : ${erreur.message}` : '.'}`);
}

async function graph<T>(cfg: Config, chemin: string, init: { method: 'GET' | 'POST'; params: Record<string, string> }): Promise<T> {
	const url = `https://graph.facebook.com/${cfg.version ? `${cfg.version}/` : ''}${chemin}`;
	const params = new URLSearchParams({ ...init.params, access_token: cfg.jeton });
	let res: Response;
	try {
		res =
			init.method === 'GET'
				? await fetch(`${url}?${params}`, { signal: AbortSignal.timeout(DELAI_MS) })
				: await fetch(url, {
						method: 'POST',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
						body: params,
						signal: AbortSignal.timeout(DELAI_MS),
					});
	} catch {
		throw new FacebookError('Facebook est injoignable pour le moment : réessayez dans quelques minutes.');
	}
	const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string; code?: number } }) | null;
	if (!res.ok || !data || data.error) throw erreurGraph(data?.error ?? { message: `réponse ${res.status}` });
	return data;
}

const iso = (secondes: unknown) => (typeof secondes === 'number' && secondes > 0 ? new Date(secondes * 1000).toISOString() : undefined);

/**
 * Vérifie la connexion auprès de Facebook (Page lisible, jeton de Page,
 * permission, échéances) et écrit le résultat sous `etat.facebook`.
 */
export async function verifierFacebook(): Promise<EtatJeton> {
	const cfg = await config();
	if (!cfg) throw new FacebookError('Page Facebook non configurée : renseignez l’identifiant de la Page et son jeton dans le module « Plugins ».');
	const etat: EtatJeton = { verifie_le: new Date().toISOString() };
	try {
		const page = await graph<{ name?: string; link?: string }>(cfg, encodeURIComponent(cfg.pageId), { method: 'GET', params: { fields: 'name,link' } });
		etat.page = page.name ?? 'Page Facebook';
		etat.lien_page = page.link ?? `https://www.facebook.com/${cfg.pageId}`;
		// Échéances du jeton : sans application, `debug_token` accepte le jeton lui-même.
		const debug = await graph<{ data?: Record<string, unknown> }>(cfg, 'debug_token', { method: 'GET', params: { input_token: cfg.jeton } }).catch(() => null);
		const d = debug?.data;
		if (d) {
			etat.type = typeof d.type === 'string' ? d.type : undefined;
			etat.expire_le = iso(d.expires_at);
			etat.acces_donnees_expire_le = iso(d.data_access_expires_at);
			const scopes = Array.isArray(d.scopes) ? d.scopes : [];
			if (d.is_valid === false) etat.erreur = 'Facebook indique que ce jeton n’est plus valide : générez-en un nouveau.';
			else if (etat.type && etat.type !== 'PAGE') {
				etat.erreur = `Ce jeton est un jeton « ${etat.type === 'USER' ? 'utilisateur' : etat.type} », pas celui de la Page : récupérez l’access_token de la Page avec me/accounts (étape 5 de la documentation).`;
			} else if (scopes.length && !scopes.includes('pages_manage_posts')) {
				etat.erreur = 'Le jeton n’a pas la permission pages_manage_posts : regénérez-le en cochant cette permission.';
			} else if (typeof d.profile_id === 'string' && d.profile_id !== cfg.pageId) {
				etat.erreur = 'Ce jeton est celui d’une autre Page que l’identifiant renseigné.';
			} else if (etat.expire_le && Date.parse(etat.expire_le) - Date.now() < COURTE_DUREE_MS) {
				etat.erreur = `Jeton de courte durée (il expire le ${new Date(etat.expire_le).toLocaleString('fr-FR')}) : prolongez-le dans le débogueur de jeton puis reprenez le jeton de la Page (étapes 4 et 5 de la documentation).`;
			}
		}
	} catch (err) {
		if (!(err instanceof FacebookError)) throw err;
		// Facebook injoignable : on ne remplace pas un état connu par une panne passagère.
		if (!err.jeton && /injoignable/.test(err.message)) throw err;
		etat.erreur = err.message;
	}
	await ecrireEtatConnexion(PLUGIN, 'facebook', { ...etat });
	return etat;
}

let enCours: Promise<EtatJeton> | null = null;

/**
 * État de la connexion (`null` si non configurée) : celui enregistré, revérifié
 * s'il a plus d'un jour (ou jamais vérifié). Une panne de Facebook laisse
 * l'état enregistré.
 */
export async function etatFacebook(): Promise<EtatJeton | null> {
	if (!(await facebookConfigure())) return null;
	const etat = await lireEtatConnexion<EtatJeton>(PLUGIN, 'facebook');
	const age = etat?.verifie_le ? Date.now() - Date.parse(etat.verifie_le) : Infinity;
	if (etat && age < REVERIFIER_MS) return etat;
	enCours ??= verifierFacebook().finally(() => (enCours = null));
	return enCours.catch(() => etat);
}

/** Nom et adresse de la Page (état vérifié). */
export async function pageFacebook(): Promise<PageFacebook> {
	const etat = await etatFacebook();
	if (!etat) throw new FacebookError('Page Facebook non configurée : renseignez l’identifiant de la Page et son jeton dans le module « Plugins ».');
	if (etat.erreur) throw new FacebookError(etat.erreur);
	if (!etat.page) throw new FacebookError('Page Facebook impossible à vérifier pour le moment.');
	return { nom: etat.page, lien: etat.lien_page ?? '' };
}

/**
 * Publie `message` + `lien` sur le fil de la Page (Facebook tire l'aperçu
 * des balises Open Graph de la page liée). Renvoie l'identifiant de la
 * publication et, si Facebook la donne, son adresse. Jeton refusé : noté
 * dans l'état de la connexion (rappel affiché aussitôt).
 */
export async function publierFacebook({ message, lien }: { message: string; lien: string }): Promise<{ id: string; lien?: string }> {
	const cfg = await config();
	if (!cfg) throw new FacebookError('Page Facebook non configurée : renseignez l’identifiant de la Page et son jeton dans le module « Plugins ».');
	let id: string | undefined;
	try {
		({ id } = await graph<{ id?: string }>(cfg, `${encodeURIComponent(cfg.pageId)}/feed`, { method: 'POST', params: { message, link: lien } }));
	} catch (err) {
		if (err instanceof FacebookError && err.jeton) {
			const avant = await lireEtatConnexion<EtatJeton>(PLUGIN, 'facebook');
			await ecrireEtatConnexion(PLUGIN, 'facebook', { ...avant, verifie_le: new Date().toISOString(), erreur: err.message }).catch(() => {});
		}
		throw err;
	}
	if (!id) throw new FacebookError('Facebook n’a pas confirmé la publication : vérifiez la Page avant de réessayer.');
	// Adresse de la publication : facultative, une erreur ici n'annule rien.
	const permalien = await graph<{ permalink_url?: string }>(cfg, encodeURIComponent(id), { method: 'GET', params: { fields: 'permalink_url' } }).catch(() => null);
	return { id, ...(permalien?.permalink_url ? { lien: permalien.permalink_url } : {}) };
}
