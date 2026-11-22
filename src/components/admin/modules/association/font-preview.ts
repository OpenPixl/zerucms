/**
 * Aperçu des polices dans le module « Charte graphique » (navigateur) :
 * chaque police (proposée, déposée ou en cours d'ajout) est chargée à la
 * demande sous un nom d'aperçu (`apercu-…`) avec l'API `FontFace`, sans
 * toucher aux polices du site.
 */
import { catalogueFont, FALLBACK_STACK, fontSlug, type FontWeight } from '../../../../lib/font-catalogue';
import type { BrandSource } from '../../client';

/** Police à l'étude : sources de ses fichiers (URL, data URL ou fichier choisi) par graisse. */
export interface PreviewFiles {
	key: string;
	files: { graisse: FontWeight; source: string | File }[];
}

const loaded = new Set<string>();

const familyOf = (key: string) => `apercu-${key}`;
const weightOf = (graisse: FontWeight, range?: string) => (graisse === 'variable' ? (range ?? '100 900') : graisse);

async function load(preview: PreviewFiles, range?: string): Promise<void> {
	if (loaded.has(preview.key) || typeof FontFace === 'undefined') return;
	loaded.add(preview.key);
	for (const f of preview.files) {
		try {
			const source = typeof f.source === 'string' ? `url(${f.source})` : await f.source.arrayBuffer();
			const face = new FontFace(familyOf(preview.key), source, { weight: weightOf(f.graisse, range), display: 'swap' });
			document.fonts.add(await face.load());
		} catch {
			// Fichier illisible : l'aperçu garde la police de secours.
		}
	}
}

/** Pile CSS d'aperçu d'une police (chargée en tâche de fond). `pending` = polices en cours d'ajout. */
export function previewFamily(value: string, source: BrandSource, pending: { nom: string; fichiers: { graisse: FontWeight; file: File }[]; key: number }[]): string {
	const cat = catalogueFont(value);
	if (cat) {
		const url = source.catalogue.find((c) => c.id === cat.id)?.url;
		if (url) void load({ key: `cat-${cat.id}`, files: [{ graisse: 'variable', source: url }] }, cat.weight);
		return `"${familyOf(`cat-${cat.id}`)}", ${FALLBACK_STACK[cat.kind]}`;
	}
	const added = pending.find((p) => p.nom.trim() === value);
	if (added) {
		const key = `new-${added.key}`;
		void load({ key, files: added.fichiers.map((f) => ({ graisse: f.graisse, source: f.file })) });
		return `"${familyOf(key)}", ${FALLBACK_STACK.sans}`;
	}
	const uploaded = source.fonts.deposees.find((d) => d.nom === value);
	if (uploaded) {
		const key = `dep-${fontSlug(uploaded.nom)}`;
		void load({ key, files: uploaded.fichiers.filter((f) => f.preview).map((f) => ({ graisse: f.graisse, source: f.preview! })) });
		return `"${familyOf(key)}", ${FALLBACK_STACK.sans}`;
	}
	return FALLBACK_STACK.sans;
}
