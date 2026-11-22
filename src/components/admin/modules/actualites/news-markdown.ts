/**
 * Fichier `.md` d'une actualité (navigateur) : téléchargé depuis le
 * formulaire en modification, puis rechargé pour le remplir (`EditFileBar`).
 * Mêmes clés que le dépôt d'une actualité (cf. docs/actualites.md,
 * src/lib/news-writer.ts) ; l'adresse et la photo restent dans le
 * formulaire. Le serveur revalide tout à l'enregistrement.
 */
import type { Bloc } from '../../../../lib/blocs';
import { lireBlocsFichier, type PhotoDeposee } from '../../blocs-fichier';
import type { NewsFields } from '../../client';
import { contentKindProblem } from '../../content-import';
import { buildMarkdownFile, downloadMarkdown, keyWarnings, parseMarkdownFile, textField } from '../../markdown-file';

type NewsFile = NewsFields & { body: string; blocs: Record<string, Bloc> };

const KNOWN = ['title', 'publishAt', 'excerpt', 'isPublish', 'tag', 'author', 'imageCredit', 'blocs', 'cover'];
const IGNORED: Record<string, string | null> = {
	activite: "le lien vers l'activité est gardé tel quel",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `cover` : photo de couverture jointe au `.zip` (nom dans l'archive). */
export function newsMarkdownFile(n: NewsFile, cover?: string): string {
	return buildMarkdownFile(
		'actualite',
		{
			title: n.title,
			publishAt: n.publishAt,
			excerpt: n.excerpt,
			isPublish: n.isPublish,
			tag: n.tag,
			author: n.author,
			cover,
			imageCredit: n.imageCredit,
			blocs: Object.keys(n.blocs).length ? n.blocs : undefined,
		},
		n.body,
	);
}

/** Lit un fichier chargé ; date illisible = remarque, date du formulaire gardée (`publishAt` vide). */
export function parseNewsMarkdown(source: string, photo?: PhotoDeposee): { fields?: NewsFile & { cover: string }; warnings: string[]; error?: string } {
	const { data, body, error } = parseMarkdownFile(source);
	if (!data) return { warnings: [], error };
	const wrongKind = contentKindProblem(data, 'actualite');
	if (wrongKind) return { warnings: [], error: wrongKind };
	const warnings = keyWarnings(data, KNOWN, IGNORED);
	const lus = lireBlocsFichier(data.blocs, photo);
	warnings.push(...lus.warnings);
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
			blocs: lus.blocs,
			/** Photo de couverture citée (`cover:`), à retrouver parmi les fichiers déposés. */
			cover: textField(data.cover),
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
# Photo de couverture : fichier déposé avec ce .md (ou dans le même .zip).
# cover: "couverture.jpg"
#
# Blocs (photos, carrousel, vidéo…) : retirer les « # » ci-dessous, puis
# ajouter dans le texte la ligne [[bloc:galerie]] (ou [[bloc:video]]) seule,
# là où le bloc doit s'afficher. Les photos sont citées par leur nom de
# fichier et déposées avec ce .md (ou dans le même .zip).
# blocs:
#   galerie:
#     type: photos              # ou carrousel (2 photos au moins)
#     items:
#       - { photo: "photo-1.jpg", alt: "Ce que montre la photo" }
#       - { photo: "photo-2.jpg", alt: "Ce que montre la photo", legende: "Légende facultative" }
#   video:
#     type: video
#     lien: "https://www.youtube.com/watch?v=xxxxxxxxxxx"   # YouTube, Vimeo, Framatube ou peertube.fr
#     titre: "Titre de la vidéo"
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
