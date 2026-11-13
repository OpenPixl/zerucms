/**
 * Fichiers `.md` du module « Pages » (navigateur) : modèles à télécharger,
 * fichier de la page en cours d'édition (`pageMarkdownFile`), lecture d'un
 * fichier déposé ou chargé pour pré-remplir le formulaire.
 * Même format que les pages des sources (`src/content/pages/…/index.md`,
 * cf. src/content/README.md) ; le serveur revalide tout à l'envoi
 * (src/lib/page-writer.ts).
 */
import { validateBloc, type Bloc } from '../../../../lib/blocs';
import { contentKindProblem } from '../../content-import';
import { buildMarkdownFile, downloadMarkdown, keyWarnings, parseMarkdownFile, textField } from '../../markdown-file';

export type PageKind = 'classique' | 'enrichie';

/** Champs du formulaire tirés d'un fichier. L'emplacement et l'adresse restent à choisir. */
export interface ImportedPage {
	type: PageKind;
	title: string;
	description: string;
	/** `undefined` = pas de bloc `menu:` dans le fichier (le formulaire garde son choix). */
	menuShow?: boolean;
	menuLabel: string;
	imageCredit: string;
	blocs: Record<string, Bloc>;
	body: string;
}

/** Clés du frontmatter reprises ; les autres sont signalées puis ignorées. */
const KNOWN = ['title', 'description', 'type', 'menu', 'imageCredit', 'blocs'];
/** Clés connues du site mais réglées dans le formulaire (emplacement, photo…). */
const SET_IN_FORM: Record<string, string> = {
	access: "l'accès se règle avec l'emplacement « Page réservée »",
	cover: "la photo se change dans l'onglet « Image »",
};

const text = textField;

/** Fichier d'une page d'après le formulaire (emplacement, adresse et accès restent dans le formulaire). */
export function pageMarkdownFile(page: {
	type: PageKind;
	title: string;
	description: string;
	menu: { show: boolean; label: string } | null;
	imageCredit: string;
	blocs: Record<string, Bloc>;
	body: string;
}): string {
	return buildMarkdownFile(
		'page',
		{
			title: page.title,
			description: page.description,
			type: page.type === 'enrichie' ? 'enrichie' : undefined,
			menu: page.menu ? { show: page.menu.show, ...(page.menu.label ? { label: page.menu.label } : {}) } : undefined,
			imageCredit: page.imageCredit,
			blocs: page.type === 'enrichie' && Object.keys(page.blocs).length ? page.blocs : undefined,
		},
		page.body,
	);
}

/**
 * Lit un fichier de page. `error` = fichier inutilisable ; `warnings` =
 * éléments ignorés ou à corriger (le formulaire est quand même rempli).
 */
export function parsePageMarkdown(source: string): { page?: ImportedPage; warnings: string[]; error?: string } {
	const { data, body, error } = parseMarkdownFile(source);
	if (!data) return { warnings: [], error };
	const wrongKind = contentKindProblem(data, 'page');
	if (wrongKind) return { warnings: [], error: wrongKind };
	const warnings = keyWarnings(data, KNOWN, SET_IN_FORM);

	const blocs: Record<string, Bloc> = {};
	const rawBlocs = data.blocs && typeof data.blocs === 'object' && !Array.isArray(data.blocs) ? (data.blocs as Record<string, unknown>) : {};
	for (const [id, raw] of Object.entries(rawBlocs)) {
		const { bloc, errors } = validateBloc(id, raw);
		warnings.push(...errors);
		if (bloc) blocs[id] = bloc;
	}
	const type: PageKind = data.type === 'enrichie' || Object.keys(rawBlocs).length > 0 ? 'enrichie' : 'classique';
	const menu = data.menu && typeof data.menu === 'object' ? (data.menu as Record<string, unknown>) : null;

	return {
		page: {
			type,
			title: text(data.title),
			description: text(data.description),
			menuShow: menu ? menu.show === true : undefined,
			menuLabel: text(menu?.label),
			imageCredit: text(data.imageCredit),
			blocs,
			body,
		},
		warnings,
	};
}

const CLASSIQUE = `---
contenu: page
title: "Titre de la page"
description: "Une ou deux phrases, affichées sous le titre et dans les moteurs de recherche."
# Facultatif — retirer les « # » en début de ligne pour activer :
# menu:
#   show: true            # false = page accessible par son adresse, hors du menu
#   label: "Libellé court dans le menu"
# imageCredit: "Photo : Prénom Nom"
---

Premier paragraphe : l'essentiel en quelques phrases. Les informations de
l'association s'insèrent avec des variables : {{association.nom}},
{{association.email}}, {{association.telephone}}…

## Un sous-titre

Du texte en **gras** ou en *italique*, et un [lien](/contact).

- Un point de liste
- Un autre point

> Une citation ou un passage à mettre en avant.

| Colonne 1 | Colonne 2 |
| --- | --- |
| Valeur | Valeur |
`;

const ENRICHIE = `---
contenu: page
title: "Titre de la page"
description: "Une ou deux phrases, affichées sous le titre et dans les moteurs de recherche."
type: enrichie
# Facultatif — retirer les « # » en début de ligne pour activer :
# menu:
#   show: true
#   label: "Libellé court dans le menu"
# imageCredit: "Photo : Prénom Nom"

# Chaque bloc a un identifiant (minuscules, chiffres, tirets) repris dans le
# texte par un marqueur [[bloc:identifiant]] seul sur sa ligne.
# Retirez les blocs inutiles ET leur marqueur.
blocs:
  services:
    type: cartes
    colonnes: "3"          # "2" ou "3"
    items:
      - icone: users       # nom Font Awesome sans « fa- »
        titre: "Première carte"
        texte: "Texte de la carte : **gras** et [liens](/contact) acceptés."
      - icone: laptop
        titre: "Deuxième carte"
        texte: "Texte de la carte."
      - icone: graduation-cap
        titre: "Troisième carte"
        texte: "Texte de la carte."
  prix:
    type: tarif
    libelle: "Adhésion annuelle"
    montant: "20 € / an"
  a-savoir:
    type: encart
    style: info            # info, attention ou succes
    titre: "Bon à savoir"
    texte: "Un message à mettre en avant."
  contact:
    type: bouton
    texte: "Nous contacter"
    lien: "/contact"
    style: primary         # primary, secondary ou outline
---

Premier paragraphe : l'essentiel en quelques phrases.

## Ce que nous proposons

[[bloc:services]]

## Tarif

[[bloc:prix]]

[[bloc:a-savoir]]

## Une question ?

Écrivez-nous à {{association.email}}.

[[bloc:contact]]
`;

/** Télécharge le modèle de page (généré dans le navigateur). */
export function downloadPageTemplate(kind: PageKind): void {
	downloadMarkdown(kind === 'enrichie' ? 'modele-page-enrichie.md' : 'modele-page.md', kind === 'enrichie' ? ENRICHIE : CLASSIQUE);
}
