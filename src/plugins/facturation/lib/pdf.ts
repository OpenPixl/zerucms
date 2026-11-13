/**
 * HTML d'un devis ou d'une facture (A4 portrait), converti en PDF par
 * Gotenberg (`src/lib/gotenberg.ts`). Mentions de l'auto-entrepreneur :
 * nom + « EI », adresse, SIRET (`association.yaml`), mention de TVA,
 * conditions de paiement et pénalités (`facturation.yaml`) ; pour une
 * facture : numéro, date d'émission, date de la prestation, échéance.
 *
 * Code serveur uniquement.
 */
import { association, getAddressLines } from '../../../lib/association';
import { site } from '../../../config/site';
import { facturationConfig } from './config';
import { euros, montantLigne, type Client, type Devis, type Facture } from './types';

const logos: Record<string, string> = import.meta.glob('../../../content/images/logo.{png,jpg,jpeg,webp,svg}', {
	eager: true,
	query: '?inline',
	import: 'default',
});
const logo = Object.values(logos)[0] ?? '';

const e = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const br = (s: string) => e(s).replace(/\n/g, '<br>');
const dateFr = (iso: string) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '');
const quantite = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

export type DocumentPdf = { type: 'devis'; doc: Devis } | { type: 'facture'; doc: Facture };

export function nomFichier(d: DocumentPdf): string {
	const numero = d.doc.numero || `brouillon-${d.doc.id}`;
	return `${d.type === 'devis' ? 'devis' : 'facture'}-${numero}.pdf`.replace(/[^\w.-]+/g, '-');
}

export function documentHtml(d: DocumentPdf, client: Client | null): string {
	const { doc } = d;
	const c = facturationConfig;
	const legal = association.legal;
	const facture = d.type === 'facture' ? d.doc : null;
	const devis = d.type === 'devis' ? d.doc : null;
	const titre = facture ? (facture.numero ? `Facture ${facture.numero}` : 'Facture (brouillon)') : `Devis ${doc.numero || '(demande)'}`;
	const infos: [string, string][] = facture
		? [
				["Date d'émission", dateFr(facture.date) || 'non émise'],
				['Date de la prestation', facture.datePrestation],
				["Date d'échéance", dateFr(facture.echeance)],
			]
		: [
				['Date', dateFr(devis!.date)],
				["Valable jusqu'au", dateFr(devis!.validite)],
			];
	const paiement = facture && c.paiement.iban ? `<p><strong>Règlement par virement</strong> : IBAN ${e(c.paiement.iban)}${c.paiement.bic ? ` · BIC ${e(c.paiement.bic)}` : ''}</p>` : '';
	const paye = facture?.statut === 'Payée' ? `<p class="paye">Payée le ${dateFr(facture.datePaiement)} (${e(facture.modePaiement)})</p>` : '';
	const signature = devis
		? '<div class="signature"><p>Bon pour accord (date, signature et mention « Bon pour accord ») :</p><div class="cadre"></div></div>'
		: '';

	return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${e(titre)}</title>
<style>
	@page { size: A4; margin: 16mm 14mm; }
	* { box-sizing: border-box; }
	body { font: 10pt/1.45 "Helvetica Neue", Arial, sans-serif; color: #1f2937; margin: 0; }
	header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
	header img { max-height: 60px; max-width: 200px; }
	.emetteur { font-size: 9pt; color: #4b5563; margin-top: 8px; }
	.emetteur strong { color: #111827; font-size: 10.5pt; }
	h1 { font-size: 18pt; margin: 0; color: ${site.colors.primary}; text-align: right; }
	.infos { margin-top: 6px; font-size: 9pt; text-align: right; }
	.infos div span { color: #6b7280; }
	.client { margin: 28px 0 18px auto; width: 48%; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
	.client .etiquette { font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
	.objet { margin: 0 0 10px; }
	table { width: 100%; border-collapse: collapse; }
	th { background: #f3f4f6; text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; padding: 7px 8px; }
	td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
	.n { text-align: right; white-space: nowrap; }
	.total td { border: 0; font-weight: bold; font-size: 11pt; }
	.tva { text-align: right; font-size: 9pt; margin: 4px 0 18px; }
	.notes { margin: 12px 0; }
	.conditions { font-size: 8.5pt; color: #4b5563; margin-top: 18px; }
	.paye { color: #166534; font-weight: bold; }
	.signature { margin-top: 24px; width: 55%; margin-left: auto; font-size: 9pt; }
	.cadre { height: 70px; border: 1px solid #9ca3af; border-radius: 6px; }
	footer { margin-top: 28px; font-size: 7.5pt; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 6px; }
</style></head>
<body>
<header>
	<div>
		${logo ? `<img src="${logo}" alt="">` : ''}
		<div class="emetteur">
			<strong>${e(association.name)}</strong><br>
			${legal.president ? `${e(legal.president)} — entrepreneur individuel (EI)<br>` : 'Entrepreneur individuel (EI)<br>'}
			${getAddressLines().map(e).join('<br>')}<br>
			${e(association.email)} · ${e(association.phone)}<br>
			${legal.siretNumber ? `SIRET ${e(legal.siretNumber)}` : 'SIRET : à compléter'}
		</div>
	</div>
	<div>
		<h1>${e(titre)}</h1>
		<div class="infos">${infos
			.filter(([, v]) => v)
			.map(([k, v]) => `<div><span>${e(k)} :</span> ${e(v)}</div>`)
			.join('')}</div>
	</div>
</header>

<div class="client">
	<div class="etiquette">${facture ? 'Facturé à' : 'Client'}</div>
	${
		client
			? `<strong>${e(client.societe || client.nom)}</strong><br>${client.societe ? `${e(client.nom)}<br>` : ''}${client.adresse ? `${e(client.adresse)}<br>` : ''}${
					client.codePostal || client.ville ? `${e(`${client.codePostal} ${client.ville}`.trim())}<br>` : ''
				}${client.siret ? `SIRET ${e(client.siret)}` : ''}`
			: 'Client inconnu'
	}
</div>

${doc.objet ? `<p class="objet"><strong>Objet :</strong> ${e(doc.objet)}</p>` : ''}

<table>
	<thead><tr><th>Désignation</th><th class="n">Quantité</th><th class="n">Prix unitaire HT</th><th class="n">Montant HT</th></tr></thead>
	<tbody>
		${doc.lignes
			.map(
				(l) =>
					`<tr><td>${br(l.libelle)}</td><td class="n">${quantite(l.quantite)}${l.unite ? ` ${e(l.unite)}` : ''}</td><td class="n">${euros(l.prixUnitaire)}</td><td class="n">${euros(montantLigne(l))}</td></tr>`,
			)
			.join('')}
		<tr class="total"><td colspan="3" class="n">Total à payer</td><td class="n">${euros(doc.total)}</td></tr>
	</tbody>
</table>
<p class="tva">${e(c.tva)}</p>

${doc.notes ? `<p class="notes">${br(doc.notes)}</p>` : ''}
${paiement}
${paye}
<p class="conditions">${e(facture ? c.factures.conditions : c.devis.conditions)}</p>
${signature}

<footer>${e(association.name)} — EI — ${legal.siretNumber ? `SIRET ${e(legal.siretNumber)} — ` : ''}${e(c.tva)}</footer>
</body></html>`;
}
