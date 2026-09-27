const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1800;

export async function prepareImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error("Images must be 5 MB or smaller.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error("This image could not be read."));
      element.src = objectUrl;
    });
    const scale = Math.min(
      1,
      MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Your browser could not prepare this image.")),
        "image/webp",
        0.86,
      );
    });
    if (blob.size > MAX_IMAGE_BYTES)
      throw new Error("This image is still larger than 5 MB after resizing.");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function imageAltFromFile(file: File) {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .slice(0, 200);
}
