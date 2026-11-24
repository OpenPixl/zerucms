<script setup lang="ts">
import { inject } from 'vue';
import { ADMIN_CONTEXT } from '../context';

const { pages } = inject(ADMIN_CONTEXT)!;
</script>

<template>
	<ul v-if="pages.length > 0" class="space-y-3">
		<li v-for="p in pages" :key="p.url">
			<a
				:href="p.url"
				class="block rounded-xl border border-gray-100 p-4 shadow-sm transition-shadow hover:shadow-md"
			>
				<span class="font-heading font-semibold text-gray-900">{{ p.title }}</span>
				<span v-if="p.description" class="mt-1 block text-sm font-light text-gray-600">{{ p.description }}</span>
			</a>
		</li>
	</ul>
	<p v-else class="text-sm font-light text-gray-500">
		Aucune page réservée pour l'instant.
	</p>
</template>
