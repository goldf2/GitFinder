const EXPORT_FORMAT = 'gitfinder.relationship-board';
const EXPORT_FORMAT_VERSION = 1;
const HIGH_CONFIDENCE_SECRET_PATTERN = /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----|(?:password|passwd|secret|token|credential|private[_ -]?key|access[_ -]?key)\s*[:=]\s*\S+/i;

function containsHighConfidenceSecret(value) {
  if (typeof value === 'string') return HIGH_CONFIDENCE_SECRET_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsHighConfidenceSecret);
  if (value && typeof value === 'object') return Object.values(value).some(containsHighConfidenceSecret);
  return false;
}

function unwrapRelationshipBoardFile(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { store: parsed, portable: false };
  }
  if (!Object.prototype.hasOwnProperty.call(parsed, 'format')) {
    return { store: parsed, portable: false };
  }
  if (parsed.format !== EXPORT_FORMAT) {
    throw new Error(`不支持的关系白板文件格式：${String(parsed.format || '未知')}`);
  }
  if (Number(parsed.formatVersion) !== EXPORT_FORMAT_VERSION) {
    throw new Error(`暂不支持关系白板文件版本：${String(parsed.formatVersion ?? '未知')}`);
  }
  if (!parsed.store || typeof parsed.store !== 'object' || Array.isArray(parsed.store)) {
    throw new Error('关系白板文件缺少 store 数据');
  }
  return {
    store: parsed.store,
    portable: true,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : ''
  };
}

module.exports = {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  HIGH_CONFIDENCE_SECRET_PATTERN,
  containsHighConfidenceSecret,
  unwrapRelationshipBoardFile
};
