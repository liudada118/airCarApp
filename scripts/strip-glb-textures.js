// 剥掉 glb 里的内嵌贴图与材质贴图引用。
// 原因:新模型内嵌贴图在 RN+three 环境无法加载(Creating blobs from ArrayBuffer not supported),
// GLTFLoader 会 console.error + throw,开屏弹红屏。剥掉贴图引用后模型渲染为纯色(灰),不再报错。
// 用法: node scripts/strip-glb-textures.js <in.glb> [out.glb]
const fs = require('fs');

const inPath = process.argv[2] || 'src/assets/3D/carSeatModel.glb';
const outPath = process.argv[3] || inPath;

const buf = fs.readFileSync(inPath);
// glb 头: magic(4) version(4) length(4)
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) {
  throw new Error('不是 glb 文件 (magic 不匹配)');
}
// 第一个 chunk: length(4) type(4) data
const jsonChunkLen = buf.readUInt32LE(12);
const jsonChunkType = buf.readUInt32LE(16);
if (jsonChunkType !== 0x4e4f534a) {
  throw new Error('第一个 chunk 不是 JSON');
}
const jsonStart = 20;
const jsonBuf = buf.slice(jsonStart, jsonStart + jsonChunkLen);
const json = JSON.parse(jsonBuf.toString('utf8'));

const before = {
  images: (json.images || []).length,
  textures: (json.textures || []).length,
  materials: (json.materials || []).length,
};

// 删除贴图相关顶层数组
delete json.images;
delete json.textures;
delete json.samplers;

// 删除材质里所有指向 texture 的引用,只保留纯色 (baseColorFactor 等)
const TEX_KEYS = [
  'baseColorTexture', 'metallicRoughnessTexture',
  'normalTexture', 'occlusionTexture', 'emissiveTexture',
];
for (const mat of json.materials || []) {
  if (mat.pbrMetallicRoughness) {
    for (const k of ['baseColorTexture', 'metallicRoughnessTexture']) {
      delete mat.pbrMetallicRoughness[k];
    }
  }
  for (const k of TEX_KEYS) delete mat[k];
  if (mat.extensions) delete mat.extensions; // 去掉可能引用贴图的扩展
}

// 重新序列化 JSON chunk(4 字节对齐,用空格补齐)
let newJson = Buffer.from(JSON.stringify(json), 'utf8');
while (newJson.length % 4 !== 0) newJson = Buffer.concat([newJson, Buffer.from(' ')]);

// 保留第二个 chunk(BIN)原样
const binStart = jsonStart + jsonChunkLen;
const binChunk = buf.slice(binStart); // 含它自己的 length/type 头

// 拼装新 glb
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // magic
header.writeUInt32LE(2, 4); // version
const totalLen = 12 + 8 + newJson.length + binChunk.length;
header.writeUInt32LE(totalLen, 8);

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(newJson.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

const out = Buffer.concat([header, jsonChunkHeader, newJson, binChunk]);
fs.writeFileSync(outPath, out);

console.log('剥离前:', before);
console.log('输出:', outPath, '大小:', out.length, 'bytes (原', buf.length, ')');
