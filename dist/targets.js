import { TARGET_PREFIXES } from "./constants.js";
export function normalizeWhatsAppTarget(raw) {
    if (!raw)
        return undefined;
    let value = raw.trim();
    for (const prefix of TARGET_PREFIXES) {
        if (value.toLowerCase().startsWith(prefix)) {
            value = value.slice(prefix.length).trim();
            break;
        }
    }
    if (!value)
        return undefined;
    const hasLeadingPlus = value.startsWith("+");
    const digits = value.replace(/[^\d]/g, "");
    if (!digits)
        return undefined;
    return hasLeadingPlus ? `+${digits}` : digits;
}
export function looksLikeWhatsAppTarget(raw) {
    return Boolean(normalizeWhatsAppTarget(raw));
}
export function whatsAppTargetsEquivalent(left, right) {
    const normalizedLeft = normalizeWhatsAppTarget(left);
    const normalizedRight = normalizeWhatsAppTarget(right);
    if (!normalizedLeft || !normalizedRight)
        return false;
    if (normalizedLeft === normalizedRight)
        return true;
    return stripLeadingPlus(normalizedLeft) === stripLeadingPlus(normalizedRight);
}
function stripLeadingPlus(value) {
    return value.startsWith("+") ? value.slice(1) : value;
}
//# sourceMappingURL=targets.js.map