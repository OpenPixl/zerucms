/**
 * État des réseaux du plugin diffusion (garde `redacteur`, cf. `src/middleware.ts`) :
 * `GET` → `{ dev, facebook: { actif, configure, page?, erreur?, rappel? } }`.
 * La Page et le jeton sont vérifiés auprès de Facebook au plus une fois par
 * jour (état écrit dans le fichier de connexion) ; `rappel` = jeton à
 * renouveler bientôt ou expiré. Le jeton n'est jamais renvoyé.
 */
import type { APIRoute } from 'astro';
import { json, withErrors } from '../../../lib/auth/api';
import { outilActif } from '../../index';
import { etatFacebook } from '../lib/facebook';
import { rappelJeton } from '../lib/regles';

export const prerender = false;

export const GET: APIRoute = withErrors(async () => {
	const actif = outilActif('diffusion', 'facebook');
	const etat = actif ? await etatFacebook().catch(() => null) : null;
	const rappel = etat ? rappelJeton(etat) : null;
	return json({
		dev: import.meta.env.DEV,
		facebook: {
			actif,
			configure: etat !== null,
			page: etat?.page && !etat.erreur ? { nom: etat.page, lien: etat.lien_page ?? '' } : null,
			erreur: etat ? (etat.erreur ?? (etat.page ? '' : 'Page Facebook impossible à vérifier pour le moment.')) : '',
			rappel: rappel && (rappel.niveau === 'bientot' || rappel.niveau === 'expire') ? rappel : null,
		},
	});
});
