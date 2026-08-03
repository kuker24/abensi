'use strict';

/**
 * BullMQ rejects custom job ids that contain ":".
 * Repeatable child job ids look like "repeat:<hash>:<timestamp>", so DLQ ids
 * must sanitize that shape before queue.add().
 */
function safeCustomJobId(parts, maxLength = 120) {
  const limit = Number.isInteger(maxLength) && maxLength > 8 ? maxLength : 120;
  const joined = (Array.isArray(parts) ? parts : [parts])
    .map((part) => String(part ?? 'na').replace(/[^a-zA-Z0-9._-]+/g, '_'))
    .filter((part) => part.length > 0)
    .join('_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const value = joined || 'job';
  return value.length > limit ? value.slice(0, limit) : value;
}

module.exports = {
  safeCustomJobId
};
