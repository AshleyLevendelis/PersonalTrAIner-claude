import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface OptionCardProps {
  icon: string
  label: string
  description?: string
  selected: boolean
  onClick: () => void
  compact?: boolean
}

export function OptionCard({ icon, label, description, selected, onClick, compact }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-xl border-2 p-5 transition-all duration-200 cursor-pointer text-center',
        compact && 'p-3',
        selected
          ? 'border-primary bg-primary/5 shadow-md scale-[1.02]'
          : 'border-border hover:border-primary/40 hover:bg-accent/50 active:scale-[0.97]'
      )}
    >
      <span className={cn('text-3xl mb-2', compact && 'text-2xl mb-1')}>{icon}</span>
      <span className={cn('text-sm font-semibold text-foreground', compact && 'text-xs')}>{label}</span>
      {description && (
        <span className="text-xs text-muted-foreground mt-0.5">{description}</span>
      )}
      {selected && (
        <div className="absolute top-2 right-2 size-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="size-3 text-primary-foreground" />
        </div>
      )}
    </button>
  )
}
