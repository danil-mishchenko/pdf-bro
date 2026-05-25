import { PDFDocument } from 'pdf-lib';

export function parsePageRanges(input: string, totalPages: number): { success: boolean; pages?: number[]; error?: string } {
  // 1. SANITIZE: оставить только цифры, запятые, дефисы
  let sanitized = input.replace(/[^\d,\-]/g, '');

  // 2. Нормализация: схлопнуть множественные дефисы
  sanitized = sanitized.replace(/-{2,}/g, '-');

  // 3. TOKENIZE: разбить по запятой, отбросить пустые
  const tokens = sanitized.split(',').filter(token => token.length > 0);

  // 4. PARSE каждый токен
  const result = new Set<number>();

  for (const token of tokens) {
    if (token.includes('-')) {
      const parts = token.split('-').filter(p => p.length > 0);

      if (parts.length === 0) continue;

      if (parts.length === 1) {
        const num = parseInt(parts[0], 10);
        if (!isNaN(num)) result.add(num);
      } else {
        const start = parseInt(parts[0], 10);
        const end = parseInt(parts[1], 10);

        if (isNaN(start) || isNaN(end)) continue;

        // Авто-коррекция инвертированного диапазона
        let lo = Math.min(start, end);
        let hi = Math.max(start, end);

        // Оптимизация: ограничить верхнюю границу
        hi = Math.min(hi, totalPages);
        lo = Math.max(lo, 1);

        for (let i = lo; i <= hi; i++) {
          result.add(i);
        }
      }
    } else {
      const num = parseInt(token, 10);
      if (!isNaN(num)) result.add(num);
    }
  }

  // 5. BOUND CHECK + SORT
  const filtered = Array.from(result)
    .filter(n => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);

  // 6. EMPTY CHECK
  if (filtered.length === 0) {
    return { success: false, error: 'NO_VALID_PAGES' };
  }

  return { success: true, pages: filtered };
}

export async function processPdf(
  fileBuffer: ArrayBuffer,
  userPages: number[],
  mode: 'keep' | 'remove',
  totalPages: number
): Promise<Uint8Array> {
  let sourcePdf: PDFDocument;
  try {
    sourcePdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } catch (err) {
    throw new Error('FILE_CORRUPTED');
  }

  // Check if encrypted
  if (sourcePdf.isEncrypted) {
    throw new Error('FILE_ENCRYPTED');
  }

  const resultPdf = await PDFDocument.create();

  let pagesToCopy: number[] = [];

  if (mode === 'keep') {
    pagesToCopy = userPages.map(p => p - 1);
  } else {
    const toRemove = new Set(userPages);
    for (let i = 1; i <= totalPages; i++) {
      if (!toRemove.has(i)) {
        pagesToCopy.push(i - 1);
      }
    }
    if (pagesToCopy.length === 0) {
      throw new Error('EMPTY_RESULT');
    }
  }

  const copiedPages = await resultPdf.copyPages(sourcePdf, pagesToCopy);
  for (const page of copiedPages) {
    resultPdf.addPage(page);
  }

  return await resultPdf.save();
}

export function generateFileName(originalName: string, mode: 'keep' | 'remove'): string {
  const baseName = originalName.replace(/\.pdf$/i, '');
  const suffix = mode === 'keep' ? '_kept' : '_removed';
  return `${baseName}${suffix}.pdf`;
}
