// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isPublicAddress } from './safe-address.ts'

describe('isPublicAddress', () => {
  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '1.1.1.1',
    '172.15.255.255',
    '172.32.0.1',
    '100.63.255.255',
    '100.128.0.1',
    '198.17.255.255',
    '198.20.0.1',
    '223.255.255.255',
  ])('allows public IPv4 %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true)
  })

  it.each([
    ['0.0.0.0', 'this network'],
    ['0.1.2.3', 'this network'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['10.0.0.1', 'RFC 1918'],
    ['172.16.0.1', 'RFC 1918'],
    ['172.31.255.255', 'RFC 1918'],
    ['192.168.1.1', 'RFC 1918'],
    ['169.254.169.254', 'cloud metadata'],
    ['169.254.0.1', 'link-local'],
    ['100.64.0.1', 'CGNAT'],
    ['100.127.255.255', 'CGNAT'],
    ['192.0.0.170', 'IETF assignments'],
    ['192.0.2.1', 'documentation'],
    ['198.51.100.7', 'documentation'],
    ['203.0.113.9', 'documentation'],
    ['192.88.99.1', '6to4 relay'],
    ['198.18.0.1', 'benchmarking'],
    ['198.19.255.255', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
  ])('refuses %s (%s)', (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })

  it.each([
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
    '2a00:1450:4001:80b::200e',
    '2002:5db8:d822::1', // 6to4 wrapping public 93.184.216.34
    '::ffff:93.184.216.34',
    '::ffff:5db8:d822',
  ])('allows public IPv6 %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true)
  })

  it.each([
    ['::', 'unspecified'],
    ['::1', 'loopback'],
    ['0:0:0:0:0:0:0:1', 'loopback, long form'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback, hex'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['::127.0.0.1', 'IPv4-compatible loopback'],
    ['::a00:1', 'IPv4-compatible private'],
    ['fc00::1', 'unique local'],
    ['fd12:3456:789a::1', 'unique local'],
    ['fe80::1', 'link-local'],
    ['fe80::1%en0', 'link-local with zone'],
    ['febf::1', 'link-local upper edge'],
    ['ff02::1', 'multicast'],
    ['64:ff9b::7f00:1', 'NAT64'],
    ['64:ff9b::8.8.8.8', 'NAT64 even to a public address'],
    ['2001:db8::1', 'documentation'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'Teredo'],
    ['2002:7f00:1::1', '6to4 wrapping loopback'],
    ['2002:a9fe:a9fe::1', '6to4 wrapping metadata'],
    ['100::1', 'discard prefix'],
  ])('refuses %s (%s)', (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })

  it.each(['', 'localhost', 'example.com', '127.1', '0x7f000001', '1.2.3'])(
    'refuses non-literal input %j, failing closed',
    (input) => {
      expect(isPublicAddress(input)).toBe(false)
    },
  )
})
