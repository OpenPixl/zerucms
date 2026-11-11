/**
 * Garde le site allumé sur un serveur Linux (installation sans Docker) :
 *
 *   sudo npm run service              installe et démarre le service
 *   sudo npm run service -- retirer   l'arrête et le retire
 *
 * Écrit `/etc/systemd/system/<nom>.service` (nom = dossier du site, ex.
 * `/srv/monsite` → `monsite`), qui lance `scripts/start.mjs` (= npm start)
 * au démarrage de la machine et le relance s'il s'arrête. Le site tourne
 * sous le compte propriétaire du dossier, pas sous root. Relancer la
 * commande met le service à jour (sans risque).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const root = resolve(process.cwd());
const nom = basename(root).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
const fichier = `/etc/systemd/system/${nom}.service`;
const retirer = process.argv.slice(2).includes('retirer');

function echec(message) {
	console.error(`✗ ${message}`);
	process.exit(1);
}
function systemctl(...args) {
	const r = spawnSync('systemctl', args, { stdio: 'inherit' });
	if (r.status !== 0) echec(`la commande « systemctl ${args.join(' ')} » a échoué.`);
}

if (process.platform !== 'linux' || !existsSync('/run/systemd/system')) {
	echec("ce serveur n'utilise pas systemd : lancez simplement « npm start » (voir docs/deploiement.md).");
}
if (process.getuid?.() !== 0) echec('il faut les droits administrateur : tapez « sudo npm run service ».');
if (!existsSync(join(root, 'scripts', 'start.mjs'))) echec('lancez la commande depuis le dossier du site.');

if (retirer) {
	if (!existsSync(fichier)) echec(`aucun service « ${nom} » installé.`);
	systemctl('disable', '--now', nom);
	rmSync(fichier);
	systemctl('daemon-reload');
	console.log(`✓ Service « ${nom} » arrêté et retiré. Le site ne tourne plus ; « npm start » le relance à la main.`);
	process.exit(0);
}

// Compte propriétaire du dossier (celui qui a fait git clone / npm install).
const uid = statSync(root).uid;
const compte = spawnSync('id', ['-nu', String(uid)], { encoding: 'utf8' }).stdout.trim() || 'root';
const node = process.execPath;

writeFileSync(
	fichier,
	`# Créé par « sudo npm run service » (scripts/service.mjs). Retirer : sudo npm run service -- retirer
[Unit]
Description=Site ${nom}
After=network-online.target
Wants=network-online.target

[Service]
User=${compte}
WorkingDirectory=${root}
ExecStart=${node} --env-file-if-exists=.env scripts/start.mjs
Environment=PATH=${dirname(node)}:/usr/local/bin:/usr/bin:/bin
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`,
);

const dejaActif = spawnSync('systemctl', ['is-active', '--quiet', nom]).status === 0;
systemctl('daemon-reload');
systemctl('enable', nom);
systemctl(dejaActif ? 'restart' : 'start', nom);

console.log(`✓ Service « ${nom} » installé : le site tourne (compte ${compte}) et redémarre tout seul avec le serveur.

  Voir s'il tourne          systemctl status ${nom}
  Lire le journal           journalctl -u ${nom} -n 50
  Redémarrer le site        sudo systemctl restart ${nom}
  Retirer le service        sudo npm run service -- retirer

Au premier démarrage, le site se construit (une à trois minutes) avant de répondre.
Si « npm start » tourne encore dans un terminal, arrêtez-le (Ctrl+C) : les deux se disputeraient le port.`);
