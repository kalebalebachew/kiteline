export type Attachment = {
	id: string;
	previewUrl: string;
	mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
	data: string;
};

const MAX_EDGE = 1568;

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/** Phone photos are huge; scale to the size Claude reads best and re-encode as JPEG. */
export async function toAttachment(file: File): Promise<Attachment> {
	const id = Math.random().toString(36).slice(2);
	if (file.type === "image/gif") {
		return {
			id,
			previewUrl: URL.createObjectURL(file),
			mediaType: "image/gif",
			data: await blobToBase64(file),
		};
	}
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const keepPng = file.type === "image/png" && scale === 1 && file.size < 1_500_000;
	const blob = await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))),
			keepPng ? "image/png" : "image/jpeg",
			0.86,
		),
	);
	return {
		id,
		previewUrl: URL.createObjectURL(blob),
		mediaType: keepPng ? "image/png" : "image/jpeg",
		data: await blobToBase64(blob),
	};
}
