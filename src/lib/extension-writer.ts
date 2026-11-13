/**
 * Installation et suppression d'une extension depuis le module
 * « Extensions » (super admin) : logique de `scripts/extension.mjs`
 * (partagée avec la ligne de commande), plus le fichier de réglages modèle
 * (`modele` de la fiche, chemin relatif au dossier de l'extension) copié
 * dans `src/content/` s'il manque. Rend de quoi annuler (`restore`) si la
 * reconstruction du site échoue, ou valider (`purge`).
 *
 * Code serveur uniquement.
 */
import { copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Applied } from './content-transaction';
import type { ExtensionInfo } from './extensions';
import { siteRoot } from './news-writer';
import { contentDir } from './plugin-adresses';
import { installerArchive, supprimerExtension } from '../../scripts/extension.mjs';

interface Operation {
	fiche: ExtensionInfo;
	restaurer: () => void;
	purger: () => void;
}

export async function installExtension(zip: Uint8Array): Promise<{ fiche: ExtensionInfo; precedente: string | null; applied: Applied }> {
	const r: Operation & { precedente: string | null } = installerArchive(zip, siteRoot());
	// Réglages propres à la structure : modèle copié s'il manque (jamais écrasé).
	let copie: string | null = null;
	const modele = r.fiche.modele;
	if (modele && !existsSync(join(contentDir(), modele.fichier))) {
		const source = join(siteRoot(), 'extensions', r.fiche.id, modele.source);
		if (existsSync(source)) {
			copie = join(contentDir(), modele.fichier);
			await copyFile(source, copie);
		}
	}
	return {
		fiche: r.fiche,
		precedente: r.precedente,
		applied: {
			restore: async () => {
				r.restaurer();
				if (copie) await rm(copie, { force: true });
			},
			purge: async () => r.purger(),
		},
	};
}

/** Retire l'extension (ses réglages de `src/content/` restent, pour une réinstallation). */
export function removeExtension(id: string): { fiche: ExtensionInfo | null; applied: Applied } {
	const r: Operation = supprimerExtension(id, siteRoot());
	return {
		fiche: r.fiche,
		applied: { restore: async () => r.restaurer(), purge: async () => r.purger() },
	};
}
