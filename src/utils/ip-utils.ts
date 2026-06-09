import { Request } from 'express';

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function isValidIp(ip: string): boolean {
    if (!IPV4_REGEX.test(ip)) return false;
    return ip.split('.').every(octet => parseInt(octet) >= 0 && parseInt(octet) <= 255);
}

function ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function wildcardToCidr(wildcard: string): string | null {
    const parts = wildcard.split('.');
    if (parts.length !== 4) return null;
    const fixedBits = parts.filter(p => p !== '*').length * 8;
    const cidrPrefix = parts.map((p, i) => p === '*' ? '0' : p).join('.');
    return `${cidrPrefix}/${fixedBits}`;
}

function wildcardToMinMax(wildcard: string): { min: string; max: string } | null {
    const parts = wildcard.split('.');
    if (parts.length !== 4) return null;
    const minParts = parts.map(p => p === '*' ? '0' : p);
    const maxParts = parts.map(p => p === '*' ? '255' : p);
    return { min: minParts.join('.'), max: maxParts.join('.') };
}

export function ipInCidr(ip: string, cidr: string): boolean {
    if (!isValidIp(ip)) return false;

    if (cidr.includes('*')) {
        const range = wildcardToMinMax(cidr);
        if (!range) return false;
        const ipNum = ipToNumber(ip);
        const minNum = ipToNumber(range.min);
        const maxNum = ipToNumber(range.max);
        return ipNum >= minNum && ipNum <= maxNum;
    }

    if (cidr.includes('/')) {
        const parts = cidr.split('/');
        if (parts.length !== 2) return false;
        const [rangeIp, bitsStr] = parts;
        const bits = parseInt(bitsStr);
        if (isNaN(bits) || bits < 0 || bits > 32) return false;
        if (!isValidIp(rangeIp)) return false;
        const mask = ~(2 ** (32 - bits) - 1) >>> 0;
        return (ipToNumber(ip) & mask) === (ipToNumber(rangeIp) & mask);
    }

    if (isValidIp(cidr)) {
        return ip === cidr;
    }

    return false;
}

function parseIpList(list: string | null | undefined): string[] {
    if (!list) return [];
    return list
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);
}

export function ipMatchesList(ip: string, list: string | null | undefined): boolean {
    if (!list) return false;
    const entries = parseIpList(list);
    return entries.some(entry => ipInCidr(ip, entry));
}

export function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
        if (isValidIp(ip)) return ip;
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        const ip = Array.isArray(realIp) ? realIp[0] : realIp;
        if (isValidIp(ip)) return ip;
    }

    if (req.ip && isValidIp(req.ip)) return req.ip;

    if (req.socket?.remoteAddress && isValidIp(req.socket.remoteAddress)) {
        return req.socket.remoteAddress;
    }

    return '0.0.0.0';
}

export interface IpAccessResult {
    allowed: boolean;
    blockingRule: 'none' | 'blocked' | 'not-whitelisted';
    clientIp: string;
}

export function checkIpAccess(ip: string, allowedIps: string | null | undefined, blockedIps: string | null | undefined): IpAccessResult {
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
] as const;

export function getIpExamples(): readonly string[] {
    return IP_EXAMPLE_VALUES;
}
