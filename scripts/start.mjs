/**
 * Démarrage du site en production (Node seul ou Docker) :
 *
 *   node --env-file-if-exists=.env scripts/start.mjs     (= npm start)
 *
 * 0. nouveau site (src/content/ sans association.yaml) : copie le contenu de
 *    démonstration de `contenu-initial/` (scripts/contenu-initial.mjs) ;
 *    Charge ensuite les secrets saisis à l'installation
 *    (`<DATA_DIR>/installation/secrets.env`, scripts/installation.mjs : le
 *    .env l'emporte) et génère `AUTH_SECRET` s'il manque ;
 * 1. compare l'empreinte de l'état courant (version du modèle, SITE_URL,
 *    contenu de src/content/ — cf. releases.mjs) à celle du site en place
 *    (`dist/build-info.json`) ;
 * 2. si elles diffèrent (premier démarrage, mise à jour du modèle, domaine ou
 *    contenu changés hors publication) : bascule sur une version de
 *    `.releases/` déjà construite avec cette empreinte s'il y en a une
 *    (construite à l'avance par `update.sh`), sinon `npm run build` dans
 *    `.releases/<horodatage>`, puis `dist` pointe dessus. Pendant ce temps le
 *    site ne répond pas (le serveur n'est pas encore lancé) ;
 * 3. lance le serveur (`dist/server/entry.mjs`, gestionnaire de l'adaptateur
 *    Node) derrière la porte du mode maintenance (scripts/maintenance.mjs :
 *    page « Site en maintenance » avec progression pendant une restauration,
 *    ou maintenance manuelle décidée dans l'Espace Admin), puis retire un
 *    éventuel reste de maintenance de restauration (la manuelle reste).
 *
 * Build en échec : l'ancien site est servi s'il existe (message d'erreur
 * dans les logs), sinon arrêt avec le code 1. Les publications depuis
 * l'Espace Admin construisent elles-mêmes (src/lib/site-build.ts) : leur
 * build-info.json correspond, le redémarrage qui suit ne reconstruit pas.
 *
 * `SITE_ROOT` : dossier du projet (défaut : dossier courant), comme la publication.
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASES_DIR, computeFingerprint, findRelease, pruneReleases, readBuildInfo, releaseStamp, swapDist } from './releases.mjs';
import { installerContenuInitial } from './contenu-initial.mjs';
import { fermerMaintenance, lireMaintenance, nomAssociation, porteMaintenance } from './maintenance.mjs';
import { assurerAuthSecret, chargerSecrets } from './installation.mjs';

const root = resolve(process.env.SITE_ROOT || process.cwd());
const log = (message) => console.log(`[démarrage] ${message}`);

async function buildIfNeeded() {
	// Nouveau site : contenu de démonstration, avant l'empreinte (qui inclut src/content/).
	installerContenuInitial(root);
	const current = await computeFingerprint(root, process.env.SITE_URL);
	const built = await readBuildInfo(root);
	const serverEntry = join(root, 'dist/server/entry.mjs');

	if (built?.fingerprint === current.fingerprint && existsSync(serverEntry)) {
		log(`site à jour (version ${built.version}, construit le ${built.builtAt}).`);
		return;
	}

	const reason = !built
		? 'aucun site construit'
		: built.version !== current.version
			? `nouvelle version du modèle (${built.version} → ${current.version})`
			: built.siteUrl !== current.siteUrl
				? `adresse du site changée (${built.siteUrl || '—'} → ${current.siteUrl || '—'})`
				: 'contenu modifié';

	// Déjà construite à l'avance (mise à jour, publication…) : simple bascule.
	const ready = await findRelease(root, current.fingerprint);
	if (ready) {
		await swapDist(root, ready);
		log(`${reason} : version déjà construite (${ready}), aucune construction.`);
		return;
	}

	log(`construction du site : ${reason}…`);

	const release = releaseStamp();
	const outDir = join(RELEASES_DIR, release);
	await mkdir(join(root, RELEASES_DIR), { recursive: true });
	const started = Date.now();
	const result = spawnSync('npm', ['run', '-s', 'build'], {
		cwd: root,
		env: { ...process.env, ASTRO_OUT_DIR: outDir },
		stdio: 'inherit',
	});

	if (result.status !== 0) {
		await rm(join(root, outDir), { recursive: true, force: true });
		if (existsSync(serverEntry)) {
			console.error(`[démarrage] ÉCHEC de la construction : l'ancienne version du site reste en ligne. Corriger l'erreur ci-dessus puis redémarrer.`);
			return;
		}
		console.error('[démarrage] ÉCHEC de la construction et aucun site existant : arrêt.');
		process.exit(1);
	}

	await swapDist(root, release);
	await pruneReleases(root).catch(() => {});
	log(`site construit en ${Math.round((Date.now() - started) / 1000)} s.`);
}

const dataDir = resolve(process.env.DATA_DIR || process.env.AUTH_DATA_DIR || join(root, 'data'));

// Secrets saisis à l'installation (Espace Admin) : complètent le .env, qui l'emporte.
const charges = chargerSecrets(dataDir);
if (charges.length) log(`secrets de l'installation chargés : ${charges.join(', ')}.`);
if (assurerAuthSecret(dataDir)) log("AUTH_SECRET absent : généré et gardé dans data/installation/secrets.env.");


await buildIfNeeded();

// Serveur lancé ici (et non par l'adaptateur) pour placer la porte du mode
// maintenance devant les pages prérendues, servies avant tout middleware.
process.env.ASTRO_NODE_AUTOSTART = 'disabled';
const { handler, options } = await import(pathToFileURL(join(root, 'dist/server/entry.mjs')).href);
const port = process.env.PORT ? Number(process.env.PORT) : (options.port ?? 8080);
const host = process.env.HOST ?? (typeof options.host === 'boolean' ? (options.host ? '0.0.0.0' : 'localhost') : options.host);
const server = createServer(porteMaintenance(handler, { dataDir, nom: () => nomAssociation(root) }));
server.listen(port, host, () => {
	log(`serveur à l'écoute sur http://${host}:${port}`);
	// Fin du redémarrage qui suit une restauration (ou reste d'un serveur arrêté
	// en cours de route). Une maintenance manuelle (Espace Admin) est gardée.
	const maintenance = lireMaintenance(dataDir);
	if (maintenance?.manuel) log('site en maintenance (manuelle : à lever depuis l\'Espace Admin, module « Site »).');
	else if (maintenance) {
		fermerMaintenance(dataDir);
		log('mode maintenance terminé.');
	}
});

// Arrêt demandé (docker stop, update.sh, systemd, Ctrl-C) : on termine les
// requêtes en cours puis on sort. Sans ce gestionnaire, Node lancé en PID 1
// (conteneur sans `init`) ignore SIGTERM et Docker attend 10 s avant de le tuer.
let arretEnCours = false;
function arreter(signal) {
	if (arretEnCours) return;
	arretEnCours = true;
	log(`${signal} reçu : arrêt du serveur.`);
	server.close(() => process.exit(0));
	server.closeIdleConnections();
	// Requête qui traîne (flux, client lent) : on n'attend pas plus de 5 s.
	setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));
