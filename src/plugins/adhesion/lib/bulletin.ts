/**
 * Bulletin d'adhésion en PDF — voir docs/bulletin-pdf.md.
 *
 * Deux responsabilités, toutes deux CÔTÉ SERVEUR uniquement :
 *   - signer / vérifier le jeton d'accès au lien de téléchargement ;
 *   - relayer le HTML (colonne Formule de Grist) à Gotenberg -> PDF.
 *
 * `BULLETIN_SECRET` (et la configuration Gotenberg, `src/lib/gotenberg.ts`)
 * ne doivent jamais atteindre le navigateur.
 * Configuration lue au démarrage du serveur (`astro:env`, variables `secret`
 * de `astro.config.mjs`) : jamais figée dans dist/.
 */

import { BULLETIN_SECRET } from 'astro:env/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isGotenbergEnabled } from '../../../lib/gotenberg';

// Conversion HTML → PDF : `src/lib/gotenberg.ts` (partagée avec la facturation et les extensions).
export { GotenbergError, htmlToPdf } from '../../../lib/gotenberg';

/** Durée de validité du lien de bulletin (le règlement se fait en présentiel, 24 h suffisent). */
const TTL_SECONDS = 60 * 60 * 24;

/** La fonctionnalité n'est active que si les deux variables sont renseignées. */
export function isBulletinEnabled(): boolean {
	return Boolean(isGotenbergEnabled() && BULLETIN_SECRET);
}

function sign(payload: string): string {
	return createHmac('sha256', BULLETIN_SECRET as string)
		.update(payload)
		.digest('base64url');
}

/** Jeton opaque `<adhesionId>.<expEpoch>.<hmac>` transmis dans `?t=`. */
export function signBulletinToken(adhesionId: number, ttlSeconds = TTL_SECONDS): string {
	if (!BULLETIN_SECRET) throw new Error('BULLETIN_SECRET manquant.');
	const payload = `${adhesionId}.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
	return `${payload}.${sign(payload)}`;
}

/** Retourne l'`adhesionId` si le jeton est authentique et non expiré, sinon `null`. */
export function verifyBulletinToken(token: string | null | undefined): number | null {
	if (!BULLETIN_SECRET || !token) return null;

	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [idStr, expStr, sig] = parts;

	const expected = sign(`${idStr}.${expStr}`);
	if (sig.length !== expected.length) return null;
	if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

	const adhesionId = Number(idStr);
	const exp = Number(expStr);
	if (!Number.isInteger(adhesionId) || !Number.isFinite(exp)) return null;
	if (exp * 1000 < Date.now()) return null;

	return adhesionId;
}

