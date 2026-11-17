import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import type { AdresseSuggestion } from '../../../lib/grist-asso/types';

export const prerender = false;

// API Adresse (Base Adresse Nationale) — service public, sans clé.
const BAN = 'https://api-adresse.data.gouv.fr/search/';

/** Autocomplétion d'adresse : renvoie voie + code postal + commune. */
export const GET: APIRoute = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 3) return json([]);

	try {
		const res = await fetch(`${BAN}?q=${encodeURIComponent(q)}&limit=6&type=housenumber&autocomplete=1`);
		if (!res.ok) return json({ error: 'Service adresse indisponible.' }, 502);

		const data = (await res.json()) as {
			features: { properties: Record<string, unknown> }[];
		};
		const suggestions: AdresseSuggestion[] = (data.features ?? []).map((f) => {
			const p = f.properties;
			return {
				label: String(p.label ?? ''),
				adresse: String(p.name ?? ''),
				codePostal: String(p.postcode ?? ''),
				commune: String(p.city ?? ''),
			};
		});
		return json(suggestions);
	} catch (err) {
		console.error('[api/adhesion/adresse]', err);
		return json({ error: 'Service adresse indisponible.' }, 502);
	}
};
