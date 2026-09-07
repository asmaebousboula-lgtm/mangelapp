import { Badge } from './ui'
import { priorityLabel, statusLabel } from '../lib/domain'

const STATUS_TONE = { offen: 'amber', in_bearbeitung: 'steel', erledigt: 'moss' } as const
const PRIORITY_TONE = { normal: 'neutral', dringend: 'amber', sehr_dringend: 'ember' } as const

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge dot tone={STATUS_TONE[status as keyof typeof STATUS_TONE] ?? 'neutral'}>
      {statusLabel(status)}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === 'normal') return null
  return <Badge tone={PRIORITY_TONE[priority as keyof typeof PRIORITY_TONE] ?? 'neutral'}>{priorityLabel(priority)}</Badge>
}

export function statusTone(status: string) {
  return STATUS_TONE[status as keyof typeof STATUS_TONE] ?? 'neutral'
}
