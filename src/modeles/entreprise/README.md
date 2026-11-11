# Contenu d'exemple « auto-entrepreneur »

Appliqué par l'assistant d'installation (`src/lib/installation.ts`) quand le
type de structure choisi est **Auto-entrepreneur** : chaque fichier remplace
celui de `src/modeles/association/` encore inchangé dans `src/content/`, ou s'y
ajoute. Les exemples propres aux associations (activités, statuts, règlement
intérieur, menu « Association », partenaire) sont retirés.

Fichiers du socle (toujours appliqués, même « site vide ») :
`association.yaml`, `images/logo.svg`, `pages/mentions-legales/`,
`pages/_pages-site.md`, `partenaires.yaml`. Les autres sont des exemples.

Ce dossier n'est jamais copié tel quel dans `src/content/`.
