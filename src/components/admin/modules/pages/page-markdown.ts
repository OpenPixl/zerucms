/**
 * Fichiers `.md` du module « Pages » (navigateur) : modèles à télécharger,
 * fichier de la page en cours d'édition (`pageMarkdownFile`), lecture d'un
 * fichier déposé ou chargé pour pré-remplir le formulaire.
 * Même format que les pages des sources (`src/content/pages/…/index.md`,
 * cf. src/content/README.md) ; le serveur revalide tout à l'envoi
 * (src/lib/page-writer.ts).
 */
import type { Bloc } from '../../../../lib/blocs';
import { lireBlocsFichier, lireSectionsFichier, type PhotoDeposee } from '../../blocs-fichier';
import type { HomeModule } from '../../../../lib/home-modules';
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
	/** `true` = `pied: { show: true }` dans le fichier : emplacement « Pied de page ». */
	piedShow: boolean;
	imageCredit: string;
	blocs: Record<string, Bloc>;
	/** Sections d'une page enrichie (vide : page simple). */
	sections: HomeModule[];
	/** Photo de couverture citée (`cover:`), à retrouver parmi les fichiers déposés. */
	cover: string;
	body: string;
}

/** Clés du frontmatter reprises ; les autres sont signalées puis ignorées. */
const KNOWN = ['title', 'description', 'type', 'menu', 'pied', 'imageCredit', 'blocs', 'sections', 'cover'];
/** Clés connues du site mais réglées dans le formulaire (emplacement, photo…). */
const SET_IN_FORM: Record<string, string> = {
	access: "l'accès se règle avec l'emplacement « Page réservée »",
};

const text = textField;

/** Fichier d'une page d'après le formulaire (emplacement, adresse et accès restent dans le formulaire). */
export function pageMarkdownFile(page: {
	type: PageKind;
	title: string;
	description: string;
	menu: { show: boolean; label: string } | null;
	/** Lien du bas du pied de page (la position reste réglée dans le module). */
	pied?: boolean;
	imageCredit: string;
	blocs: Record<string, Bloc>;
	/** Sections d'une page enrichie. */
	sections?: HomeModule[];
	body: string;
	/** Photo de couverture jointe au `.zip` (nom dans l'archive). */
	cover?: string;
}): string {
	return buildMarkdownFile(
		'page',
		{
			title: page.title,
			description: page.description,
			type: page.type === 'enrichie' ? 'enrichie' : undefined,
			menu: page.menu ? { show: page.menu.show, ...(page.menu.label ? { label: page.menu.label } : {}) } : undefined,
			pied: page.pied ? { show: true } : undefined,
			cover: page.cover,
			imageCredit: page.imageCredit,
			blocs: Object.keys(page.blocs).length ? page.blocs : undefined,
			sections: page.type === 'enrichie' && page.sections?.length ? page.sections : undefined,
		},
		page.body,
	);
}

/**
 * Lit un fichier de page. `error` = fichier inutilisable ; `warnings` =
 * éléments ignorés ou à corriger (le formulaire est quand même rempli).
 */
export function parsePageMarkdown(source: string, photo?: PhotoDeposee): { page?: ImportedPage; warnings: string[]; error?: string } {
	const { data, body, error } = parseMarkdownFile(source);
	if (!data) return { warnings: [], error };
	const wrongKind = contentKindProblem(data, 'page');
	if (wrongKind) return { warnings: [], error: wrongKind };
	const warnings = keyWarnings(data, KNOWN, SET_IN_FORM);

	const lus = lireBlocsFichier(data.blocs, photo);
	const blocs = lus.blocs;
	warnings.push(...lus.warnings);
	// Page enrichie = composée de sections ; un ancien fichier « enrichie » sans `sections:` (blocs seulement) est une page simple.
	const type: PageKind = data.type === 'enrichie' && Array.isArray(data.sections) ? 'enrichie' : 'classique';
	const sectionsLues = type === 'enrichie' ? lireSectionsFichier(data.sections, photo) : { sections: [], warnings: [] };
	warnings.push(...sectionsLues.warnings);
	const menu = data.menu && typeof data.menu === 'object' ? (data.menu as Record<string, unknown>) : null;
	const pied = data.pied && typeof data.pied === 'object' ? (data.pied as Record<string, unknown>) : null;

	return {
		page: {
			type,
			title: text(data.title),
			description: text(data.description),
			menuShow: menu ? menu.show === true : undefined,
			menuLabel: text(menu?.label),
			piedShow: pied?.show === true,
			imageCredit: text(data.imageCredit),
			blocs,
			sections: sectionsLues.sections,
			cover: text(data.cover),
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
# pied:
#   show: true            # lien en bas du pied de page (mentions légales, CGV…), à la place du menu
# imageCredit: "Photo : Prénom Nom"

# Blocs (facultatifs) : éléments placés dans le texte. Chaque bloc a un
# identifiant (minuscules, chiffres, tirets) repris dans le texte par un
# marqueur [[bloc:identifiant]] seul sur sa ligne. Retirez les blocs
# inutiles ET leur marqueur.
# Blocs « Photos » et « Carrousel » : photos citées par leur nom de fichier
# et déposées avec ce .md (ou dans le même .zip), par exemple :
#   galerie:
#     type: photos
#     items:
#       - { photo: "photo-1.jpg", alt: "Ce que montre la photo" }
# Photo de couverture, de même : cover: "couverture.jpg" (avant « blocs: »).
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
  presentation:
    type: video
    lien: "https://www.youtube.com/watch?v=xxxxxxxxxxx"   # YouTube, Vimeo, Framatube ou peertube.fr
    titre: "Titre de la vidéo"
---

Premier paragraphe : l'essentiel en quelques phrases. Les informations de
l'association s'insèrent avec des variables : {{association.nom}},
{{association.email}}, {{association.telephone}}…

## Ce que nous proposons

Du texte en **gras** ou en *italique*, et un [lien](/contact).

[[bloc:services]]

## En vidéo

[[bloc:presentation]]

## Tarif

[[bloc:prix]]

[[bloc:a-savoir]]

## Une question ?

Écrivez-nous à {{association.email}}.

[[bloc:contact]]
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

# Sections : bandes pleine largeur, dans l'ordre d'affichage (mêmes sections
# que l'accueil). « contenu » = le texte de la page ci-dessous, avec ses
# blocs (cf. modèle de page simple). Retirez les sections inutiles.
# Section « Bandeau défilant » (logos) : images citées par leur nom de
# fichier et déposées avec ce .md (ou dans le même .zip), par exemple :
#   - type: defilement
#     titre: "Ils nous soutiennent"
#     vitesse: normale     # lente, normale ou rapide
#     gris: non            # oui = logos en gris, couleur au survol
#     items:               # 2 logos au moins (PNG transparent conseillé)
#       - { photo: "logo-mairie.png", nom: "Mairie", lien: "https://…" }
#       - { photo: "logo-region.png", nom: "Région" }
sections:
  - type: presentation
    surtitre: "Notre association"
    titre: "Titre accrocheur de la page"
    accroche: "Une phrase qui donne envie, avec des **mots en gras**."
    bouton1-texte: "Nous contacter"
    bouton1-lien: "/contact"
    illustration: logo     # logo, photo (photo d'accueil) ou aucune
    fond: gris             # gris, fond, surface, primaire, secondaire ou accent
  - type: contenu
  - type: tarifs
    titre: "Nos formules"
    note: "Tarifs TTC."
    items:
      - titre: "Découverte"
        prix: "Gratuit"
        description: "Pour essayer"
        details: |        # une ligne « - » par point
          - Un atelier d'essai
          - Accès libre aux postes
      - titre: "Adhésion"
        prix: "20 €"
        periode: "/ an"
        details: |
          - Tous les ateliers
          - Prêt de matériel
        bouton: "J'adhère"
        lien: "/adherer"
        avant: oui         # formule mise en avant
        mention: "La plus choisie"
  - type: equipe
    titre: "L'équipe"
    colonnes: "3"          # "2", "3" ou "4" par ligne
    items:                 # photo facultative : photo: "prenom.jpg", déposée avec ce .md
      - nom: "Prénom Nom"
        role: "Président·e"
        texte: "Quelques mots de présentation."
      - nom: "Prénom Nom"
        role: "Animateur·rice"
  - type: appel
    titre: "Envie de nous rejoindre ?"
    texte: "Bénévoles, adhérent·e·s ou partenaires : chacun·e a sa place chez {{association.nom}}."
    bouton-texte: "Adhérer"
    bouton-lien: "/adherer"
---

Le texte de la page, affiché à l'emplacement de la section « contenu ».
Il peut recevoir des blocs, comme une page simple.

## Un sous-titre

Du texte en **gras** ou en *italique*, et un [lien](/contact).
`;

/** Télécharge le modèle de page (généré dans le navigateur). */
export function downloadPageTemplate(kind: PageKind): void {
	downloadMarkdown(kind === 'enrichie' ? 'modele-page-enrichie.md' : 'modele-page.md', kind === 'enrichie' ? ENRICHIE : CLASSIQUE);
}
