import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import { Select } from './ui/select'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { ScreenshotDropzone } from './ScreenshotDropzone'
import { HeroSelect } from './HeroSelect'
import { cn } from '../lib/utils'
import { getHeroes, type Hero } from '../api/heroes'
import { extractScoreboard } from '../api/matches'
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

export interface PlayerStatInput {
  user_id: string
  kills?: number
  assists?: number
  deaths?: number
  damage_dealt?: number
  healing_done?: number
  damage_mitigated?: number
}

interface MatchResultFormData {
  map_name: string
  result: MatchResult
  participant_heroes: ParticipantHeroes[]
  screenshot?: File
  player_stats: PlayerStatInput[]
}

interface MatchResultFormProps {
  match: Match
  participants: (MatchParticipant & { nickname?: string })[]
  onSubmit: (data: MatchResultFormData) => void
  isSubmitting?: boolean
  className?: string
}

const STAT_FIELDS = [
  { key: 'kills', label: '처치' },
  { key: 'assists', label: '도움' },
  { key: 'deaths', label: '죽음' },
  { key: 'damage_dealt', label: '피해' },
  { key: 'healing_done', label: '치유' },
  { key: 'damage_mitigated', label: '경감' },
] as const

type StatKey = typeof STAT_FIELDS[number]['key']

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
  const [statInputs, setStatInputs] = useState<Record<string, Record<StatKey, string>>>(() => {
    const init: Record<string, Record<StatKey, string>> = {}
    participants.forEach((p) => {
      init[p.user_id] = { kills: '', assists: '', deaths: '', damage_dealt: '', healing_done: '', damage_mitigated: '' }
    })
    return init
  })
  const [ocrLoading, setOcrLoading] = useState(false)

  useEffect(() => {
    getHeroes().then(setHeroes).catch(() => {})
  }, [])

  const handleOcrAutoFill = async () => {
    if (!screenshot) return
    setOcrLoading(true)
    try {
      const { players } = await extractScoreboard(screenshot)
      if (!players || players.length === 0) {
        alert('스코어보드에서 스탯을 추출하지 못했습니다.')
        return
      }
      // 팀A → 팀B 순서로 매핑
      const ordered = [...teamA, ...teamB]
      const newStats = { ...statInputs }
      ordered.forEach((p, idx) => {
        if (idx < players.length) {
          const row = players[idx]
          newStats[p.user_id] = {
            kills: row.kills != null ? String(row.kills) : '',
            assists: row.assists != null ? String(row.assists) : '',
            deaths: row.deaths != null ? String(row.deaths) : '',
            damage_dealt: row.damage_dealt != null ? String(row.damage_dealt) : '',
            healing_done: row.healing_done != null ? String(row.healing_done) : '',
            damage_mitigated: '',
          }
        }
      })
      setStatInputs(newStats)
    } catch {
      alert('OCR 추출에 실패했습니다.')
    } finally {
      setOcrLoading(false)
    }
  }

  const teamA = participants.filter((p) => p.team === 'A')
  const teamB = participants.filter((p) => p.team === 'B')

  const handleHeroChange = (userId: string, index: number, value: string) => {
    setHeroInputs((prev) => {
      const heroes = [...(prev[userId] || ['', '', ''])]
      heroes[index] = value
      return { ...prev, [userId]: heroes }
    })
  }

  const handleStatChange = (userId: string, field: StatKey, value: string) => {
    setStatInputs((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!mapName || !result) return

    const player_stats: PlayerStatInput[] = participants.map((p) => {
      const stats = statInputs[p.user_id] || {}
      const entry: PlayerStatInput = { user_id: p.user_id }
      for (const { key } of STAT_FIELDS) {
        const val = stats[key]
        if (val !== '' && val !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(entry as any)[key] = parseInt(val, 10)
        }
      }
      return entry
    })

    onSubmit({
      map_name: mapName,
      result: result as MatchResult,
      participant_heroes: participants.map((p) => ({
        user_id: p.user_id,
        heroes: (heroInputs[p.user_id] || []).filter(Boolean),
      })),
      screenshot: screenshot || undefined,
      player_stats,
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

  const renderStatTable = (team: string, members: typeof participants) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-muted-foreground">{team}팀</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-1.5 px-1 font-medium text-xs w-24">닉네임</th>
              {STAT_FIELDS.map((f) => (
                <th key={f.key} className="text-center py-1.5 px-1 font-medium text-xs w-20">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((p) => (
              <tr key={p.user_id} className="border-b last:border-0">
                <td className="py-1.5 px-1 text-xs font-medium truncate max-w-[6rem]">
                  {p.nickname || p.user_id.slice(0, 8)}
                </td>
                {STAT_FIELDS.map((f) => (
                  <td key={f.key} className="py-1 px-1">
                    <Input
                      type="number"
                      min={0}
                      value={statInputs[p.user_id]?.[f.key] ?? ''}
                      onChange={(e) => handleStatChange(p.user_id, f.key, e.target.value)}
                      className="h-7 text-xs text-center w-full"
                      placeholder="-"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

      {/* Per-participant stat input */}
      <div className="space-y-4">
        <Label>참가자별 스탯 (선택)</Label>
        {renderStatTable('A', teamA)}
        {renderStatTable('B', teamB)}
      </div>

      {/* Screenshot upload */}
      <div className="space-y-2">
        <Label>스코어카드 스크린샷</Label>
        <ScreenshotDropzone onFileSelect={setScreenshot} />
        {screenshot && (
          <Button
            type="button"
            variant="outline"
            onClick={handleOcrAutoFill}
            disabled={ocrLoading}
            className="w-full"
          >
            {ocrLoading ? 'OCR 추출 중...' : 'OCR로 스탯 자동 채우기'}
          </Button>
        )}
      </div>

      {/* Submit */}
      <Button type="submit" disabled={!mapName || !result || isSubmitting} className="w-full">
        {isSubmitting ? '저장 중...' : '결과 저장'}
      </Button>
    </form>
  )
}

export type { MatchResultFormData, ParticipantHeroes }
