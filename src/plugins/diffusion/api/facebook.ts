/**
 * Diffuse une actualité sur la Page Facebook (garde `redacteur`, cf.
 * `src/middleware.ts` ; route construite seulement si l'outil `facebook` est
 * allumé). `POST { slug, message }` → publication du texte relu + lien vers
 * l'article en ligne, trace écrite dans l'en-tête de l'actualité
 * (`diffusion.facebook`), journal `diffusion.facebook`.
 *
 * Refusée si l'actualité est un brouillon, programmée, ou pas encore dans le
 * site construit (Facebook lit l'aperçu sur la page publique).
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { APIRoute } from 'astro';
import { json, jsonError, readJson, withErrors } from '../../../lib/auth/api';
import { logEvent } from '../../../lib/journal';
import { enregistrerDiffusion, readNewsSource, siteRoot } from '../../../lib/news-writer';
import { FacebookError, publierFacebook } from '../lib/facebook';
import { MESSAGE_MAX } from '../lib/regles';

export const prerender = false;

/** Page de l'actualité présente dans le site en ligne (`dist/`) ? */
async function enLigne(slug: string): Promise<boolean> {
	return Boolean(await stat(join(siteRoot(), 'dist', 'client', 'actualites', slug, 'index.html')).catch(() => null));
}

export const POST: APIRoute = withErrors(async ({ request, locals, site }) => {
	const user = locals.user!;
	const body = (await readJson(request)) ?? {};
	const slug = typeof body.slug === 'string' ? body.slug : '';
	const message = typeof body.message === 'string' ? body.message.trim() : '';

	const source = await readNewsSource(slug);
	if (!source) return jsonError('Actualité introuvable.', 404);
	if (!message) return jsonError('Le texte de la publication est vide.');
	if (message.length > MESSAGE_MAX) return jsonError(`Texte trop long : ${MESSAGE_MAX} caractères au plus.`);
	if (!source.isPublish) return jsonError('Cette actualité est un brouillon : publiez-la sur le site avant de la diffuser.', 409);
	if (source.publishAt > new Date().toLocaleDateString('sv-SE')) {
		return jsonError('Cette actualité est programmée : elle pourra être diffusée à partir de sa date de publication.', 409);
	}
	// En dev, pas de site construit à jour : on ne vérifie pas.
	if (!import.meta.env.DEV && !(await enLigne(slug))) {
		return jsonError('Cette actualité n’est pas encore en ligne : publiez-la (ou attendez la fin de la publication) avant de la diffuser.', 409);
	}
	if (!site) return jsonError('Adresse publique du site inconnue (SITE_URL) : impossible de donner le lien de l’actualité.', 500);
	const lien = new URL(`/actualites/${slug}`, site).href;

	let publication: { id: string; lien?: string };
	try {
		publication = await publierFacebook({ message, lien });
	} catch (err) {
		const texte = err instanceof FacebookError ? err.message : 'Facebook n’a pas pu être joint.';
		await logEvent({ by: user, action: 'diffusion.facebook', label: source.title, href: `/actualites/${slug}`, outcome: 'echec', message: texte });
		return jsonError(texte, 502);
	}

	const trace = { id: publication.id, date: new Date().toISOString(), ...(publication.lien ? { lien: publication.lien } : {}), par: user.fullname || user.login };
	let avertissement = '';
	try {
		await enregistrerDiffusion(slug, 'facebook', trace);
	} catch {
		avertissement = 'Publiée sur Facebook, mais la diffusion n’a pas pu être notée dans l’actualité.';
	}
	await logEvent({
		by: user,
		action: 'diffusion.facebook',
		label: source.title,
		href: `/actualites/${slug}`,
		outcome: 'ok',
		...(avertissement ? { message: avertissement } : publication.lien ? { message: publication.lien } : {}),
	});
	return json({ ok: true, trace, avertissement });
});
