# Plugin « presence » : « Je participe »

Page `/je-participe` (et son lien rapide sur téléphone, `presence:` de
`reglages.yaml`) : pendant une séance, un·e membre se retrouve par son nom
(route commune `/api/adhesion/membres`, mémorisé·e sur l'appareil) et
signale sa présence ou son absence, écrite dans la table Grist `Presence`
du **document de l'association** (code commun :
[`src/lib/grist-asso/`](../../lib/grist-asso/)). Détail : [api.md](../../../docs/api.md).

**Actif par défaut**, indépendant des plugins [`adhesion`](../adhesion/README.md)
et [`activites`](../activites/README.md). `plugins: { presence: false }` (ou la
case « Plugin actif ») retire la page, ses routes et le lien rapide. Jusqu'à
la 0.5.22, il faisait partie du plugin adhésion : sans valeur écrite, il
suit `plugins.adhesion` (`heriteDe`).

## Organisation

| Fichier / dossier | Contenu |
| :--- | :--- |
| `plugin.ts` | Manifeste : page `/je-participe`, routes `/api/presence/*` et route commune `membres` |
| `index.ts` | `PRESENCE_HREF` |
| `pages/je-participe.astro` | Page |
| `formulaire/` | Îlot Vue `PresenceForm.vue` et son client `presenceApi` |
| `api/seances.ts` | `GET /api/presence/seances` : séances en cours du membre |
| `api/inscrire.ts` | `POST /api/presence/inscrire` : présence ou absence |
| `lib/presence.ts` | `fetchSeancesCourantes()`, `enregistrerPresence()` |
