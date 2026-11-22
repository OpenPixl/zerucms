/**
 * Photo d'un contenu telle qu'elle est dans les sources (groupes `redacteur`
 * / `admin`, garde dans `src/middleware.ts`) : photos des blocs
 * (`photo_<n>.<ext>`) et photo de couverture (`cover.<ext>`) d'une page, d'une
 * actualité ou d'une activité. Sert au téléchargement d'un contenu en `.zip`
 * (« Télécharger le fichier », `src/components/admin/zip-contenu.ts`) : le
 * site ne publie que des versions optimisées.
 *
 *  - GET `?dossier=<pages|news|activites>/<chemin>&fichier=photo_1.jpg`
 */
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { SITE_ROOT } from 'astro:env/server';
import { jsonError, withErrors } from '../../../lib/auth/api';

export const prerender = false;

const DOSSIER = /^(?:pages|news|activites)\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;
const FICHIER = /^(?:photo_\d{1,4}|cover)\.(jpg|jpeg|png|webp|avif)$/;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

export const GET: APIRoute = withErrors(async ({ url }) => {
	const dossier = url.searchParams.get('dossier') ?? '';
	const fichier = url.searchParams.get('fichier') ?? '';
	const ext = fichier.match(FICHIER)?.[1];
	if (!DOSSIER.test(dossier) || !ext) return jsonError('Photo introuvable.', 404);
	const racine = resolve(SITE_ROOT || process.cwd(), 'src', 'content');
	const chemin = resolve(racine, dossier, fichier);
	if (!chemin.startsWith(racine + sep)) return jsonError('Photo introuvable.', 404);
	const data = await readFile(join(chemin)).catch(() => null);
	if (!data) return jsonError('Photo introuvable.', 404);
	return new Response(new Uint8Array(data), { headers: { 'content-type': TYPES[ext], 'cache-control': 'private, no-store' } });
});
