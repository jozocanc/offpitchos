'use client'

import { useState } from 'react'

interface Props {
  name: string
  placeholder?: string
  autoFocus?: boolean
  autoComplete?: string
  required?: boolean
  minLength?: number
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
  style?: React.CSSProperties
  inputStyle?: React.CSSProperties
  defaultValue?: string
}

export default function PasswordInput({
  name,
  placeholder,
  autoFocus,
  autoComplete,
  required,
  minLength,
  value,
  onChange,
  className,
  style,
  inputStyle,
  defaultValue,
}: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative" style={style}>
      <input
        name={name}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        value={value}
        onChange={onChange}
        defaultValue={defaultValue}
        style={inputStyle}
        className={className + ' pr-11'}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide' : 'Show'}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-inherit opacity-60 hover:opacity-100 transition-opacity"
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}
