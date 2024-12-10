<script lang="ts">
	let file = $state<File | null>(null);
	let filenames = $state<string[]>([]);
	let chunks = $state<string[]>([]);
	let isUploading = $state<boolean>(false);
	let postTime = $state<string | null>(null);
	let getTime = $state<string | null>(null);
	let selectedFile = $state<string | null>(null);

	async function getData(fileName: string) {
		if (!fileName) {
			alert('Please select a file to stream.');
			return;
		}

		chunks = [];
		const startTime = Date.now();

		try {
			const response = await fetch(
				`/api?file=${encodeURIComponent(fileName)}`,
				{ method: 'GET' },
			);
			if (!response.ok) {
				chunks = ['Error fetching data!'];
				return;
			}

			if (response.body) {
				const reader = response.body.getReader();
				const decoder = new TextDecoder();

				let done = false;
				while (!done) {
					const { value, done: readerDone } = await reader.read();
					if (value) {
						const chunk = decoder.decode(value, { stream: true });
						chunks = [...chunks, chunk];
					}
					done = readerDone;
				}
			}
		} catch (err) {
			chunks = ['Error during fetch!'];
			throw err;
		} finally {
			const endTime = Date.now();
			const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
			const minutes = Math.floor(elapsedSeconds / 60);
			const seconds = elapsedSeconds % 60;
			getTime = `${minutes}m ${seconds}s`;
		}
	}

	async function uploadFile(e: Event) {
		e.preventDefault();
		if (!file) return;

		isUploading = true;
		const startTime = Date.now();

		const formData = new FormData();
		formData.append('file', file);

		try {
			const response = await fetch('/api', {
				method: 'POST',
				body: formData,
				headers: {
					'X-File-Name': file.name,
				},
			});
			if (response.ok) {
				filenames = [...filenames, file.name];
			} else {
				throw new Error('File upload failed.');
			}
		} catch (err) {
			throw err;
		} finally {
			isUploading = false;
			const endTime = Date.now();
			const elapsedSeconds = Math.floor((endTime - startTime) / 1000);
			const minutes = Math.floor(elapsedSeconds / 60);
			const seconds = elapsedSeconds % 60;
			postTime = `${minutes}m ${seconds}s`;
		}
	}
</script>

<form
	method="POST"
	enctype="multipart/form-data"
	onsubmit={uploadFile}
>
	<input
		type="file"
		name="file"
		onchange={(e) =>
			(file = (e.target as HTMLInputElement)?.files?.[0] || null)}
		accept=".txt"
	/>
	<button
		type="submit"
		class="bg-blue-500 px-4 py-2"
		disabled={isUploading}
	>
		{isUploading ? 'Uploading...' : 'Submit post'}
	</button>
</form>

<div class="my-16">
	<h2>Uploaded Files</h2>
	<ul>
		{#each filenames as filename}
			<li>
				<label>
					<input
						type="radio"
						name="selectedFile"
						bind:group={selectedFile}
						value={filename}
					/>
					{filename}
				</label>
			</li>
		{/each}
	</ul>
</div>

<form
	method="GET"
	action="/api"
	onsubmit={async (e) => {
		e.preventDefault();
		if (!selectedFile) return;
		await getData(selectedFile);
	}}
>
	<button
		type="submit"
		class="bg-blue-500 px-4 py-2"
	>
		Stream Selected File
	</button>
</form>

<p class="my-16">
	{#if postTime}
		Last POST request completed in: {postTime}
	{/if}
	{#if getTime}
		Last GET request completed in: {getTime}
	{/if}
</p>

<p class="my-16">
	{#if isUploading}
		Uploading file...
	{:else if chunks.length > 0}
		{#each chunks as chunk}{chunk}{/each}
	{/if}
</p>
