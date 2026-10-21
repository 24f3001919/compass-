import React from 'react'
import logoSrc from '../assets/logo.png'

export default function Logo({
  size = 24,
  alt = 'Compass logo',
  className = '',
  style = {},
  ...rest
}) {
  const dimension = typeof size === 'number' ? `${size}px` : size
  const isDecorative = alt === ''

  return (
    <img
      src={logoSrc}
      alt={alt}
      aria-hidden={isDecorative ? 'true' : undefined}
      className={`compass-logo ${className}`.trim()}
      style={{
        width: dimension,
        height: dimension,
        objectFit: 'contain',
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        padding: 0,
        ...style,
      }}
      {...rest}
    />
  )
}
