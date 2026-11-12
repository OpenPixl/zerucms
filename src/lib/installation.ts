/**
 * Assistant d'installation (super admin, première connexion après le
 * déploiement) : type de structure (association ou auto-entrepreneur,
 * `src/lib/structure.ts`), compte administrateur, identité (nom,
 * coordonnées, logo), plugins (tous décochés au départ) et leurs réglages et
 * secrets, contenu d'exemple gardé ou retiré. Tout est contrôlé avant la
 * moindre écriture, puis appliqué ; la reconstruction du site qui suit
 * annule le contenu (association, logo, plugins, exemples) si elle échoue.
 *
 * Secrets : `<DATA_DIR>/installation/secrets.env` (`scripts/installation.mjs`),
 * seulement pendant l'installation ; ensuite, le `.env`. Une variable déjà
 * définie par le `.env` n'est ni demandée ni écrite.
 *
 * Installation requise : `installation.json` absent et aucun compte autre
 * que super admin (site neuf ; un site déjà en service a des comptes), ou
 * installation commencée mais pas terminée (reconstruction échouée).
 *
 * Code serveur uniquement. Route : `src/pages/api/admin/installation.ts`.
 */

import { cp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { isMap, parseDocument, YAMLMap } from 'yaml';
import { parseReglages } from '../config/site';
import { PLUGIN_IDS, PLUGINS, proposePour, requis, type PluginId, type PluginInfo, type SecretPlugin } from '../plugins/catalogue';
import { estStructure, type Structure } from './structure';
import { FORMATS } from '../plugins/champs';
import { readAssociationSource, saveAssociation } from './association-writer';
import { isSuperadminAccount, isValidLogin, listAccounts, normalizeLogin, readAccount, saveAccount } from './auth/accounts';
import { hashPassword, passwordProblem } from './auth/password';
import type { SessionUser } from './auth/session';
import { readBrandInput, readBrandSource, saveBrand } from './brand-writer';
import type { Applied } from './content-transaction';
import { dataDir } from './data-dir';
import { siteRoot } from './news-writer';
import { readPluginsSource, savePlugin, type ChampState } from './plugin-writer';
import {
	chargerSecrets,
	defini,
	ecrireInstallation,
	ecrireSecrets,
	lireInstallation,
	lireSecrets,
	secretAleatoire,
} from '../../scripts/installation.mjs';
import { dossierModele } from '../../scripts/contenu-initial.mjs';

const contenu = () => join(siteRoot(), 'src', 'content');
const modeles = () => dossierModele(siteRoot(), 'association');
/** Contenu d'exemple « auto-entrepreneur » : remplace ou complète `src/modeles/association/` (cf. son README). */
const modelesEntreprise = () => dossierModele(siteRoot(), 'entreprise');

/** Exemples propres aux associations, retirés pour une entreprise (s'ils sont inchangés). */
const ASSOCIATION_SEULEMENT = ['activites/', 'pages/association/', 'pages/statuts/', 'pages/reglement-interieur/'];
/** Fichiers de `src/modeles/entreprise/` appliqués même sans exemples. */
const SOCLE_ENTREPRISE = ['association.yaml', 'images/logo.svg', 'pages/mentions-legales/index.md', 'pages/_pages-site.md', 'partenaires.yaml'];

/**
 * Contenu de démonstration gardé quand on retire les exemples : identité,
 * réglages, images, mentions légales (obligatoires), pages du site, catégories.
 */
const SOCLE = [
	'README.md',
	'association.yaml',
	'reglages.yaml',
	'images/',
	'pages/_pages-site.md',
	'pages/mentions-legales/',
	'activites/_categories.yaml',
];
/** Fichiers d'exemple vidés plutôt que supprimés (lus par le site). */
const VIDES: Record<string, string> = {
	'annonces.yaml': '# Annonces défilantes du site (module « Annonces » de l’Espace Admin).\n[]\n',
	'partenaires.yaml': '# Partenaires de l’association (cartes de l’accueil, relais de l’adhésion).\npartenaires: []\n',
};

// ---------------------------------------------------------------------------
// État

export async function installationRequise(): Promise<boolean> {
	const etat = lireInstallation(dataDir());
	if (etat) return etat.etat !== 'terminee';
	return !(await listAccounts()).some((a) => !isSuperadminAccount(a));
}

/** Fichiers de `src/modeles/association/` (chemins relatifs). */
async function fichiersDe(dossier: string, base = dossier): Promise<string[]> {
	const entrees = await readdir(dossier, { withFileTypes: true }).catch(() => []);
	const fichiers: string[] = [];
	for (const e of entrees) {
		const chemin = join(dossier, e.name);
		if (e.isDirectory()) fichiers.push(...(await fichiersDe(chemin, base)));
		else fichiers.push(relative(base, chemin));
	}
	return fichiers;
}

/** `src/content/<f>` est-il identique au fichier de même nom de `dossier` (contenu d'exemple inchangé) ? */
async function identique(f: string, dossier: string): Promise<boolean> {
	const [a, b] = await Promise.all([readFile(join(dossier, f)).catch(() => null), readFile(join(contenu(), f)).catch(() => null)]);
	return Boolean(a && b && a.equals(b));
}

/** Exemples encore identiques à `src/modeles/association/` dans `src/content/` (ceux modifiés depuis sont gardés). */
async function exemplesPresents(): Promise<string[]> {
	const presents: string[] = [];
	for (const f of await fichiersDe(modeles())) {
		if (SOCLE.some((s) => (s.endsWith('/') ? f.startsWith(s) : f === s))) continue;
		const [a, b] = await Promise.all([readFile(join(modeles(), f)).catch(() => null), readFile(join(contenu(), f)).catch(() => null)]);
		if (a && b && a.equals(b)) presents.push(f);
	}
	return presents;
}

export interface SecretEtat extends SecretPlugin {
	/** Déjà défini par le `.env` (ou l'environnement) : ni demandé ni écrit. */
	dejaDefini: boolean;
}

export interface PluginInstallation {
	id: PluginId;
	/** Types de structure à qui il est proposé (vide = tous). */
	structures: Structure[];
	label: string;
	description: string;
	icon: string;
	requiert: PluginId[];
	secrets: SecretEtat[];
	champs: ChampState[];
}

export interface EtatInstallation {
	requise: boolean;
	/** Type de structure actuel (`structure:` de `reglages.yaml`). */
	structure: Structure;
	/** Compte administrateur déjà créé (installation reprise après un échec). */
	compte: { login: string; fullname: string } | null;
	association: { name: string; email: string; phone: string; address: { street: string; postalCode: string; city: string } };
	logo: string | null;
	plugins: PluginInstallation[];
	exemples: number;
	dev: boolean;
}

/** Variables du `.env` / de l'environnement, hors `secrets.env` de l'installation. */
function definiHorsInstallation(nom: string): boolean {
	const installes = lireSecrets(dataDir());
	return defini(process.env, nom) && process.env[nom] !== installes[nom];
}

export async function lireEtat(): Promise<EtatInstallation> {
	const [association, brand, sources, comptes, exemples] = await Promise.all([
		readAssociationSource(),
		readBrandSource(),
		readPluginsSource(),
		listAccounts(),
		exemplesPresents(),
	]);
	const admin = comptes.find((a) => !isSuperadminAccount(a) && a.groups.includes('admin'));
	const reglages = parseReglages(await readFile(join(contenu(), 'reglages.yaml'), 'utf8').catch(() => ''));
	// Identité encore celle de démonstration : champs vides dans l'assistant.
	const demo = await identique('association.yaml', modeles());
	const vide = (v: string) => (demo ? '' : v);
	return {
		requise: await installationRequise(),
		structure: reglages.structure,
		compte: admin ? { login: admin.login, fullname: admin.fullname } : null,
		association: {
			name: vide(association.name),
			email: vide(association.email),
			phone: vide(association.phone),
			address: { street: vide(association.address.street), postalCode: vide(association.address.postalCode), city: vide(association.address.city) },
		},
		logo: brand.logo?.preview ?? null,
		plugins: PLUGIN_IDS.map((id) => {
			const info: PluginInfo = PLUGINS[id];
			return {
				id,
				label: info.label,
				description: info.description,
				icon: info.icon,
				structures: [...(info.structures ?? [])],
				requiert: requis(id),
				secrets: (info.secrets ?? []).filter((s) => !s.genere).map((s) => ({ ...s, dejaDefini: definiHorsInstallation(s.nom) })),
				champs: sources.find((p) => p.id === id)?.champs ?? [],
			};
		}),
		exemples: exemples.length,
		dev: import.meta.env.DEV,
	};
}

// ---------------------------------------------------------------------------
// Saisie

interface Saisie {
	structure: Structure;
	compte: { login: string; fullname: string; email: string; password: string } | null;
	association: { name: string; email: string; phone: string; street: string; postalCode: string; city: string };
	logo: unknown;
	plugins: Record<PluginId, boolean>;
	reglages: Partial<Record<PluginId, Record<string, string>>>;
	secrets: Record<string, string>;
	exemples: boolean;
}

const texte = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function lireSaisie(raw: unknown): Saisie {
	const r = obj(raw);
	const c = r.compte === null ? null : obj(r.compte);
	const a = obj(r.association);
	const p = obj(r.plugins);
	const reglages = obj(r.reglages);
	const secrets = obj(r.secrets);
	return {
		structure: estStructure(r.structure) ? r.structure : 'association',
		compte: c && {
			login: normalizeLogin(texte(c.login, 40)),
			fullname: texte(c.fullname, 80),
			email: texte(c.email, 120),
			password: typeof c.password === 'string' ? c.password : '',
		},
		association: {
			name: texte(a.name, 80),
			email: texte(a.email, 120),
			phone: texte(a.phone, 40),
			street: texte(a.street, 120),
			postalCode: texte(a.postalCode, 10),
			city: texte(a.city, 80),
		},
		logo: r.logo ?? null,
		plugins: Object.fromEntries(PLUGIN_IDS.map((id) => [id, p[id] === true])) as Record<PluginId, boolean>,
		reglages: Object.fromEntries(
			PLUGIN_IDS.map((id) => [id, Object.fromEntries(Object.entries(obj(reglages[id])).map(([k, v]) => [k, texte(v, 300)]))]),
		),
		secrets: Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : ''])),
		exemples: r.exemples !== false,
	};
}

const FORMAT_SECRET: Record<SecretPlugin['type'], { re: RegExp; message: string }> = {
	url: { re: /^https?:\/\/[^\s/$.?#][^\s]*$/i, message: 'adresse attendue (https://…)' },
	identifiant: { re: /^[A-Za-z0-9_-]{2,100}$/, message: 'lettres, chiffres, « - » ou « _ » seulement' },
	cle: { re: /^\S{8,500}$/, message: 'au moins 8 caractères, sans espace' },
};

/** Plugins cochés réellement actifs (un plugin dont un requis est décoché ne l'est pas). */
function actifs(saisie: Saisie): PluginId[] {
	const actif = (id: PluginId): boolean => saisie.plugins[id] && proposePour(id, saisie.structure) && requis(id).every(actif);
	return PLUGIN_IDS.filter(actif);
}

// ---------------------------------------------------------------------------
// Installation

export type ResultatInstallation =
	| { errors: string[] }
	| { errors: []; applied: Applied; label: string; compte: string | null; plugins: string[] };

export async function installer(raw: unknown, user: SessionUser): Promise<ResultatInstallation> {
	if (!(await installationRequise())) return { errors: ['Le site est déjà installé.'] };
	const saisie = lireSaisie(raw);
	const errors: string[] = [];
	const etat = await lireEtat();

	// 1. Compte administrateur (sauf s'il existe déjà : installation reprise).
	if (!etat.compte) {
		const c = saisie.compte;
		if (!c) errors.push('Compte administrateur : à créer.');
		else {
			if (!isValidLogin(c.login)) errors.push("Compte : l'identifiant doit faire 2 à 32 caractères (minuscules, chiffres, « . », « - » ou « _ »).");
			else if (await readAccount(c.login)) errors.push(`Compte : l'identifiant « ${c.login} » est déjà pris.`);
			if (!c.fullname) errors.push('Compte : prénom et nom à renseigner.');
			if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) errors.push('Compte : adresse email invalide.');
			const probleme = passwordProblem(c.password);
			if (probleme) errors.push(`Compte : ${probleme}`);
		}
	}

	// 2. Identité : nom et coordonnées (le reste ne change pas ; écrit après le contenu d'exemple).
	const a = saisie.association;
	if (!a.name || !a.email || !a.phone || !a.street || !a.postalCode || !a.city) errors.push('Identité : nom, email, téléphone et adresse sont obligatoires.');
	const logo = saisie.logo ? readBrandInput({ ...(await readBrandSource()), logo: saisie.logo, favicon: null, fonts: null }) : null;
	if (logo && 'error' in logo) errors.push(logo.error);

	// 3. Plugins, réglages et secrets des plugins actifs.
	const choisis = actifs(saisie);
	for (const id of PLUGIN_IDS) {
		if (saisie.plugins[id] && !proposePour(id, saisie.structure)) {
			errors.push(`Plugin « ${PLUGINS[id].label} » : non proposé à ce type de structure.`);
		} else if (saisie.plugins[id] && !choisis.includes(id)) {
			errors.push(`Plugin « ${PLUGINS[id].label} » : il requiert « ${requis(id).map((r) => PLUGINS[r].label).join(' », « ')} ».`);
		}
	}
	const secrets: Record<string, string> = {};
	for (const id of choisis) {
		const info: PluginInfo = PLUGINS[id];
		for (const s of info.secrets ?? []) {
			if (definiHorsInstallation(s.nom)) continue;
			if (s.genere) {
				secrets[s.nom] = lireSecrets(dataDir())[s.nom] || secretAleatoire();
				continue;
			}
			const valeur = saisie.secrets[s.nom] ?? '';
			if (/[\r\n]/.test(valeur)) errors.push(`${s.label} : une seule ligne.`);
			else if (!valeur) {
				if (s.obligatoire) errors.push(`${info.label} : « ${s.label} » est à renseigner (ou décochez le plugin).`);
			} else if (!FORMAT_SECRET[s.type].re.test(valeur)) errors.push(`${s.label} : ${FORMAT_SECRET[s.type].message}.`);
			else secrets[s.nom] = valeur;
		}
		// Réglages obligatoires : valeur saisie, ou variable déjà connue (.env ou secret saisi ici).
		const champs = etat.plugins.find((p) => p.id === id)!.champs;
		for (const champ of champs) {
			const valeur = saisie.reglages[id]?.[champ.cle] ?? champ.valeur;
			if (valeur && !FORMATS[champ.type].re.test(valeur.replace(/\/+$/, ''))) errors.push(`${champ.label} : ${FORMATS[champ.type].message}.`);
			const connu = champ.env && (defini(process.env, champ.env) || secrets[champ.env]);
			if (champ.obligatoire && !valeur && !connu && !champ.defaut) errors.push(`${info.label} : « ${champ.label} » est à renseigner.`);
		}
	}
	if (errors.length) return { errors };

	// --- Écritures : chaque étape rend de quoi l'annuler si la suivante échoue.
	const annulations: (() => Promise<void>)[] = [];
	const purges: (() => Promise<void>)[] = [];
	const annuler = async () => {
		for (const f of annulations.reverse()) await f().catch(() => {});
	};
	const etape = (applied: Applied | undefined) => {
		if (!applied) return;
		annulations.push(applied.restore);
		purges.push(applied.purge);
	};
	try {
		// Entreprise : exemples et mentions légales propres, avant l'identité (association.yaml compris).
		if (saisie.structure === 'entreprise') etape(await appliquerEntreprise(saisie.exemples));

		const source = await readAssociationSource();
		const assoc = await saveAssociation({
			...source,
			name: a.name,
			email: a.email,
			phone: a.phone,
			address: { street: a.street, postalCode: a.postalCode, city: a.city },
		});
		if (assoc.errors.length) throw new Error(assoc.errors.join(' '));
		etape(assoc.applied);

		if (logo && !('error' in logo)) {
			const brand = await saveBrand(logo);
			if (brand.errors.length) throw new Error(brand.errors.join(' '));
			etape(brand.applied);
		}

		etape(await ecrirePlugins(choisis, saisie.structure));
		for (const id of choisis) {
			const valeurs = saisie.reglages[id] ?? {};
			if (!Object.keys(valeurs).length) continue;
			const r = await savePlugin(id, true, valeurs);
			if (r.errors.length && r.errors[0] !== "Rien n'a changé.") throw new Error(r.errors.join(' '));
			etape(r.applied);
		}

		if (!saisie.exemples) etape(await retirerExemples());
	} catch (err) {
		await annuler();
		return { errors: [(err as Error).message] };
	}

	// Hors contenu (gardés si la reconstruction échoue) : secrets, compte, état.
	if (Object.keys(secrets).length) {
		ecrireSecrets(dataDir(), secrets);
		chargerSecrets(dataDir());
	}
	let compte: string | null = null;
	if (!etat.compte && saisie.compte) {
		const now = new Date().toISOString();
		await saveAccount({
			login: saisie.compte.login,
			fullname: saisie.compte.fullname,
			...(saisie.compte.email ? { email: saisie.compte.email } : {}),
			groups: ['admin'],
			state: 'enabled',
			hashedPassword: await hashPassword(saisie.compte.password),
			mustChangePassword: true,
			created: now,
			updated: now,
		});
		compte = saisie.compte.login;
	}
	ecrireInstallation(dataDir(), 'en-cours', user.fullname || user.login);

	return {
		errors: [],
		label: 'Installation du site',
		compte,
		plugins: choisis.map((id) => PLUGINS[id].label),
		applied: {
			restore: annuler,
			purge: async () => {
				for (const f of purges) await f().catch(() => {});
			},
		},
	};
}

/** Fin de la reconstruction réussie : installation terminée. */
export function terminerInstallation(par: string) {
	ecrireInstallation(dataDir(), 'terminee', par);
}

/**
 * Écrit le type de structure et l'état de **tous** les plugins dans
 * `reglages.yaml` (`actifParDefaut` ne joue plus) ; crée les fichiers requis manquants.
 */
async function ecrirePlugins(choisis: PluginId[], structure: Structure): Promise<Applied> {
	const fichier = join(contenu(), 'reglages.yaml');
	const original = await readFile(fichier, 'utf8');
	const crees: string[] = [];
	const restore = async () => {
		await writeFile(fichier, original, 'utf8');
		for (const f of crees) await rm(f, { force: true });
	};
	try {
		for (const id of choisis) {
			const modele = (PLUGINS[id] as PluginInfo).modele;
			if (!modele) continue;
			const cible = join(contenu(), modele.fichier);
			if (await stat(cible).catch(() => null)) continue;
			await mkdir(dirname(cible), { recursive: true });
			await cp(join(siteRoot(), modele.source), cible);
			crees.push(cible);
		}
		const doc = parseDocument(original);
		if (doc.errors.length) throw new Error(`reglages.yaml illisible : ${doc.errors[0].message}`);
		if (doc.contents === null) doc.contents = new YAMLMap() as never;
		if (!isMap(doc.get('plugins'))) doc.set('plugins', new YAMLMap());
		for (const id of PLUGIN_IDS) doc.setIn(['plugins', id], choisis.includes(id));
		if (structure === 'association') doc.delete('structure');
		else doc.set('structure', structure);
		const nouveau = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
		parseReglages(nouveau);
		await writeFile(fichier, nouveau, 'utf8');
	} catch (err) {
		await restore();
		throw err;
	}
	return { restore, purge: async () => {} };
}

/** Retire le contenu d'exemple encore inchangé (copie gardée en mémoire jusqu'à la fin de la reconstruction). */
async function retirerExemples(): Promise<Applied> {
	const presents = await exemplesPresents();
	const copies = new Map<string, Buffer>();
	for (const f of presents) copies.set(f, await readFile(join(contenu(), f)));
	for (const f of presents) {
		if (VIDES[f]) await writeFile(join(contenu(), f), VIDES[f], 'utf8');
		else await rm(join(contenu(), f), { force: true });
	}
	// Dossiers d'exemple restés vides (actualité, fiche, page).
	await elaguer(presents);
	return {
		restore: async () => {
			for (const [f, data] of copies) {
				await mkdir(dirname(join(contenu(), f)), { recursive: true });
				await writeFile(join(contenu(), f), data);
			}
		},
		purge: async () => {},
	};
}

/** Supprime les dossiers devenus vides au-dessus des fichiers retirés. */
async function elaguer(fichiers: string[]) {
	for (const f of fichiers) {
		let dossier = dirname(join(contenu(), f));
		// Jamais les dossiers de collection eux-mêmes (news/, pages/…) : ils restent, vides.
		while (dirname(dossier) !== contenu() && dossier !== contenu() && (await readdir(dossier).catch(() => ['?'])).length === 0) {
			await rm(dossier, { recursive: true, force: true });
			dossier = dirname(dossier);
		}
	}
}

/**
 * Type « entreprise » : retire les exemples propres aux associations encore
 * inchangés, puis pose ceux de `src/modeles/entreprise/` (le socle
 * seulement sans exemples) là où le fichier manque ou est encore celui de
 * démonstration. Copie de chaque fichier touché gardée pour l'annulation.
 */
async function appliquerEntreprise(exemples: boolean): Promise<Applied> {
	const avant = new Map<string, Buffer | null>();
	const garder = async (f: string) => {
		if (!avant.has(f)) avant.set(f, await readFile(join(contenu(), f)).catch(() => null));
	};
	const retires: string[] = [];
	for (const f of await fichiersDe(modeles())) {
		if (f === 'activites/_categories.yaml' || !ASSOCIATION_SEULEMENT.some((p) => f.startsWith(p))) continue;
		if (!(await identique(f, modeles()))) continue;
		await garder(f);
		await rm(join(contenu(), f), { force: true });
		retires.push(f);
	}
	for (const f of await fichiersDe(modelesEntreprise())) {
		if (f === 'README.md' || (!exemples && !SOCLE_ENTREPRISE.includes(f))) continue;
		const present = await stat(join(contenu(), f)).catch(() => null);
		if (present && !(await identique(f, modeles()))) continue; // déjà personnalisé : gardé
		await garder(f);
		await mkdir(dirname(join(contenu(), f)), { recursive: true });
		await cp(join(modelesEntreprise(), f), join(contenu(), f));
	}
	await elaguer(retires);
	return {
		restore: async () => {
			for (const [f, data] of avant) {
				if (data === null) await rm(join(contenu(), f), { force: true });
				else {
					await mkdir(dirname(join(contenu(), f)), { recursive: true });
					await writeFile(join(contenu(), f), data);
				}
			}
		},
		purge: async () => {},
	};
}
