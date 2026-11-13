/**
 * Conversion HTML → PDF par une instance Gotenberg (`GOTENBERG_URL`, auth
 * Basic facultative `GOTENBERG_USERNAME` / `GOTENBERG_PASSWORD`), partagée
 * par les plugins et les extensions : bulletin d'adhésion (`adhesion`), devis et
 * factures (`facturation`), semaine de RDV (extension `rdv`).
 * Côté serveur uniquement : l'adresse et les identifiants ne doivent jamais
 * atteindre le navigateur.
 */
import { GOTENBERG_PASSWORD, GOTENBERG_URL as GOTENBERG_URL_RAW, GOTENBERG_USERNAME } from 'astro:env/server';

const GOTENBERG_URL = GOTENBERG_URL_RAW?.replace(/\/+$/, '');

/** En-tête d'auth HTTP Basic si l'instance Gotenberg en exige une, sinon rien. */
function gotenbergAuthHeaders(): Record<string, string> {
	if (!GOTENBERG_USERNAME || !GOTENBERG_PASSWORD) return {};
	const creds = Buffer.from(`${GOTENBERG_USERNAME}:${GOTENBERG_PASSWORD}`).toString('base64');
	return { Authorization: `Basic ${creds}` };
}

/** Instance Gotenberg configurée (bulletin d'adhésion, PDF du module « Rendez-vous »). */
export function isGotenbergEnabled(): boolean {
	return Boolean(GOTENBERG_URL);
}

export class GotenbergError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GotenbergError';
	}
}

/**
 * Envoie le HTML complet (document, pas fragment) à Gotenberg et renvoie le PDF
 * en `ArrayBuffer` (corps de `Response` valide, contrairement à `Buffer`).
 *
 * Les champs de formulaire préservent la mise en forme du gabarit :
 *  - marges à 0 + `preferCssPageSize` : Gotenberg n'ajoute pas ses ~1 cm et
 *    respecte le `@page` / les dimensions CSS du HTML ;
 *  - `paperWidth`/`paperHeight` = A4 en pouces : filet de sécurité si le HTML
 *    ne déclare pas de `@page` ;
 *  - `printBackground` : imprime les fonds (dégradés, encadrés) ;
 *  - `skipNetworkIdleEvent=false` : attend que le réseau soit calme, sinon le
 *    logo distant peut manquer.
 */
export async function htmlToPdf(html: string): Promise<ArrayBuffer> {
	if (!GOTENBERG_URL) throw new GotenbergError('GOTENBERG_URL manquant.');

	const form = new FormData();
	form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
	form.append('preferCssPageSize', 'true');
	form.append('marginTop', '0');
	form.append('marginBottom', '0');
	form.append('marginLeft', '0');
	form.append('marginRight', '0');
	form.append('paperWidth', '8.27');
	form.append('paperHeight', '11.69');
	form.append('printBackground', 'true');
	form.append('skipNetworkIdleEvent', 'false');

	let res: Response;
	try {
		res = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
			method: 'POST',
			headers: gotenbergAuthHeaders(),
			body: form,
		});
	} catch (cause) {
		throw new GotenbergError(`Gotenberg injoignable : ${String(cause)}`);
	}

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new GotenbergError(
			`Gotenberg ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
		);
	}

	return res.arrayBuffer();
}
