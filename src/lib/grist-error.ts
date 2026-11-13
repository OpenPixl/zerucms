/**
 * Erreur d'appel à Grist (réseau, réponse non 2xx, configuration absente),
 * partagée par les plugins et extensions qui lisent un document Grist :
 * `status` = code HTTP à renvoyer au navigateur.
 */
export class GristError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = 'GristError';
	}
}
