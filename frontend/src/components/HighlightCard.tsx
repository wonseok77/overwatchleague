import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import { Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { extractVideoId } from './YouTubeEmbed'

interface HighlightData {
  id: string
  title: string
  youtube_url: string
  user_nickname?: string
  match_title?: string
  registered_at: string
}

interface HighlightCardProps {
  highlight: HighlightData
  isAdmin?: boolean
  onDelete?: (id: string) => void
  className?: string
}

export function HighlightCard({ highlight, isAdmin, onDelete, className }: HighlightCardProps) {
  const videoId = extractVideoId(highlight.youtube_url)
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Thumbnail - click to open in YouTube */}
      <a
        href={highlight.youtube_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative aspect-video bg-gray-100"
      >
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={highlight.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            유효하지 않은 YouTube URL
          </div>
        )}
      </a>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{highlight.title}</h3>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {highlight.user_nickname && <span>{highlight.user_nickname}</span>}
              {highlight.match_title && <span>{highlight.match_title}</span>}
              <span>{format(new Date(highlight.registered_at), 'yyyy.M.d', { locale: ko })}</span>
            </div>
          </div>
          {isAdmin && onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
              onClick={() => onDelete(highlight.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export type { HighlightData }
