<script setup lang="ts">
import { inject, ref } from 'vue';
import { PASSWORD_MIN_LENGTH } from '../../../lib/auth/password-rules';
import { ApiError, authApi } from '../client';
import { ADMIN_CONTEXT, inputClass } from '../context';

const { user, sessionExpired } = inject(ADMIN_CONTEXT)!;

/** `forced` : mot de passe provisoire à remplacer avant de continuer (`done` une fois changé). */
const props = defineProps<{ forced?: boolean }>();
const emit = defineEmits<{ done: [] }>();

const current = ref('');
const next = ref('');
const confirm = ref('');
const error = ref('');
const done = ref(false);
const busy = ref(false);

async function submit() {
	error.value = '';
	done.value = false;
	if (next.value !== confirm.value) {
		error.value = 'Les deux nouveaux mots de passe ne correspondent pas.';
		return;
	}
	busy.value = true;
	try {
		await authApi.changePassword(current.value, next.value);
		if (props.forced) return emit('done');
		done.value = true;
		current.value = next.value = confirm.value = '';
	} catch (e) {
		if (e instanceof ApiError && e.status === 401) return sessionExpired();
		error.value = (e as Error).message;
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<form class="space-y-4" @submit.prevent="submit">
		<p v-if="props.forced" class="text-sm text-gray-600">
			Votre mot de passe est provisoire : choisissez le vôtre pour accéder à l'Espace Admin.
		</p>
		<p v-if="done" class="alerte-succes" role="status">
			Mot de passe modifié. Vos autres appareils sont déconnectés.
		</p>
		<p v-if="error" class="alerte-erreur" role="alert">{{ error }}</p>
		<input type="text" :value="user?.login" autocomplete="username" hidden />
		<div>
			<label for="pw-current" class="champ-libelle">
				{{ props.forced ? 'Mot de passe provisoire' : 'Mot de passe actuel' }}
			</label>
			<input id="pw-current" v-model="current" type="password" required autocomplete="current-password" :class="inputClass" />
		</div>
		<div>
			<label for="pw-next" class="champ-libelle">Nouveau mot de passe</label>
			<input
				id="pw-next"
				v-model="next"
				type="password"
				required
				:minlength="PASSWORD_MIN_LENGTH"
				autocomplete="new-password"
				:class="inputClass"
			/>
			<p class="champ-aide">
				{{ PASSWORD_MIN_LENGTH }} caractères minimum. Une courte phrase est idéale.
			</p>
		</div>
		<div>
			<label for="pw-confirm" class="champ-libelle">Confirmer le nouveau mot de passe</label>
			<input id="pw-confirm" v-model="confirm" type="password" required autocomplete="new-password" :class="inputClass" />
		</div>
		<button
			type="submit"
			:disabled="busy"
			class="bouton bouton-primaire"
		>
			Changer mon mot de passe
		</button>
	</form>
</template>
