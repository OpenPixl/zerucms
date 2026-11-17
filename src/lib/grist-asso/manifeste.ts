/**
 * Part commune des manifestes des plugins adhésion, activités et présence,
 * qui lisent le même document Grist de l'association : variables
 * d'environnement du document et routes communes (`./api/`). Chargé par la
 * config Astro (via `src/plugins/manifests.ts`) : imports sûrs côté config
 * seulement. Une route commune déclarée par plusieurs plugins actifs n'est
 * ajoutée qu'une fois (`src/integrations/plugins.ts`).
 */
import { envField } from 'astro/config';

/**
 * Routes communes, adresses historiques `/api/adhesion/*` gardées :
 * `membre` (retrouver ou créer un·e membre), `membres` (recherche par nom),
 * `inscription` (inscrire à une activité).
 */
export function routesGristAsso(...noms: ('membre' | 'membres' | 'inscription')[]) {
	return noms.map((nom) => ({ pattern: `/api/adhesion/${nom}`, entrypoint: `src/lib/grist-asso/api/${nom}.ts` }));
}

/**
 * Document Grist de l'association (GRIST_BASE_URL / GRIST_API_KEY, partagés
 * avec les autres plugins et les extensions, sont déclarés dans astro.config.mjs).
 */
export const ENV_GRIST_ASSO = {
	GRIST_DOC_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
	GRIST_TABLE_MEMBRES: envField.string({ context: 'server', access: 'secret', default: 'Membres' }),
	GRIST_TABLE_ADHESIONS: envField.string({ context: 'server', access: 'secret', default: 'Adhesions' }),
	GRIST_TABLE_INSCRIPTIONS: envField.string({ context: 'server', access: 'secret', default: 'Inscription' }),
	GRIST_TABLE_COTISATIONS: envField.string({ context: 'server', access: 'secret', default: 'Cotisation' }),
	GRIST_TABLE_ACTIVITES: envField.string({ context: 'server', access: 'secret', default: 'Activite' }),
	GRIST_TABLE_SAISONS: envField.string({ context: 'server', access: 'secret', default: 'Saisons' }),
	GRIST_TABLE_PRESENCE: envField.string({ context: 'server', access: 'secret', default: 'Presence' }),
};
