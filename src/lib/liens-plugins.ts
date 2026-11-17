/**
 * Liens du site (bouton « Adhérer » et « Je participe » de l'en-tête,
 * boutons du bandeau d'accueil et de l'appel à l'action) qui mènent à la
 * page d'un plugin inactif ou d'un outil éteint (404) : à masquer.
 */
import { outilActif, pluginActif } from '../plugins';
import { ADHESION_HREF } from '../plugins/adhesion';
import { INSCRIPTION_HREF } from '../plugins/activites';
import { PRESENCE_HREF } from '../plugins/presence';

const PAGES: { href: string; disponible: () => boolean }[] = [
	{ href: ADHESION_HREF, disponible: () => pluginActif('adhesion') },
	{ href: PRESENCE_HREF, disponible: () => pluginActif('presence') },
	{ href: INSCRIPTION_HREF, disponible: () => outilActif('activites', 'inscription') },
];

export function lienPluginIndisponible(href: string): boolean {
	const chemin = href.split(/[?#]/)[0].replace(/\/+$/, '');
	const page = PAGES.find((p) => chemin === p.href || chemin.startsWith(`${p.href}/`));
	return page ? !page.disponible() : false;
}
