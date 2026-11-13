// @ts-check
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';

import node from '@astrojs/node';

import mdx from '@astrojs/mdx';

import vue from '@astrojs/vue';

import sitePages from './src/integrations/site-pages.ts';
import buildInfo from './src/integrations/build-info.ts';
import plugins from './src/integrations/plugins.ts';
import maintenance from './src/integrations/maintenance.ts';
import installation from './src/integrations/installation.ts';
import { PLUGIN_MANIFESTS } from './src/plugins/manifests.ts';
import extensions, { chargerExtensions, envExtensions } from './src/integrations/extensions.ts';

// Extensions installées (extensions/<id>/, docs/extensions.md) : manifestes
// lus une fois (variables d'environnement ci-dessous, routes par l'intégration).
const EXTENSIONS = await chargerExtensions(new URL('./', import.meta.url));

/**
 * Domaine public du site, propre à chaque association : `SITE_URL` dans le
 * `.env` (ex. `https://www.mon-asso.fr`), ou variable d'environnement.
 * Contrairement aux autres variables, il sert À LA CONSTRUCTION (URL absolues
 * du flux RSS, des aperçus de partage, `allowedDomains`) : le changer demande
 * de reconstruire. Absent : refusé pour un build (le site serait faux en
 * ligne), `http://localhost:4321` sinon (dev, check).
 */
function siteUrl() {
  const value = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '').SITE_URL?.trim();
  if (!value) {
    if (process.argv.includes('build')) {
      throw new Error("SITE_URL manquant : ajoutez l'adresse publique du site dans le .env (ex. SITE_URL=https://www.mon-asso.fr).");
    }
    return new URL('http://localhost:4321');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`SITE_URL invalide : « ${value} » (attendu : https://www.mon-asso.fr).`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`SITE_URL invalide : « ${value} » (attendu : adresse seule, sans chemin, ex. https://www.mon-asso.fr).`);
  }
  return url;
}
const site = siteUrl();

// https://astro.build/config
export default defineConfig({
  // Dossier de sortie : `dist` ; la publication depuis l'espace bénévoles
  // construit chaque nouvelle version dans `.releases/<horodatage>` (cf.
  // src/lib/site-build.ts) puis fait pointer `dist` dessus.
  outDir: process.env.ASTRO_OUT_DIR || './dist',

  // Nom de domaine public (URLs absolues du flux RSS, sitemap…) : SITE_URL.
  site: site.origin,

  // Une seule adresse par page, sans « / » final (référencement : pas de
  // contenu dupliqué) : `/actualites/` redirige vers `/actualites` (301),
  // comme les liens du site, l'adresse canonique, le sitemap et le flux RSS.
  trailingSlash: 'never',

  // Derrière le reverse proxy HTTPS (cf. docker-compose.yml) : fait confiance à
  // X-Forwarded-Host/Proto pour ce domaine seulement. Sans cela, Astro voit
  // http://… alors que le navigateur envoie Origin: https://…, et refuse les
  // formulaires POST (connexion, espace bénévoles) avec un 403.
  security: {
    allowedDomains: [{ hostname: site.hostname, protocol: site.protocol.slice(0, -1) }]
  },

  // Variables d'environnement (.env) : toutes en `access: 'secret'`, donc lues
  // AU DÉMARRAGE du serveur Node et jamais recopiées dans dist/ (une variable
  // serveur « public » serait figée au build). Changer le .env ne demande
  // qu'un redémarrage. Toutes facultatives : une fonction non configurée se
  // désactive (formulaires Grist, bulletin PDF, espace bénévoles).
  // Usage : `import { GRIST_API_KEY } from 'astro:env/server'`. Doc : docs/api.md.
  env: {
    schema: {
      // Grist — instance et clé partagées par les plugins et les extensions
      GRIST_BASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      GRIST_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Variables propres à chaque plugin (src/plugins/<id>/plugin.ts) :
      // document et tables de l'adhésion, BULLETIN_SECRET, facturation…
      ...Object.assign({}, ...PLUGIN_MANIFESTS.map((p) => p.env)),
      // Variables des extensions installées (manifest.ts de chacune)
      ...envExtensions(EXTENSIONS),
      // Conversion HTML → PDF (src/lib/gotenberg.ts) : bulletin d'adhésion, devis et factures, extensions
      GOTENBERG_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOTENBERG_USERNAME: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOTENBERG_PASSWORD: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Espace bénévoles (docs/auth.md)
      AUTH_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Publication depuis l'espace bénévoles (docs/publication.md)
      // Racine du projet (sources + node_modules) à reconstruire ; défaut : dossier de lancement.
      SITE_ROOT: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Commande lancée après chaque reconstruction réussie (ex. rsync de dist/client vers un hébergement statique).
      PUBLISH_HOOK: envField.string({ context: 'server', access: 'secret', optional: true }),
      // `false` : ne pas redémarrer le serveur après publication (déconseillé, cf. doc).
      PUBLISH_RESTART: envField.boolean({ context: 'server', access: 'secret', default: true }),
    },
  },

  vite: {
    plugins: [tailwindcss()],
    // Alias du cœur pour les extensions (extensions/<id>/) : `@cms/lib/…` = `src/lib/…`.
    resolve: { alias: { '@cms': fileURLToPath(new URL('./src', import.meta.url)) } },
    // `yaml` est aussi chargé dans le navigateur (dépôt de .md, module « Pages ») :
    // pré-optimisé au démarrage du dev, sinon Vite le découvre en cours de route
    // et l'îlot d'administration échoue (504 « Outdated Optimize Dep »).
    optimizeDeps: { include: ['yaml'] }
  },

  adapter: node({
    mode: 'standalone'
  }),

  // sitePages : retire du build le HTML des pages du site désactivées (404 réel).
  // buildInfo : empreinte du build (build-info.json), lue par scripts/start.mjs.
  // plugins : routes des plugins actifs (src/plugins/, `plugins:` de reglages.yaml).
  integrations: [mdx(), vue(), sitePages(), buildInfo(), plugins(), extensions(EXTENSIONS), maintenance(), installation()]
});