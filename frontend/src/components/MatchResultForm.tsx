import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Select } from './ui/select'
import { Label } from './ui/label'
import { ScreenshotDropzone } from './ScreenshotDropzone'
import { HeroSelect } from './HeroSelect'
import { cn } from '../lib/utils'
import { getHeroes, type Hero } from '../api/heroes'
import type { Match, MatchParticipant, MatchResult } from '../types'

const OW_MAPS = [
  "King's Row", 'Hanamura', 'Lijiang Tower', 'Oasis', 'Ilios', 'Nepal', 'Busan',
  'Watchpoint: Gibraltar', 'Hollywood', 'Dorado', 'Rialto', 'Havana', 'Junkertown',
  'Route 66', 'Circuit Royal', 'Midtown', 'Numbani', 'Eichenwalde', 'Blizzard World',
  'Colosseo', 'Esperanca', 'New Queen Street', 'Paraiso', 'Suravasa', 'Samoa',
  'Shambali Monastery', 'Antarctic Peninsula', 'New Junk City', 'Runasapi',
] as const

interface ParticipantHeroes {
  user_id: string
  heroes: string[]
}

interface MatchResultFormData {
  map_name: string
  result: MatchResult
  participant_heroes: ParticipantHeroes[]
  screenshot?: File
}

interface MatchResultFormProps {
  match: Match
  participants: (MatchParticipant & { nickname?: string })[]
  onSubmit: (data: MatchResultFormData) => void
  isSubmitting?: boolean
  className?: string
}

export function MatchResultForm({
  match,
  participants,
  onSubmit,
  isSubmitting,
  className,
}: MatchResultFormProps) {
  const [mapName, setMapName] = useState(match.map_name || '')
  const [result, setResult] = useState<MatchResult | ''>('')
  const [heroInputs, setHeroInputs] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {}
    participants.forEach((p) => { init[p.user_id] = ['', '', ''] })
    return init
  })
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [heroes, setHeroes] = useState<Hero[]>([])

  useEffect(() => {
    getHeroes().then(setHeroes).catch(() => {})
  }, [])

  const teamA = participants.filter((p) => p.team === 'A')
  const teamB = participants.filter((p) => p.team === 'B')

  const handleHeroChange = (userId: string, index: number, value: string) => {
    setHeroInputs((prev) => {
      const heroes = [...(prev[userId] || ['', '', ''])]
      heroes[index] = value
      return { ...prev, [userId]: heroes }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!mapName || !result) return

    onSubmit({
      map_name: mapName,
      result: result as MatchResult,
      participant_heroes: participants.map((p) => ({
        user_id: p.user_id,
        heroes: (heroInputs[p.user_id] || []).filter(Boolean),
      })),
      screenshot: screenshot || undefined,
    })
  }

  const renderTeamSection = (team: string, members: typeof participants) => (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground">{team}팀</h4>
      {members.map((p) => (
        <div key={p.user_id} className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium w-24 truncate">
            {p.nickname || p.user_id.slice(0, 8)}
          </span>
          {[0, 1, 2].map((i) => (
            <HeroSelect
              key={i}
              value={heroInputs[p.user_id]?.[i] || ''}
              onChange={(name) => handleHeroChange(p.user_id, i, name)}
              heroes={heroes}
              placeholder={`영웅 ${i + 1}`}
              className="w-44"
            />
          ))}
        </div>
      ))}
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Map selection */}
      <div className="space-y-2">
        <Label htmlFor="map-select">맵 선택</Label>
        <Select
          id="map-select"
          value={mapName}
          onChange={(e) => setMapName(e.target.value)}
        >
          <option value="">맵을 선택하세요</option>
          {OW_MAPS.map((map) => (
            <option key={map} value={map}>
              {map}
            </option>
          ))}
        </Select>
      </div>

      {/* Result selection */}
      <div className="space-y-2">
        <Label htmlFor="result-select">경기 결과</Label>
        <Select
          id="result-select"
          value={result}
          onChange={(e) => setResult(e.target.value as MatchResult)}
        >
          <option value="">결과를 선택하세요</option>
          <option value="team_a">A팀 승리</option>
          <option value="team_b">B팀 승리</option>
          <option value="draw">무승부</option>
        </Select>
      </div>

      {/* Per-participant hero selection */}
      <div className="space-y-4">
        <Label>참가자별 영웅</Label>
        {renderTeamSection('A', teamA)}
        {renderTeamSection('B', teamB)}
      </div>

      {/* Screenshot upload */}
      <div className="space-y-2">
        <Label>스코어카드 스크린샷</Label>
        <ScreenshotDropzone onFileSelect={setScreenshot} />
      </div>

      {/* Submit */}
      <Button type="submit" disabled={!mapName || !result || isSubmitting} className="w-full">
        {isSubmitting ? '저장 중...' : '결과 저장'}
      </Button>
    </form>
  )
}

export type { MatchResultFormData, ParticipantHeroes }
