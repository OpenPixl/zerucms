/**
 * Démarrage du site en production (Node seul ou Docker) :
 *
 *   npm start     (= node --env-file-if-exists=.env scripts/start.mjs)
 *
 * Petit superviseur : lance le serveur (`scripts/serveur.mjs` : construction
 * si besoin, puis serveur HTTP) et le RELANCE quand il s'arrête pour passer
 * sur une nouvelle version — publication ou restauration depuis l'Espace
 * Admin (`src/lib/site-build.ts` sort avec `CODE_RELANCE`). Aucun outil
 * à installer (PM2, systemd…) : `npm start` suffit, Ctrl+C arrête tout.
 *
 * Tout autre arrêt du serveur (erreur, signal) arrête aussi le superviseur,
 * avec le même code : un gestionnaire éventuel (Docker `restart`, systemd)
 * fait alors son travail habituel. SIGTERM / SIGINT / SIGHUP reçus sont
 * transmis au serveur, qui termine les requêtes en cours.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Code de sortie du serveur qui demande une relance (cf. site-build.ts). */
const CODE_RELANCE = 75;
const serveur = fileURLToPath(new URL('./serveur.mjs', import.meta.url));
const log = (message) => console.log(`[démarrage] ${message}`);

let enfant;
let arret = false;

function lancer() {
	// Mêmes options Node (`--env-file-if-exists=.env` : un .env modifié est
	// relu à chaque relance), même dossier ; ZERUCMS_SUPERVISE indique au
	// serveur qu'il sera relancé.
	enfant = spawn(process.execPath, [...process.execArgv, serveur, ...process.argv.slice(2)], {
		stdio: 'inherit',
		env: { ...process.env, ZERUCMS_SUPERVISE: '1' },
	});
	enfant.on('exit', (code, signal) => {
		if (code === CODE_RELANCE && !arret) {
			log('nouvelle version : relance du serveur…');
			lancer();
			return;
		}
		process.exit(code ?? (signal ? 1 : 0));
	});
}

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
	process.on(signal, () => {
		arret = true;
		enfant?.kill(signal === 'SIGHUP' ? 'SIGTERM' : signal);
	});
}

lancer();
