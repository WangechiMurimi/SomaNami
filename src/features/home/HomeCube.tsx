import type { CSSProperties } from 'react'
import './home-cube.css'

const AXIS = [-1, 0, 1] as const
const HEIGHTS = [3, 2, 1] as const

// Custom properties the stylesheet reads to place each column and block.
const vars = (values: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [`--${name}`, value]),
  ) as CSSProperties

/**
 * The decorative cube from the design canvas. It carries no information, so
 * it is hidden from assistive technology; the stylesheet stops it moving when
 * the user prefers reduced motion.
 */
export default function HomeCube() {
  return (
    <div className="home-cube" aria-hidden="true" data-testid="home-cube">
      <div className="home-cube__anchor">
        <div className="home-cube__shift">
          {AXIS.map((layer) => (
            <div key={layer} className="home-cube__layer">
              {AXIS.map((x) => (
                <div key={x} className="home-cube__col" style={vars({ x })}>
                  {HEIGHTS.map((i) => (
                    <span
                      key={i}
                      className="home-cube__block"
                      style={vars({ i })}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
