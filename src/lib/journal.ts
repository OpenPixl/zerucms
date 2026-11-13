/**
 * Journal des modifications faites depuis l'Espace Admin (qui, quand,
 * quoi, avec quel résultat), consultable par le seul groupe `superadmin`
 * (module « Journal »). Un événement par ligne JSON dans
 * `<DATA_DIR>/journal/<AAAA>.jsonl` (un fichier par année), ajouté en fin de
 * fichier : rien n'est jamais réécrit ni effacé depuis le site.
 *
 * Un échec d'écriture du journal est signalé dans la console mais ne fait
 * jamais échouer l'action journalisée.
 *
 * Code serveur uniquement.
 */

import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from './data-dir';

export type JournalAction =
	| 'connexion'
	| 'mot-de-passe'
	| 'mon-compte'
	| 'actualite.ajout'
	| 'actualite.modification'
	| 'actualite.suppression'
	| 'publication'
	| 'publication.message-ferme'
	| 'publication.lot-annule'
	| 'activite.ajout'
	| 'activite.modification'
	| 'activite.suppression'
	| 'activite.ordre'
	| 'categorie.ajout'
	| 'categorie.modification'
	| 'categorie.suppression'
	| 'annonce.ajout'
	| 'annonce.modification'
	| 'annonce.suppression'
	| 'annonce.ordre'
	| 'sauvegarde.creation'
	| 'sauvegarde.depot'
	| 'sauvegarde.suppression'
	| 'sauvegarde.restauration'
	| 'installation'
	| 'maintenance.activation'
	| 'maintenance.modification'
	| 'maintenance.fin'
	| 'page.ajout'
	| 'page.modification'
	| 'page.suppression'
	| 'menu-deroulant.ajout'
	| 'menu-deroulant.modification'
	| 'menu-deroulant.suppression'
	| 'lien-menu.modification'
	| 'page-site.modification'
	| 'ordre-menu.modification'
	| 'association.modification'
	| 'charte.modification'
	| 'plugin.modification'
	| 'extension.installation'
	| 'extension.modification'
	| 'extension.suppression'
	// Actions d'une extension (`<id>.<action>`, libellés : `journal` de son definitions.ts).
	| `${string}.${string}`
	| 'facturation'
	| 'compte.creation'
	| 'compte.modification'
	| 'compte.reinitialisation'
	| 'compte.suppression';

export interface JournalActor {
	login: string;
	fullname: string;
}

export interface JournalEntry {
	at: string;
	/** Absent pour une action système (ex. publication interrompue). */
	by?: JournalActor;
	action: JournalAction;
	/** Objet de l'action (titre de l'actualité, login du compte…). */
	label?: string;
	href?: string;
	outcome?: 'ok' | 'echec';
	/** Détail (message d'erreur, avertissement, champs modifiés…). */
	message?: string;
}

function journalDir(): string {
	return join(dataDir(), 'journal');
}

/** Ajoute un événement au journal. */
export async function logEvent(entry: Omit<JournalEntry, 'at' | 'by'> & { by?: JournalActor | null }): Promise<void> {
	const { by, ...rest } = entry;
	const line: JournalEntry = { at: new Date().toISOString(), ...(by ? { by: { login: by.login, fullname: by.fullname } } : {}), ...rest };
	try {
		await mkdir(journalDir(), { recursive: true, mode: 0o700 });
		await appendFile(join(journalDir(), `${line.at.slice(0, 4)}.jsonl`), `${JSON.stringify(line)}\n`, { mode: 0o600 });
	} catch (err) {
		console.error('[journal] écriture impossible :', err);
	}
}

/** Années disponibles, la plus récente d'abord. */
export async function journalYears(): Promise<string[]> {
	try {
		return (await readdir(journalDir()))
			.map((f) => f.match(/^(\d{4})\.jsonl$/)?.[1])
			.filter((y): y is string => Boolean(y))
			.sort()
			.reverse();
	} catch {
		return [];
	}
}

/** Événements d'une année, du plus récent au plus ancien (lignes illisibles ignorées). */
export async function readJournal(year: string): Promise<JournalEntry[]> {
	if (!/^\d{4}$/.test(year)) return [];
	let raw: string;
	try {
		raw = await readFile(join(journalDir(), `${year}.jsonl`), 'utf8');
	} catch {
		return [];
	}
	const entries: JournalEntry[] = [];
	for (const line of raw.split('\n')) {
		if (!line.trim()) continue;
		try {
			entries.push(JSON.parse(line));
		} catch {
			// ligne tronquée (arrêt brutal pendant l'écriture) : ignorée
		}
	}
	return entries.reverse();
}
