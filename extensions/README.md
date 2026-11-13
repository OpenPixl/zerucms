# Extensions de ce site

Ce dossier reçoit les **extensions** installées sur ce site : développements
propres à une structure, distribués à part du CMS (archive `.zip`) — par
exemple la prise de rendez-vous de numérik&Co (`rdv/`).

Il est ignoré par git (sauf ce fichier) et conservé par les mises à jour,
comme `src/content/`. Installer, mettre à jour ou retirer une extension :
module « Extensions » de l'Espace Admin (super admin), ou

```bash
npm run extension -- install <archive.zip>
npm run extension -- supprimer <id>
```

Contrat et fonctionnement : [docs/extensions.md](../docs/extensions.md).
