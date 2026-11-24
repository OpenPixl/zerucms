/**
 * Formulaire de contact (`src/pages/contact.astro`) : message envoyé à
 * l'adresse de la structure (`email` d'`association.yaml`, saisie à
 * l'installation ou dans le module « Association »), avec le compte e-mail
 * du site (`envoyerEmail()`, module « Site » → E-mails). « Répondre » écrit
 * directement à la personne (`repondreA`).
 * Champ piège `site` (robots) ; 5 messages par quart d'heure et par adresse
 * IP au plus.
 */
import type { APIRoute } from 'astro';
import { association } from '../../lib/association';
import { lockedMinutes, recordFailure } from '../../lib/auth/rate-limit';
import { emailConfigure, envoyerEmail } from '../../lib/email';
import { isFormOpen } from '../../lib/forms';
import { json } from '../../lib/http';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const INDISPONIBLE = `L'envoi en ligne est momentanément indisponible : écrivez-nous à ${association.email}.`;

export const POST: APIRoute = async ({ request, clientAddress }) => {
	if (!isFormOpen('contact')) return json({ error: 'Le formulaire de contact est fermé.' }, 403);
	const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || clientAddress;
	const cle = `contact:${ip}`;
	if (lockedMinutes(cle) > 0) return json({ error: 'Trop de messages envoyés : réessayez dans un moment.' }, 429);

	const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
	if (texte(b.site, 200)) return json({ ok: true }); // robot : réponse normale, rien d'envoyé
	const nom = texte(b.nom, 120).replace(/[\r\n]+/g, ' ');
	const email = texte(b.email, 120);
	const sujet = texte(b.sujet, 150).replace(/[\r\n]+/g, ' ');
	const message = texte(b.message, 5000);
	if (!nom || !EMAIL_RE.test(email) || !message) {
		return json({ error: 'Nom, adresse e-mail valide et message sont obligatoires.' }, 400);
	}
	if (!(await emailConfigure())) return json({ error: INDISPONIBLE }, 503);

	recordFailure(cle);
	try {
		await envoyerEmail({
			a: association.email,
			sujet: `[Site] ${sujet || `Message de ${nom}`}`,
			titre: sujet || 'Nouveau message du site',
			texte: `De : ${nom} (${email})\n\n${message}`,
			raison: `Message envoyé depuis le formulaire de contact du site. Répondez à cet e-mail pour écrire directement à ${nom}.`,
			repondreA: email,
		});
	} catch (err) {
		console.error('[api/contact]', (err as Error).message);
		return json({ error: INDISPONIBLE }, 503);
	}
	return json({ ok: true });
};
