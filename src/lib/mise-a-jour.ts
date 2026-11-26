/**
 * Mise à jour du modèle depuis l'Espace Admin (module « Mise à jour », super
 * admin ; route `/api/admin/mise-a-jour`). Même logique que `./update.sh` en
 * SSH : `scripts/update.mjs <version> --suivi`, lancé ici, qui reconnaît une
 * installation par git (modifications locales mises de côté) ou par archive.
 *
 * Pendant la mise à jour, le site est en **mode maintenance**
 * (`scripts/maintenance.mjs`, nature `mise-a-jour`) : page avec barre de
 * progression, alimentée par les lignes `@@<progression>|<étape>` du script
 * et la sortie du build (`suiviDuBuild`). Aucune publication possible
 * (`lancerTacheExclusive`). Réussite : le serveur se relance
 * (`restartServer` : superviseur `npm start`, Passenger, ou relance
 * autonome), `serveur.mjs` trouve la version déjà construite et lève la
 * maintenance. Échec : le script a tout remis en place, la maintenance est
 * levée, le site n'a pas changé.
 *
 * Docker (le code est dans l'image) : pas de bouton, `./update.sh` sur le
 * serveur. Dernier résultat dans `<DATA_DIR>/publication/mise-a-jour.json`,
 * sortie complète dans `mise-a-jour.log` ; journal `modele.mise-a-jour`.
 *
 * Code serveur uniquement.
 */

import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { avancerMaintenance, fermerMaintenance, ouvrirMaintenance } from '../../scripts/maintenance.mjs';
import { dataDir } from './data-dir';
import { logEvent, type JournalActor } from './journal';
import { getModelVersionInfo, isNewer, MODEL_VERSION, type ModelVersionInfo } from './model-version';
import { readLot } from './publication-lot';
import { canPublish, isPublishing, lancerTacheExclusive, restartServer, root, suiviDuBuild } from './site-build';

/** Façon dont le site est installé : décide de ce que le bouton peut faire. */
export type ModeInstallation = 'git' | 'archive' | 'docker' | 'dev';

export interface ResultatMiseAJour {
	etat: 'en-cours' | 'reussie' | 'echec';
	version: string;
	depuis: string;
	debut: string;
	fin?: string;
	/** Dernière étape (en cours) ou raison de l'échec. */
	message?: string;
	/** Fichiers du modèle modifiés sur le serveur, mis de côté (git stash). */
	misDeCote?: string[];
	par: string;
}

export interface EtatMiseAJour {
	mode: ModeInstallation;
	version: ModelVersionInfo;
	/** Raison qui empêche de lancer la mise à jour maintenant, sinon `null`. */
	bloquee: string | null;
	dernier: ResultatMiseAJour | null;
}

const fichierResultat = () => join(dataDir(), 'publication', 'mise-a-jour.json');
const fichierLog = () => join(dataDir(), 'publication', 'mise-a-jour.log');

export function modeInstallation(): ModeInstallation {
	if (import.meta.env.DEV) return 'dev';
	if (existsSync('/.dockerenv') || process.env.ZERUCMS_DOCKER) return 'docker';
	return existsSync(join(root(), '.git')) ? 'git' : 'archive';
}

async function lireResultat(): Promise<ResultatMiseAJour | null> {
	try {
		const resultat = JSON.parse(await readFile(fichierResultat(), 'utf8')) as ResultatMiseAJour;
		// Serveur relancé sur la version visée : la mise à jour « en cours » a réussi.
		if (resultat.etat === 'en-cours' && !isPublishing()) {
			return resultat.version === MODEL_VERSION
				? { ...resultat, etat: 'reussie' }
				: { ...resultat, etat: 'echec', message: 'La mise à jour a été interrompue (serveur arrêté pendant l’opération) : le site est resté dans sa version.' };
		}
		return resultat;
	} catch {
		return null;
	}
}

async function ecrireResultat(resultat: ResultatMiseAJour): Promise<void> {
	await mkdir(join(dataDir(), 'publication'), { recursive: true });
	await writeFile(fichierResultat(), JSON.stringify(resultat, null, 2));
}

async function raisonBlocage(mode: ModeInstallation): Promise<string | null> {
	if (mode === 'dev') return 'Serveur de développement : mettez à jour le code avec git.';
	if (mode === 'docker') return 'Site installé avec Docker : la mise à jour se fait sur le serveur, par « ./update.sh ».';
	const publication = await canPublish();
	if (!publication.ok) return publication.reason ?? 'Publication impossible sur ce serveur.';
	if (isPublishing()) return 'Une publication ou une mise à jour est en cours : réessayez dans quelques minutes.';
	const lot = await readLot();
	if (lot.length) return `${lot.length} modification(s) enregistrée(s) sans publier : publiez-les ou annulez-les avant de mettre à jour.`;
	return null;
}

export async function etatMiseAJour(): Promise<EtatMiseAJour> {
	const mode = modeInstallation();
	return { mode, version: await getModelVersionInfo(), bloquee: await raisonBlocage(mode), dernier: await lireResultat() };
}

/**
 * Lance la mise à jour vers `version` (X.Y.Z, plus récente que celle en
 * ligne) en arrière-plan. `{ ok: false, raison }` si elle ne peut pas partir.
 */
export async function lancerMiseAJour(version: string, by: JournalActor): Promise<{ ok: boolean; raison?: string }> {
	const mode = modeInstallation();
	const bloquee = await raisonBlocage(mode);
	if (bloquee) return { ok: false, raison: bloquee };
	if (!/^\d+\.\d+\.\d+$/.test(version) || !isNewer(version, MODEL_VERSION)) {
		return { ok: false, raison: `Version ${version} invalide ou pas plus récente que celle du site (${MODEL_VERSION}).` };
	}
	const par = by.fullname || by.login;
	const resultat: ResultatMiseAJour = { etat: 'en-cours', version, depuis: MODEL_VERSION, debut: new Date().toISOString(), par };

	const lance = lancerTacheExclusive(async () => {
		await ecrireResultat(resultat);
		ouvrirMaintenance(dataDir(), `Mise à jour vers la version ${version}`, 'Préparation…', 'mise-a-jour');
		await logEvent({ by, action: 'modele.mise-a-jour', label: `${MODEL_VERSION} → ${version}`, message: 'lancée' });
		const sortie = await executer(version, resultat);
		if (sortie.ok) {
			await ecrireResultat({ ...resultat, etat: 'reussie', fin: new Date().toISOString(), message: undefined });
			await logEvent({ by, action: 'modele.mise-a-jour', label: `${MODEL_VERSION} → ${version}`, outcome: 'ok', message: resultat.misDeCote?.length ? `modifications locales mises de côté : ${resultat.misDeCote.join(', ')}` : undefined });
			// La maintenance prend fin quand le serveur relancé écoute (scripts/serveur.mjs).
			avancerMaintenance(dataDir(), { etape: 'Redémarrage du serveur…', progression: 96, etat: 'redemarrage' });
			restartServer(sortie.log);
		} else {
			fermerMaintenance(dataDir());
			const message = sortie.erreur || 'La mise à jour a échoué.';
			await ecrireResultat({ ...resultat, etat: 'echec', fin: new Date().toISOString(), message });
			await logEvent({ by, action: 'modele.mise-a-jour', label: `${MODEL_VERSION} → ${version}`, outcome: 'echec', message: `${message} Détail : ${fichierLog()}` });
		}
		sortie.log.end();
	});
	return lance ? { ok: true } : { ok: false, raison: 'Une publication est en cours : réessayez dans quelques minutes.' };
}

/** Lance `scripts/update.mjs` et suit sa sortie (progression, fichiers mis de côté, erreur). */
function executer(version: string, resultat: ResultatMiseAJour): Promise<{ ok: boolean; erreur?: string; log: NodeJS.WritableStream }> {
	const log = createWriteStream(fichierLog());
	log.write(`Mise à jour ${MODEL_VERSION} → ${version} (${new Date().toISOString()})\n`);
	const avancer = (etape: string, progression: number) => {
		avancerMaintenance(dataDir(), { etape, progression: Math.round(progression) });
	};
	// Sortie du build (12 → 90 %) ramenée sur la plage de la construction (30 → 90 %).
	const build = suiviDuBuild((etape, p) => avancer(etape, 30 + ((p - 12) * 60) / 78));
	let enBuild = false;
	let misDeCote = false;
	let erreur: string | undefined;

	const ligne = (texte: string) => {
		const suivi = /^@@(\d+)\|(.*)$/.exec(texte);
		if (suivi) {
			const progression = Number(suivi[1]);
			enBuild = progression >= 30 && progression < 92;
			misDeCote = suivi[2].startsWith('Modifications locales');
			avancer(suivi[2], progression);
			return;
		}
		if (misDeCote && /^ {2}\S/.test(texte) && !texte.includes('git stash')) resultat.misDeCote = [...(resultat.misDeCote ?? []), texte.trim()];
		if (texte.startsWith('✗ ') && !erreur) erreur = texte.slice(2);
		if (enBuild) build(texte);
	};

	return new Promise((resolve) => {
		const enfant = spawn(process.execPath, ['scripts/update.mjs', `v${version}`, '--suivi'], {
			cwd: root(),
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		for (const flux of [enfant.stdout, enfant.stderr]) {
			let reste = '';
			flux.on('data', (morceau: Buffer) => {
				log.write(morceau);
				const lignes = (reste + morceau.toString('utf8')).split('\n');
				reste = lignes.pop() ?? '';
				for (const l of lignes) ligne(l.replace(/\x1b\[[0-9;]*m/g, ''));
			});
		}
		enfant.on('error', (err) => resolve({ ok: false, erreur: err.message, log }));
		enfant.on('close', (code) => resolve(code === 0 ? { ok: true, log } : { ok: false, erreur, log }));
	});
}
