export function PipelineBadge({ status }: { status: string }) {
  return (
    <span className={`pipeline-badge pipeline-${status}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export function CorrectnessBadge({ status }: { status: string | null }) {
  const s = status || 'PENDING'
  let className = 'badge-neutral'
  if (s === 'PASS') className = 'badge-pass'
  if (s === 'PASS_WITH_WARNINGS') className = 'badge-warn'
  if (s === 'FAIL') className = 'badge-fail'
  
  return <span className={`badge ${className}`}>{s.replace(/_/g, ' ')}</span>
}
