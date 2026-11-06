/** Imagens nos PDFs gerados no navegador: fotos, assinaturas e o logo da empresa. */

/** Medidas para a imagem caber na moldura sem cortar nem deformar, centralizada. */
export function fitInFrame(imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number) {
  const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { width, height, offsetX: (frameWidth - width) / 2, offsetY: (frameHeight - height) / 2 };
}

/** Baixa a imagem pelo link temporário e devolve como data URL, para o jsPDF. */
export async function loadImage(url: string): Promise<{ data: string; width: number; height: number; format: "JPEG" | "PNG" }> {
  const blob = await (await fetch(url)).blob();
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return { data, ...size, format: blob.type === "image/png" ? "PNG" : "JPEG" };
}

export interface PdfLogo {
  data: string;
  format: "JPEG" | "PNG";
  width: number;
  height: number;
}

/**
 * Logo pronto para o cabeçalho do PDF, no maior tamanho que cabe na caixa (em mm), sem distorcer.
 * Sem logo, ou se o arquivo não carregar, o documento sai como antes, só com o nome.
 */
export async function loadPdfLogo(url: string | null, maxWidth: number, maxHeight: number): Promise<PdfLogo | null> {
  if (!url) return null;
  const image = await loadImage(url).catch(() => null);
  if (!image) return null;
  const fit = fitInFrame(image.width, image.height, maxWidth, maxHeight);
  return { data: image.data, format: image.format, width: fit.width, height: fit.height };
}
