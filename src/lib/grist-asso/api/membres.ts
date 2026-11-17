import type { APIRoute } from 'astro';
import { COLS, GristError, listRecords, TABLES } from '../grist';
import { json, normalize } from '../../http';
import type { MembreRecherche } from '../types';

export const prerender = false;

const LIMITE = 8;

/** Recherche de membres par nom/prénom (rattachement d'un membre existant). */
export const GET: APIRoute = async ({ url }) => {
	const q = normalize(url.searchParams.get('q') ?? '');
	if (q.length < 2) return json([]);

	try {
		const c = COLS.membre;
		const records = await listRecords(TABLES.membres);
		const resultats: MembreRecherche[] = records
			.map((r) => {
				const prenom = String(r.fields[c.prenom] ?? '').trim();
				const nom = String(r.fields[c.nom] ?? '').trim();
				return { r, prenom, nom, hay: normalize(`${prenom} ${nom} ${nom} ${prenom}`) };
			})
			.filter(({ hay }) => q.split(' ').every((mot) => hay.includes(mot)))
			.slice(0, LIMITE)
			.map(({ r, prenom, nom }) => {
				const ddn = Number(r.fields[c.dateNaissance]);
				const annee = Number.isFinite(ddn) ? new Date(ddn * 1000).getUTCFullYear() : null;
				const ville = String(r.fields[c.commune] ?? '').trim();
				const indice = [annee ? `né·e en ${annee}` : '', ville].filter(Boolean).join(' · ');
				return { membreId: r.id, prenom, nom, indice };
			});

		return json(resultats);
	} catch (err) {
		const status = err instanceof GristError ? err.status : 500;
		console.error('[api/adhesion/membres]', err);
		return json({ error: 'Recherche impossible.' }, status);
	}
};
