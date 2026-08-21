type Props = {
  text: string
  className?: string
}

export default function GlitchText({ text, className = '' }: Props) {
  return (
    <span className={`relative inline-block ${className}`}>
      <span
        className="relative inline-block"
        style={{
          textShadow: '2px 0 #c084fc, -2px 0 #22d3ee',
        }}
      >
        {text}
      </span>
    </span>
  )
}
