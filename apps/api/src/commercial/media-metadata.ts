import { BadRequestException } from "@nestjs/common";

export interface MediaMetadata { mediaType: "IMAGE" | "VIDEO"; width: number; height: number; durationSeconds?: number; }
const invalid = () => new BadRequestException("Não foi possível ler esta mídia. Envie uma imagem JPG, PNG ou WebP estática, ou um MP4 H.264 válido.");

function imageDimensions(data: Buffer, mime: string): MediaMetadata {
  let width = 0; let height = 0;
  if (mime === "image/png") {
    if (data.length < 33 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || data.toString("ascii", 12, 16) !== "IHDR") throw invalid();
    width = data.readUInt32BE(16); height = data.readUInt32BE(20);
    let offset = 8;
    while (offset + 12 <= data.length) {
      const length = data.readUInt32BE(offset); const type = data.toString("ascii", offset + 4, offset + 8);
      if (length > data.length - offset - 12) throw invalid();
      if (type === "acTL") throw new BadRequestException("Use uma imagem estática. PNG animado não é aceito em campanhas.");
      offset += length + 12;
      if (type === "IEND") break;
    }
  } else if (mime === "image/jpeg") {
    if (data.length < 4 || data.readUInt16BE(0) !== 0xffd8) throw invalid();
    let offset = 2;
    while (offset < data.length) {
      if (data[offset++] !== 0xff) throw invalid();
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > data.length) throw invalid();
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) throw invalid();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) throw invalid();
        height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5); break;
      }
      offset += length;
    }
  } else if (mime === "image/webp") {
    if (data.length < 30 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP") throw invalid();
    let offset = 12;
    while (offset + 8 <= data.length) {
      const kind = data.toString("ascii", offset, offset + 4); const length = data.readUInt32LE(offset + 4); const start = offset + 8;
      if (length > data.length - start) throw invalid();
      if (kind === "ANIM" || kind === "ANMF" || kind === "VP8X" && length >= 10 && (data[start] & 2)) throw new BadRequestException("Use uma imagem WebP estática.");
      if (kind === "VP8X" && length >= 10) { width = data.readUIntLE(start + 4, 3) + 1; height = data.readUIntLE(start + 7, 3) + 1; }
      if (kind === "VP8 " && length >= 10 && !width) {
        if (!data.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) throw invalid();
        width = data.readUInt16LE(start + 6) & 0x3fff; height = data.readUInt16LE(start + 8) & 0x3fff;
      }
      if (kind === "VP8L" && length >= 5 && !width) {
        if (data[start] !== 0x2f) throw invalid();
        const bits = data.readUInt32LE(start + 1); width = (bits & 0x3fff) + 1; height = (bits >>> 14 & 0x3fff) + 1;
      }
      offset = start + length + (length % 2);
    }
  } else throw invalid();
  if (!width || !height) throw invalid();
  return { mediaType: "IMAGE", width, height };
}

interface Box { type: string; start: number; end: number; }
function boxes(data: Buffer, start: number, end: number): Box[] {
  const output: Box[] = [];
  while (start + 8 <= end) {
    let size = data.readUInt32BE(start); const type = data.toString("ascii", start + 4, start + 8); let header = 8;
    if (size === 1) {
      if (start + 16 > end) throw invalid();
      const extended = data.readBigUInt64BE(start + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
      size = Number(extended); header = 16;
    } else if (size === 0) size = end - start;
    if (size < header || size > end - start) throw invalid();
    output.push({ type, start: start + header, end: start + size });
    if (output.length > 10000) throw invalid();
    start += size;
  }
  return output;
}

function videoMetadata(data: Buffer): MediaMetadata {
  const root = boxes(data, 0, data.length);
  if (!root.some((box) => box.type === "ftyp") || !root.some((box) => box.type === "mdat")) throw invalid();
  const moov = root.find((box) => box.type === "moov");
  if (!moov) throw invalid();
  const movie = boxes(data, moov.start, moov.end); const header = movie.find((box) => box.type === "mvhd");
  if (!header || header.end - header.start < 24) throw invalid();
  const version = data[header.start];
  if (version !== 0 && version !== 1 || version === 1 && header.end - header.start < 36) throw invalid();
  const timescale = data.readUInt32BE(header.start + (version === 1 ? 20 : 12));
  const duration = version === 1 ? Number(data.readBigUInt64BE(header.start + 24)) : data.readUInt32BE(header.start + 16);
  const durationSeconds = duration / timescale;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw invalid();
  let width = 0; let height = 0; let videoCount = 0;
  for (const track of movie.filter((box) => box.type === "trak")) {
    const children = boxes(data, track.start, track.end); const mdia = children.find((box) => box.type === "mdia");
    if (!mdia) continue;
    const media = boxes(data, mdia.start, mdia.end); const handler = media.find((box) => box.type === "hdlr");
    if (!handler || handler.end - handler.start < 12) throw invalid();
    const kind = data.toString("ascii", handler.start + 8, handler.start + 12);
    if (kind !== "vide" && kind !== "soun") continue;
    const minf = media.find((box) => box.type === "minf");
    const stbl = minf && boxes(data, minf.start, minf.end).find((box) => box.type === "stbl");
    const stsd = stbl && boxes(data, stbl.start, stbl.end).find((box) => box.type === "stsd");
    if (!stsd || stsd.end - stsd.start < 8) throw invalid();
    const entries = boxes(data, stsd.start + 8, stsd.end);
    if (entries.length !== 1 || !(kind === "vide" ? ["avc1", "avc3"] : ["mp4a"]).includes(entries[0].type)) throw new BadRequestException("O MP4 deve usar vídeo H.264 e áudio AAC (ou não ter áudio).");
    if (kind === "vide") {
      videoCount++;
      const tkhd = children.find((box) => box.type === "tkhd");
      if (!tkhd || tkhd.end - tkhd.start < 84) throw invalid();
      const base = tkhd.start; const v1 = data[base] === 1; const matrixOffset = base + (v1 ? 52 : 40);
      if (tkhd.end - base < (v1 ? 96 : 84)) throw invalid();
      width = Math.round(data.readUInt32BE(base + (v1 ? 88 : 76)) / 65536); height = Math.round(data.readUInt32BE(base + (v1 ? 92 : 80)) / 65536);
      if (data.readInt32BE(matrixOffset) === 0 && data.readInt32BE(matrixOffset + 16) === 0) [width, height] = [height, width];
    }
  }
  if (videoCount !== 1 || !width || !height) throw invalid();
  return { mediaType: "VIDEO", width, height, durationSeconds };
}

export function readAdvertisingMetadata(data: Buffer, mime: string): MediaMetadata {
  try { return mime === "video/mp4" ? videoMetadata(data) : imageDimensions(data, mime); }
  catch (error) { if (error instanceof BadRequestException) throw error; throw invalid(); }
}
