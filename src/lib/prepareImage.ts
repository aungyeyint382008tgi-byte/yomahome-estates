const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.84;

function isHeicLike(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    name.endsWith('.hif') ||
    type.includes('heic') ||
    type.includes('heif')
  );
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Native browser decode failed.'));
    };
    img.src = url;
  });
}

async function renderBlobToJpeg(blob: Blob): Promise<Blob> {
  const img = await loadImageFromBlob(blob);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('Invalid image dimensions.');

  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('JPEG encoding failed.'))),
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}

async function convertWithHeicTo(file: File): Promise<Blob> {
  const { heicTo, isHeic } = await import('heic-to');
  const detected = await isHeic(file).catch(() => isHeicLike(file));
  if (!detected && !isHeicLike(file)) {
    throw new Error('Unsupported format.');
  }
  return heicTo({
    blob: file,
    type: 'image/jpeg',
    quality: 0.9,
  });
}

export async function prepareImageForUpload(file: File): Promise<File> {
  const baseName = (file.name.replace(/\.[^.]+$/, '') || 'photo').replace(/[^a-zA-Z0-9_-]/g, '_');
  let sourceBlob: Blob = file;

  if (isHeicLike(file)) {
    try {
      sourceBlob = await convertWithHeicTo(file);
    } catch {
      sourceBlob = file;
    }
  }

  try {
    const jpegBlob = await renderBlobToJpeg(sourceBlob);
    return new File([jpegBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    try {
      const converted = await convertWithHeicTo(file);
      const jpegBlob = await renderBlobToJpeg(converted).catch(() => converted);
      return new File([jpegBlob], `${baseName}.jpg`, { type: 'image/jpeg' });
    } catch {
      if (file.type && file.type.startsWith('image/')) {
        return file;
      }
      throw new Error('Could not process this photo. Please try another image file.');
    }
  }
}
