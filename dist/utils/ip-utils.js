"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipInCidr = ipInCidr;
exports.ipMatchesList = ipMatchesList;
exports.getClientIp = getClientIp;
exports.checkIpAccess = checkIpAccess;
exports.getIpExamples = getIpExamples;
const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
function isValidIp(ip) {
    if (!IPV4_REGEX.test(ip))
        return false;
    return ip.split('.').every(octet => parseInt(octet) >= 0 && parseInt(octet) <= 255);
}
function ipToNumber(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}
function wildcardToCidr(wildcard) {
    const parts = wildcard.split('.');
    if (parts.length !== 4)
        return null;
    const fixedBits = parts.filter(p => p !== '*').length * 8;
    const cidrPrefix = parts.map((p, i) => p === '*' ? '0' : p).join('.');
    return `${cidrPrefix}/${fixedBits}`;
}
function wildcardToMinMax(wildcard) {
    const parts = wildcard.split('.');
    if (parts.length !== 4)
        return null;
    const minParts = parts.map(p => p === '*' ? '0' : p);
    const maxParts = parts.map(p => p === '*' ? '255' : p);
    return { min: minParts.join('.'), max: maxParts.join('.') };
}
function ipInCidr(ip, cidr) {
    if (!isValidIp(ip))
        return false;
    if (cidr.includes('*')) {
        const range = wildcardToMinMax(cidr);
        if (!range)
            return false;
        const ipNum = ipToNumber(ip);
        const minNum = ipToNumber(range.min);
        const maxNum = ipToNumber(range.max);
        return ipNum >= minNum && ipNum <= maxNum;
    }
    if (cidr.includes('/')) {
        const parts = cidr.split('/');
        if (parts.length !== 2)
            return false;
        const [rangeIp, bitsStr] = parts;
        const bits = parseInt(bitsStr);
        if (isNaN(bits) || bits < 0 || bits > 32)
            return false;
        if (!isValidIp(rangeIp))
            return false;
        const mask = ~(2 ** (32 - bits) - 1) >>> 0;
        return (ipToNumber(ip) & mask) === (ipToNumber(rangeIp) & mask);
    }
    if (isValidIp(cidr)) {
        return ip === cidr;
    }
    return false;
}
function parseIpList(list) {
    if (!list)
        return [];
    return list
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);
}
function ipMatchesList(ip, list) {
    if (!list)
        return false;
    const entries = parseIpList(list);
    return entries.some(entry => ipInCidr(ip, entry));
}
function getClientIp(req) {
    var _a;
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
        if (isValidIp(ip))
            return ip;
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        const ip = Array.isArray(realIp) ? realIp[0] : realIp;
        if (isValidIp(ip))
            return ip;
    }
    if (req.ip && isValidIp(req.ip))
        return req.ip;
    if (((_a = req.socket) === null || _a === void 0 ? void 0 : _a.remoteAddress) && isValidIp(req.socket.remoteAddress)) {
        return req.socket.remoteAddress;
    }
    return '0.0.0.0';
}
function checkIpAccess(ip, allowedIps, blockedIps) {
    if (ipMatchesList(ip, blockedIps)) {
        return { allowed: false, blockingRule: 'blocked', clientIp: ip };
    }
    if (allowedIps && allowedIps.trim().length > 0) {
        if (!ipMatchesList(ip, allowedIps)) {
            return { allowed: false, blockingRule: 'not-whitelisted', clientIp: ip };
        }
    }
    return { allowed: true, blockingRule: 'none', clientIp: ip };
}
const IP_EXAMPLE_VALUES = [
    '203.0.113.5 — Single IP (office workstation)',
    '203.0.113.0/24 — CIDR range (office network)',
    '203.0.113.* — Wildcard (same as /24)',
    '10.0.0.0/8 — Large private range',
    '198.51.100.1, 203.0.113.0/24 — Comma-separated'
];
function getIpExamples() {
    return IP_EXAMPLE_VALUES;
}
