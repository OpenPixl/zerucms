/**
 * Authentification : renseigne `Astro.locals.user` sur chaque requête rendue
 * à la demande et garde les routes de l'Espace Admin :
 *  - `/api/auth/*`, `/api/admin/*` : requêtes du site lui-même uniquement ;
 *  - `/api/admin/*` : connexion obligatoire (401) ;
 *  - préfixes de `GUARDS` : groupe requis (403), `admin` / `superadmin`
 *    passent toujours, sauf garde `noAdmin` (journal, plugins : `superadmin` seul) ;
 *  - mot de passe provisoire (`mustChangePassword`) : seule
 *    `/api/admin/mot-de-passe` répond (403 ailleurs).
 * L'interface (modale de connexion, barre et modules) est un îlot Vue
 * (`src/components/admin/AdminRoot.vue`) ; les pages de contenu restreintes
 * par `access:` sont contrôlées par `src/pages/[...slug].astro`.
 * Les pages prérendues (statiques) ne passent pas ici à l'exécution.
 */

import { defineMiddleware } from 'astro:middleware';
import { isAdmin } from './lib/auth/access';
import type { AuthGroup } from './lib/auth/groups';
import { isSameOrigin, jsonError } from './lib/auth/api';
import { readSession } from './lib/auth/session';

/** Routes réservées à certains groupes (en plus de la connexion). Tenir aligné avec `ADMIN_MODULES`. */
const GUARDS: { prefix: string; groups: AuthGroup[]; message: string; noAdmin?: true }[] = [
	{ prefix: '/api/admin/sauvegardes/restauration', groups: ['superadmin'], message: 'La restauration est réservée au super admin.', noAdmin: true },
	{ prefix: '/api/admin/sauvegardes', groups: ['admin'], message: 'Les sauvegardes sont réservées au bureau.' },
	{ prefix: '/api/admin/installation', groups: ['superadmin'], message: "L'installation est réservée au super admin.", noAdmin: true },
	{ prefix: '/api/admin/journal', groups: ['superadmin'], message: 'Le journal est réservé au super admin.', noAdmin: true },
	{ prefix: '/api/admin/plugins', groups: ['superadmin'], message: 'La gestion des plugins est réservée au super admin.', noAdmin: true },
	// Plugin RDV (routes ajoutées seulement s'il est actif).
	{ prefix: '/api/admin/rdv', groups: ['animateur'], message: 'La gestion des rendez-vous est réservée au bureau et aux animateur·rice·s.' },
	// Plugin facturation (routes ajoutées seulement s'il est actif).
	{ prefix: '/api/admin/facturation', groups: ['admin'], message: 'La facturation est réservée aux administrateur·rice·s.' },
	{ prefix: '/api/admin/comptes', groups: ['admin'], message: 'La gestion des comptes est réservée au bureau.' },
	{ prefix: '/api/admin/version', groups: ['admin'], message: 'Réservé au bureau.' },
	{ prefix: '/api/admin/maintenance', groups: ['admin'], message: 'Le mode maintenance est réservé au bureau.' },
	{ prefix: '/api/admin/association', groups: ['admin'], message: "Les informations de l'association sont réservées au bureau." },
	{ prefix: '/api/admin/charte', groups: ['admin'], message: 'La charte graphique est réservée au bureau.' },
	{ prefix: '/api/admin/actualites', groups: ['redacteur'], message: 'La publication des actualités est réservée aux rédacteur·rice·s.' },
	{ prefix: '/api/admin/publication', groups: ['redacteur'], message: 'Réservé aux rédacteur·rice·s.' },
	{ prefix: '/api/admin/activites', groups: ['redacteur'], message: 'La gestion des activités est réservée aux rédacteur·rice·s.' },
	{ prefix: '/api/admin/annonces', groups: ['redacteur'], message: 'La gestion des annonces est réservée aux rédacteur·rice·s.' },
	{ prefix: '/api/admin/pages', groups: ['redacteur'], message: 'La gestion des pages est réservée aux rédacteur·rice·s.' },
	{ prefix: '/api/admin/ordre-menu', groups: ['redacteur'], message: 'La gestion du menu est réservée aux rédacteur·rice·s.' },
	{ prefix: '/api/admin/pages-du-site', groups: ['redacteur'], message: 'La gestion des pages est réservée aux rédacteur·rice·s.' },
	{ prefix: '/api/admin/liens', groups: ['redacteur'], message: 'Réservé aux rédacteur·rice·s.' },
	{ prefix: '/api/admin/menus-deroulants', groups: ['redacteur'], message: 'La gestion des menus déroulants est réservée aux rédacteur·rice·s.' },
];

function startsWithSegment(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

export const onRequest = defineMiddleware(async (context, next) => {
	if (context.isPrerendered) return next();

	const path = context.url.pathname.replace(/\/+$/, '') || '/';
	const isAuthApi = startsWithSegment(path, '/api/auth') || startsWithSegment(path, '/api/admin');
	if (isAuthApi && !isSameOrigin(context)) {
		// Souvent : site ouvert à une autre adresse que SITE_URL (IP, 127.0.0.1…).
		console.warn(`[admin] requête refusée (origine) : ${context.request.method} ${path} depuis ${context.request.headers.get('origin') ?? context.request.headers.get('sec-fetch-site') ?? 'origine inconnue'}`);
		return jsonError('Requête refusée.', 403);
	}

	const user = await readSession(context.cookies);
	context.locals.user = user;

	if (startsWithSegment(path, '/api/admin')) {
		if (!user) return jsonError('Session expirée : reconnectez-vous.', 401);
		if (user.mustChangePassword && path !== '/api/admin/mot-de-passe') {
			return jsonError('Choisissez d’abord votre mot de passe personnel.', 403);
		}
		const guard = GUARDS.find((g) => startsWithSegment(path, g.prefix));
		if (guard && !(isAdmin(user) && !guard.noAdmin) && !guard.groups.some((g) => user.groups.includes(g))) {
			return jsonError(guard.message, 403);
		}
	}

	const response = await next();
	// Contenu personnalisé : jamais mis en cache par un proxy partagé.
	if (user) response.headers.set('Cache-Control', 'private, no-store');
	return response;
});
