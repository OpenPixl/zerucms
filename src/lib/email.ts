/**
 * Envoi d'e-mails par le site (compte SMTP de la structure), réglé par le
 * bureau dans le module « Site » (`SiteModule.vue`, route `/api/admin/email`).
 *
 * Identifiants écrits **uniquement** dans `<DATA_DIR>/connexions/email.yaml`
 * (même mécanisme que les connexions des plugins : `src/lib/connexions.ts`,
 * droits 600, hors du build et des sauvegardes) ; mot de passe jamais renvoyé
 * au navigateur. Lu à chaque envoi : un changement vaut sans reconstruire ni
 * redémarrer.
 *
 *     smtp:
 *       hote: "smtp.exemple.fr"
 *       port: "587"            # 465 = SSL direct, sinon STARTTLS
 *       identifiant: "contact@exemple.fr"
 *       mot_de_passe: "…"
 *     expediteur:
 *       email: "contact@exemple.fr"   # vide = l'identifiant
 *       nom: "Mon association"        # vide = nom de la structure
 *     etat:
 *       smtp: { verifie_le: "…", erreur: "…" }
 *
 * Pour envoyer depuis une fonction du site : `envoyerEmail({ a, sujet, texte })`
 * (+ `titre`, `bouton`, `raison` facultatifs) : message mis en forme par
 * `src/lib/email-modele.ts` (HTML + texte, pied de page de la structure).
 * Code serveur uniquement.
 */
import nodemailer from 'nodemailer';
import type { ChampConnexion } from '../plugins/champs';
import type { StatutConnexion } from '../plugins/connexions';
import { association } from './association';
import { ecrireEtatConnexion, lireConnexion, lireEtatConnexion, valeurConnexion } from './connexions';
import { adresseSite, logoEmail, mettreEnForme, type ContenuEmail } from './email-modele';

/** Nom du fichier de connexion (`data/connexions/email.yaml`). */
export const CONNEXION_EMAIL = 'email';

export const CHAMPS_EMAIL: readonly ChampConnexion[] = [
	{
		cle: 'smtp.hote',
		label: "Serveur d'envoi (SMTP)",
		type: 'hote',
		clair: true,
		obligatoire: true,
		aide: 'Indiqué par votre hébergeur de messagerie, ex. smtp.gmail.com, ssl0.ovh.net, smtp.office365.com.',
	},
	{ cle: 'smtp.port', label: 'Port', type: 'port', clair: true, aide: 'En général 587 (par défaut) ou 465.' },
	{ cle: 'smtp.identifiant', label: 'Identifiant', type: 'texte', clair: true, obligatoire: true, aide: 'Souvent l’adresse e-mail elle-même.' },
	{
		cle: 'smtp.mot_de_passe',
		label: 'Mot de passe',
		type: 'motdepasse',
		obligatoire: true,
		aide: 'Pour Gmail ou Outlook, un « mot de passe d’application » créé dans les réglages de sécurité du compte.',
	},
	{ cle: 'expediteur.email', label: "Adresse d'expédition", type: 'email', clair: true, aide: 'Vide : l’identifiant ci-dessus.' },
	{ cle: 'expediteur.nom', label: "Nom de l'expéditeur", type: 'texte', clair: true, aide: `Vide : « ${association.name} ».` },
];

interface ConfigEmail {
	hote: string;
	port: number;
	identifiant: string;
	motDePasse: string;
	de: { address: string; name: string };
}

interface EtatEmail {
	verifie_le?: string;
	erreur?: string;
}

async function config(): Promise<ConfigEmail | null> {
	const d = await lireConnexion(CONNEXION_EMAIL);
	const v = (cle: string) => valeurConnexion(d, cle);
	if (!v('smtp.hote') || !v('smtp.identifiant') || !v('smtp.mot_de_passe')) return null;
	const identifiant = v('smtp.identifiant');
	const adresse = v('expediteur.email') || (identifiant.includes('@') ? identifiant : '');
	if (!adresse) return null;
	return {
		hote: v('smtp.hote'),
		port: Number(v('smtp.port')) || 587,
		identifiant,
		motDePasse: v('smtp.mot_de_passe'),
		de: { address: adresse, name: v('expediteur.nom') || association.name },
	};
}

/** Domaine d'une adresse e-mail, en minuscules (`''` sans « @ »). */
const domaine = (adresse: string) => (adresse.includes('@') ? adresse.split('@').pop()!.toLowerCase() : '');

function transport(c: ConfigEmail) {
	// Nom annoncé au serveur (EHLO) : le domaine du site plutôt que le nom de
	// la machine ou du conteneur, que certains filtres anti-spam pénalisent.
	const nom = new URL(adresseSite()).hostname;
	return nodemailer.createTransport({
		...(nom !== 'localhost' ? { name: nom } : {}),
		host: c.hote,
		port: c.port,
		secure: c.port === 465,
		auth: { user: c.identifiant, pass: c.motDePasse },
		connectionTimeout: 15_000,
		greetingTimeout: 15_000,
		socketTimeout: 30_000,
	});
}

/** Le compte e-mail est-il renseigné (sans le vérifier) ? */
export async function emailConfigure(): Promise<boolean> {
	return (await config()) !== null;
}

/** Message d'erreur compréhensible à partir d'une erreur de nodemailer. */
function messageErreur(err: unknown): string {
	const e = err as { code?: string; responseCode?: number; message?: string };
	if (e.code === 'EAUTH' || e.responseCode === 535) return 'Identifiant ou mot de passe refusé par le serveur d’envoi.';
	if (e.code === 'ENOTFOUND' || e.code === 'EDNS') return 'Serveur d’envoi introuvable : vérifiez son nom.';
	if (e.code === 'ETIMEDOUT' || e.code === 'ECONNECTION' || e.code === 'ECONNREFUSED' || e.code === 'ESOCKET') {
		return 'Le serveur d’envoi ne répond pas : vérifiez son nom et le port (587 ou 465).';
	}
	return `Envoi impossible : ${e.message ?? String(err)}`;
}

const STATUT_TITRE = 'Compte e-mail';

function statutDe(c: ConfigEmail | null, etat: EtatEmail | null): StatutConnexion[] {
	if (!c) return [];
	if (etat?.erreur) return [{ titre: STATUT_TITRE, niveau: 'erreur', message: etat.erreur, verifieLe: etat.verifie_le }];
	if (!etat?.verifie_le) return [{ titre: STATUT_TITRE, niveau: 'inconnu', message: 'Pas encore vérifié.' }];
	const ok: StatutConnexion = { titre: STATUT_TITRE, niveau: 'ok', message: `Envois au nom de ${c.de.name} <${c.de.address}>.`, verifieLe: etat.verifie_le };
	// Adresse d'expédition d'un autre domaine que le compte : souvent classée en indésirable.
	const compte = domaine(c.identifiant);
	if (compte && domaine(c.de.address) !== compte) {
		return [
			ok,
			{
				titre: "Adresse d'expédition",
				niveau: 'attention',
				message: `${c.de.address} n'est pas du même domaine que le compte (${compte}) : les e-mails risquent d'arriver dans les indésirables.`,
			},
		];
	}
	return [ok];
}

/** État enregistré (sans contacter le serveur). */
export async function statutEmail(): Promise<StatutConnexion[]> {
	return statutDe(await config(), await lireEtatConnexion<EtatEmail>(CONNEXION_EMAIL, 'smtp'));
}

/** Connexion au serveur d'envoi (identifiants compris), état enregistré. */
export async function verifierEmail(): Promise<StatutConnexion[]> {
	const c = await config();
	if (!c) return [];
	const etat: EtatEmail = { verifie_le: new Date().toISOString() };
	try {
		await transport(c).verify();
	} catch (err) {
		etat.erreur = messageErreur(err);
	}
	await ecrireEtatConnexion(CONNEXION_EMAIL, 'smtp', etat);
	return statutDe(c, etat);
}

export interface Email extends ContenuEmail {
	a: string | string[];
	sujet: string;
	/** HTML déjà prêt : remplace la mise en forme (le `texte` est alors envoyé tel quel). */
	html?: string;
	repondreA?: string;
}

/** Envoie un e-mail avec le compte du site ; erreur lisible si non configuré ou refusé. */
export async function envoyerEmail(email: Email): Promise<void> {
	const c = await config();
	if (!c) throw new Error('Le compte e-mail du site n’est pas configuré (module « Site »).');
	try {
		const logo = email.html ? null : await logoEmail();
		const corps = email.html ? { html: email.html, texte: email.texte } : mettreEnForme(email, logo);
		await transport(c).sendMail({
			from: c.de,
			to: email.a,
			subject: email.sujet,
			text: corps.texte,
			html: corps.html,
			// Message envoyé par le site, pas par une personne : pas de réponse automatique.
			headers: { 'Auto-Submitted': 'auto-generated' },
			...(logo ? { attachments: [{ filename: 'logo.png', content: logo.contenu, cid: logo.cid, contentDisposition: 'inline' as const }] } : {}),
			...(email.repondreA ? { replyTo: email.repondreA } : {}),
		});
	} catch (err) {
		throw new Error(messageErreur(err));
	}
}
