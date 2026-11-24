/**
 * Mise en forme des e-mails envoyés par le site (`envoyerEmail()` de
 * `src/lib/email.ts`) : une version HTML **et** une version texte du même
 * message, pour qu'il soit lisible partout et moins souvent classé en
 * indésirable :
 *  - HTML simple et complet (doctype, `lang="fr"`, titre, styles en ligne,
 *    mise en page en tableau de 600 px), sans script ni image distante ;
 *  - bandeau : le **logo** du site (`src/content/images/logo.*`, converti en
 *    PNG par sharp, joint au message et cité par `cid:` : affiché sans
 *    « charger les images »), sinon le nom de la structure ;
 *  - mêmes mots dans les deux versions (un écart est mal vu des filtres) ;
 *  - pied de page avec le nom, l'adresse et le site de la structure, et la
 *    raison de l'envoi ;
 *  - liens en clair vers le domaine du site seulement (jamais de lien
 *    raccourci).
 * Couleur : `primary` de la charte, texte blanc si le contraste suffit (≥ 3).
 * Code serveur uniquement.
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { site } from '../config/site';
import { association, getAddressLines } from './association';
import { contraste, hexComplet } from './mode-sombre';
import { siteRoot } from './news-writer';

/** Logo joint au message (pièce jointe en ligne, citée par `cid:`). */
export interface LogoEmail {
	cid: string;
	contenu: Buffer;
	largeur: number;
	hauteur: number;
}

/** Hauteur affichée du logo dans le bandeau (PNG produit au double, pour les écrans fins). */
const HAUTEUR_LOGO = 56;
/** Largeur affichée au plus. */
const LARGEUR_LOGO_MAX = 240;

let logoEnCache: { cle: string; logo: LogoEmail | null } | null = null;

/** Logo du site prêt pour un e-mail, `null` s'il manque ou ne se lit pas (gardé tant que le fichier ne change pas). */
export async function logoEmail(): Promise<LogoEmail | null> {
	try {
		const dossier = join(siteRoot(), 'src', 'content', 'images');
		const nom = (await readdir(dossier)).find((f) => /^logo\.(png|jpe?g|webp|svg)$/i.test(f));
		if (!nom) return null;
		const fichier = join(dossier, nom);
		const cle = `${fichier}:${(await stat(fichier)).mtimeMs}`;
		if (logoEnCache?.cle === cle) return logoEnCache.logo;
		// Marges vides du fichier retirées : le logo occupe toute la hauteur prévue.
		const rogne = await sharp(fichier, { density: 300 }).trim().png().toBuffer();
		const contenu = await sharp(rogne)
			.resize({ height: HAUTEUR_LOGO * 2, width: LARGEUR_LOGO_MAX * 2, fit: 'inside', withoutEnlargement: false })
			.png()
			.toBuffer();
		const { width = 1, height = 1 } = await sharp(contenu).metadata();
		const echelle = Math.min(HAUTEUR_LOGO / height, LARGEUR_LOGO_MAX / width);
		const logo = { cid: 'logo@site', contenu, largeur: Math.round(width * echelle), hauteur: Math.round(height * echelle) };
		logoEnCache = { cle, logo };
		return logo;
	} catch {
		return null;
	}
}

export interface ContenuEmail {
	/** Titre en tête du message (facultatif). */
	titre?: string;
	/** Texte brut : une ligne vide sépare deux paragraphes. */
	texte: string;
	/** Bouton d'action, ex. « Voir l'actualité » (lien absolu). */
	bouton?: { texte: string; lien: string };
	/** Pourquoi la personne reçoit cet e-mail (pied de page). */
	raison?: string;
}

const echapper = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Adresse publique du site (`SITE_URL`), sans « / » final. */
export function adresseSite(): string {
	return (import.meta.env.SITE ?? 'http://localhost:4321').replace(/\/+$/, '');
}

function paragraphes(texte: string): string[] {
	return texte
		.replace(/\r\n/g, '\n')
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean);
}

function couleurs() {
	const fond = hexComplet(site.colors.primary);
	// Texte en gras (bandeau, bouton) : un contraste de 3 suffit.
	const blanc = contraste(fond, '#ffffff') >= 3;
	return { fond, texte: blanc ? '#ffffff' : '#1f2937' };
}

/** Version texte : titre, paragraphes, lien du bouton, pied de page. */
function versionTexte(c: ContenuEmail, pied: string[]): string {
	const morceaux: string[] = [];
	if (c.titre) morceaux.push(c.titre);
	morceaux.push(...paragraphes(c.texte));
	if (c.bouton) morceaux.push(`${c.bouton.texte} : ${c.bouton.lien}`);
	morceaux.push(`--\n${pied.join('\n')}`);
	return `${morceaux.join('\n\n')}\n`;
}

/** Message prêt à envoyer : `{ html, texte }`. */
export function mettreEnForme(c: ContenuEmail, logo: LogoEmail | null = null): { html: string; texte: string } {
	const { fond, texte: surFond } = couleurs();
	const url = adresseSite();
	const domaine = url.replace(/^https?:\/\//, '');
	const pied = [association.name, ...getAddressLines(), url, ...(c.raison ? [c.raison] : [])];

	const police = "font-family:Arial,Helvetica,sans-serif;";
	const corps = paragraphes(c.texte)
		.map((p) => `<p style="margin:0 0 16px;${police}font-size:15px;line-height:1.6;color:#1f2937;">${echapper(p).replace(/\n/g, '<br>')}</p>`)
		.join('\n');
	const titre = c.titre
		? `<h1 style="margin:0 0 20px;${police}font-size:20px;line-height:1.3;color:#111827;">${echapper(c.titre)}</h1>`
		: '';
	const bouton = c.bouton
		? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;"><tr><td style="border-radius:6px;background:${fond};">` +
			`<a href="${echapper(c.bouton.lien)}" style="display:inline-block;padding:12px 22px;${police}font-size:15px;font-weight:bold;color:${surFond};text-decoration:none;border-radius:6px;">${echapper(c.bouton.texte)}</a>` +
			`</td></tr></table>`
		: '';
	const bandeau = logo
		? `<tr><td style="background:#ffffff;padding:20px 28px;border-bottom:4px solid ${fond};">` +
			`<img src="cid:${logo.cid}" width="${logo.largeur}" height="${logo.hauteur}" alt="${echapper(association.name)}" style="display:block;border:0;width:${logo.largeur}px;height:${logo.hauteur}px;${police}font-size:18px;font-weight:bold;color:#111827;">` +
			`</td></tr>`
		: `<tr><td style="background:${fond};padding:18px 28px;${police}font-size:18px;font-weight:bold;color:${surFond};">${echapper(association.name)}</td></tr>`;
	const adresse = getAddressLines().map(echapper).join('<br>');
	const raison = c.raison ? `<p style="margin:12px 0 0;">${echapper(c.raison)}</p>` : '';

	const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(c.titre ?? association.name)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
${bandeau}
<tr><td style="padding:28px;">
${titre}
${corps}
${bouton}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e5e7eb;${police}font-size:12px;line-height:1.5;color:#6b7280;">
<p style="margin:0;"><strong>${echapper(association.name)}</strong><br>${adresse}<br><a href="${echapper(url)}" style="color:#6b7280;">${echapper(domaine)}</a></p>
${raison}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
	return { html, texte: versionTexte(c, pied) };
}
