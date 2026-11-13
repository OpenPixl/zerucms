/**
 * Plugins et extensions depuis les modules « Plugins » et « Extensions » de
 * l'Espace Admin (super admin seul) : un enregistrement unique par volet,
 * fichiers changés en place (`yaml` Document : commentaires et autres
 * réglages gardés) :
 *  - activation : `plugins.<id>` de `src/content/reglages.yaml` (extension :
 *    `extensions.<id>: false`, clé retirée = active), revalidé par
 *    `parseReglages()` ;
 *  - réglages (`reglages.champs` du catalogue) dans le fichier du plugin
 *    (ex. `rdv.yaml`) : format du type de champ (`src/plugins/champs.ts`),
 *    champ vide = clé retirée (variable du `.env` ou défaut du modèle) ;
 *    l'adresse de la page est refusée si déjà prise par le site
 *    (`adresseOccupee()`) ou par un autre plugin actif.
 * La publication (reconstruction du site, qui ajoute ou retire les routes du
 * plugin) est faite par `site-build.ts`, via `admin-publish.ts` ; textes
 * d'origine remis si elle échoue.
 *
 * Code serveur uniquement.
 */
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSecret } from 'astro:env/server';
import { isMap, parseDocument, YAMLMap, type Document } from 'yaml';
import { parseReglages } from '../config/site';
import { PLUGIN_IDS, PLUGINS, proposePour, requis, type PluginInfo } from '../plugins/catalogue';
import { FORMATS, normaliserChamp, type ChampPlugin } from '../plugins/champs';
import { pluginActif } from '../plugins';
import type { Applied } from './content-transaction';
import { adresseOccupee } from './page-writer';
import { extensionActive, type ExtensionInfo } from './extensions';
import { adressesPluginsActifs, contentDir, extensionsSources, valeurA } from './plugin-adresses';

const reglagesFile = () => join(contentDir(), 'reglages.yaml');

/** Champ de réglage tel que le montre la page de configuration. */
export interface ChampState extends ChampPlugin {
	/** Valeur écrite dans le fichier du plugin ('' = absente). */
	valeur: string;
	/** Valeur utilisée quand le champ est vide : celle du `.env`, sinon le défaut du modèle. */
	repli: string;
	/** D'où vient `repli`. */
	source: 'env' | 'defaut' | 'aucune';
}

export interface PluginState {
	genre: 'plugin' | 'extension';
	id: string;
	/** Extension : version installée et auteur. */
	version?: string;
	auteur?: string;
	label: string;
	description: string;
	icon: string;
	doc: string;
	/** État enregistré dans `reglages.yaml` (sources). */
	actif: boolean;
	/** État du site en ligne (construit), différent tant que la modification n'est pas publiée. */
	enLigne: boolean;
	/** Plugins requis inactifs (`requiert` du catalogue) : activation impossible. */
	requisInactifs: { id: string; label: string }[];
	/** Plugins qui requièrent celui-ci : désactivés avec lui. */
	dependants: { id: string; label: string }[];
	/** Fichiers requis absents : activation et réglages impossibles. */
	manquants: { fichier: string; aide: string }[];
	/** Secrets du `.env` absents et réglages obligatoires vides partout : signalés seulement. */
	avertissements: { nom: string; aide: string }[];
	/** Secrets du `.env` : variable effectivement utilisée (la sienne, son repli) ou `null` si aucune n'est renseignée. */
	secrets: { nom: string; utilise: string | null }[];
	/** Fichier des réglages (`src/content/…`), `null` si le plugin n'en a pas. */
	fichierReglages: string | null;
	/** Proposé au type de structure du site (`structure:` de `reglages.yaml`) ; sinon caché du module. */
	propose: boolean;
	champs: ChampState[];
}

const existe = (fichier: string) =>
	access(join(contentDir(), fichier)).then(
		() => true,
		() => false,
	);

async function lireYaml(fichier: string): Promise<unknown> {
	try {
		return parseDocument(await readFile(join(contentDir(), fichier), 'utf8')).toJS();
	} catch {
		return null;
	}
}

type Contexte = Pick<PluginState, 'genre' | 'id' | 'actif' | 'enLigne' | 'requisInactifs' | 'dependants' | 'propose'>;

/** État d'un plugin ou d'une extension tel que le montre sa page de configuration. */
async function etatVolet(info: PluginInfo | ExtensionInfo, ctx: Contexte): Promise<PluginState> {
	const manquants = [];
	for (const r of info.requis ?? []) if (!(await existe(r.fichier))) manquants.push({ ...r, fichier: `src/content/${r.fichier}` });
	const data = info.reglages ? await lireYaml(info.reglages.fichier) : null;
	const champs: ChampState[] = (info.reglages?.champs ?? []).map((c) => {
		const lu = valeurA(data, c.cle);
		const env = c.env ? (getSecret(c.env) as string | undefined) : undefined;
		const repli = env || c.defaut || '';
		return { ...c, valeur: typeof lu === 'string' ? lu : '', repli, source: env ? 'env' : c.defaut ? 'defaut' : 'aucune' };
	});
	const secrets = (info.env ?? []).map((e) => ({
		nom: e.nom,
		utilise: getSecret(e.nom) ? e.nom : e.repli && getSecret(e.repli) ? e.repli : null,
	}));
	const avertissements = [
		...(info.env ?? []).filter((_, i) => !secrets[i].utilise).map((e) => ({ nom: e.nom, aide: e.aide })),
		...champs
			.filter((c) => c.obligatoire && !c.valeur && !c.repli)
			.map((c) => ({ nom: c.label, aide: `à renseigner ici${c.env ? ` ou dans le .env (${c.env})` : ''} : ${ctx.genre === 'plugin' ? 'le plugin' : "l'extension"} ne peut pas fonctionner sans.` })),
	];
	const ext = ctx.genre === 'extension' ? (info as ExtensionInfo) : null;
	return {
		...ctx,
		...(ext ? { version: ext.version, auteur: ext.auteur } : {}),
		label: info.label,
		description: info.description,
		icon: info.icon,
		doc: info.doc,
		manquants,
		avertissements,
		secrets,
		fichierReglages: info.reglages ? `src/content/${info.reglages.fichier}` : null,
		champs,
	};
}

async function lireReglagesSource() {
	return parseReglages(await readFile(reglagesFile(), 'utf8').catch(() => ''));
}

export async function readPluginsSource(): Promise<PluginState[]> {
	const { plugins, structure } = await lireReglagesSource();
	return Promise.all(
		PLUGIN_IDS.map((id) =>
			etatVolet(PLUGINS[id], {
				genre: 'plugin',
				id,
				actif: plugins[id],
				enLigne: pluginActif(id),
				requisInactifs: requis(id)
					.filter((r) => !plugins[r])
					.map((r) => ({ id: r, label: PLUGINS[r].label })),
				dependants: PLUGIN_IDS.filter((d) => requis(d).includes(id)).map((d) => ({ id: d, label: PLUGINS[d].label })),
				propose: proposePour(id, structure),
			}),
		),
	);
}

/** Extensions installées (dossier `extensions/`, fiche valide) et leur état. */
export async function readExtensionsSource(): Promise<PluginState[]> {
	const { extensions } = await lireReglagesSource();
	return Promise.all(
		extensionsSources().map(({ id, fiche }) =>
			etatVolet(fiche, {
				genre: 'extension',
				id,
				actif: extensions[id] !== false,
				enLigne: extensionActive(id),
				requisInactifs: [],
				dependants: [],
				propose: true,
			}),
		),
	);
}

export type PluginResult = { applied?: Applied; label: string; errors: string[] };

/** Saisie d'un champ, mise en forme : espaces retirés ; adresse et URL sans « / » final, adresse en minuscules. */
function normaliser(champ: ChampPlugin, brut: unknown): string {
	return normaliserChamp(champ.type, brut);
}

/** Écrit (ou retire, si vide) la clé à points `cle` ; une rubrique devenue vide est retirée aussi. */
function poser(doc: Document, cle: string, valeur: string) {
	const chemin = cle.split('.');
	if (valeur) {
		doc.setIn(chemin, valeur);
		return;
	}
	doc.deleteIn(chemin);
	for (let i = chemin.length - 1; i > 0; i--) {
		const parent = doc.getIn(chemin.slice(0, i), true);
		if (isMap(parent) && parent.items.length === 0) doc.deleteIn(chemin.slice(0, i));
	}
}

/** Lit un fichier YAML de `src/content/` en Document modifiable (`null` si absent, erreur si illisible). */
async function documentDe(chemin: string): Promise<{ texte: string | null; doc: Document } | { erreur: string }> {
	const texte = await readFile(chemin, 'utf8').catch(() => null);
	const doc = parseDocument(texte ?? '');
	if (doc.errors.length) return { erreur: `${chemin.split('/').pop()} illisible : ${doc.errors[0].message}` };
	if (doc.contents === null) doc.contents = new YAMLMap() as never;
	return { texte, doc };
}

/**
 * Enregistre l'état et les réglages d'un plugin : `{ actif, valeurs }`
 * (`valeurs` : clé du champ → saisie). Seuls les changements sont écrits.
 */
export function savePlugin(id: unknown, actif: unknown, valeurs: unknown): Promise<PluginResult> {
	return saveVolet('plugin', id, actif, valeurs);
}

/** Même chose pour une extension installée. */
export function saveExtension(id: unknown, actif: unknown, valeurs: unknown): Promise<PluginResult> {
	return saveVolet('extension', id, actif, valeurs);
}

async function saveVolet(genre: 'plugin' | 'extension', id: unknown, actif: unknown, valeurs: unknown): Promise<PluginResult> {
	const nom = genre === 'plugin' ? 'Plugin' : 'Extension';
	const states = genre === 'plugin' ? await readPluginsSource() : await readExtensionsSource();
	const state = typeof id === 'string' ? states.find((p) => p.id === id) : undefined;
	if (!state) return { label: '', errors: [`${nom} inconnu${genre === 'plugin' ? '' : 'e'}.`] };
	if (typeof actif !== 'boolean') return { label: '', errors: ['État attendu : actif ou non.'] };
	const voletId = state.id;
	const info: PluginInfo | ExtensionInfo = genre === 'plugin' ? PLUGINS[voletId as keyof typeof PLUGINS] : extensionsSources().find((e) => e.id === voletId)!.fiche;
	const saisies = valeurs && typeof valeurs === 'object' ? (valeurs as Record<string, unknown>) : {};

	const errors: string[] = [];
	const changes: string[] = [];
	const nouveaux: { champ: ChampState; valeur: string }[] = [];
	for (const champ of state.champs) {
		if (!(champ.cle in saisies)) continue;
		const valeur = normaliser(champ, saisies[champ.cle]);
		if (valeur === champ.valeur) continue;
		if (valeur && !FORMATS[champ.type].re.test(valeur)) {
			errors.push(`${champ.label} : ${FORMATS[champ.type].message}.`);
			continue;
		}
		nouveaux.push({ champ, valeur });
		changes.push(`${champ.label.toLowerCase()} : ${valeur || `vide (${champ.source === 'env' ? '.env' : 'défaut'})`}`);
	}
	if (nouveaux.length && state.manquants.length) errors.push(`${state.manquants[0].fichier} absent : réglages impossibles.`);

	// Adresse de la page qui sera en ligne : vérifiée si elle change ou si le plugin s'active.
	const champAdresse = state.champs.find((c) => c.type === 'adresse');
	if (champAdresse && actif) {
		const nouvelle = nouveaux.find((n) => n.champ === champAdresse);
		const adresse = (nouvelle ? nouvelle.valeur : champAdresse.valeur) || champAdresse.repli;
		if (nouvelle || !state.actif) {
			const autre = (await adressesPluginsActifs(voletId)).some((a) => a.adresse.split('/')[1] === adresse.split('/')[1]);
			if (autre || (await adresseOccupee(adresse))) errors.push(`L'adresse ${adresse} est déjà utilisée par une page du site.`);
		}
	}

	if (actif && !state.propose) errors.push(`Ce plugin n'est pas proposé à ce type de structure.`);
	if (actif !== state.actif) {
		if (actif && state.requisInactifs.length) {
			errors.push(`Activation impossible : activez d'abord le plugin « ${state.requisInactifs.map((r) => r.label).join(' », « ')} », qu'il requiert.`);
		}
		if (actif && state.manquants.length) {
			errors.push(`Activation impossible : ${state.manquants.map((m) => `${m.fichier} absent (${m.aide})`).join(' ')}`);
		}
		changes.unshift(actif ? 'activé' : 'désactivé');
	}
	if (errors.length) return { label: '', errors };
	if (!changes.length) return { label: '', errors: ["Rien n'a changé."] };

	// Écriture : reglages.yaml (état) puis fichier du plugin (réglages), textes d'origine gardés.
	const ecrits: { chemin: string; original: string | null }[] = [];
	const restore = async () => {
		for (const { chemin, original } of ecrits.reverse()) {
			if (original === null) await rm(chemin, { force: true });
			else await writeFile(chemin, original, 'utf8');
		}
	};
	try {
		if (actif !== state.actif) {
			const lu = await documentDe(reglagesFile());
			if ('erreur' in lu) return { label: '', errors: [lu.erreur] };
			// Extension : absente = active, seule la désactivation est écrite.
			if (genre === 'plugin') lu.doc.setIn(['plugins', voletId], actif);
			else if (actif) {
				lu.doc.deleteIn(['extensions', voletId]);
				const rubrique = lu.doc.getIn(['extensions'], true);
				if (isMap(rubrique) && rubrique.items.length === 0) lu.doc.deleteIn(['extensions']);
			} else lu.doc.setIn(['extensions', voletId], false);
			const texte = lu.doc.toString({ lineWidth: 0, flowCollectionPadding: false });
			parseReglages(texte);
			ecrits.push({ chemin: reglagesFile(), original: lu.texte });
			await writeFile(reglagesFile(), texte, 'utf8');
		}
		if (nouveaux.length && info.reglages) {
			const chemin = join(contentDir(), info.reglages.fichier);
			const lu = await documentDe(chemin);
			if ('erreur' in lu) {
				await restore();
				return { label: '', errors: [lu.erreur] };
			}
			for (const { champ, valeur } of nouveaux) poser(lu.doc, champ.cle, valeur);
			ecrits.push({ chemin, original: lu.texte });
			await writeFile(chemin, lu.doc.toString({ lineWidth: 0, flowCollectionPadding: false }), 'utf8');
		}
	} catch (err) {
		await restore();
		throw err;
	}

	return {
		label: `${nom} « ${info.label} » : ${changes.join(', ')}`,
		errors: [],
		applied: { restore, purge: async () => {} },
	};
}
