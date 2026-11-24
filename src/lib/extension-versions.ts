/**
 * Mises à jour des extensions (module « Extensions », super admin) : une
 * extension dont la fiche déclare `depot` (« propriétaire/dépôt » GitHub,
 * public) est comparée à la **dernière Release** de ce dépôt — même principe
 * que le badge de version du CMS (`model-version.ts`) : API publique, sans
 * jeton, cache mémoire 6 h (30 min après un échec), jamais bloquant.
 *
 * La version minimale du CMS demandée par la nouvelle version est lue dans
 * son `extension.json` (au tag de la Release) : « nécessite le CMS X » plutôt
 * qu'un refus après téléchargement.
 *
 * Mise à jour = l'archive `.zip` jointe à la Release, téléchargée par le
 * serveur (adresse de téléchargement de ce dépôt seulement, 20 Mo au plus),
 * puis installée exactement comme une archive déposée à la main
 * (`installExtension()` : contrôles, ancienne version gardée jusqu'à la
 * reconstruction réussie).
 *
 * Code serveur uniquement.
 */
import { extensionsSources } from './plugin-adresses';
import { isNewer, MODEL_VERSION } from './model-version';
import { DEPOT_RE, TAILLE_MAX, versionAuMoins } from '../../scripts/extension.mjs';

export interface MiseAJourExtension {
	id: string;
	installee: string;
	/** Dernière version publiée, `null` si GitHub est injoignable. */
	derniere: string | null;
	/** Page des nouveautés de la Release. */
	url: string | null;
	disponible: boolean;
	/** Version minimale du CMS demandée par la dernière version. */
	cms: string | null;
	/** Le CMS en place suffit-il ? */
	compatible: boolean;
	/** Archive .zip jointe à la Release (sinon : mise à jour à la main). */
	archive: boolean;
}

interface Release {
	version: string;
	url: string;
	archive: string | null;
	cms: string | null;
}

const CACHE_OK = 6 * 60 * 60 * 1000;
const CACHE_ERREUR = 30 * 60 * 1000;
const cache = new Map<string, { at: number; ttl: number; release: Release | null }>();

const ENTETES = { Accept: 'application/vnd.github+json', 'User-Agent': `zerucms/${MODEL_VERSION}` };

async function lireRelease(depot: string): Promise<Release | null> {
	try {
		const res = await fetch(`https://api.github.com/repos/${depot}/releases/latest`, { headers: ENTETES, signal: AbortSignal.timeout(5000) });
		if (!res.ok) throw new Error(`GitHub ${res.status}`);
		const data = (await res.json()) as { tag_name?: unknown; html_url?: unknown; assets?: { name?: unknown; browser_download_url?: unknown }[] };
		if (typeof data.tag_name !== 'string') throw new Error('Release sans tag');
		const tag = data.tag_name;
		const prefixe = `https://github.com/${depot}/releases/download/`;
		const zip = (data.assets ?? []).find(
			(a) => typeof a.name === 'string' && a.name.endsWith('.zip') && typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(prefixe),
		);
		// Version minimale du CMS : extension.json au tag de la Release.
		let cms: string | null = null;
		const fiche = await fetch(`https://raw.githubusercontent.com/${depot}/${encodeURIComponent(tag)}/extension.json`, {
			headers: { 'User-Agent': ENTETES['User-Agent'] },
			signal: AbortSignal.timeout(5000),
		})
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null);
		if (fiche && typeof fiche.cms === 'string' && /^\d+\.\d+\.\d+$/.test(fiche.cms)) cms = fiche.cms;
		return {
			version: tag.replace(/^v/, ''),
			url: typeof data.html_url === 'string' ? data.html_url : `https://github.com/${depot}/releases`,
			archive: zip ? (zip.browser_download_url as string) : null,
			cms,
		};
	} catch (e) {
		console.warn(`[extensions] dernière version de ${depot} inconnue : ${(e as Error).message}`);
		return null;
	}
}

async function release(depot: string, rafraichir = false): Promise<Release | null> {
	const c = cache.get(depot);
	if (!rafraichir && c && Date.now() - c.at < c.ttl) return c.release;
	const r = await lireRelease(depot);
	cache.set(depot, { at: Date.now(), ttl: r ? CACHE_OK : CACHE_ERREUR, release: r });
	return r;
}

/** État des mises à jour des extensions installées qui déclarent un dépôt. */
export async function misesAJourExtensions({ rafraichir = false } = {}): Promise<MiseAJourExtension[]> {
	const suivies = extensionsSources().filter(({ fiche }) => typeof fiche.depot === 'string' && DEPOT_RE.test(fiche.depot));
	return Promise.all(
		suivies.map(async ({ id, fiche }) => {
			const r = await release(fiche.depot!, rafraichir);
			const disponible = r !== null && isNewer(r.version, fiche.version);
			return {
				id,
				installee: fiche.version,
				derniere: r?.version ?? null,
				url: r?.url ?? null,
				disponible,
				cms: r?.cms ?? null,
				compatible: !r?.cms || versionAuMoins(MODEL_VERSION, r.cms),
				archive: Boolean(r?.archive),
			};
		}),
	);
}

/** Archive de la dernière version de l'extension `id`, prête pour `installExtension()` ; erreur lisible sinon. */
export async function telechargerMiseAJour(id: unknown): Promise<{ zip: Uint8Array; version: string; precedente: string }> {
	const source = extensionsSources().find((e) => e.id === id);
	if (!source) throw new Error('Extension inconnue.');
	const { fiche } = source;
	if (!fiche.depot || !DEPOT_RE.test(fiche.depot)) throw new Error('Cette extension ne déclare pas où trouver ses mises à jour : déposez l’archive à la main.');
	const r = await release(fiche.depot, true);
	if (!r) throw new Error('Impossible de joindre GitHub pour le moment : réessayez plus tard.');
	if (!isNewer(r.version, fiche.version)) throw new Error(`La version ${fiche.version} est déjà la plus récente.`);
	if (r.cms && !versionAuMoins(MODEL_VERSION, r.cms)) throw new Error(`La version ${r.version} demande le CMS ${r.cms} : mettez d’abord le site à jour.`);
	if (!r.archive) throw new Error(`La version ${r.version} n’a pas d’archive .zip : téléchargez-la depuis ${r.url}.`);

	const res = await fetch(r.archive, { headers: { 'User-Agent': ENTETES['User-Agent'] }, signal: AbortSignal.timeout(60_000) });
	if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (GitHub ${res.status}).`);
	if (Number(res.headers.get('content-length') ?? 0) > TAILLE_MAX) throw new Error('Archive trop volumineuse.');
	// Lecture bornée : on s'arrête dès que la taille maximale est dépassée.
	const morceaux: Uint8Array[] = [];
	let total = 0;
	for await (const morceau of res.body as unknown as AsyncIterable<Uint8Array>) {
		total += morceau.length;
		if (total > TAILLE_MAX) throw new Error('Archive trop volumineuse.');
		morceaux.push(morceau);
	}
	const zip = new Uint8Array(total);
	let pos = 0;
	for (const m of morceaux) {
		zip.set(m, pos);
		pos += m.length;
	}
	return { zip, version: r.version, precedente: fiche.version };
}
