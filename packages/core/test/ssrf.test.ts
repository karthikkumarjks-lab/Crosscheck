import { describe, expect, it } from "vitest";
import { isPrivateOrReservedIp } from "../src/dynamic-discovery/index.js";

describe("isPrivateOrReservedIp", () => {
  it.each([
    ["10.1.2.3", "RFC 1918 private (10/8)"],
    ["172.16.0.1", "RFC 1918 private (172.16/12)"],
    ["172.31.255.255", "RFC 1918 private (172.16/12, upper bound)"],
    ["192.168.1.1", "RFC 1918 private (192.168/16)"],
    ["127.0.0.1", "loopback"],
    ["169.254.1.1", "link-local"],
    ["169.254.169.254", "cloud-metadata address"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["0.0.0.0", "this-network"],
    ["192.0.2.1", "TEST-NET-1 documentation"],
    ["198.51.100.1", "TEST-NET-2 documentation"],
    ["203.0.113.1", "TEST-NET-3 documentation"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast/reserved"],
  ])("blocks IPv4 %s (%s)", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });

  it.each([
    ["8.8.8.8", "public DNS"],
    ["1.1.1.1", "public DNS"],
    ["93.184.216.34", "ordinary public host"],
  ])("allows IPv4 %s (%s)", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(false);
  });

  it.each([
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fe80::1", "IPv6 link-local"],
    ["fc00::1", "IPv6 unique-local"],
    ["fd12:3456:789a::1", "IPv6 unique-local (fd.. form)"],
    ["2001:db8::1", "IPv6 documentation range"],
  ])("blocks IPv6 %s (%s)", (ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });

  it("allows an ordinary public IPv6 address", () => {
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("unwraps an IPv4-mapped IPv6 address and checks it against the IPv4 rules", () => {
    expect(isPrivateOrReservedIp("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("fails closed (treats as blocked) for an unparseable/invalid IP string", () => {
    expect(isPrivateOrReservedIp("not-an-ip")).toBe(true);
    expect(isPrivateOrReservedIp("")).toBe(true);
  });
});
