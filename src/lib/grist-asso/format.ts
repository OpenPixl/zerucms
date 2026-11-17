export function formatPrix(prix: number | null): string {
	if (prix === null) return '—';
	if (prix === 0) return 'Gratuit';
	return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(prix);
}
