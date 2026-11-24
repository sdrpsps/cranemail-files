import Image from 'next/image'

import { cn } from '@/lib/utils'

interface BrandMarkProps {
  className?: string
}

/** Decorative mark; the adjacent product name provides its accessible label. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <Image
      src="/brand/crane.svg"
      alt=""
      aria-hidden="true"
      width={64}
      height={64}
      className={cn('size-8 shrink-0', className)}
      unoptimized
    />
  )
}
