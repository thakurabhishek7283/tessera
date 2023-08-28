/** zlib stream using stored (uncompressed) deflate blocks. */
export function deflateStored(data: Uint8Array): Uint8Array {
  const MAX = 0xffff;
  const blocks = Math.max(1, Math.ceil(data.length / MAX));
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  out.set([0x78, 0x01], 0);
  let pos = 2;
  for (let i = 0; i < blocks; i++) {
    const slice = data.subarray(i * MAX, (i + 1) * MAX);
    out[pos++] = i === blocks - 1 ? 1 : 0;
    out[pos++] = slice.length & 0xff;
    out[pos++] = slice.length >>> 8;
    out[pos++] = ~slice.length & 0xff;
    out[pos++] = (~slice.length >>> 8) & 0xff;
    out.set(slice, pos);
    pos += slice.length;
  }
  new DataView(out.buffer).setUint32(pos, adler32(data));
  return out;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
