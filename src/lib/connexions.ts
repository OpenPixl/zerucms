/**
 * Identifiants de connexion des plugins à des services extérieurs (jeton de
 * Page Facebook…) : `connexion.champs` du catalogue (`src/plugins/catalogue.ts`).
 *
 * Un fichier YAML par plugin, **seul endroit** où ils sont écrits :
 * `<DATA_DIR>/connexions/<plugin>.yaml` (droits 600, hors de `src/content/`,
 * du build et des sauvegardes ; volume `./data` en Docker). Rien dans le
 * `.env`. Lu à chaque usage : un changement vaut sans reconstruire ni
 * redémarrer.
 *
 *     facebook:                 # valeurs saisies (champs du catalogue)
 *       page_id: "1234567890"
 *       jeton: "EAAG…"
 *     etat:                     # écrit par le plugin après vérification
 *       facebook:
 *         verifie_le: "2026-11-22T10:00:00.000Z"
 *         expire_le: "2027-01-21T10:00:00.000Z"   # absent = n'expire pas
 *
 * La page de configuration du module « Plugins » ne reçoit jamais une valeur
 * masquée : seulement « renseigné ou non » (`champsConnexion()`). Une saisie
 * vide garde la valeur enregistrée ; `null` l'efface.
 *
 * Code serveur uniquement (sans dépendance à Astro).
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMap, parseDocument, type Document } from 'yaml';
import { FORMATS_CONNEXION, type ChampConnexion } from '../plugins/champs';
import { dataDir } from './data-dir';

/** Rubrique réservée à l'état écrit par le plugin (vérification, expiration). */
const ETAT = 'etat';

export const dossierConnexions = () => join(dataDir(), 'connexions');
export const fichierConnexion = (plugin: string) => join(dossierConnexions(), `${plugin}.yaml`);
/** Chemin affiché dans l'admin (relatif au dossier des données). */
export const fichierConnexionAffiche = (plugin: string) => `data/connexions/${plugin}.yaml`;

function verifierId(plugin: string) {
	if (!/^[a-z0-9-]+$/.test(plugin)) throw new Error(`Identifiant de plugin invalide : ${plugin}`);
}

async function lireDocument(plugin: string): Promise<{ texte: string | null; doc: Document }> {
	verifierId(plugin);
	const texte = await readFile(fichierConnexion(plugin), 'utf8').catch(() => null);
	const doc = parseDocument(texte ?? '');
	if (doc.errors.length) throw new Error(`${fichierConnexionAffiche(plugin)} illisible : ${doc.errors[0].message}`);
	if (doc.contents === null || !isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
	return { texte, doc };
}

/** Écriture atomique (fichier temporaire puis renommage), lisible par le seul compte du serveur. */
async function ecrire(plugin: string, doc: Document) {
	await mkdir(dossierConnexions(), { recursive: true, mode: 0o700 });
	if (!doc.commentBefore) {
		doc.commentBefore = ` Connexion « ${plugin} » : écrite par l'Espace Admin.\n Contient des secrets : ne pas partager, ne pas versionner.`;
	}
	const tmp = `${fichierConnexion(plugin)}.${process.pid}.tmp`;
	await writeFile(tmp, doc.toString({ lineWidth: 0 }), { encoding: 'utf8', mode: 0o600 });
	await chmod(tmp, 0o600);
	await rename(tmp, fichierConnexion(plugin));
}

/** Contenu du fichier (`{}` s'il n'existe pas ou est illisible). */
export async function lireConnexion(plugin: string): Promise<Record<string, unknown>> {
	try {
		const js = (await lireDocument(plugin)).doc.toJS();
		return js && typeof js === 'object' ? js : {};
	} catch {
		return {};
	}
}

function valeurA(data: unknown, cle: string): unknown {
	return cle.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), data);
}

/** Valeur (texte, espaces retirés) d'un champ de connexion, `''` si absente. */
export function valeurConnexion(data: Record<string, unknown>, cle: string): string {
	const v = valeurA(data, cle);
	return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
}

/** Champ tel que le reçoit la page de configuration : jamais la valeur d'un champ masqué. */
export interface ChampConnexionEtat extends ChampConnexion {
	renseigne: boolean;
	/** Valeur en clair (`clair: true` seulement), sinon `''`. */
	valeur: string;
}

export function champsConnexion(champs: readonly ChampConnexion[], data: Record<string, unknown>): ChampConnexionEtat[] {
	return champs.map((c) => {
		const v = valeurConnexion(data, c.cle);
		return { ...c, renseigne: Boolean(v), valeur: c.clair ? v : '' };
	});
}

/**
 * Enregistre les saisies `{ <cle>: texte | null }` : texte vide = inchangé,
 * `null` = effacé. Renvoie les libellés changés (jamais les valeurs) ou les
 * erreurs de format.
 */
export async function enregistrerConnexion(
	plugin: string,
	champs: readonly ChampConnexion[],
	saisies: unknown,
): Promise<{ changes: string[]; errors: string[] }> {
	const s = saisies && typeof saisies === 'object' ? (saisies as Record<string, unknown>) : {};
	const { doc } = await lireDocument(plugin);
	const changes: string[] = [];
	const errors: string[] = [];
	const touches = new Set<string>();
	for (const c of champs) {
		if (!(c.cle in s)) continue;
		const brut = s[c.cle];
		const chemin = c.cle.split('.');
		const avant = valeurConnexion(doc.toJS() ?? {}, c.cle);
		if (brut === null) {
			if (!avant) continue;
			doc.deleteIn(chemin);
			for (let i = chemin.length - 1; i > 0; i--) {
				const parent = doc.getIn(chemin.slice(0, i), true);
				if (isMap(parent) && parent.items.length === 0) doc.deleteIn(chemin.slice(0, i));
			}
			changes.push(`${c.label} : effacé`);
			touches.add(chemin[0]);
			continue;
		}
		const valeur = typeof brut === 'string' ? brut.trim() : '';
		if (!valeur || valeur === avant) continue;
		if (!FORMATS_CONNEXION[c.type].re.test(valeur)) {
			errors.push(`${c.label} : ${FORMATS_CONNEXION[c.type].message}.`);
			continue;
		}
		doc.setIn(chemin, valeur);
		changes.push(`${c.label} : ${avant ? 'remplacé' : 'renseigné'}`);
		touches.add(chemin[0]);
	}
	if (errors.length) return { changes: [], errors };
	if (!changes.length) return { changes, errors: ['Rien n’a changé : saisissez une nouvelle valeur.'] };
	// Valeurs changées : l'état vérifié de la rubrique ne vaut plus.
	for (const rubrique of touches) if (doc.hasIn([ETAT, rubrique])) doc.deleteIn([ETAT, rubrique]);
	const etat = doc.getIn([ETAT], true);
	if (isMap(etat) && etat.items.length === 0) doc.deleteIn([ETAT]);
	await ecrire(plugin, doc);
	return { changes, errors };
}

/** État écrit par le plugin pour une rubrique (ex. `facebook`), `null` si aucun. */
export async function lireEtatConnexion<T extends object>(plugin: string, rubrique: string): Promise<T | null> {
	const etat = valeurA(await lireConnexion(plugin), `${ETAT}.${rubrique}`);
	return etat && typeof etat === 'object' && !Array.isArray(etat) ? (etat as T) : null;
}

/** Remplace l'état d'une rubrique (valeurs `undefined` omises). */
export async function ecrireEtatConnexion(plugin: string, rubrique: string, etat: object) {
	const { doc } = await lireDocument(plugin);
	const propre = Object.fromEntries(Object.entries(etat).filter(([, v]) => v !== undefined && v !== ''));
	doc.setIn([ETAT, rubrique], doc.createNode(propre));
	await ecrire(plugin, doc);
}
