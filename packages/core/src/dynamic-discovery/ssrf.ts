import net from "node:net";

/**
 * Ranges considered private/loopback/link-local/reserved/otherwise unsafe
 * for a dynamically-discovered candidate to resolve to
 * (docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md §11). Built on Node's
 * built-in `net.BlockList` (no new dependency) — it also correctly
 * evaluates IPv4-mapped IPv6 addresses (e.g. `::ffff:169.254.169.254`)
 * against the IPv4 rules below without any special-casing here.
 */
const BLOCKED_IPV4_SUBNETS: Array<[address: string, prefix: number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // RFC 1918 private
  ["100.64.0.0", 10], // carrier-grade NAT (RFC 6598)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. the 169.254.169.254 cloud-metadata address
  ["172.16.0.0", 12], // RFC 1918 private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1 (documentation)
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC 1918 private
  ["198.18.0.0", 15], // benchmark testing
  ["198.51.100.0", 24], // TEST-NET-2 (documentation)
  ["203.0.113.0", 24], // TEST-NET-3 (documentation)
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved for future use, incl. 255.255.255.255 broadcast
];

const BLOCKED_IPV6_SUBNETS: Array<[address: string, prefix: number]> = [
  ["::1", 128], // loopback
  ["::", 128], // unspecified
  ["fe80::", 10], // link-local
  ["fc00::", 7], // unique-local
  ["2001:db8::", 32], // documentation
  ["ff00::", 8], // multicast
];

function buildBlockList(): net.BlockList {
  const blockList = new net.BlockList();
  for (const [address, prefix] of BLOCKED_IPV4_SUBNETS) blockList.addSubnet(address, prefix, "ipv4");
  for (const [address, prefix] of BLOCKED_IPV6_SUBNETS) blockList.addSubnet(address, prefix, "ipv6");
  return blockList;
}

const blockList = buildBlockList();

/**
 * Component: SSRF IP-range check (Sprint 5, §11). Pure — no network, no
 * DNS resolution here, just a range check against an already-resolved
 * address string. Kept deliberately independent of the Master-domain
 * boundary check (which compares hostnames, not IPs) — see
 * modules/website-quality/src/dynamic-discovery/safeFetch.ts for how
 * this is used before every connection and every redirect hop.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return true; // not a valid IP at all -- fail closed
  return blockList.check(ip, family === 4 ? "ipv4" : "ipv6");
}
