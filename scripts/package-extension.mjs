import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const extensionRoot = resolve(process.cwd(), process.argv[2] ?? '.');
const distDir = resolve(extensionRoot, 'dist');
const manifestPath = resolve(extensionRoot, 'manifest.json');
const zipPath = resolve(extensionRoot, 'extension.zip');

if (!existsSync(distDir)) {
  console.error(`Extension dist directory does not exist: ${distDir}`);
  process.exit(1);
}
if (!existsSync(manifestPath)) {
  console.error(`Extension manifest does not exist: ${manifestPath}`);
  process.exit(1);
}

copyFileSync(manifestPath, resolve(distDir, 'manifest.json'));

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosDate, dosTime };
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(path);
    }
    return entry.isFile() ? [path] : [];
  });
}

function header(signature, size) {
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32LE(signature, 0);
  return buffer;
}

const localChunks = [];
const centralChunks = [];
let offset = 0;

for (const file of listFiles(distDir).sort()) {
  const data = readFileSync(file);
  const stats = statSync(file);
  const relativeName = relative(distDir, file).replaceAll('\\', '/');
  const nameBuffer = Buffer.from(relativeName);
  const checksum = crc32(data);
  const { dosDate, dosTime } = dosDateTime(stats.mtime);

  const localHeader = header(0x04034b50, 30);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(data.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);

  localChunks.push(localHeader, nameBuffer, data);

  const centralHeader = header(0x02014b50, 46);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(data.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(offset, 42);
  centralChunks.push(centralHeader, nameBuffer);

  offset += localHeader.length + nameBuffer.length + data.length;
}

const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
const endHeader = header(0x06054b50, 22);
const entryCount = centralChunks.length / 2;
endHeader.writeUInt16LE(0, 4);
endHeader.writeUInt16LE(0, 6);
endHeader.writeUInt16LE(entryCount, 8);
endHeader.writeUInt16LE(entryCount, 10);
endHeader.writeUInt32LE(centralSize, 12);
endHeader.writeUInt32LE(offset, 16);
endHeader.writeUInt16LE(0, 20);

mkdirSync(extensionRoot, { recursive: true });
writeFileSync(zipPath, Buffer.concat([...localChunks, ...centralChunks, endHeader]));

console.log(`packaged ${entryCount} ${entryCount === 1 ? 'file' : 'files'} into ${basename(zipPath)}`);
