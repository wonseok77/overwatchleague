import { cn } from '../lib/utils'

interface YouTubeEmbedProps {
  url: string
  title?: string
  className?: string
}

function extractVideoId(url: string): string | null {
  // youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) return shortMatch[1]

  // youtube.com/watch?v=VIDEO_ID
  const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (longMatch) return longMatch[1]

  // youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (embedMatch) return embedMatch[1]

  return null
}

export function YouTubeEmbed({ url, title, className }: YouTubeEmbedProps) {
  const videoId = extractVideoId(url)

  if (!videoId) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg bg-gray-100 aspect-video text-sm text-muted-foreground',
          className
        )}
      >
        유효하지 않은 YouTube URL입니다.
      </div>
    )
  }

  return (
    <div className={cn('relative aspect-video rounded-lg overflow-hidden bg-gray-100', className)}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title || 'YouTube video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  )
}

export { extractVideoId }
