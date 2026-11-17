/**
 * Fichier `.md` d'une actualité (navigateur) : téléchargé depuis le
 * formulaire en modification, puis rechargé pour le remplir (`EditFileBar`).
 * Mêmes clés que le dépôt d'une actualité (cf. docs/actualites.md,
 * src/lib/news-writer.ts) ; l'adresse et la photo restent dans le
 * formulaire. Le serveur revalide tout à l'enregistrement.
 */
import type { NewsFields } from '../../client';
import { contentKindProblem } from '../../content-import';
import { buildMarkdownFile, downloadMarkdown, keyWarnings, parseMarkdownFile, textField } from '../../markdown-file';

type NewsFile = NewsFields & { body: string };

const KNOWN = ['title', 'publishAt', 'excerpt', 'isPublish', 'tag', 'author', 'imageCredit'];
const IGNORED: Record<string, string | null> = {
	cover: "la photo se change dans l'onglet « Image »",
	activite: "le lien vers l'activité est gardé tel quel",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function newsMarkdownFile(n: NewsFile): string {
	return buildMarkdownFile(
		'actualite',
		{
			title: n.title,
			publishAt: n.publishAt,
			excerpt: n.excerpt,
			isPublish: n.isPublish,
			tag: n.tag,
			author: n.author,
			imageCredit: n.imageCredit,
		},
		n.body,
	);
}

/** Lit un fichier chargé ; date illisible = remarque, date du formulaire gardée (`publishAt` vide). */
export function parseNewsMarkdown(source: string): { fields?: NewsFile; warnings: string[]; error?: string } {
	const { data, body, error } = parseMarkdownFile(source);
	if (!data) return { warnings: [], error };
	const wrongKind = contentKindProblem(data, 'actualite');
	if (wrongKind) return { warnings: [], error: wrongKind };
	const warnings = keyWarnings(data, KNOWN, IGNORED);
	const publishAt = textField(data.publishAt);
	if (!DATE.test(publishAt)) warnings.push('Date de publication absente ou illisible (attendu : AAAA-MM-JJ) : date actuelle gardée.');
	return {
		fields: {
			title: textField(data.title),
			publishAt: DATE.test(publishAt) ? publishAt : '',
			excerpt: textField(data.excerpt),
			isPublish: data.isPublish !== false,
			tag: textField(data.tag),
			author: textField(data.author),
			imageCredit: textField(data.imageCredit),
			body,
		},
		warnings,
	};
}

/** Modèle de fichier à compléter, daté du jour (généré dans le navigateur). */
export function downloadNewsTemplate(): void {
	const today = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale
	downloadMarkdown(
		`${today}-modele-actualite.md`,
		`---
contenu: actualite
title: "Titre de l'actualité"
publishAt: ${today}
excerpt: "Résumé en une ou deux phrases, affiché sur les cartes et en page d'accueil."
tag: "Ateliers"
author: ""
# Facultatif — retirer le « # » en début de ligne pour activer :
# isPublish: false
# imageCredit: "Photo : Prénom Nom"
---

Premier paragraphe : l'essentiel de l'information en quelques phrases.

## Un sous-titre

Du texte en **gras** ou en *italique*, et un [lien](https://exemple.org).

- Un point de liste
- Un autre point

> Une citation ou un encadré à mettre en avant.

## Infos pratiques

- **Quand :** jour, horaires
- **Où :** lieu
- **Inscription :** téléphone ou email
`,
	);
}
