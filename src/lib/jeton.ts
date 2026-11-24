/**
 * Jetons signés de courte durée (HMAC `AUTH_SECRET`) : une route publique
 * remet au navigateur un jeton qui décrit ce qu'il a le droit de demander
 * ensuite (ex. extension RDV : « envoyer le détail de CE rendez-vous à CETTE
 * adresse »), sans pouvoir le modifier. Usage unique en option : `unique`
 * à la lecture, puis `consommerJeton()` une fois l'action réussie (un échec
 * laisse réessayer).
 * Code serveur uniquement.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSecret } from 'astro:env/server';

function secret(): string | null {
	const s = getSecret('AUTH_SECRET') as string | undefined;
	return s && s.length >= 32 ? s : null;
}

function signature(objet: string, donnees: string, cle: string): string {
	return createHmac('sha256', cle).update(`${objet}.${donnees}`).digest('base64url');
}

/** Jeton signé pour `objet` (ex. `rdv-email`), valable `dureeSecondes` ; `null` sans `AUTH_SECRET`. */
export function signerJeton<T>(objet: string, valeur: T, dureeSecondes: number): string | null {
	const cle = secret();
	if (!cle) return null;
	const donnees = Buffer.from(JSON.stringify({ v: valeur, e: Math.floor(Date.now() / 1000) + dureeSecondes })).toString('base64url');
	return `${donnees}.${signature(objet, donnees, cle)}`;
}

/** Jetons à usage unique déjà servis (signature → échéance), en mémoire du serveur. */
const utilises = new Map<string, number>();

/**
 * Valeur d'un jeton valide (signature, échéance), sinon `null`.
 * `unique: true` : refusé s'il a déjà été consommé (`consommerJeton()`).
 */
export function lireJeton<T>(objet: string, jeton: unknown, { unique = false }: { unique?: boolean } = {}): T | null {
	const cle = secret();
	if (!cle || typeof jeton !== 'string') return null;
	const [donnees, signe] = jeton.split('.');
	if (!donnees || !signe) return null;
	const attendu = Buffer.from(signature(objet, donnees, cle));
	const recu = Buffer.from(signe);
	if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
	let contenu: { v: T; e: number };
	try {
		contenu = JSON.parse(Buffer.from(donnees, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	const maintenant = Math.floor(Date.now() / 1000);
	if (typeof contenu.e !== 'number' || contenu.e < maintenant) return null;
	if (unique) {
		for (const [j, e] of utilises) if (e < maintenant) utilises.delete(j);
		if (utilises.has(signe)) return null;
	}
	return contenu.v;
}

/** Marque un jeton (déjà validé par `lireJeton`) comme servi. */
export function consommerJeton(jeton: string): void {
	const [donnees, signe] = jeton.split('.');
	try {
		const { e } = JSON.parse(Buffer.from(donnees, 'base64url').toString('utf8')) as { e: number };
		utilises.set(signe, e);
	} catch {
		// jeton illisible : jamais validé par lireJeton
	}
}
