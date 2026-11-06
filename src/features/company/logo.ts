/** Logo da empresa: tamanho máximo do arquivo, conferido no aparelho e no servidor. */
export const MAX_LOGO_BYTES = 512 * 1024;

/** Lados máximos tentados, do mais nítido ao mais leve. Bastam para o cabeçalho do PDF impresso. */
const SIDES = [600, 450, 300];

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível processar a imagem."))), "image/png");
  });
}

/**
 * Reduz o logo no navegador e converte para PNG, mantendo o fundo transparente. PNG é o que o PDF
 * aceita sem perder a transparência; JPG e WebP também chegam assim.
 */
export async function compressLogo(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Envie o logo em PNG, JPG ou WebP.");
  }
  try {
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível processar a imagem.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasToPng(canvas);
      if (blob.size <= MAX_LOGO_BYTES) return blob;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("O logo ficou grande demais. Tente uma imagem mais simples.");
}
