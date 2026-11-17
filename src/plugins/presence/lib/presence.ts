/**
 * Dispositif « Je participe » : détecte la séance en cours (à partir des
 * lignes `Activite` publiées, cf. `src/plugins/activites/lib/planning.ts`) et
 * enregistre la présence — ou l'absence signalée — d'un membre.
 *
 * Une ligne `Presence` par séance (Activite × Date), avec deux listes de
 * membres (`Presents` / `Absents`). Pas d'opération atomique « ajouter à la
 * liste » côté Grist : on relit, on vérifie l'absence de doublon, on
 * réécrit la liste complète.
 */

import {
	COLS,
	createRecord,
	currentSaisonId,
	dateToEpochSeconds,
	listRecords,
	parseRefList,
	refList,
	TABLES,
	updateRecord,
} from '../../../lib/grist-asso/grist';
import type { PresenceStatut, SeanceCourante } from '../../../lib/grist-asso/types';

const FUSEAU = 'Europe/Paris';
/** Marge avant le début d'une séance pendant laquelle on peut déjà pointer sa présence. */
const MARGE_AVANT_MIN = 15;

function capitaliser(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function jourActuel(date: Date): string {
	return capitaliser(new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long' }).format(date));
}

function minutesActuelles(date: Date): number {
	const parts = new Intl.DateTimeFormat('fr-FR', {
		timeZone: FUSEAU,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).formatToParts(date);
	const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
	const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
	return h * 60 + m;
}

/** Date du jour (fuseau association) au format ISO yyyy-mm-dd. */
function dateDuJourIso(date: Date): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU }).format(date);
}

/** "16:30" -> 990 (minutes depuis minuit). */
function toMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + (m || 0);
}

/** Activités auxquelles `membreId` a une Inscription (peu importe la disponibilité). */
async function activitesInscrites(membreId: number): Promise<Set<number>> {
	const inscriptions = await listRecords(TABLES.inscriptions, {
		[COLS.inscription.membre]: [membreId],
	});
	return new Set(inscriptions.map((r) => r.fields[COLS.inscription.activite] as number));
}

/**
 * Séances Activite (publiées, saison en cours) dont l'horaire couvre le
 * moment présent, restreintes à celles où `membreId` est inscrit.
 */
export async function fetchSeancesCourantes(
	membreId: number,
	date = new Date(),
): Promise<SeanceCourante[]> {
	const saisonId = await currentSaisonId();
	const jour = jourActuel(date);
	const minutes = minutesActuelles(date);

	const [records, inscrites] = await Promise.all([
		listRecords(TABLES.activites, {
			[COLS.activite.saison]: [saisonId],
			[COLS.activite.publiee]: [true],
			[COLS.activite.jour]: [jour],
		}),
		activitesInscrites(membreId),
	]);

	return records
		.filter((r) => inscrites.has(r.id))
		.filter((r) => {
			const debut = toMinutes(String(r.fields[COLS.activite.debuteA] ?? ''));
			const fin = toMinutes(String(r.fields[COLS.activite.finiA] ?? ''));
			return minutes >= debut - MARGE_AVANT_MIN && minutes <= fin;
		})
		.map((r) => ({
			activiteId: r.id,
			label: String(r.fields[COLS.activite.nom] ?? `Activité ${r.id}`),
		}));
}

/**
 * Ajoute `membreId` à la liste Presents ou Absents de la séance du jour,
 * sans doublon. Revérifie que le membre est bien inscrit à cette activité
 * (au cas où la liste affichée serait périmée).
 */
export async function enregistrerPresence(
	membreId: number,
	activiteId: number,
	statut: PresenceStatut,
	date = new Date(),
): Promise<'ok' | 'deja' | 'non-inscrit'> {
	const inscrites = await activitesInscrites(membreId);
	if (!inscrites.has(activiteId)) return 'non-inscrit';

	const dateEpoch = dateToEpochSeconds(dateDuJourIso(date));
	const colonne = statut === 'present' ? COLS.presence.presents : COLS.presence.absents;

	const lignes = await listRecords(TABLES.presence, {
		[COLS.presence.activite]: [activiteId],
		[COLS.presence.date]: [dateEpoch as number],
	});
	const ligne = lignes[0];

	if (!ligne) {
		await createRecord(TABLES.presence, {
			[COLS.presence.activite]: activiteId,
			[COLS.presence.date]: dateEpoch,
			[colonne]: refList(membreId),
		});
		return 'ok';
	}

	const idsActuels = parseRefList(ligne.fields[colonne]);
	if (idsActuels.includes(membreId)) return 'deja';

	await updateRecord(TABLES.presence, ligne.id, {
		[colonne]: refList(...idsActuels, membreId),
	});
	return 'ok';
}
