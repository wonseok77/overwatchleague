import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { cn } from '../lib/utils'
import { Upload, X, ImageIcon } from 'lucide-react'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

interface ScreenshotDropzoneProps {
  onFileSelect: (file: File) => void
  preview?: string
  className?: string
}

export function ScreenshotDropzone({ onFileSelect, preview, className }: ScreenshotDropzoneProps) {
  const [error, setError] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setError(null)
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0]
        if (rejection.errors.some((e) => e.code === 'file-too-large')) {
          setError('파일 크기가 10MB를 초과합니다.')
        } else {
          setError('JPG, PNG, WebP 형식만 허용됩니다.')
        }
        return
      }
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0]
        setLocalPreview(URL.createObjectURL(file))
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: false,
  })

  const displayPreview = preview || localPreview

  const clearPreview = () => {
    if (localPreview) URL.revokeObjectURL(localPreview)
    setLocalPreview(null)
  }

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-ow-orange-500 bg-ow-orange-500/5'
            : 'border-gray-300 hover:border-ow-orange-400 hover:bg-gray-50',
          displayPreview && 'p-2'
        )}
      >
        <input {...getInputProps()} />
        {displayPreview ? (
          <div className="relative w-full">
            <img
              src={displayPreview}
              alt="스크린샷 미리보기"
              className="w-full rounded-md object-contain max-h-64"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                clearPreview()
              }}
              className="absolute top-2 right-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            {isDragActive ? (
              <Upload className="h-10 w-10 text-ow-orange-500 mb-2" />
            ) : (
              <ImageIcon className="h-10 w-10 text-gray-400 mb-2" />
            )}
            <p className="text-sm font-medium text-gray-700">
              {isDragActive ? '여기에 놓으세요' : '이미지를 드래그하거나 클릭하여 선택'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG, WebP (최대 10MB)
            </p>
          </>
        )}
      </div>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  )
}
