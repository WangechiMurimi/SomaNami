import { BlockList, isIPv4, isIPv6 } from 'node:net'

// Everything a public web server cannot be. A link that resolves here could
// reach our own process, the cloud metadata service or a private network.
const BLOCKED_V4: ReadonlyArray<[string, number]> = [
  ['0.0.0.0', 8], // "this network"; 0.0.0.0 reaches localhost on many stacks
  ['10.0.0.0', 8], // RFC 1918 private
  ['100.64.0.0', 10], // carrier-grade NAT, shared address space
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including 169.254.169.254 metadata
  ['172.16.0.0', 12], // RFC 1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1 documentation
  ['192.88.99.0', 24], // deprecated 6to4 relay anycast
  ['192.168.0.0', 16], // RFC 1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2 documentation
  ['203.0.113.0', 24], // TEST-NET-3 documentation
  ['224.0.0.0', 3], // multicast, reserved 240/4 and broadcast
]

const blockedV4 = new BlockList()
for (const [network, prefix] of BLOCKED_V4) {
  blockedV4.addSubnet(network, prefix, 'ipv4')
}

/**
 * Whether `ip` is a public unicast address a link may be fetched from. Anything
 * that is not a valid IP literal is refused, so callers fail closed.
 */
export function isPublicAddress(ip: string): boolean {
  // Resolvers may append a zone (`fe80::1%en0`); the zone never makes an
  // address public, so judge the address alone.
  const address = ip.split('%')[0] ?? ''
  if (isIPv4(address)) return !blockedV4.check(address, 'ipv4')
  if (isIPv6(address)) return isPublicV6(ipv6Words(address))
  return false
}

function isPublicV6(words: number[]): boolean {
  const [w0 = 0, w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0, w6 = 0, w7 = 0] = words

  // IPv4-mapped (::ffff:a.b.c.d) and the deprecated IPv4-compatible form
  // (::a.b.c.d, which also covers :: and ::1) reach the embedded IPv4
  // address, so they are exactly as safe as it is.
  const highZero = w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0
  if (highZero && (w5 === 0xffff || w5 === 0)) {
    return isPublicAddress(embeddedV4(w6, w7))
  }

  // Only global unicast (2000::/3) is public. This one rule refuses unique
  // local fc00::/7, link-local fe80::/10, multicast ff00::/8, NAT64
  // 64:ff9b::/96 (which would reach any IPv4 address) and unassigned space.
  if ((w0 & 0xe000) !== 0x2000) return false

  // 2001::/23 holds Teredo (whose embedded client can't be checked) and other
  // special-purpose blocks; 2001:db8::/32 is documentation.
  if (w0 === 0x2001 && ((w1 & 0xfe00) === 0 || w1 === 0x0db8)) return false

  // 6to4 tunnels to the IPv4 address in bits 16-47.
  if (w0 === 0x2002) return isPublicAddress(embeddedV4(w1, w2))

  return true
}

function embeddedV4(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
}

/** Expands a valid IPv6 literal (with an optional dotted IPv4 tail) to eight 16-bit words. */
function ipv6Words(address: string): number[] {
  let text = address
  const tail: number[] = []
  const lastColon = text.lastIndexOf(':')
  const last = text.slice(lastColon + 1)
  if (last.includes('.')) {
    const [a = 0, b = 0, c = 0, d = 0] = last.split('.').map(Number)
    tail.push((a << 8) | b, (c << 8) | d)
    text = text.slice(0, lastColon + 1)
    // Keep a trailing "::" intact; drop a lone separator colon.
    if (!text.endsWith('::')) text = text.slice(0, -1)
  }

  const [left = '', right] = text.split('::')
  const parse = (part: string) =>
    part === '' ? [] : part.split(':').map((group) => parseInt(group, 16))
  const head = parse(left)
  const rest = right === undefined ? [] : parse(right)
  const missing = 8 - tail.length - head.length - rest.length
  return [...head, ...Array<number>(missing).fill(0), ...rest, ...tail]
}
