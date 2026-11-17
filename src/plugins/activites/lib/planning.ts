/**
 * Planning hebdomadaire affiché sur `/activites` : lu en direct depuis la
 * table Grist `Activite` plutôt qu'en dur dans le code. Seules les lignes
 * `Publiee = true` de la saison en cours sont retenues ; celles sans
 * `Categorie_agenda` valide (colonne pas encore renseignée) sont ignorées.
 *
 * Seules les activités qui ont lieu **dans la semaine en cours** sont
 * affichées : une ligne avec `Ouverture` (date de la première séance) n'apparaît
 * qu'à partir de la semaine de cette date, et pendant `Nombre_de_seances`
 * semaines si ce nombre est renseigné (0 ou vide = sans fin). Sans
 * `Ouverture`, la ligne est affichée chaque semaine.
 */

import { AGENDA_KIND_META, type AgendaKind, type AgendaSession } from '../../../lib/agenda';
import { COLS, currentSaisonId, listRecords, membreLabel, parseRefList, TABLES } from '../../../lib/grist-asso/grist';

/** "16:30" (Grist) -> "16h30" (format attendu par WeeklyAgenda.astro). */
function toAgendaTime(value: unknown): string {
	return String(value ?? '').replace(':', 'h');
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lundi (minuit UTC) de la semaine contenant `date` (lue en UTC). */
function mondayOf(date: Date): number {
	const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	return midnight - ((date.getUTCDay() + 6) % 7) * DAY_MS;
}

/** Lundi de la semaine en cours, d'après la date du jour à Paris. */
function currentMonday(now: Date): number {
	const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
	return mondayOf(new Date(`${ymd}T00:00:00Z`));
}

/**
 * L'activité a-t-elle lieu dans la semaine commençant le lundi `monday` ?
 * Sans `Ouverture`, elle est réputée hebdomadaire et toujours affichée.
 */
function occursThisWeek(ouverture: unknown, nombre: unknown, monday: number): boolean {
	if (typeof ouverture !== 'number') return true;
	const index = Math.round((monday - mondayOf(new Date(ouverture * 1000))) / (7 * DAY_MS));
	if (index < 0) return false;
	return !(typeof nombre === 'number' && nombre > 0 && index >= nombre);
}

/** « 3 places restantes » / « Complet », si un nombre de places est fixé. */
function placesNote(max: unknown, restantes: unknown): string | undefined {
	if (typeof max !== 'number' || max <= 0 || typeof restantes !== 'number') return undefined;
	if (restantes <= 0) return 'Complet';
	return `${restantes} place${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''}`;
}

export async function fetchPlanningAgenda(): Promise<AgendaSession[]> {
	const saisonId = await currentSaisonId();
	const records = await listRecords(TABLES.activites, {
		[COLS.activite.saison]: [saisonId],
		[COLS.activite.publiee]: [true],
	});

	const encadrantIds = new Set<number>();
	for (const r of records) {
		for (const id of parseRefList(r.fields[COLS.activite.encadrant])) {
			encadrantIds.add(id);
		}
	}
	const membres = encadrantIds.size > 0 ? await listRecords(TABLES.membres) : [];
	// Prénom seul sur les cartes du planning (nom complet en repli).
	const labelParMembre = new Map(
		membres.map((m) => [
			m.id,
			String(m.fields[COLS.membre.prenom] ?? '').trim() || membreLabel(m.fields),
		]),
	);

	const monday = currentMonday(new Date());

	return records
		.filter((r) => {
			const kind = r.fields[COLS.activite.categorieAgenda];
			return typeof kind === 'string' && kind in AGENDA_KIND_META;
		})
		.flatMap((r) => {
			const f = r.fields;
			if (!occursThisWeek(f[COLS.activite.ouverture], f[COLS.activite.nombreSeances], monday)) {
				return [];
			}
			const session: AgendaSession = {
				day: String(f[COLS.activite.jour]),
				start: toAgendaTime(f[COLS.activite.debuteA]),
				end: toAgendaTime(f[COLS.activite.finiA]),
				title: String(f[COLS.activite.nom] ?? ''),
				kind: f[COLS.activite.categorieAgenda] as AgendaKind,
			};
			const animateurs = parseRefList(f[COLS.activite.encadrant])
				.map((id) => labelParMembre.get(id))
				.filter((label): label is string => Boolean(label))
				.join(' et ');
			if (animateurs) session.animators = animateurs;
			const lieu = f[COLS.activite.lieu];
			if (lieu) session.location = String(lieu);
			const places = placesNote(f[COLS.activite.placesMax], f[COLS.activite.placesRestantes]);
			if (places) session.note = places;
			return [session];
		});
}
